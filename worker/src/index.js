import { CONFIG, budgetCalls } from "./config.js";
import { DETECTORS, runDetectors } from "./detectors/index.js";

const HASH_RE = /^[a-f0-9]{64}$/;

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  const h = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors },
  });
}

function sniffType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

async function readNum(kv, key) {
  return parseInt((await kv.get(key)) || "0", 10) || 0;
}

// NB: KV non è atomico. Con più richieste simultanee il conteggio può perdere qualche
// unità; il SAFETY_FACTOR in config copre questo scarto.
async function bump(kv, key, by, ttl) {
  const cur = await readNum(kv, key);
  await kv.put(key, String(cur + by), { expirationTtl: ttl });
}

async function budgetState(kv) {
  const limits = budgetCalls();
  const [d, m] = await Promise.all([readNum(kv, `calls:d:${dayKey()}`), readNum(kv, `calls:m:${monthKey()}`)]);
  return {
    dailyLeft: Math.max(0, limits.daily - d),
    monthlyLeft: Math.max(0, limits.monthly - m),
    exhausted: d >= limits.daily || m >= limits.monthly,
  };
}

export async function handle(request, env, detectors = DETECTORS) {
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
  }
  // Richieste da browser di altri domini: rifiutate.
  const origin = request.headers.get("Origin");
  if (origin && !cors["Access-Control-Allow-Origin"]) {
    return json({ error: "origin_not_allowed" }, 403, cors);
  }

  if (url.pathname === "/status" && request.method === "GET") {
    const s = await budgetState(env.CACHE);
    return json({ available: !s.exhausted, perIpDaily: CONFIG.PER_IP_DAILY_CALLS }, 200, cors);
  }

  if (url.pathname !== "/analyze" || request.method !== "POST") {
    return json({ error: "not_found" }, 404, cors);
  }

  const declared = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (declared > CONFIG.MAX_UPLOAD_BYTES + 4096) return json({ error: "file_too_large" }, 413, cors);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "bad_request" }, 400, cors);
  }
  const hash = String(form.get("hash") || "").toLowerCase();
  const file = form.get("image");
  if (!HASH_RE.test(hash)) return json({ error: "bad_hash" }, 400, cors);

  const kv = env.CACHE;

  // 1. Cache per hash: non consuma crediti né quota per IP.
  const cached = await kv.get(`res:${hash}`, "json");
  if (cached) return json({ ...cached, cached: true }, 200, cors);

  // 2. Validazione file (solo se serve davvero chiamare l'API).
  if (!file || typeof file === "string") return json({ error: "missing_image" }, 400, cors);
  if (file.size > CONFIG.MAX_UPLOAD_BYTES) return json({ error: "file_too_large" }, 413, cors);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !CONFIG.ALLOWED_TYPES.includes(type)) return json({ error: "unsupported_type" }, 415, cors);

  // 3. Budget globale.
  const budget = await budgetState(kv);
  if (budget.exhausted) return json({ error: "budget_exhausted" }, 429, cors);

  // 4. Rate limit per IP (l'IP viene salvato solo come hash, con scadenza 2 giorni).
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipKey = `ip:${dayKey()}:${(await sha256Hex(ip + (env.IP_SALT || ""))).slice(0, 24)}`;
  const ipCalls = await readNum(kv, ipKey);
  if (ipCalls >= CONFIG.PER_IP_DAILY_CALLS) return json({ error: "ip_limit" }, 429, cors);

  // 5. Provider.
  let r;
  try {
    r = await runDetectors({ bytes, type }, env, detectors);
  } catch (e) {
    if (e.quota) return json({ error: "budget_exhausted" }, 429, cors);
    return json({ error: "provider_error" }, 502, cors);
  }

  // 6. Contatori (in numero di chiamate; se il provider dichiara ops diverse da quelle
  //    in config le conteggiamo proporzionalmente) + cache. Salviamo solo hash e risultato.
  const weight = r.operations && r.operations > CONFIG.OPS_PER_CALL ? Math.ceil(r.operations / CONFIG.OPS_PER_CALL) : 1;
  const result = { provider: r.provider, aiScore: r.aiScore, generators: r.generators, analyzedAt: new Date().toISOString() };
  await Promise.all([
    kv.put(`res:${hash}`, JSON.stringify(result), { expirationTtl: CONFIG.CACHE_TTL_SECONDS }),
    bump(kv, `calls:d:${dayKey()}`, weight, 2 * 86400),
    bump(kv, `calls:m:${monthKey()}`, weight, 35 * 86400),
    bump(kv, ipKey, 1, 2 * 86400),
  ]);
  return json({ ...result, cached: false, ipCallsLeft: Math.max(0, CONFIG.PER_IP_DAILY_CALLS - ipCalls - 1) }, 200, cors);
}

export default { fetch: (request, env) => handle(request, env) };
