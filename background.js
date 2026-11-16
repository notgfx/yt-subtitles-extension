
"use strict";

importScripts("page-fetch.js", "presets.js", "proxy-lib.js");

/* ---------- Диагностика ИИ ---------- */

const AI_DIAG_KEY = "__aiDiagnostics";
const AI_DIAG_LIMIT = 10;
const AI_RAW_LIMIT = 12000;

async function saveAIDiagnostic(diag) {
  try {
    const data = await chrome.storage.local.get(AI_DIAG_KEY);
    const records = data[AI_DIAG_KEY] || [];
    records.unshift(diag);
    await chrome.storage.local.set({
      [AI_DIAG_KEY]: records.slice(0, AI_DIAG_LIMIT),
    });
  } catch (e) {
    console.warn("[AI diagnostics] Не удалось сохранить отчёт:", e);
  }
}

function safeEndpoint(value) {
  try {
    const u = new URL(value);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch (_) {
    return "(не удалось определить URL)";
  }
}

function responseHeaderInfo(headers) {
  const result = {};
  const allowed = [
    "content-type",
    "content-length",
    "date",
    "server",
    "retry-after",
    "x-request-id",
    "request-id",
    "cf-ray",
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
  ];

  for (const name of allowed) {
    const value = headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

/* ---------- Вызов ИИ ---------- */

async function callAI(system, user, opts = {}) {
  const started = Date.now();

  const diag = {
    timestamp: new Date().toISOString(),
    provider: "AI API",
    stage: "initialization",
    endpoint: "",
    model: "",
    style: "",
    request: {},
    http: null,
    responseHeaders: {},
    responseTimeMs: 0,
    rawResponse: "",
    rawResponseTruncated: false,
    responseJson: null,
    responseStructure: null,
    error: null,
  };

  try {
    const { ai } = await chrome.storage.local.get("ai");
    const cfg = ai || {};
    const id = cfg.active || "anthropic";
    const preset = AI_PRESETS[id] || AI_PRESETS.custom;
    const prof = Object.assign(
      aiPresetDefaults(id),
      (cfg.profiles || {})[id] || {}
    );

    diag.provider = id;
    diag.endpoint = safeEndpoint(prof.url || "");
    diag.model = prof.model || "(не указана)";
    diag.style = prof.style || "(не указан)";
    diag.request = {
      systemLength: String(system || "").length,
      userLength: String(user || "").length,
      maxTokens: opts.maxTokens || Number(cfg.maxTokens) || 0,
    };

    if (!/^https?:\/\//i.test(prof.url || "")) {
      throw new Error("Не задан URL API (откройте ⚙ настройки)");
    }
    if (!prof.model) {
      throw new Error("Не указана модель (откройте ⚙ настройки)");
    }
    if (preset.needsKey && !prof.token) {
      throw new Error("Не задан API-токен (откройте ⚙ настройки)");
    }

    const maxTokens = opts.maxTokens || Number(cfg.maxTokens) || 0;
    let headers, body;

    if (prof.style === "anthropic") {
      headers = {
        "content-type": "application/json",
        "x-api-key": prof.token,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      };
      body = {
        model: prof.model,
        max_tokens: maxTokens || 4096,
        messages: [{ role: "user", content: user }],
      };
      if (system) body.system = system;
    } else {
      headers = { "content-type": "application/json" };
      if (prof.token) headers.authorization = "Bearer " + prof.token;

      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: user });

      body = { model: prof.model, messages };
      if (maxTokens) body.max_tokens = maxTokens;
    }

    diag.stage = "sending_request";
    const proxyMeta = await prepareProxyFor(prof.url);
    diag.proxy = proxyMeta;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5 * 60 * 1000);

    let res;
    try {
      res = await fetch(prof.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") {
        throw new Error("Таймаут: ИИ не ответил за 5 минут");
      }
      let host = "API";
      try { host = new URL(prof.url).host; } catch (_) {}
      if (proxyMeta.enabled && !proxyMeta.bypass) {
        const kind = YTSProxy.classifyProxyError(e);
        throw new Error(
          `${kind.error}. Не удалось связаться с ${host} через прокси. Прямое соединение не использовалось.`
        );
      }
      throw new Error(
        `Не удалось подключиться к ${host}: ${e.message}. Проверьте URL и доступность сервера.`
      );
    } finally {
      clearTimeout(timer);
    }

    diag.stage = "reading_response";
    diag.http = {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    };
    diag.responseHeaders = responseHeaderInfo(res.headers);

    const raw = await res.text();

    diag.rawResponse = raw.slice(0, AI_RAW_LIMIT);
    diag.rawResponseTruncated = raw.length > AI_RAW_LIMIT;
    diag.responseBytes = new TextEncoder().encode(raw).length;
    diag.responseLength = raw.length;

    let json = null;
    let jsonError = null;

    try {
      json = JSON.parse(raw);
    } catch (e) {
      jsonError = e.message;
    }

    diag.jsonParsing = json
      ? "success"
      : raw.length
        ? "failed"
        : "empty";

    if (jsonError) diag.jsonParsingError = jsonError;

    if (json && typeof json === "object") {
      const choices = Array.isArray(json.choices) ? json.choices : [];
      const firstChoice = choices[0] || {};
      const message = firstChoice.message || {};
      const content = message.content;

      diag.responseStructure = {
        topLevelKeys: Object.keys(json),
        choicesCount: choices.length,
        finishReason: firstChoice.finish_reason ?? null,
        messageKeys:
          message && typeof message === "object"
            ? Object.keys(message)
            : [],
        contentType: Array.isArray(content)
          ? "array"
          : content === null
            ? "null"
            : typeof content,
        contentLength:
          typeof content === "string"
            ? content.length
            : Array.isArray(content)
              ? content.length
              : null,
        usage: json.usage || null,
        error: json.error || null,
      };

      if (prof.style === "anthropic") {
        diag.responseStructure = {
          topLevelKeys: Object.keys(json),
          contentBlocks: Array.isArray(json.content)
            ? json.content.length
            : null,
          stopReason: json.stop_reason ?? null,
          usage: json.usage || null,
          error: json.error || null,
        };
      }
    }

    if (!res.ok) {
      const msg =
        (json &&
          ((json.error && (json.error.message || json.error)) ||
            json.message)) ||
        raw.slice(0, 300);

      const errText = typeof msg === "string" ? msg : JSON.stringify(msg);
      const httpErr = new Error(`HTTP ${res.status}: ${errText}`);
      // Структура для content.js: по ней он отличает «слишком большой запрос» и «подождите»
      httpErr.info = {
        status: res.status,
        message: errText,
        retryAfter:
          res.headers.get("retry-after") ||
          res.headers.get("x-ratelimit-reset-tokens") ||
          "",
      };
      throw httpErr;
    }

    if (!json) {
      throw new Error(
        "API вернул не JSON: " + raw.slice(0, 200)
      );
    }

    diag.stage = "extracting_text";

    let text = "";

    if (prof.style === "anthropic") {
      text = (json.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const c =
        json.choices &&
        json.choices[0] &&
        json.choices[0].message &&
        json.choices[0].message.content;

      text = Array.isArray(c)
        ? c.map((p) => p.text || "").join("")
        : c || "";
    }

    diag.extractedTextLength = String(text).length;

    if (!String(text).trim()) {
      const reason =
        diag.responseStructure?.finishReason ||
        diag.responseStructure?.stopReason ||
        "неизвестно";

      throw new Error(
        `API вернул пустой ответ. HTTP ${res.status}; ` +
        `finish_reason: ${reason}; ` +
        `JSON: ${diag.jsonParsing}; ` +
        `см. подробности в отладке.`
      );
    }

    diag.stage = "completed";
    diag.result = "success";

    return {
      text,
      model: prof.model,
      usage: json.usage || null,
      rate: {
        remainingTokens: res.headers.get("x-ratelimit-remaining-tokens"),
        resetTokens: res.headers.get("x-ratelimit-reset-tokens"),
      },
    };

  } catch (e) {
    diag.result = "error";
    diag.error = {
      message: String((e && e.message) || e),
      name: e && e.name,
    };
    throw e;

  } finally {
    diag.responseTimeMs = Date.now() - started;
    await saveAIDiagnostic(diag);
  }
}


/* ---------- Получение списка моделей ---------- */

const AI_MODELS_CACHE_KEY = "__aiModelsCache";

async function getAIModels(providerId, profile) {
  const preset = AI_PRESETS[providerId] || AI_PRESETS.custom;
  const modelsUrl = preset.modelsUrl;

  if (!modelsUrl) {
    throw new Error("Для этого провайдера автоматическое получение моделей не настроено");
  }

  const cacheKey = `${providerId}|${modelsUrl}`;
  const stored = await chrome.storage.local.get(AI_MODELS_CACHE_KEY);
  const cache = stored[AI_MODELS_CACHE_KEY] || {};
  const cachedModels = cache[cacheKey]?.models || [];

  const headers = {
    accept: "application/json",
  };

  if (profile.token) {
    if (preset.style === "anthropic") {
      headers["x-api-key"] = profile.token;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    } else {
      headers.authorization = "Bearer " + profile.token;
    }
  }

  try {
    const proxyMeta = await prepareProxyFor(modelsUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);

    let res;
    try {
      res = await fetch(modelsUrl, {
        method: "GET",
        headers,
        signal: ctrl.signal,
      });
    } catch (e) {
      if (proxyMeta.enabled && !proxyMeta.bypass) {
        const kind = YTSProxy.classifyProxyError(e);
        let host = "API";
        try { host = new URL(modelsUrl).host; } catch (_) {}
        throw new Error(
          `${kind.error}. Не удалось получить список моделей с ${host} через прокси. Прямое соединение не использовалось.`
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    let json;

    try {
      json = JSON.parse(raw);
    } catch (_) {
      throw new Error("API вернул ответ не в формате JSON");
    }

    if (!res.ok) {
      const message =
        json?.error?.message ||
        json?.message ||
        raw.slice(0, 250);

      throw new Error(`HTTP ${res.status}: ${message}`);
    }

    // У разных провайдеров формат ответа может отличаться.
    let items = [];

    if (Array.isArray(json.data)) {
      items = json.data;
    } else if (Array.isArray(json.models)) {
      items = json.models;
    }

    const models = items
      .map((item) => {
        if (typeof item === "string") return item;
        return item.id || item.name || "";
      })
      .filter(Boolean);

    if (!models.length) {
      throw new Error("API не вернул список моделей");
    }

    const uniqueModels = [...new Set(models)].sort((a, b) =>
      a.localeCompare(b)
    );

    cache[cacheKey] = {
      models: uniqueModels,
      updatedAt: Date.now(),
    };

    await chrome.storage.local.set({
      [AI_MODELS_CACHE_KEY]: cache,
    });

    return {
      ok: true,
      models: uniqueModels,
      cached: false,
    };

  } catch (e) {
    // Если API недоступен, используем последний сохранённый список.
    if (cachedModels.length) {
      return {
        ok: true,
        models: cachedModels,
        cached: true,
        warning: `Не удалось обновить список: ${e.message}`,
      };
    }

    throw e;
  }
}


/* ---------- Прокси ---------- */

let authOverride = null;
const activeSubtitleFetches = new Set();
let checkLock = false;
let checkAbort = false;
let checkFetchAbort = null;

async function readProxyRaw() {
  const data = await chrome.storage.local.get("proxy");
  const proxy = data.proxy && typeof data.proxy === "object" ? data.proxy : {};
  const state = YTSProxy.normalizeProxyState(proxy);
  if (proxy.check && typeof proxy.check === "object") state.check = proxy.check;
  return state;
}

async function writeProxyRaw(state) {
  const payload = {
    enabled: !!state.enabled,
    activeId: state.activeId || null,
    items: state.items || [],
  };
  if (state.check) payload.check = state.check;
  await chrome.storage.local.set({ proxy: payload });
}

function proxySettingsGet() {
  return chrome.proxy.settings.get({});
}

function assertProxyControllable(level) {
  if (level === "controlled_by_other_extensions" || level === "not_controllable") {
    throw new Error("Прокси Chrome сейчас задаёт другое расширение или политика. Настройки не изменены, запрос напрямую не отправляется.");
  }
}

async function installPac(item, hosts) {
  const current = await proxySettingsGet();
  assertProxyControllable(current.levelOfControl);

  // PAC is a browser-wide setting. Do not silently replace a proxy configured
  // by the user, the OS, policy, or another extension.
  const currentMode = current.value && current.value.mode;
  if (
    current.levelOfControl !== "controlled_by_this_extension" &&
    currentMode && currentMode !== "direct"
  ) {
    throw new Error(
      "В Chrome уже настроен системный или пользовательский прокси. " +
      "Чтобы не менять его поведение для остальных сайтов, сначала переключите прокси Chrome в режим «Без прокси» (Direct)."
    );
  }

  const pacScript = YTSProxy.buildPacScript(item, hosts);
  const currentPac = current.value && current.value.pacScript && current.value.pacScript.data;
  if (
    current.levelOfControl === "controlled_by_this_extension" &&
    currentMode === "pac_script" &&
    currentPac === pacScript
  ) {
    return; // Already applied; avoid resetting Chrome's proxy for every API call.
  }

  await chrome.proxy.settings.set({
    scope: "regular",
    value: {
      mode: "pac_script",
      pacScript: { data: pacScript },
    },
  });
}

async function releaseProxy() {
  const current = await proxySettingsGet();
  if (current.levelOfControl === "controlled_by_this_extension") {
    await chrome.proxy.settings.clear({ scope: "regular" });
  }
}

async function applyStoredProxy() {
  const state = await readProxyRaw();
  if (!state.enabled) {
    await releaseProxy();
    const current = await proxySettingsGet();
    return { ok: true, enabled: false, level: current.levelOfControl };
  }

  const item = state.items.find((entry) => entry.id === state.activeId);
  if (!item) {
    await releaseProxy();
    throw new Error("Прокси включён, но активный сервер не выбран. Запросы к API не отправляются.");
  }

  const stored = await chrome.storage.local.get("ai");
  const hosts = YTSProxy.llmHosts(stored.ai, AI_PRESETS).filter((host) => !YTSProxy.isLocalHost(host));
  if (!hosts.length) {
    await releaseProxy();
    return {
      ok: true,
      enabled: true,
      localOnly: true,
      scheme: item.scheme,
      host: item.host,
      port: item.port,
      message: "Адрес API локальный, поэтому запросы к нему идут напрямую. Внешний адрес LLM для прокси не задан.",
    };
  }

  await installPac(item, hosts);
  return {
    ok: true,
    enabled: true,
    scheme: item.scheme,
    host: item.host,
    port: item.port,
    apiHosts: hosts,
    socks4Auth: item.scheme === "socks4" && !!item.username,
    level: "controlled_by_this_extension",
  };
}

async function prepareProxyFor(targetUrl) {
  if (checkLock) {
    throw new Error("Сейчас идёт проверка прокси. Запрос к API не отправлен.");
  }
  const state = await readProxyRaw();
  if (state.check && state.check.running) {
    throw new Error("Сейчас идёт проверка прокси. Запрос к API не отправлен.");
  }

  const host = YTSProxy.hostFromUrl(targetUrl);
  if (!state.enabled) return { enabled: false };

  const item = state.items.find((entry) => entry.id === state.activeId);
  if (!item) {
    throw new Error("Прокси включён, но активный сервер не выбран. Запрос не отправлен.");
  }

  const meta = { enabled: true, scheme: item.scheme, host: item.host, port: item.port };
  if (YTSProxy.isLocalHost(host)) {
    meta.bypass = "local";
    return meta;
  }

  await applyStoredProxy();
  const current = await proxySettingsGet();
  if (current.levelOfControl !== "controlled_by_this_extension") {
    throw new Error("Прокси включён, но правила не применены. Запрос напрямую не отправлен.");
  }
  const pac = (current.value && current.value.pacScript && current.value.pacScript.data) || "";
  if (!YTSProxy.pacRoutesHost(pac, host)) {
    throw new Error("Прокси включён, но адрес API не входит в правила. Запрос напрямую не отправлен.");
  }
  return meta;
}

async function restoreProxyMode() {
  authOverride = null;
  const state = await readProxyRaw();
  if (state.enabled) await applyStoredProxy();
  else await releaseProxy();
}

async function fetchExternalIp() {
  let lastError = null;
  const ctrl = new AbortController();
  checkFetchAbort = ctrl;
  const timer = setTimeout(() => ctrl.abort(), YTSProxy.CHECK_TIMEOUT_MS);
  try {
    for (const host of YTSProxy.IP_CHECK_HOSTS) {
      if (ctrl.signal.aborted || checkAbort) break;
      const started = Date.now();
      try {
        const res = await fetch("https://" + host + "?format=json", {
          method: "GET",
          cache: "no-store",
          signal: ctrl.signal,
        });
        const latencyMs = Date.now() - started;
        const text = await res.text();
        if (!res.ok) {
          const error = new Error("HTTP " + res.status);
          error.status = res.status;
          if (res.status === 407 || checkAbort) {
            return { ok: false, status: res.status, latencyMs, error };
          }
          lastError = error;
          continue;
        }
        let ip = text.trim();
        try {
          const json = JSON.parse(text);
          if (json && json.ip) ip = String(json.ip).trim();
        } catch (_) {}
        if (!ip || /\s/.test(ip) || ip.length > 80) {
          throw new Error("Сервис определения IP вернул непонятный ответ");
        }
        return { ok: true, ip, latencyMs };
      } catch (error) {
        lastError = error;
        if (checkAbort || error.name === "AbortError" || ctrl.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(timer);
    if (checkFetchAbort === ctrl) checkFetchAbort = null;
  }
  if (ctrl.signal.aborted && !checkAbort) {
    const error = new Error("Тайм-аут: прокси не ответил вовремя");
    error.name = "AbortError";
    throw lastError && lastError.name === "AbortError" ? lastError : error;
  }
  throw lastError || new Error("Не удалось определить внешний IP");
}

async function probeComparisonIp() {
  try {
    const probe = await fetchExternalIp();
    return probe.ok ? probe.ip : "";
  } catch (_) {
    return "";
  }
}

async function commitProxyCheck(id, lastCheck, progress) {
  const state = await readProxyRaw();
  if (id && lastCheck) {
    state.items = state.items.map((item) => (
      item.id === id ? Object.assign({}, item, { lastCheck }) : item
    ));
  }
  if (progress) state.check = progress;
  await writeProxyRaw(state);
}

async function checkProxyItem(id, directIp) {
  const state = await readProxyRaw();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error("Прокси не найден");

  authOverride = item;
  const started = Date.now();
  let outcome = null;
  let cancelled = false;
  try {
    await installPac(item, YTSProxy.IP_CHECK_HOSTS);
    const probe = await fetchExternalIp();
    const latencyMs = probe.latencyMs != null ? probe.latencyMs : Date.now() - started;
    if (checkAbort) {
      cancelled = true;
    } else if (!probe.ok) {
      outcome = YTSProxy.checkResult(Object.assign(
        YTSProxy.classifyProxyError(probe.error, probe.status),
        { latencyMs }
      ));
    } else if (directIp && probe.ip === directIp) {
      outcome = YTSProxy.checkResult({
        status: "error",
        latencyMs,
        ip: probe.ip,
        error: "Внешний IP совпал с подключением без этого прокси: запрос, похоже, не прошёл через него",
      });
    } else {
      outcome = YTSProxy.checkResult({ status: "ok", latencyMs, ip: probe.ip, error: "" });
    }
  } catch (error) {
    if (checkAbort && error && error.name === "AbortError") cancelled = true;
    else {
      outcome = YTSProxy.checkResult(Object.assign(
        YTSProxy.classifyProxyError(error, error && error.status),
        { latencyMs: Date.now() - started }
      ));
    }
  } finally {
    authOverride = null;
    try {
      await restoreProxyMode();
    } catch (restoreError) {
      cancelled = false;
      outcome = YTSProxy.checkResult({
        status: "error",
        latencyMs: Date.now() - started,
        ip: outcome && outcome.ip || "",
        error: "Не удалось восстановить прежние настройки прокси: " + String(restoreError && restoreError.message || restoreError),
      });
    }
  }
  return cancelled ? null : outcome;
}

async function runProxyChecks(ids) {
  if (checkLock) throw new Error("Проверка уже выполняется");
  if (!ids.length) throw new Error("Список прокси пуст");

  checkLock = true;
  checkAbort = false;
  let working = 0;
  let failed = 0;
  let done = 0;

  try {
    const progress = (extra) => ({
      running: true,
      currentId: "",
      index: done,
      total: ids.length,
      ok: working,
      bad: failed,
      stopped: false,
      ...extra,
    });
    await commitProxyCheck(null, null, progress());
    const directIp = await probeComparisonIp();
    for (const id of ids) {
      if (checkAbort) break;
      await commitProxyCheck(null, null, progress({ currentId: id }));
      const result = await checkProxyItem(id, directIp);
      if (!result) break;
      if (result.status === "ok") working += 1;
      else failed += 1;
      done += 1;
      await commitProxyCheck(id, result, progress());
    }
    await commitProxyCheck(null, null, {
      running: false,
      currentId: "",
      index: done,
      total: ids.length,
      ok: working,
      bad: failed,
      stopped: !!checkAbort,
      finishedAt: new Date().toISOString(),
    });
    return { working, failed, stopped: !!checkAbort, total: ids.length };
  } finally {
    checkLock = false;
    checkAbort = false;
    authOverride = null;
    try {
      await restoreProxyMode();
    } catch (error) {
      console.warn("[proxy] не удалось восстановить настройки:", error && error.message);
    }
  }
}

function replyProxyAuth(callback, creds) {
  if (!creds || !creds.username) callback();
  else {
    callback({
      authCredentials: {
        username: creds.username,
        password: creds.password || "",
      },
    });
  }
}

function proxyMatchesChallenger(item, details) {
  const challenger = details && details.challenger;
  if (!item || !challenger || !challenger.host || !challenger.port) return false;
  return (
    YTSProxy.stripHost(challenger.host) === YTSProxy.stripHost(item.host) &&
    Number(challenger.port) === Number(item.port)
  );
}

function onProxyAuthRequired(details, callback) {
  if (!details.isProxy) {
    callback();
    return;
  }
  if (authOverride) {
    callback(proxyMatchesChallenger(authOverride, details) && authOverride.username
      ? { authCredentials: { username: authOverride.username, password: authOverride.password || "" } }
      : undefined);
    return;
  }
  chrome.storage.local.get("proxy").then((data) => {
    const state = YTSProxy.normalizeProxyState(data.proxy);
    const item = state.enabled ? state.items.find((entry) => entry.id === state.activeId) : null;
    if (!proxyMatchesChallenger(item, details) || !item.username) {
      callback();
      return;
    }
    replyProxyAuth(callback, item);
  }).catch(() => callback());
}

chrome.webRequest.onAuthRequired.addListener(
  onProxyAuthRequired,
  { urls: ["https://*/*"] },
  ["asyncBlocking"]
);

async function bootProxy() {
  try {
    const state = await readProxyRaw();
    if (state.check && state.check.running) {
      state.check = {
        running: false,
        stopped: true,
        index: state.check.index || 0,
        total: state.check.total || 0,
        ok: state.check.ok || 0,
        bad: state.check.bad || 0,
        error: "Проверка прервана перезапуском расширения",
      };
      await writeProxyRaw(state);
    }
    if (!checkLock) await applyStoredProxy();
  } catch (error) {
    console.warn("[proxy] не удалось применить сохранённый прокси:", error && error.message);
  }
}

bootProxy();
chrome.runtime.onInstalled.addListener(() => { bootProxy(); });
chrome.runtime.onStartup.addListener(() => { bootProxy(); });

/* ---------- Сообщения от панели ---------- */

async function handle(msg, sender) {
  const tabId = sender.tab && sender.tab.id;

  switch (msg.type) {
    case "getAIModels": {
      const r = await getAIModels(msg.provider, msg.profile || {});
      return { ok: true, data: r };
    }

    case "getTracks": {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: pageGetTracks,
      });
      return { ok: true, data: r && r.result };
    }

    case "fetchSubs": {
      if (tabId == null) return { ok: false, error: "Не удалось определить вкладку YouTube" };
      if (activeSubtitleFetches.has(tabId)) {
        return { ok: false, error: "Загрузка субтитров для этой вкладки уже выполняется. Дождитесь её завершения." };
      }
      activeSubtitleFetches.add(tabId);
      try {
        const [r] = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: pageFetchSubtitles,
          args: [msg.baseUrl, msg.tlang || ""],
        });
        return { ok: true, data: r && r.result };
      } finally {
        activeSubtitleFetches.delete(tabId);
      }
    }

    case "analyze": {
      const mt = Number(msg.maxTokens) || 0;
      const r = await callAI(msg.system, msg.user, mt ? { maxTokens: mt } : {});
      return { ok: true, data: r };
    }

    case "testAI": {
      const r = await callAI("", "Ответь одним словом: ok", {
        maxTokens: 64,
      });
      return { ok: true, data: r };
    }

    case "applyProxy": {
      if (checkLock) return { ok: false, error: "Дождитесь окончания проверки прокси" };
      return applyStoredProxy();
    }

    case "proxyStatus": {
      const current = await proxySettingsGet();
      const state = await readProxyRaw();
      const item = state.items.find((entry) => entry.id === state.activeId);
      return {
        ok: true,
        enabled: state.enabled,
        level: current.levelOfControl,
        active: item
          ? { name: YTSProxy.displayName(item), scheme: item.scheme, host: item.host, port: item.port }
          : null,
        check: state.check || null,
        localOnly: state.enabled && !YTSProxy.llmHosts(
          (await chrome.storage.local.get("ai")).ai,
          AI_PRESETS
        ).some((host) => !YTSProxy.isLocalHost(host)),
      };
    }

    case "proxyCheckOne": {
      const summary = await runProxyChecks([msg.id]);
      const fresh = await readProxyRaw();
      const item = fresh.items.find((entry) => entry.id === msg.id);
      return { ok: true, summary, result: item ? item.lastCheck : null };
    }

    case "proxyCheckAll": {
      const state = await readProxyRaw();
      const summary = await runProxyChecks(state.items.map((item) => item.id));
      return { ok: true, summary };
    }

    case "proxyCheckStop": {
      checkAbort = true;
      if (checkFetchAbort) checkFetchAbort.abort();
      return { ok: true };
    }

    case "openDebug": {
      const q = new URLSearchParams({
        v: msg.videoId || "",
        tab: String(tabId || ""),
      });
      await chrome.tabs.create({
        url: chrome.runtime.getURL("debug.html?" + q),
      });
      return { ok: true };
    }

    default:
      return {
        ok: false,
        error: "Неизвестная команда: " + msg.type,
      };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch((e) =>
      sendResponse({
        ok: false,
        error: String((e && e.message) || e),
        info: (e && e.info) || null,
      })
    );

  return true;
});
