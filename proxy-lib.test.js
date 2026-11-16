"use strict";

const assert = require("assert");
const P = require("./proxy-lib.js");

function testPacRoutesOnlyListedHosts() {
  const item = {
    id: "a",
    scheme: "socks5",
    host: "proxy.example",
    port: 1080,
    username: "user",
    password: "secret",
  };
  const pac = P.buildPacScript(item, ["api.openai.com", "localhost", "API.OPENAI.COM"]);
  assert.strictEqual(P.pacRoutesHost(pac, "api.openai.com"), true);
  assert.strictEqual(P.pacRoutesHost(pac, "localhost"), false);
  assert.ok(pac.includes("SOCKS5 proxy.example:1080"));
  assert.ok(!pac.includes("SOCKS5 proxy.example:1080; DIRECT"));
  assert.ok(pac.includes('return "DIRECT"'));
  assert.ok(!pac.includes("secret"));
  assert.ok(!pac.includes("user"));

  const find = new Function(pac + "\nreturn FindProxyForURL;")();
  assert.strictEqual(find("https://api.openai.com/v1/chat/completions", "api.openai.com"), "SOCKS5 proxy.example:1080");
  assert.strictEqual(find("https://example.com/", "example.com"), "DIRECT");
  assert.strictEqual(find("http://localhost:11434/", "localhost"), "DIRECT");
}

function testSchemes() {
  assert.strictEqual(P.pacEndpoint({ scheme: "http", host: "10.0.0.1", port: 8080 }), "PROXY 10.0.0.1:8080");
  assert.strictEqual(P.pacEndpoint({ scheme: "https", host: "10.0.0.1", port: 443 }), "HTTPS 10.0.0.1:443");
  assert.strictEqual(P.pacEndpoint({ scheme: "socks4", host: "10.0.0.1", port: 1080 }), "SOCKS4 10.0.0.1:1080");
  assert.strictEqual(
    P.pacEndpoint({ scheme: "socks5", host: "2001:db8::1", port: 1080 }),
    "SOCKS5 [2001:db8::1]:1080"
  );
}

function testValidationAndDuplicates() {
  assert.throws(() => P.normalizeItem({ scheme: "ftp", host: "a", port: 1 }), /тип/);
  assert.throws(() => P.normalizeItem({ scheme: "http", host: "https://a", port: 1 }), /домен/);
  assert.throws(() => P.normalizeItem({ scheme: "http", host: "a", port: 0 }), /Порт/);

  const first = P.normalizeItem({ id: "1", scheme: "http", host: "Proxy.Test", port: 8080, username: "u", password: "p" });
  const copy = P.normalizeItem({ id: "2", scheme: "http", host: "proxy.test", port: 8080, username: "u", password: "other" });
  assert.strictEqual(P.isDuplicate([first], copy), true);
  assert.strictEqual(P.isDuplicate([first], copy, "1"), false);

  const loose = P.normalizeProxyState({
    enabled: true,
    activeId: "missing",
    items: [first, copy],
  });
  assert.strictEqual(loose.items.length, 1);
  assert.strictEqual(loose.activeId, null);
  assert.throws(() => P.normalizeProxyState({ items: [first, copy] }, { strict: true }), /дубликат/);
}

function testClassify() {
  assert.strictEqual(P.CHECK_TIMEOUT_MS, 7000);
  assert.strictEqual(P.classifyProxyError({ name: "AbortError" }).status, "timeout");
  assert.strictEqual(P.classifyProxyError(new Error("net::ERR_PROXY_CONNECTION_FAILED")).status, "connect");
  assert.strictEqual(P.classifyProxyError(new Error("HTTP 407"), 407).status, "auth");
  assert.strictEqual(P.classifyProxyError(new Error("ERR_PROXY_AUTH_UNSUPPORTED")).status, "auth");
  assert.strictEqual(P.classifyProxyError(new Error("что-то ещё")).status, "error");
}

function testImportDoesNotApplyPartialGarbage() {
  assert.throws(() => P.parseImport("{"), /JSON/);
  assert.throws(() => P.parseImport(JSON.stringify({ schemaVersion: 2, ai: {}, proxy: {} })), /не поддерживается/);
  assert.throws(() => P.parseImport(JSON.stringify({
    schemaVersion: 1,
    ai: { active: "openai", profiles: {} },
    proxy: { items: [{ scheme: "http", host: "", port: 1 }] },
  })), /домен|прокси/);

  const doc = P.exportDocument(
    { pane: "set", collapsed: false, ignored: true },
    {
      active: "openai",
      profiles: { openai: { style: "openai", url: "https://api.openai.com/v1/chat/completions", token: "sk-test", model: "gpt" } },
      maxTokens: "",
      maxChars: 200000,
    },
    {
      enabled: true,
      activeId: "p1",
      check: { running: true },
      items: [{
        id: "p1",
        name: "Рабочий",
        scheme: "https",
        host: "proxy.example",
        port: 443,
        username: "login",
        password: "s3cret",
        lastCheck: { status: "ok", latencyMs: 40, ip: "203.0.113.5", error: "", checkedAt: "2026-01-01T00:00:00.000Z" },
      }],
    },
    "2026-01-02T00:00:00.000Z"
  );

  assert.strictEqual(doc.schemaVersion, 1);
  assert.strictEqual(doc.exportedAt, "2026-01-02T00:00:00.000Z");
  assert.strictEqual(doc.proxy.check, undefined);
  assert.strictEqual(doc.ui.ignored, undefined);
  assert.strictEqual(doc.ai.profiles.openai.token, "sk-test");
  assert.strictEqual(doc.proxy.items[0].password, "s3cret");

  const parsed = P.parseImport(JSON.stringify(doc));
  assert.strictEqual(parsed.ai.profiles.openai.token, "sk-test");
  assert.strictEqual(parsed.proxy.items[0].password, "s3cret");
  assert.strictEqual(parsed.proxy.items[0].lastCheck.ip, "203.0.113.5");
  assert.strictEqual(parsed.summary.proxies, 1);
  assert.strictEqual(parsed.summary.enabled, true);
  assert.strictEqual(parsed.summary.activeName, "Рабочий");
}

function testLlmHostsSkipEmpty() {
  const hosts = P.llmHosts({
    active: "custom",
    profiles: { custom: { url: "http://127.0.0.1:11434/v1/chat/completions" } },
  }, { custom: { url: "", modelsUrl: "" } });
  assert.deepStrictEqual(hosts, ["127.0.0.1"]);
  assert.strictEqual(P.isLocalHost(hosts[0]), true);
}

function main() {
  testPacRoutesOnlyListedHosts();
  testSchemes();
  testValidationAndDuplicates();
  testClassify();
  testImportDoesNotApplyPartialGarbage();
  testLlmHostsSkipEmpty();
  console.log("proxy-lib.test.js: ok");
}

main();
