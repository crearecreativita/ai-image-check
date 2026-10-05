import { API_URL, MAX_INPUT_BYTES, UNCERTAINTY } from "./config.js";
import { sha256Hex, downscale } from "./image.js";
import { analyzeMetadata } from "./metadata.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // sempre textContent: i metadati sono input non fidato
  return n;
};

const ERRORS = {
  budget_exhausted: "Analisi avanzata esaurita per oggi, resta attiva l'analisi dei metadati.",
  ip_limit: "Hai raggiunto il limite di analisi visive per oggi. Resta attiva l'analisi dei metadati; riprova domani.",
  file_too_large: "L'immagine è troppo pesante per l'analisi visiva.",
  unsupported_type: "Formato non supportato. Usa JPG, PNG o WebP.",
  provider_error: "Il servizio di analisi visiva non risponde. Riprova tra poco.",
  origin_not_allowed: "Questo sito non è autorizzato a usare il servizio di analisi.",
  network: "Impossibile contattare il servizio di analisi. Controlla la connessione e riprova.",
  decode: "Non riesco a leggere questa immagine. Prova con un JPG, PNG o WebP.",
};

let file = null;
let busy = false;
const apiConfigured = !API_URL.includes("TUOSUBDOMINIO");

function setStatus(msg, kind) {
  const s = $("status");
  s.hidden = !msg;
  s.textContent = msg || "";
  s.className = "status" + (kind ? " " + kind : "");
}

function setFile(f) {
  if (!f) return;
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setStatus(ERRORS.unsupported_type, "error");
  if (f.size > MAX_INPUT_BYTES) return setStatus("Il file supera i 25 MB.", "error");
  file = f;
  setStatus("");
  $("result").hidden = true;
  $("dropEmpty").hidden = true;
  $("preview").hidden = false;
  if ($("previewImg").src) URL.revokeObjectURL($("previewImg").src);
  $("previewImg").src = URL.createObjectURL(f);
  $("previewName").textContent = `${f.name} · ${(f.size / 1024 / 1024).toFixed(2)} MB`;
  $("analyze").disabled = false;
  $("reset").hidden = false;
}

function reset() {
  file = null;
  $("file").value = "";
  $("dropEmpty").hidden = false;
  $("preview").hidden = true;
  $("analyze").disabled = true;
  $("reset").hidden = true;
  $("result").hidden = true;
  setStatus("");
}

function showTab(name) {
  for (const t of ["meta", "visual"]) {
    $("tab-" + t).setAttribute("aria-selected", String(t === name));
    $("panel-" + t).hidden = t !== name;
  }
}

function scoreLabel(s) {
  if (s < 0.2) return "Improbabile che sia generata con AI";
  if (s < 0.5) return "Incerto, più vicino a un'immagine reale";
  if (s < 0.8) return "Incerto, più vicino a un'immagine generata";
  return "Probabile che sia generata con AI";
}

const pct = (x) => Math.round(x * 100 / 5) * 5; // arrotondato a 5 punti: niente falsa precisione

function renderMeta(md) {
  const p = $("panel-meta");
  p.replaceChildren();
  p.append(
    el("h2", "headline", md.declaredAI ? "I metadati indicano un'origine AI" : "Nessuna dichiarazione AI nei metadati"),
    el("p", "sub", md.declaredAI
      ? "Il file stesso dichiara come è stato creato. Questa informazione si può rimuovere, ma qui è presente."
      : "L'assenza di dichiarazioni non dice nulla sull'origine: i metadati si cancellano con facilità.")
  );
  const ul = el("ul", "list");
  for (const f of md.findings) ul.append(el("li", f.level, f.text));
  p.append(ul);
}

