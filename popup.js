"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  tabId: null,
  videoId: "",
  title: "",
  tracks: [],
  translationLanguages: [],
};

/* ---------- Вспомогательные функции ---------- */

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
}

function setProgress(pct) {
  const el = $("prog");
  if (pct == null) {
    el.hidden = true;
    el.firstElementChild.style.width = "0";
    return;
  }
  el.hidden = false;
  el.firstElementChild.style.width = Math.max(0, Math.min(100, pct)) + "%";
}

async function watchPageProgress() {
  await chrome.scripting.executeScript({
    target: { tabId: state.tabId },
    world: "ISOLATED",
    func: () => {
      if (window.__ytsSubsProgress) return;
      window.__ytsSubsProgress = true;
      document.addEventListener("yts-subs-progress", (e) => {
        const pct = e.detail && e.detail.pct;
        if (typeof pct !== "number") return;
        chrome.runtime.sendMessage({ type: "subsProgress", pct }).catch(() => {});
      });
    },
  });
  const listener = (msg) => {
    if (msg && msg.type === "subsProgress" && typeof msg.pct === "number") setProgress(msg.pct);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

async function runInPage(func, args = []) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: state.tabId },
    world: "MAIN",
    func,
    args,
  });
  return res && res.result;
}

/* ---------- Интерфейс ---------- */

function trackLabel(t) {
  return t.kind === "asr" ? `${t.name} (автоматические)` : t.name;
}

function fillTracks() {
  const sel = $("track");
  sel.innerHTML = "";
  state.tracks.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = trackLabel(t);
    sel.appendChild(opt);
  });
  const manual = state.tracks.findIndex((t) => t.kind !== "asr"); // ручные — в приоритете
  sel.value = String(manual >= 0 ? manual : 0);
  updateTranslateBlock();
}

function updateTranslateBlock() {
  const track = state.tracks[Number($("track").value)];
  const canTranslate = track && track.isTranslatable && state.translationLanguages.length > 0;
  $("translateBlock").classList.toggle("hidden", !canTranslate);
  if (!canTranslate) return;

  const sel = $("translate");
  sel.innerHTML = '<option value="">Без перевода</option>';
  state.translationLanguages.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.languageCode;
    opt.textContent = l.name;
    sel.appendChild(opt);
  });
}

async function onDownload() {
  const track = state.tracks[Number($("track").value)];
  if (!track) return;

  const btn = $("download");
  btn.disabled = true;
  setStatus("");
  setProgress(4);
  let unwatch = () => {};
  try { unwatch = await watchPageProgress(); } catch (_) { /* бар останется на стартовых 4% */ }

  try {
    const translateTo = $("translateBlock").classList.contains("hidden") ? "" : $("translate").value;
    const r = await runInPage(pageFetchSubtitles, [track.baseUrl, translateTo]);
    if (!r || !r.ok) {
      throw new Error((r && r.error) || "нет ответа от страницы");
    }
    const cues = YTS.parseCaptions(r.text);
    if (!cues.length) throw new Error("Не удалось разобрать ответ YouTube");

    const ext = $("format").value;
    const fmt = YTS.FORMATS[ext];
    const lang = translateTo || track.languageCode;
    YTS.saveFile(`${YTS.safeFilename(state.title)} [${state.videoId}].${lang}.${ext}`, fmt.build(cues), fmt.mime);
    setStatus(`Готово: ${cues.length} строк`, "ok");
  } catch (e) {
    setStatus(`Ошибка: ${e.message}. Подробности — по ссылке «Отладка».`, "error");
  } finally {
    unwatch();
    setProgress(null);
    btn.disabled = false;
  }
}

async function init() {
  $("track").addEventListener("change", updateTranslateBlock);
  $("download").addEventListener("click", onDownload);
  $("debugLink").addEventListener("click", (e) => {
    e.preventDefault();
    if (!state.tabId) return setStatus("Откройте страницу видео на YouTube", "error");
    const q = new URLSearchParams({ v: state.videoId || "", tab: state.tabId });
    chrome.tabs.create({ url: chrome.runtime.getURL("debug.html?" + q) });
  });

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) { /* нет доступа */ }

  if (!tab || !/^https:\/\/www\.youtube\.com\/(watch|shorts|live)/.test(tab.url || "")) {
    setStatus("Откройте страницу видео на YouTube и нажмите на иконку расширения снова.");
    return;
  }
  state.tabId = tab.id;

  setStatus("Читаю список субтитров…");
  try {
    const info = await runInPage(pageGetTracks);
    if (!info || info.error) throw new Error((info && info.error) || "нет ответа от страницы");

    state.videoId = info.videoId;
    state.title = info.title;
    state.tracks = info.tracks;
    state.translationLanguages = info.translationLanguages;
    $("title").textContent = info.title;

    if (!info.tracks.length) {
      const why = info.status && info.status !== "OK" ? ` (${info.reason || info.status})` : "";
      setStatus("У этого видео нет субтитров или они недоступны" + why, "error");
      return;
    }
    fillTracks();
    $("controls").classList.remove("hidden");
    setStatus("");
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
}

init();
