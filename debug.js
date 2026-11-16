"use strict";

const params = new URLSearchParams(location.search);
const tabId = Number(params.get("tab")) || null;

const out = document.getElementById("log");
let lines = [];

function log(s = "") {
  lines.push(s);
  out.textContent = lines.join("\n");
}

const oneLine = (s, n = 140) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

function describeUrl(u) {
  try {
    const url = new URL(u);
    const ps = [...url.searchParams.entries()].map(([k, v]) =>
      v.length > 14 ? `${k}=${v.slice(0, 10)}…(${v.length})` : `${k}=${v}`
    );
    return `${url.pathname}?${ps.join("&")}`;
  } catch (_) {
    return oneLine(u, 100);
  }
}

async function inPage(func, args = []) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return r && r.result;
}

function analyze(text) {
  const t = (text || "").trim();
  if (!t) return "пусто";
  if (t.startsWith("{")) {
    try { return `json3, событий: ${(JSON.parse(t).events || []).length}`; } catch (_) { return "битый JSON"; }
  }
  const n = (t.match(/<text\b/g) || []).length + (t.match(/<p\b/g) || []).length;
  return n ? `XML, строк: ${n}` : "неизвестный формат";
}


async function showAIDiagnostics() {
  log("\n=== 4. Диагностика ИИ / Grok API ===");

  try {
    const data = await chrome.storage.local.get("__aiDiagnostics");
    const records = data.__aiDiagnostics || [];

    if (!records.length) {
      log("Диагностических отчётов пока нет.");
      log("Сначала запустите тест API или создайте саммари.");
      return;
    }

    log(`Сохранено запросов: ${records.length}`);

    records.forEach((d, i) => {
      log(`\n--- Запрос #${i + 1} ---`);
      log(`Дата: ${d.timestamp || "?"}`);
      log(`Провайдер: ${d.provider || "?"}`);
      log(`Модель: ${d.model || "?"}`);
      log(`Стиль API: ${d.style || "?"}`);
      log(`Этап: ${d.stage || "?"}`);
      log(`Результат: ${d.result || "?"}`);
      log(`Endpoint: ${d.endpoint || "?"}`);
      log(`Время: ${d.responseTimeMs ?? "?"} мс`);

      if (d.request) {
        log(`Длина system prompt: ${d.request.systemLength ?? "?"}`);
        log(`Длина user prompt: ${d.request.userLength ?? "?"}`);
        log(`Max tokens: ${d.request.maxTokens ?? "?"}`);
      }

      if (d.http) {
        log(`HTTP: ${d.http.status} ${d.http.statusText}`);
        log(`HTTP OK: ${d.http.ok}`);
      } else {
        log("HTTP: ответ не получен");
      }

      if (d.responseHeaders) {
        log("Заголовки ответа:");
        log(JSON.stringify(d.responseHeaders, null, 2));
      }

      if (d.jsonParsing) {
        log(`JSON parsing: ${d.jsonParsing}`);
      }

      if (d.jsonParsingError) {
        log(`Ошибка JSON: ${d.jsonParsingError}`);
      }

      if (d.responseStructure) {
        log("Структура ответа:");
        log(JSON.stringify(d.responseStructure, null, 2));
      }

      if (d.extractedTextLength !== undefined) {
        log(`Извлечено символов: ${d.extractedTextLength}`);
      }

      if (d.error) {
        log("ОШИБКА:");
        log(JSON.stringify(d.error, null, 2));
      }

      if (d.rawResponse !== undefined) {
        log(
          `Исходный ответ (${d.responseLength ?? d.rawResponse.length} символов` +
          (d.rawResponseTruncated ? ", ОБРЕЗАН" : "") +
          "):"
        );
        log(d.rawResponse || "(пусто)");
      }
    });

  } catch (e) {
    log("Не удалось получить диагностику: " + e.message);
  }
}


async function runCase(title, track, tlang) {
  log(`\n--- ${title} ---`);
  const r = await inPage(pageFetchSubtitles, [track.baseUrl, tlang || ""]);
  if (!r) return log("  нет ответа от страницы");
  (r.log || []).forEach((l) => log("  " + l));
  if (r.ok) {
    log(`  ✔ РЕЗУЛЬТАТ: ${analyze(r.text)}, длина ${r.text.length}`);
    log(`  начало: "${oneLine(r.text, 120)}"`);
  } else {
    log(`  ✘ РЕЗУЛЬТАТ: ${r.error}`);
  }
  return r;
}

async function run() {
  lines = [];
  out.textContent = "Запуск…";

  log(`Расширение v${chrome.runtime.getManifest().version}`);
  log(`Браузер: ${navigator.userAgent}`);
  await showAIDiagnostics();

  if (!tabId) return log("Вкладка YouTube не передана. Откройте отладку через popup расширения.");

  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (_) { return log("Вкладка недоступна (закрыта?)."); }
  log(`Вкладка: ${describeUrl(tab.url || "")}`);
  if (!/^https:\/\/www\.youtube\.com\//.test(tab.url || "")) return log("Это не страница YouTube.");

  log("\n=== 1. Данные плеера на странице ===");
  const info = await inPage(pageGetTracks);
  if (!info || info.error) return log("ОШИБКА: " + ((info && info.error) || "нет ответа"));

  log(`Видео: ${info.videoId} — ${oneLine(info.title, 80)}`);
  log(`playability: ${info.status}${info.reason ? " — " + oneLine(info.reason, 80) : ""}`);
  log(`Дорожек: ${info.tracks.length}; языков перевода: ${info.translationLanguages.length}`);
  info.tracks.slice(0, 5).forEach((t, i) => {
    log(`  #${i} ${t.languageCode}${t.kind ? " (" + t.kind + ")" : ""}${t.isTranslatable ? ", можно переводить" : ""}`);
  });
  if (info.tracks[0]) log("  URL #0: " + describeUrl(info.tracks[0].baseUrl));

  const existing = await inPage(() =>
    performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/api/timedtext"))
  );
  log(`\nЗапросов плеера к timedtext в истории страницы: ${existing ? existing.length : "?"}`);
  (existing || []).slice(-2).forEach((u) => log("  " + describeUrl(u)));

  if (!info.tracks.length) return log("\nДорожек нет — тестировать нечего.");

  log("\n=== 2. Загрузка ===");
  const first = info.tracks[0];
  const r1 = await runCase(`Дорожка #0 (${first.languageCode}), без перевода`, first, "");

  if (first.isTranslatable && info.translationLanguages.length) {
    const tl = first.languageCode === "en" ? "de" : "en";
    await runCase(`Дорожка #0 с переводом на ${tl}`, first, tl);
  }

  if (info.tracks.length > 1) {
    await runCase(`Дорожка #1 (${info.tracks[1].languageCode})`, info.tracks[1], "");
  }

  log("\n=== 3. Итог ===");
  log(r1 && r1.ok
    ? "Основной сценарий работает."
    : "Основной сценарий не сработал — см. шаги выше (нашёлся ли pot, сколько запросов timedtext заметили, что ответил YouTube).");
}

document.getElementById("rerun").addEventListener("click", run);
document.getElementById("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(lines.join("\n"));
  const b = document.getElementById("copy");
  const old = b.textContent;
  b.textContent = "Скопировано ✔";
  setTimeout(() => (b.textContent = old), 1500);
});

run();