function renderVisual(state) {
  const p = $("panel-visual");
  p.replaceChildren();
  if (state.kind === "skipped") {
    p.append(el("h2", "headline", "Analisi visiva non necessaria"), el("p", "sub", "I metadati dichiarano già l'origine, quindi l'immagine non è stata inviata a nessun servizio esterno."));
    return;
  }
  if (state.kind === "unavailable") {
    p.append(el("h2", "headline", "Analisi visiva non disponibile"), el("p", "sub", state.message));
    return;
  }
  const r = state.data;
  const lo = Math.max(0, r.aiScore - UNCERTAINTY), hi = Math.min(1, r.aiScore + UNCERTAINTY);
  p.append(
    el("h2", "headline", scoreLabel(r.aiScore)),
    el("p", "sub", "Stima basata sui pixel dell'immagine, indipendente dai metadati.")
  );
  const meter = el("div", "meter");
  const band = el("div", "band");
  band.style.left = lo * 100 + "%";
  band.style.width = (hi - lo) * 100 + "%";
  const tick = el("div", "tick");
  tick.style.left = `calc(${r.aiScore * 100}% - 1px)`;
  meter.append(band, tick);
  const scale = el("div", "scale");
  scale.append(el("span", null, "Reale"), el("span", null, "AI"));
  p.append(meter, scale, el("p", "range", `Probabilità AI stimata tra il ${pct(lo)}% e il ${pct(hi)}%.`));

  const gens = r.generators
    ? Object.entries(r.generators).filter(([, v]) => v >= 0.2).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : [];
  if (r.aiScore >= 0.5 && gens.length) {
    const g = el("div", "gen");
    g.append(el("h3", null, "Generatore più simile"));
    for (const [name, v] of gens) {
      const row = el("div");
      row.append(el("span", null, name.replace(/_/g, " ")), el("span", null, `circa ${pct(v)}%`));
      g.append(row);
    }
    p.append(g);
  }
  p.append(el("p", "meta-small", r.cached ? "Risultato già in archivio per questo file: nessun credito consumato." : "Analisi eseguita ora da Sightengine."));
}

async function callApi(blob, hash) {
  const form = new FormData();
  form.append("hash", hash);
  form.append("image", blob, "image.jpg");
  let res;
  try {
    res = await fetch(API_URL + "/analyze", { method: "POST", body: form });
  } catch {
    throw new Error("network");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "provider_error");
  return body;
}

async function analyze() {
  if (!file || busy) return;
  busy = true;
  $("analyze").disabled = true;
  $("result").hidden = true;
  setStatus("Lettura dei metadati…", "loading");
  try {
    const md = await analyzeMetadata(file);
    renderMeta(md);

    if (md.declaredAI) {
      renderVisual({ kind: "skipped" });
    } else if (!apiConfigured) {
      renderVisual({ kind: "unavailable", message: "Il servizio di analisi non è ancora configurato in questa installazione." });
    } else {
      try {
        setStatus("Preparazione dell'immagine…", "loading");
        const hash = await sha256Hex(file);
        const { blob } = await downscale(file);
        setStatus("Analisi visiva in corso…", "loading");
        renderVisual({ kind: "ok", data: await callApi(blob, hash) });
      } catch (e) {
        renderVisual({ kind: "unavailable", message: ERRORS[e.message] || ERRORS.provider_error });
      }
    }
    setStatus("");
    $("result").hidden = false;
    showTab(md.declaredAI ? "meta" : "visual");
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    setStatus("Si è verificato un errore durante l'analisi. Riprova con un altro file.", "error");
  } finally {
    busy = false;
    $("analyze").disabled = !file;
  }
}

async function checkBudget() {
  if (!apiConfigured) return;
  try {
    const r = await fetch(API_URL + "/status");
    const s = await r.json();
    if (!s.available) {
      const b = $("banner");
      b.hidden = false;
      b.textContent = ERRORS.budget_exhausted;
    }
  } catch {}
}

const drop = $("drop");
drop.addEventListener("click", () => !file && $("file").click());
drop.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !file) { e.preventDefault(); $("file").click(); } });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); setFile(e.dataTransfer.files[0]); });
$("file").addEventListener("change", (e) => setFile(e.target.files[0]));
$("analyze").addEventListener("click", analyze);
$("reset").addEventListener("click", reset);
$("tab-meta").addEventListener("click", () => showTab("meta"));
$("tab-visual").addEventListener("click", () => showTab("visual"));
checkBudget();
