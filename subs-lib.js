"use strict";

// Общая библиотека: разбор субтитров, форматы вывода, текст для ИИ.
const YTS = (() => {
  const pad = (n, len = 2) => String(n).padStart(len, "0");

  function decodeEntities(s) {
    const ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  }

  function cleanText(s) {
    return decodeEntities(s)
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/\u200b/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function parseJson3(text) {
    const data = JSON.parse(text);
    const cues = [];
    for (const ev of data.events || []) {
      if (!ev.segs) continue;
      const t = cleanText(ev.segs.map((s) => s.utf8 || "").join(""));
      if (!t) continue;
      const start = ev.tStartMs || 0;
      cues.push({ start, end: start + (ev.dDurationMs || 2000), text: t });
    }
    return cues;
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const cues = [];
    const ps = doc.querySelectorAll("p"); // srv3
    if (ps.length) {
      ps.forEach((p) => {
        const t = cleanText(p.textContent || "");
        if (!t) return;
        const start = Number(p.getAttribute("t")) || 0;
        const dur = Number(p.getAttribute("d")) || 2000;
        cues.push({ start, end: start + dur, text: t });
      });
      return cues;
    }
    doc.querySelectorAll("text").forEach((el) => {
      const t = cleanText(el.textContent || "");
      if (!t) return;
      const start = Math.round(parseFloat(el.getAttribute("start") || "0") * 1000);
      const dur = Math.round(parseFloat(el.getAttribute("dur") || "2") * 1000);
      cues.push({ start, end: start + dur, text: t });
    });
    return cues;
  }

  function parseCaptions(text) {
    const t = (text || "").trim();
    if (!t) return [];
    return t.startsWith("{") ? parseJson3(t) : parseXml(t);
  }

  function formatTime(ms, sep) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
  }

  // Короткий таймкод: мм:сс или ч:мм:сс
  function clock(ms) {
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  const toSrt = (cues) =>
    cues.map((c, i) => `${i + 1}\n${formatTime(c.start, ",")} --> ${formatTime(c.end, ",")}\n${c.text}\n`).join("\n");

  const toVtt = (cues) =>
    "WEBVTT\n\n" +
    cues.map((c) => `${formatTime(c.start, ".")} --> ${formatTime(c.end, ".")}\n${c.text}\n`).join("\n");

  const toTxt = (cues) => cues.map((c) => c.text.replace(/\n/g, " ")).join("\n") + "\n";

  // Транскрипт для ИИ: с таймкодами «[мм:сс] текст» или сплошным текстом
  function toAiLines(cues, withTs) {
    return cues.map((c) => (withTs ? `[${clock(c.start)}] ` : "") + c.text.replace(/\n/g, " "));
  }
  function toAiText(cues, withTs) {
    return toAiLines(cues, withTs).join(withTs ? "\n" : " ");
  }

  const FORMATS = {
    srt: { build: toSrt, mime: "application/x-subrip" },
    vtt: { build: toVtt, mime: "text/vtt" },
    txt: { build: toTxt, mime: "text/plain" },
  };

  function saveFile(filename, content, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const safeFilename = (s) =>
    (s || "subtitles").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 120);

  return { parseCaptions, clock, toAiText, toAiLines, FORMATS, saveFile, safeFilename };
})();
