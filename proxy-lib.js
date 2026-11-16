"use strict";

// Чистые функции прокси и переноса настроек.
// Файл подключается и в service worker, и в панели, и в node-проверках.

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.YTSProxy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCHEMA_VERSION = 1;
  const SCHEMES = ["http", "https", "socks4", "socks5"];
  const SCHEME_LABELS = {
    http: "HTTP",
    https: "HTTPS",
    socks4: "SOCKS4",
    socks5: "SOCKS5",
  };
  const CHECK_STATUSES = ["ok", "connect", "auth", "timeout", "error"];
  const IP_CHECK_HOSTS = ["api.ipify.org", "api64.ipify.org"];
  const CHECK_TIMEOUT_MS = 7000;

  function emptyProxyState() {
    return { enabled: false, activeId: null, items: [] };
  }

  function newProxyId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "px-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function stripHost(host) {
    return String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  }

  function isLocalHost(host) {
    const h = stripHost(host);
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  }

  function hostFromUrl(value) {
    try {
      return stripHost(new URL(value).hostname);
    } catch (_) {
      return "";
    }
  }

  function proxyKey(item) {
    return [item.scheme, stripHost(item.host), String(item.port), item.username || ""].join("|");
  }

  function normalizeCheck(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!CHECK_STATUSES.includes(raw.status)) return null;
    const latency = Number(raw.latencyMs);
    return {
      status: raw.status,
      latencyMs: Number.isFinite(latency) ? latency : null,
      ip: typeof raw.ip === "string" ? raw.ip.slice(0, 80) : "",
      error: typeof raw.error === "string" ? raw.error.slice(0, 300) : "",
      checkedAt: typeof raw.checkedAt === "string" ? raw.checkedAt.slice(0, 40) : "",
    };
  }

  function normalizeItem(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Запись прокси повреждена");
    }
    const scheme = String(input.scheme || "").toLowerCase();
    if (!SCHEMES.includes(scheme)) throw new Error("Неизвестный тип подключения прокси");

    const host = stripHost(input.host);
    if (!host || /[\s/\\]/.test(host) || host.includes("://")) {
      throw new Error("Укажите IP-адрес или домен без схемы и пути");
    }

    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Порт должен быть числом от 1 до 65535");
    }

    const username = typeof input.username === "string" ? input.username : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (username.length > 256 || password.length > 256) {
      throw new Error("Слишком длинный логин или пароль");
    }

    const item = {
      id: typeof input.id === "string" && input.id.trim() ? input.id.trim().slice(0, 80) : newProxyId(),
      name: typeof input.name === "string" ? input.name.trim().slice(0, 80) : "",
      scheme,
      host,
      port,
      username,
      password,
    };
    const lastCheck = normalizeCheck(input.lastCheck);
    if (lastCheck) item.lastCheck = lastCheck;
    return item;
  }

  function isDuplicate(items, item, exceptId) {
    const key = proxyKey(item);
    return (items || []).some((other) => other.id !== exceptId && proxyKey(other) === key);
  }

  function normalizeProxyState(raw, opts) {
    const strict = !!(opts && opts.strict);
    if (raw == null) {
      if (strict) throw new Error("В файле нет настроек прокси");
      return emptyProxyState();
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Настройки прокси повреждены");
    }

    const list = Array.isArray(raw.items) ? raw.items : [];
    if (raw.items != null && !Array.isArray(raw.items)) {
      throw new Error("Список прокси повреждён");
    }

    const items = [];
    const seen = new Set();
    for (const entry of list) {
      const item = normalizeItem(entry);
      const key = proxyKey(item);
      if (seen.has(key)) {
        if (strict) throw new Error("В списке прокси есть дубликаты");
        continue;
      }
      seen.add(key);
      items.push(item);
    }

    let activeId = typeof raw.activeId === "string" && raw.activeId ? raw.activeId : null;
    if (activeId && !items.some((item) => item.id === activeId)) {
      if (strict) throw new Error("Выбранный прокси отсутствует в списке");
      activeId = null;
    }

    return { enabled: !!raw.enabled, activeId, items };
  }

  function pacEndpoint(item) {
    const host = item.host.includes(":") ? "[" + item.host + "]" : item.host;
    const point = host + ":" + item.port;
    switch (item.scheme) {
      case "http": return "PROXY " + point;
      case "https": return "HTTPS " + point;
      case "socks4": return "SOCKS4 " + point;
      case "socks5": return "SOCKS5 " + point;
      default: throw new Error("Неизвестный тип подключения прокси");
    }
  }

  function buildPacScript(item, hosts) {
    const proxy = normalizeItem(item);
    const targets = [];
    (hosts || []).forEach((host) => {
      const clean = stripHost(host);
      if (!clean || isLocalHost(clean) || targets.includes(clean)) return;
      targets.push(clean);
    });
    const token = pacEndpoint(proxy);
    return [
      "function FindProxyForURL(url, host) {",
      "  var h = String(host || \"\").toLowerCase().replace(/^\\[|\\]$/g, \"\");",
      "  if (h === \"localhost\" || h === \"127.0.0.1\" || h === \"::1\") return \"DIRECT\";",
      "  var targets = " + JSON.stringify(targets) + ";",
      "  for (var i = 0; i < targets.length; i++) {",
      "    if (h === targets[i]) return " + JSON.stringify(token) + ";",
      "  }",
      "  return \"DIRECT\";",
      "}",
    ].join("\n");
  }

  function pacRoutesHost(pac, host) {
    const clean = stripHost(host);
    if (!clean || isLocalHost(clean)) return false;
    const match = String(pac || "").match(/var targets = (\[[\s\S]*?\]);/);
    if (!match) return false;
    try {
      const targets = JSON.parse(match[1]);
      return Array.isArray(targets) && targets.indexOf(clean) !== -1;
    } catch (_) {
      return false;
    }
  }

  function llmHosts(ai, presets) {
    const cfg = ai && typeof ai === "object" ? ai : {};
    const id = typeof cfg.active === "string" && cfg.active ? cfg.active : "anthropic";
    const preset = (presets && presets[id]) || {};
    const profiles = cfg.profiles && typeof cfg.profiles === "object" ? cfg.profiles : {};
    const prof = profiles[id] && typeof profiles[id] === "object" ? profiles[id] : {};
    const hosts = [];
    [prof.url, preset.url, preset.modelsUrl].forEach((value) => {
      const host = hostFromUrl(value);
      if (host && !hosts.includes(host)) hosts.push(host);
    });
    return hosts;
  }

  function classifyProxyError(err, status) {
    const name = err && err.name;
    const msg = String((err && err.message) || err || "");
    if (name === "AbortError" || /timeout|timed out|таймаут/i.test(msg)) {
      return { status: "timeout", error: "Тайм-аут: прокси не ответил вовремя" };
    }
    if (status === 407 || /407|ERR_PROXY_AUTH|PROXY_AUTH/i.test(msg)) {
      return { status: "auth", error: "Ошибка авторизации прокси" };
    }
    if (/ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_SOCKS|ERR_PROXY|ECONNREFUSED|ENOTFOUND|Failed to fetch|NetworkError|network error/i.test(msg)) {
      return { status: "connect", error: "Ошибка подключения к прокси" };
    }
    return { status: "error", error: (msg || "Неизвестная ошибка").slice(0, 300) };
  }

  function checkResult(partial) {
    return {
      status: partial.status,
      latencyMs: partial.latencyMs == null ? null : partial.latencyMs,
      ip: partial.ip || "",
      error: partial.error || "",
      checkedAt: partial.checkedAt || new Date().toISOString(),
    };
  }

  function statusLabel(status) {
    switch (status) {
      case "ok": return "успешно";
      case "connect": return "ошибка подключения";
      case "auth": return "ошибка авторизации";
      case "timeout": return "тайм-аут";
      default: return status === "error" ? "ошибка" : "не проверялся";
    }
  }

  function displayName(item) {
    if (item && item.name) return item.name;
    if (!item) return "Прокси";
    return SCHEME_LABELS[item.scheme] + " " + item.host + ":" + item.port;
  }

  function sanitizeAi(ai) {
    if (!ai || typeof ai !== "object" || Array.isArray(ai)) {
      throw new Error("В файле нет настроек LLM API");
    }
    const active = typeof ai.active === "string" && ai.active.trim() ? ai.active.trim().slice(0, 40) : "anthropic";
    const profiles = {};
    const src = ai.profiles && typeof ai.profiles === "object" && !Array.isArray(ai.profiles) ? ai.profiles : {};
    Object.keys(src).forEach((id) => {
      const prof = src[id];
      if (!prof || typeof prof !== "object" || Array.isArray(prof)) {
        throw new Error("Профиль API «" + id + "» повреждён");
      }
      profiles[id] = {
        style: prof.style === "anthropic" ? "anthropic" : "openai",
        url: typeof prof.url === "string" ? prof.url : "",
        token: typeof prof.token === "string" ? prof.token : "",
        model: typeof prof.model === "string" ? prof.model : "",
      };
    });

    let maxTokens = "";
    if (ai.maxTokens !== "" && ai.maxTokens != null) {
      const n = Number(ai.maxTokens);
      if (!Number.isInteger(n) || n < 1) throw new Error("Некорректное значение «Макс. токенов ответа»");
      maxTokens = n;
    }

    let maxChars = ai.maxChars == null ? 200000 : Number(ai.maxChars);
    if (!Number.isInteger(maxChars) || maxChars < 1000) {
      throw new Error("Некорректный лимит транскрипта");
    }

    let maxInputTokens = 0;
    if (ai.maxInputTokens != null && ai.maxInputTokens !== "") {
      const n = Number(ai.maxInputTokens);
      if (!Number.isInteger(n) || n < 0) throw new Error("Некорректный лимит токенов запроса");
      maxInputTokens = n;
    }

    return { active, profiles, maxTokens, maxChars, maxInputTokens };
  }

  function sanitizeUi(ui) {
    if (ui == null) return {};
    if (typeof ui !== "object" || Array.isArray(ui)) throw new Error("Поле интерфейса повреждено");
    const out = {};
    ["collapsed", "withTs"].forEach((key) => {
      if (typeof ui[key] === "boolean") out[key] = ui[key];
    });
    ["pane", "last", "format", "promptId", "customPrompt", "lang"].forEach((key) => {
      if (typeof ui[key] === "string") out[key] = ui[key].slice(0, 20000);
    });
    return out;
  }

  function exportDocument(ui, ai, proxy, now) {
    const clean = normalizeProxyState(proxy);
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now || new Date().toISOString(),
      ui: sanitizeUi(ui || {}),
      ai: sanitizeAi(ai || { active: "anthropic", profiles: {}, maxTokens: "", maxChars: 200000 }),
      proxy: {
        enabled: !!clean.enabled,
        activeId: clean.activeId,
        items: clean.items,
      },
    };
  }

  function summarizeImport(doc) {
    const active = doc.proxy.items.find((item) => item.id === doc.proxy.activeId);
    return {
      provider: doc.ai.active,
      profiles: Object.keys(doc.ai.profiles || {}).length,
      proxies: doc.proxy.items.length,
      enabled: !!doc.proxy.enabled,
      activeName: active ? displayName(active) : "",
    };
  }

  function parseImport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("Файл не является корректным JSON");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("В файле нет объекта настроек");
    }
    if (data.schemaVersion !== SCHEMA_VERSION) {
      const seen = data.schemaVersion == null ? "без версии" : String(data.schemaVersion);
      throw new Error("Версия файла (" + seen + ") не поддерживается. Нужна schemaVersion " + SCHEMA_VERSION + ".");
    }
    const ai = sanitizeAi(data.ai);
    const ui = sanitizeUi(data.ui);
    const proxy = normalizeProxyState(data.proxy, { strict: true });
    const doc = { ui, ai, proxy };
    doc.summary = summarizeImport(doc);
    return doc;
  }

  return {
    SCHEMA_VERSION,
    SCHEMES,
    SCHEME_LABELS,
    IP_CHECK_HOSTS,
    CHECK_TIMEOUT_MS,
    emptyProxyState,
    newProxyId,
    stripHost,
    isLocalHost,
    hostFromUrl,
    proxyKey,
    normalizeItem,
    isDuplicate,
    normalizeProxyState,
    pacEndpoint,
    buildPacScript,
    pacRoutesHost,
    llmHosts,
    classifyProxyError,
    checkResult,
    statusLabel,
    displayName,
    sanitizeAi,
    sanitizeUi,
    exportDocument,
    parseImport,
  };
});
