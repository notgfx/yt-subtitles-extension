"use strict";

const assert = require("assert");
const C = require("./chunk-lib.js");

const GROQ_413 =
  "HTTP 413: Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` " +
  "on tokens per minute (TPM): Limit 8000, Requested 10010, please reduce your message size and try again. " +
  "Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing";

function testParseErrors() {
  const a = C.parseLlmError(413, GROQ_413);
  assert.strictEqual(a.kind, "too_large");
  assert.strictEqual(a.limit, 8000);
  assert.strictEqual(a.requested, 10010);
  assert.strictEqual(a.scope, "TPM");

  const b = C.parseLlmError(429, "Rate limit reached for model x on tokens per minute (TPM): Limit 8000, Used 7000, Requested 3000. Please try again in 1m30.5s. Need more");
  assert.strictEqual(b.kind, "rate");
  assert.strictEqual(b.waitMs, 90500);
  assert.strictEqual(b.used, 7000);

  const c = C.parseLlmError(429, "Rate limit reached on tokens per day (TPD): Limit 200000, Used 199000, Requested 5000. Please try again in 2h3m.");
  assert.strictEqual(c.kind, "quota");

  // OpenAI: «Request too large» приходит с 429
  const d = C.parseLlmError(429, "Request too large for gpt-4o on tokens per min (TPM): Limit 30000, Requested 45000.");
  assert.strictEqual(d.kind, "too_large");

  const e = C.parseLlmError(400, "prompt is too long: 210000 tokens > 200000 maximum");
  assert.strictEqual(e.kind, "too_large");
  assert.strictEqual(e.limit, 200000);

  const f = C.parseLlmError(400, "This model's maximum context length is 128000 tokens. However, your messages resulted in 130500 tokens.");
  assert.strictEqual(f.kind, "too_large");
  assert.strictEqual(f.limit, 128000);
  assert.strictEqual(f.requested, 130500);

  assert.strictEqual(C.parseLlmError(413, "request_too_large").limit, null);
  assert.strictEqual(C.parseLlmError(401, "Invalid API key").kind, "other");
  assert.strictEqual(C.parseLlmError(429, "slow down", "12").waitMs, 12000);

  assert.strictEqual(C.parseDuration("7.66s"), 7660);
  assert.strictEqual(C.parseDuration("250ms"), 250);
  assert.strictEqual(C.parseDuration("2h3m"), 7380000);
  assert.strictEqual(C.parseDuration("abc"), null);
}

function testPack() {
  const pieces = Array.from({ length: 50 }, (_, i) => `[00:${String(i).padStart(2, "0")}] привет мир как дела`);
  const p = pieces.slice();
  const one = C.packNext(p, 0, 100, 1, "\n");
  assert.ok(one.next > 0 && one.next < 50);
  assert.ok(one.tokens <= 100);

  // одна строка больше бюджета — режется, прогресс всегда есть
  const big = ["слово ".repeat(2000)];
  const first = C.packNext(big, 0, 200, 1, " ");
  assert.strictEqual(first.next, 1);
  assert.ok(big.length === 2 && C.estimateTokens(first.text, 1) <= 260);

  const lim = C.limitChars(["aaaa", "bbbb", "cccc"], 12, "\n");
  assert.deepStrictEqual(lim, { pieces: ["aaaa", "bbbb", "cc"], truncated: true });
  assert.deepStrictEqual(C.limitChars(["aaaa", "bbbb", "cccc"], 10, "\n").pieces, ["aaaa", "bbbb"]);
  assert.strictEqual(C.limitChars(["a", "b"], 100, "\n").truncated, false);
}

/* ---------- симулятор Groq ---------- */

function makeLlm({ tpm, cyrPerToken = 2.8, noNumbers = false }) {
  const log = [];
  let t = 0;
  const window = []; // {at, tokens}
  const trueTokens = (s) => Math.ceil(s.length / cyrPerToken);
  const used = () => window.filter((w) => w.at > t - 60000).reduce((a, w) => a + w.tokens, 0);
  const llm = {
    log,
    now: () => t,
    wait: async (ms) => { t += ms; },
    send: async (system, user, maxTokens) => {
      const inTok = trueTokens(system + user);
      const requested = inTok + (maxTokens || 0);
      if (requested > tpm) {
        const msg = noNumbers
          ? "request_too_large"
          : `Request too large for model m on tokens per minute (TPM): Limit ${tpm}, Requested ${requested}, please reduce your message size`;
        log.push({ ok: false, code: 413 });
        return { ok: false, error: "HTTP 413: " + msg, info: { status: 413, message: msg } };
      }
      const u = used();
      if (u + requested > tpm) {
        const oldest = window.filter((w) => w.at > t - 60000).sort((a, b) => a.at - b.at)[0];
        const wait = (oldest.at + 60000 - t) / 1000;
        const msg = `Rate limit reached on tokens per minute (TPM): Limit ${tpm}, Used ${u}, Requested ${requested}. Please try again in ${wait.toFixed(2)}s.`;
        log.push({ ok: false, code: 429 });
        return { ok: false, error: "HTTP 429: " + msg, info: { status: 429, message: msg } };
      }
      let text, outTok;
      if (user.includes("Часть транскрипта:")) { text = "заметки ".repeat(120); outTok = 600; }
      else if (user.startsWith("Ниже промежуточные заметки")) { text = "слитые ".repeat(120); outTok = 600; }
      else { text = "ИТОГ"; outTok = 800; }
      window.push({ at: t, tokens: inTok + outTok });
      log.push({ ok: true, requested, kind: text.slice(0, 4) });
      return { ok: true, data: { text, usage: { prompt_tokens: inTok }, rate: { remainingTokens: String(Math.max(0, tpm - used())), resetTokens: "20s" } } };
    },
  };
  return llm;
}

