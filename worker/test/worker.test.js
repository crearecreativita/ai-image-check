import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { CONFIG, budgetCalls } from "../src/config.js";

const ORIGIN = "https://utente.github.io";
const HASH = "a".repeat(64);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
  };
}
function env(kv) { return { CACHE: kv, ALLOWED_ORIGIN: ORIGIN }; }
function det(calls) {
  return [{ name: "fake", isConfigured: () => true, async analyze() { calls.n++; return { provider: "fake", aiScore: 0.9, generators: null, operations: 5 }; } }];
}
function req({ hash = HASH, body = JPEG, origin = ORIGIN, ip = "1.1.1.1" } = {}) {
  const f = new FormData();
  f.append("hash", hash);
  f.append("image", new Blob([body], { type: "image/jpeg" }), "x.jpg");
  return new Request("https://w.dev/analyze", { method: "POST", body: f, headers: { Origin: origin, "CF-Connecting-IP": ip } });
}

test("cache hit non chiama il provider", async () => {
  const kv = fakeKV(), c = { n: 0 };
  assert.equal((await handle(req(), env(kv), det(c))).status, 200);
  const r2 = await handle(req(), env(kv), det(c));
  assert.equal((await r2.json()).cached, true);
  assert.equal(c.n, 1);
});

test("origin non ammesso rifiutato", async () => {
  const r = await handle(req({ origin: "https://evil.example" }), env(fakeKV()), det({ n: 0 }));
  assert.equal(r.status, 403);
});

test("file non immagine rifiutato", async () => {
  const r = await handle(req({ body: new TextEncoder().encode("hello world, not an image") }), env(fakeKV()), det({ n: 0 }));
  assert.equal(r.status, 415);
});

test("limite per IP", async () => {
  const kv = fakeKV(), c = { n: 0 };
  for (let i = 0; i < CONFIG.PER_IP_DAILY_CALLS; i++) {
    assert.equal((await handle(req({ hash: String(i).repeat(64).slice(0, 64) }), env(kv), det(c))).status, 200);
  }
  const r = await handle(req({ hash: "f".repeat(64) }), env(kv), det(c));
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, "ip_limit");
});

test("budget giornaliero esaurito", async () => {
  const kv = fakeKV(), c = { n: 0 };
  kv.m.set(`calls:d:${new Date().toISOString().slice(0, 10)}`, String(budgetCalls().daily));
  const r = await handle(req(), env(kv), det(c));
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, "budget_exhausted");
  assert.equal(c.n, 0);
});
