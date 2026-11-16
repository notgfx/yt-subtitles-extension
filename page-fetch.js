"use strict";

/*
 * Функции ниже выполняются В КОНТЕКСТЕ СТРАНИЦЫ YouTube (chrome.scripting, world: "MAIN"),
 * поэтому должны быть полностью самодостаточными: никаких внешних переменных и функций.
 */

// Читает список дорожек из плеера открытой страницы.
function pageGetTracks() {
  try {
    const text = (x) =>
      (x && (x.simpleText || (x.runs || []).map((r) => r.text).join(""))) || "";

    const player = document.getElementById("movie_player");
    const pr =
      (player && player.getPlayerResponse && player.getPlayerResponse()) ||
      window.ytInitialPlayerResponse;
    const r = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;

    return {
      videoId: (pr && pr.videoDetails && pr.videoDetails.videoId) || "",
      title: (pr && pr.videoDetails && pr.videoDetails.title) || "",
      status: pr && pr.playabilityStatus && pr.playabilityStatus.status,
      reason: pr && pr.playabilityStatus && pr.playabilityStatus.reason,
      tracks: ((r && r.captionTracks) || []).map((t) => ({
        baseUrl: t.baseUrl,
        languageCode: t.languageCode,
        kind: t.kind || "",
        name: text(t.name) || t.languageCode,
        isTranslatable: !!t.isTranslatable,
      })),
      translationLanguages: ((r && r.translationLanguages) || []).map((l) => ({
        languageCode: l.languageCode,
        name: text(l.languageName) || l.languageCode,
      })),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// Скачивает субтитры дорожки baseUrl (опционально с переводом tlang).
// YouTube требует PO Token (параметр pot), который генерирует только сам плеер,
// когда включены субтитры. Поэтому:
//   1) ищем в истории запросов страницы запрос плеера к timedtext с pot;
//   2) если его нет — двойной клик по CC в одном тике (вкл/выкл до paint)
//      и на это время прячем окно субтитров;
//   3) если pot так и не появился — короткий setOption и сразу выключаем дорожку;
//   4) переносим pot в URL нужной дорожки и скачиваем уже при выключенных субтитрах.
// Ход: document event "yts-subs-progress", detail.pct 0..100.
async function pageFetchSubtitles(baseUrl, tlang) {
  const logLines = [];
  const L = (s) => logLines.push(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const describe = (href) => {
    try {
      const u = new URL(href);
      const ps = [...u.searchParams].map(([k, v]) =>
        v.length > 14 ? `${k}=${v.slice(0, 8)}…(${v.length})` : `${k}=${v}`
      );
      return u.pathname + "?" + ps.join("&");
    } catch (_) {
      return String(href).slice(0, 80);
    }
  };

  const target = new URL(baseUrl);
  const videoId = target.searchParams.get("v");
  const wantedLang = target.searchParams.get("lang");
  const wantedKind = target.searchParams.get("kind") || "";
  const player = document.getElementById("movie_player");
  const report = (pct) => {
    try {
      document.dispatchEvent(new CustomEvent("yts-subs-progress", { detail: { pct } }));
    } catch (_) { /* панель просто не увидит ход */ }
  };

  // Ловим новые запросы плеера к timedtext
  const seen = [];
  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name.includes("/api/timedtext")) seen.push(e.name);
      }
    });
    observer.observe({ type: "resource" });
  } catch (_) { /* не критично */ }

  const findTemplate = () => {
    const all = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => n.includes("/api/timedtext"))
      .concat(seen);
    for (let i = all.length - 1; i >= 0; i--) {
      try {
        const u = new URL(all[i]);
        if (u.searchParams.get("pot") && u.searchParams.get("v") === videoId) return u;
      } catch (_) { /* пропускаем */ }
    }
    return null;
  };

  let changedPlayer = false;
  let prevTrack = null;
  let hideStyle = null;

  const hideCaptions = () => {
    if (hideStyle) return;
    hideStyle = document.createElement("style");
    hideStyle.textContent = ".ytp-caption-window-container{visibility:hidden!important}";
    (document.head || document.documentElement).appendChild(hideStyle);
  };
  const showCaptions = () => {
    if (!hideStyle) return;
    try { hideStyle.remove(); } catch (_) {}
    hideStyle = null;
  };
  const ccButton = () => document.querySelector("button.ytp-subtitles-button");
  const restorePlayer = () => {
    if (!changedPlayer || !player) return;
    try {
      if (prevTrack && prevTrack.languageCode) player.setOption("captions", "track", prevTrack);
      else {
        player.setOption("captions", "track", {});
        try { player.unloadModule("captions"); } catch (_) {}
      }
    } catch (_) { /* не критично */ }
    changedPlayer = false;
  };

  try {
    report(8);
    let tmpl = findTemplate();
    L(
      tmpl
        ? "Найден готовый запрос плеера с pot: " + describe(tmpl.href)
        : "Готового запроса с pot нет — короткое включение CC"
    );

    if (!tmpl) {
      report(28);
      const btn = ccButton();
      const alreadyOn = !!(btn && btn.getAttribute("aria-pressed") === "true");
      if (btn && !alreadyOn) hideCaptions();

      if (btn && !alreadyOn) {
        L("Двойной клик по кнопке CC");
        tmpl = await new Promise((resolve) => {
          let settled = false;
          const finish = (url) => {
            if (settled) return;
            settled = true;
            resolve(url);
          };
          btn.addEventListener("click", () => {
            (async () => {
              let url = null;
              for (let i = 0; i < 16 && !url; i++) {
                await sleep(50);
                url = findTemplate();
              }
              finish(url);
            })();
          }, { once: true });
          btn.click();
          btn.click();
          setTimeout(() => finish(findTemplate()), 1200);
        });
        const stillOn = ccButton();
        if (stillOn && stillOn.getAttribute("aria-pressed") === "true") stillOn.click();
      } else if (alreadyOn) {
        L("CC уже включены, кнопку не трогаю");
      } else {
        L("Кнопка CC не найдена");
      }

      if (!tmpl && alreadyOn && player && player.setOption) {
        try { player.setOption("captions", "reload", true); L("CC уже включены, reload"); } catch (_) {}
        for (let i = 0; i < 16 && !tmpl; i++) {
          await sleep(50);
          tmpl = findTemplate();
        }
      }

      if (!tmpl && player && player.setOption && player.getOption) {
        try {
          try { prevTrack = player.getOption("captions", "track"); } catch (_) {}
          L("Двойной клик не дал pot. Короткий setOption, дорожка была: " + ((prevTrack && prevTrack.languageCode) || "выкл"));
          if (!(prevTrack && prevTrack.languageCode)) hideCaptions();
          try { player.loadModule("captions"); } catch (_) {}

          let list = [];
          for (let i = 0; i < 8; i++) {
            try { list = player.getOption("captions", "tracklist") || []; } catch (_) {}
            if (list.length) break;
            await sleep(80);
          }
          L("Дорожек в плеере: " + list.length);

          const t =
            list.find((x) => x.languageCode === wantedLang && (x.kind || "") === wantedKind) ||
            list.find((x) => x.languageCode === wantedLang) ||
            list[0] ||
            { languageCode: wantedLang };

          changedPlayer = true;
          player.setOption("captions", "track", t);
          L("Включена дорожка: " + t.languageCode);

          for (let i = 0; i < 24 && !tmpl; i++) {
            await sleep(50);
            tmpl = findTemplate();
            if (i === 10 && !tmpl) {
              try { player.setOption("captions", "reload", true); L("Повторный запрос (reload)"); } catch (_) {}
            }
          }
        } catch (e) {
          L("ОШИБКА при включении субтитров: " + e);
        }
      } else if (!tmpl) {
        L("ОШИБКА: movie_player недоступен или не поддерживает setOption");
      }

      L(
        tmpl
          ? "Перехвачен запрос плеера: " + describe(tmpl.href)
          : "ОШИБКА: pot так и не появился. Запросов timedtext от плеера: " + seen.length
      );
      seen.slice(-2).forEach((s) => L("  замечено: " + describe(s)));

      restorePlayer();
      await sleep(32);
      showCaptions();
    }

    report(64);

    // Строим URL нужной дорожки: подписанный baseUrl + параметры плеера (pot, potc, c, cver, ...)
    const SKIP = ["lang", "kind", "name", "tlang", "fmt", "v"];
    const u = new URL(baseUrl);
    if (tmpl) {
      for (const [k, v] of tmpl.searchParams) {
        if (!SKIP.includes(k) && !u.searchParams.has(k)) u.searchParams.set(k, v);
      }
    }
    if (tlang) u.searchParams.set("tlang", tlang);
    L("Итоговый запрос: " + describe(u.href));

    report(82);
    for (const fmt of ["json3", ""]) {
      if (fmt) u.searchParams.set("fmt", fmt);
      else u.searchParams.delete("fmt");
      const res = await fetch(u.href, { credentials: "include" });
      const body = await res.text();
      L(`fmt=${fmt || "по умолч."}: HTTP ${res.status}, ${res.headers.get("content-type")}, длина ${body.length}`);
      if (body.trim()) {
        report(100);
        return { ok: true, text: body, log: logLines };
      }
    }
    return { ok: false, error: "YouTube вернул пустой ответ", log: logLines };
  } catch (e) {
    L("ИСКЛЮЧЕНИЕ: " + e);
    return { ok: false, error: String(e), log: logLines };
  } finally {
    try { if (observer) observer.disconnect(); } catch (_) {}
    restorePlayer();
    showCaptions();
  }
}
