"use strict";

/*
 * Разбиение длинного транскрипта на части (map-reduce) под лимиты модели.
 * Без обращений к DOM и chrome.*: вся работа с окружением передаётся через options,
 * поэтому файл можно тестировать в Node (chunk-lib.test.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.YTSChunk = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SAFETY = 0.92; // запас на неточность оценки токенов
  const MAP_OUT = 2000; // max_tokens для промежуточных заметок (у reasoning-моделей часть уходит на «мысли»)
  const FINAL_OUT_DEFAULT = 3000; // max_tokens итогового ответа, если в настройках «авто»
  const NOTE_WORDS = 300; // просим модель держать заметки в этом объёме
  const MIN_CHUNK = 300; // меньше этого на фрагмент транскрипта делить бессмысленно
  const MAX_RATE_WAIT_MS = 180000; // дольше 3 минут ждать 429 не будем
  const MAX_RATE_RETRIES = 6;
  const MAX_TOO_LARGE = 12; // всего «слишком большой запрос» за один анализ
  const NOTE_SEP = "\n\n---\n\n";

  /* ---------- оценка токенов (эвристика, не точный токенайзер) ---------- */

  function estimateTokens(text, k) {
    const s = String(text == null ? "" : text);
    let cyr = 0, cjk = 0, lat = 0, digit = 0, punct = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0x400 && c <= 0x4ff) cyr++;
      else if (c >= 0x2e80) cjk++;
      else if (c >= 48 && c <= 57) digit++;
      else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 0xc0 && c < 0x400)) lat++;
      else if (c > 32 && c < 127) punct++;
    }
    const t = cyr / 2.3 + cjk + lat / 3.8 + digit / 1.6 + punct * 0.8;
    return Math.ceil(t * (k > 0 ? k : 1)) + 1;
  }

  /* ---------- разбор ошибок провайдеров ---------- */

  function parseDuration(s) {
    const str = String(s == null ? "" : s).trim();
    if (!str) return null;
    if (/^\d+(?:\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * 1000);
    const re = /(\d+(?:\.\d+)?)\s*(ms|h|m|s)/gi;
    let total = 0, found = false, m;
    while ((m = re.exec(str))) {
      found = true;
      const v = parseFloat(m[1]);
      const u = m[2].toLowerCase();
      total += u === "ms" ? v : u === "s" ? v * 1000 : u === "m" ? v * 60000 : v * 3600000;
    }
    return found ? Math.round(total) : null;
  }

  // kind: "too_large" | "rate" | "quota" | "other"
  function parseLlmError(status, message, retryAfter) {
    const msg = String(message == null ? "" : message);
    const num = (re) => {
      const m = msg.match(re);
      return m ? Number(m[1]) : null;
    };
    let limit = num(/\bLimit\s+(\d+)/i);
    let requested = num(/\bRequested\s+(\d+)/i);
    const used = num(/\bUsed\s+(\d+)/i);
    let m;
    if ((m = msg.match(/prompt is too long:\s*(\d+)\s*tokens?\s*>\s*(\d+)/i))) {
      requested = Number(m[1]);
      limit = Number(m[2]);
    }
    if ((m = msg.match(/maximum context length is\s+(\d+)\s+tokens/i))) {
      limit = Number(m[1]);
      const r = msg.match(/(?:requested|resulted in)\s+(\d+)\s+tokens/i);
      if (r) requested = Number(r[1]);
    }
    const sc = msg.match(/\((TPM|TPD|RPM|RPD)\)/i);
    const scope = sc ? sc[1].toUpperCase() : "";

    let waitMs = null;
    const w = msg.match(/try again in\s+((?:\d+(?:\.\d+)?\s*(?:ms|h|m|s)\s*)+)/i);
    if (w) waitMs = parseDuration(w[1]);
    if (waitMs == null && retryAfter) waitMs = parseDuration(retryAfter);

    const tooLarge =
      status === 413 ||
      /request too large|prompt is too long|maximum context length|context_length_exceeded/i.test(msg) ||
      (limit != null && requested != null && requested > limit && scope !== "RPM" && scope !== "RPD");
    const rate = !tooLarge && (status === 429 || /rate limit/i.test(msg));
    const quota = rate && (scope === "TPD" || scope === "RPD" || (waitMs != null && waitMs > MAX_RATE_WAIT_MS));

    return {
      kind: tooLarge ? "too_large" : quota ? "quota" : rate ? "rate" : "other",
      limit, requested, used, scope, waitMs,
    };
  }

  /* ---------- нарезка ---------- */

  // Обрезает список строк до maxChars символов (как раньше обрезался единый текст).
  function limitChars(pieces, maxChars, sep) {
    const out = [];
    let total = 0;
    for (const p of pieces) {
      const add = p.length + (out.length ? sep.length : 0);
      if (total + add > maxChars) {
        const cut = maxChars - total - (out.length ? sep.length : 0);
        if (cut > 0) out.push(p.slice(0, cut));
        return { pieces: out, truncated: true };
      }
      out.push(p);
      total += add;
    }
    return { pieces: out, truncated: false };
  }

  // Берёт подряд идущие строки pieces[start..], пока влезают в maxTokens.
  // Если одна строка не влезает — режет её (МУТИРУЕТ pieces). Всегда продвигается минимум на 1 строку.
  function packNext(pieces, start, maxTokens, k, sep) {
    const sepTok = estimateTokens(sep, k);
    let tokens = 0;
    let end = start;
    while (end < pieces.length) {
      const t = estimateTokens(pieces[end], k) + (end > start ? sepTok : 0);
      if (tokens + t > maxTokens) break;
      tokens += t;
      end++;
    }
    if (end === start) {
      const p = String(pieces[start]);
      const per = estimateTokens(p, k) / Math.max(1, p.length);
      let cut = Math.max(1, Math.floor(maxTokens / Math.max(per, 1e-6)));
      if (cut < p.length) {
        const ws = p.lastIndexOf(" ", cut);
        if (ws > cut * 0.5) cut = ws;
        const head = p.slice(0, cut);
        const tail = p.slice(cut).trimStart();
        pieces.splice(start, 1, head, ...(tail ? [tail] : []));
      }
      end = start + 1;
      tokens = estimateTokens(pieces[start], k);
    }
    return { text: pieces.slice(start, end).join(sep), next: end, tokens };
  }

  /* ---------- промпты ---------- */

  function mapPrompt(task, header, index, text) {
    return (
      `Это часть ${index} транскрипта одного видео; остальные части обрабатываются отдельно.\n` +
      `Итоговое задание пользователя (его выполнят позже по всем частям вместе):\n«${task}»\n\n` +
      `Сейчас НЕ выполняй задание целиком. Составь плотные промежуточные заметки по этой части, ` +
      `из которых потом можно собрать итоговый ответ: ключевые мысли, факты, цифры, имена, аргументы, примеры. ` +
      `Если в тексте есть таймкоды [мм:сс], сохраняй их рядом с мыслями. ` +
      `Без вступлений и общих выводов о видео. Объём — не более ${NOTE_WORDS} слов.\n\n` +
      `---\n${header}\n\nЧасть транскрипта:\n${text}`
    );
  }

  function mergePrompt(notes) {
    return (
      `Ниже промежуточные заметки по последовательным частям одного видео (в хронологическом порядке, ` +
      `разделены линиями ---). Объедини их в одни связные заметки: убери повторы, сохрани важные факты, ` +
      `цифры, имена и таймкоды [мм:сс], сохрани хронологию. Без вступлений и общих выводов. ` +
      `Объём — не более ${NOTE_WORDS} слов.\n\n${notes}`
    );
  }

  function finalPrompt(task, header, notes) {
    return (
      `${task}\n\n---\n${header}\n\n` +
      `Ниже не сам транскрипт, а подробные заметки по его последовательным частям ` +
      `(транскрипт слишком длинный для одного запроса; части разделены линиями ---). ` +
      `Выполни задание выше, опираясь только на эти заметки, и не упоминай, что работа шла по частям.\n\n` +
      `Заметки:\n${notes}`
    );
  }

  /* ---------- оркестрация ---------- */

  class TooLarge extends Error {
    constructor(message, info) {
      super(message);
      this.name = "TooLarge";
      this.info = info;
    }
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /*
   * o.system, o.task, o.header   — тексты промптов
   * o.pieces, o.sep              — строки транскрипта и разделитель
   * o.buildSingle(fullText)      — user-сообщение для запроса «целиком»
   * o.finalOut                   — max_tokens ответа из настроек (0 = авто)
   * o.lim                        — { tpm, k, learned, kChanged, tpmChanged, at }, изменяется по ходу работы
   * o.send(system,user,maxTok)   — Promise<{ok:true,data:{text,usage,rate}} | {ok:false,error,info}>
   * o.wait(ms,label)             — Promise, бросает при отмене
   * o.check()                    — бросает, если анализ надо прервать
   * o.status(text), o.now()
   */
  async function summarize(o) {
    const lim = o.lim;
    const pieces = o.pieces.slice();
    const finalOut = o.finalOut > 0 ? o.finalOut : FINAL_OUT_DEFAULT;
    let shrink = 1;
    let tlCount = 0;
    let calls = 0;
    let rate = null;

    const est = (t) => estimateTokens(t, lim.k);
    const cap = () => Math.floor(lim.tpm * SAFETY * shrink);

    function learnFromSuccess(system, user, data) {
      const u = data && data.usage;
      const used = u && (u.prompt_tokens != null ? u.prompt_tokens : u.input_tokens);
      if (used > 0) {
        const raw = estimateTokens(system + "\n" + user, 1);
        if (raw > 0) {
          lim.k = clamp(0.5 * lim.k + 0.5 * (used / raw), 0.6, 3);
          lim.kChanged = true;
        }
      }
      const r = data && data.rate;
      rate = null;
      if (r && r.remainingTokens != null && r.remainingTokens !== "") {
        const rem = Number(r.remainingTokens);
        const reset = parseDuration(r.resetTokens);
        if (Number.isFinite(rem) && reset != null) rate = { remaining: rem, resetAt: o.now() + reset };
      }
    }

    function learnTooLarge(e, fallbackTokens) {
      if (++tlCount > MAX_TOO_LARGE) {
        throw new Error("Не удалось подобрать размер запроса под лимит модели. Последняя ошибка: " + e.message);
      }
      const info = e.info || {};
      if (info.limit && (!lim.tpm || info.limit < lim.tpm)) {
        lim.tpm = info.limit;
        lim.learned = true;
        lim.tpmChanged = true; // чтобы сохранить с новой отметкой времени
      } else if (!lim.tpm) {
        lim.tpm = Math.max(1000, Math.floor(fallbackTokens * 0.6)); // догадка, не сохраняется
      } else {
        shrink *= 0.75;
      }
    }

    async function call(system, user, maxTokens, label) {
      let rateTries = 0;
      for (;;) {
        o.check();
        if (rate) {
          const need = est(system) + est(user) + (maxTokens || finalOut);
          const left = rate.resetAt - o.now();
          if (need > rate.remaining && left > 0) {
            await o.wait(Math.min(left, MAX_RATE_WAIT_MS) + 300, label + ": лимит токенов, жду");
          }
          rate = null;
        }
        o.status(label + "…");
        const r = await o.send(system, user, maxTokens);
        calls++;
        if (r.ok) {
          learnFromSuccess(system, user, r.data);
          return r.data;
        }
        const info = parseLlmError(r.info && r.info.status, (r.info && r.info.message) || r.error, r.info && r.info.retryAfter);
        if (info.kind === "too_large") throw new TooLarge(r.error, info);
        if (info.kind === "quota") throw new Error("Лимит провайдера исчерпан надолго. " + r.error);
        if (info.kind === "rate" && ++rateTries <= MAX_RATE_RETRIES) {
          await o.wait((info.waitMs != null ? info.waitMs : 15000) + 500, label + ": лимит запросов, жду");
          continue;
        }
        throw new Error(r.error);
      }
    }

    const result = (text, extra) => Object.assign({ text, calls, lim }, extra);

    /* 1. Целиком, если помещается (или лимит ещё неизвестен) */
    const fullText = pieces.join(o.sep);
    const single = o.buildSingle(fullText);
    const singleTokens = est(o.system) + est(single);
    if (!lim.tpm || singleTokens + (o.finalOut > 0 ? o.finalOut : FINAL_OUT_DEFAULT) <= cap()) {
      try {
        const d = await call(o.system, single, o.finalOut > 0 ? o.finalOut : 0, "Запрос");
        return result(d.text, { chunked: false, parts: 1 });
      } catch (e) {
        if (!(e instanceof TooLarge)) throw e;
        learnTooLarge(e, singleTokens);
      }
    }
    o.status(`Транскрипт не помещается в лимит модели (${lim.tpm} ток.), разбиваю на части…`);

    /* 2. MAP: заметки по частям */
    const mapOverhead = () => est(o.system) + est(mapPrompt(o.task, o.header, 99, ""));
    const notes = [];
    let pos = 0;
    while (pos < pieces.length) {
      o.check();
      const budget = cap() - MAP_OUT - mapOverhead();
      if (budget < MIN_CHUNK) {
        throw new Error(
          `Лимит ${lim.tpm} ток. слишком мал для разбиения: на фрагмент транскрипта остаётся ${Math.max(0, budget)} ток. ` +
          `Укажите больший лимит в настройках или сократите задание.`
        );
      }
      const part = packNext(pieces, pos, budget, lim.k, o.sep);
      const remain = est(pieces.slice(pos).join(o.sep));
      const total = notes.length + Math.max(1, Math.ceil(remain / budget));
      try {
        const d = await call(o.system, mapPrompt(o.task, o.header, notes.length + 1, part.text), MAP_OUT,
          `Часть ${notes.length + 1} из ~${total}`);
        notes.push(String(d.text).trim());
        pos = part.next;
      } catch (e) {
        if (!(e instanceof TooLarge)) throw e;
        learnTooLarge(e, part.tokens + mapOverhead() + MAP_OUT);
      }
    }
    const parts = notes.length;

    /* 3. REDUCE: итог (при необходимости — сначала сжатие заметок) */
    let current = notes;
    let level = 0;
    for (let guard = 0; guard < 20; guard++) {
      o.check();
      const joined = current.join(NOTE_SEP);
      const finalBudget = cap() - finalOut - est(o.system) - est(finalPrompt(o.task, o.header, ""));
      if (finalBudget < MIN_CHUNK) {
        throw new Error(
          `Лимит ${lim.tpm} ток. слишком мал: после резерва под ответ (${finalOut} ток.) не остаётся места для заметок. ` +
          `Уменьшите «Макс. токенов ответа» или укажите больший лимит.`
        );
      }
      if (est(joined) <= finalBudget) {
        try {
          const d = await call(o.system, finalPrompt(o.task, o.header, joined), finalOut, "Итоговый ответ");
          return result(d.text, { chunked: true, parts });
        } catch (e) {
          if (!(e instanceof TooLarge)) throw e;
          learnTooLarge(e, est(joined) + finalOut);
          continue;
        }
      }
      if (++level > 6) throw new Error("Не удалось сжать заметки до лимита модели.");
      const mergeBudget = cap() - MAP_OUT - est(o.system) - est(mergePrompt(""));
      if (mergeBudget < MIN_CHUNK) throw new Error("Лимит модели слишком мал для объединения заметок.");
      const arr = current.slice();
      const groups = [];
      for (let p = 0; p < arr.length; ) {
        const g = packNext(arr, p, mergeBudget, lim.k, NOTE_SEP);
        groups.push(g.text);
        p = g.next;
      }
      if (groups.length >= current.length) {
        throw new Error("Заметки не удаётся сжать: лимит модели слишком мал для выбранных настроек.");
      }
      const merged = [];
      try {
        for (let i = 0; i < groups.length; i++) {
          const d = await call(o.system, mergePrompt(groups[i]), MAP_OUT, `Объединение заметок ${i + 1} из ${groups.length}`);
          merged.push(String(d.text).trim());
        }
      } catch (e) {
        if (!(e instanceof TooLarge)) throw e;
        learnTooLarge(e, mergeBudget);
        level--;
        continue;
      }
      current = merged;
    }
    throw new Error("Не удалось уложиться в лимит модели.");
  }

  return {
    estimateTokens, parseDuration, parseLlmError, limitChars, packNext,
    mapPrompt, mergePrompt, finalPrompt, summarize, TooLarge,
    consts: { SAFETY, MAP_OUT, FINAL_OUT_DEFAULT, MIN_CHUNK },
  };
});