function makePieces(minutes) {
  const out = [];
  for (let s = 0; s < minutes * 60; s += 4) {
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    out.push(`[${mm}:${ss}] это довольно длинная реплика докладчика про разные важные вещи номер ${s}`);
  }
  return out;
}

async function run(llm, opts) {
  const header = "Видео: тест";
  const task = "Сделай саммари";
  const lim = opts.lim || { tpm: 0, k: 1, learned: false };
  const res = await C.summarize({
    system: "Ты помощник.",
    task, header,
    pieces: opts.pieces, sep: "\n",
    buildSingle: (t) => `${task}\n\n---\n${header}\n\nТранскрипт:\n${t}`,
    finalOut: opts.finalOut || 0,
    lim,
    send: llm.send, wait: llm.wait, now: llm.now,
    check: opts.check || (() => {}),
    status: () => {},
  });
  return { res, lim };
}

async function testShortFitsInOneCall() {
  const llm = makeLlm({ tpm: 8000 });
  const { res } = await run(llm, { pieces: makePieces(2), lim: { tpm: 8000, k: 1 } });
  assert.strictEqual(res.chunked, false);
  assert.strictEqual(llm.log.length, 1);
}

async function testGroqUnknownLimitThenChunks() {
  const llm = makeLlm({ tpm: 8000 });
  const { res, lim } = await run(llm, { pieces: makePieces(40) }); // ~ длинное видео, лимит неизвестен
  assert.strictEqual(res.text, "ИТОГ");
  assert.strictEqual(res.chunked, true);
  assert.strictEqual(lim.tpm, 8000);
  assert.strictEqual(lim.learned, true);
  assert.strictEqual(llm.log[0].code, 413); // первая попытка — целиком
  assert.ok(res.parts >= 3);
  assert.ok(llm.log.filter((l) => l.ok).every((l) => l.requested <= 8000));
}

async function testKnownLimitSkipsFirstAttempt() {
  const llm = makeLlm({ tpm: 8000 });
  const { res } = await run(llm, { pieces: makePieces(40), lim: { tpm: 8000, k: 1, learned: true } });
  assert.strictEqual(res.text, "ИТОГ");
  assert.ok(!llm.log.some((l) => l.code === 413) || llm.log.filter((l) => l.code === 413).length <= 1);
}

async function testEstimateTooOptimisticConverges() {
  // реальный токенайзер «плотнее» нашей оценки в 1.6 раза
  const llm = makeLlm({ tpm: 8000, cyrPerToken: 1.2 });
  const { res } = await run(llm, { pieces: makePieces(30), lim: { tpm: 8000, k: 1 } });
  assert.strictEqual(res.text, "ИТОГ");
}

async function testNoNumbersInError() {
  const llm = makeLlm({ tpm: 6000, noNumbers: true });
  const { res, lim } = await run(llm, { pieces: makePieces(30) });
  assert.strictEqual(res.text, "ИТОГ");
  assert.strictEqual(lim.learned, false); // догадка не считается «выученным» лимитом
}

async function testManyNotesNeedMerge() {
  const llm = makeLlm({ tpm: 8000 });
  const { res } = await run(llm, { pieces: makePieces(240), lim: { tpm: 8000, k: 1 } });
  assert.strictEqual(res.text, "ИТОГ");
  assert.ok(llm.log.some((l) => l.ok && l.kind === "слит"), "ожидался этап объединения заметок");
}

async function testTooSmallLimit() {
  const llm = makeLlm({ tpm: 2500 });
  await assert.rejects(run(llm, { pieces: makePieces(30), lim: { tpm: 2500, k: 1 } }), /слишком мал/);
}

async function testCancel() {
  const llm = makeLlm({ tpm: 8000 });
  let n = 0;
  await assert.rejects(
    run(llm, { pieces: makePieces(40), lim: { tpm: 8000, k: 1 }, check: () => { if (++n > 3) throw new Error("Отменено"); } }),
    /Отменено/
  );
}

async function main() {
  testParseErrors();
  testPack();
  await testShortFitsInOneCall();
  await testGroqUnknownLimitThenChunks();
  await testKnownLimitSkipsFirstAttempt();
  await testEstimateTooOptimisticConverges();
  await testNoNumbersInError();
  await testManyNotesNeedMerge();
  await testTooSmallLimit();
  await testCancel();
  console.log("chunk-lib.test.js: ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
