import * as exifr from "../vendor/exifr.full.esm.mjs";

// Generatori AI noti, cercati nei campi Software / CreatorTool / claim generator.
const AI_SOFTWARE = /midjourney|dall[\s·.-]?e|openai|chatgpt|stable[\s-]?diffusion|sdxl|comfyui|automatic1111|invokeai|firefly|imagen|gemini|google ai|flux|leonardo\.ai|ideogram|dreamstudio|novelai|nightcafe|runway|sora|recraft|reve|seedream|kling|bing image creator|designer\.microsoft|canva magic|stability\.ai/i;

const SOURCE_FULL = "trainedAlgorithmicMedia";
const SOURCE_PARTIAL = "compositeWithTrainedAlgorithmicMedia";

let c2paPromise = null;
async function getC2pa() {
  if (!c2paPromise) {
    c2paPromise = import("../vendor/c2pa.esm.min.js").then(({ createC2pa }) =>
      createC2pa({
        wasmSrc: new URL("../vendor/toolkit_bg.wasm", import.meta.url).href,
        workerSrc: new URL("../vendor/c2pa.worker.min.js", import.meta.url).href,
      })
    );
  }
  return c2paPromise;
}

async function readC2pa(file) {
  const out = { present: false, generator: null, issuer: null, sourceTypes: [], error: null };
  try {
    const c2pa = await Promise.race([
      getC2pa().then((c) => c.read(file)),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    const m = c2pa?.manifestStore?.activeManifest;
    if (!m) return out;
    out.present = true;
    out.generator = m.claimGenerator || null;
    out.issuer = m.signatureInfo?.issuer || null;
    for (const a of m.assertions?.data || []) {
      if (a.label?.startsWith("c2pa.actions")) {
        for (const act of a.data?.actions || []) {
          if (act.digitalSourceType) out.sourceTypes.push(String(act.digitalSourceType));
          const gen = act.softwareAgent?.name || act.softwareAgent;
          if (typeof gen === "string" && !out.generator) out.generator = gen;
        }
      }
    }
  } catch (e) {
    out.error = String(e?.message || e);
  }
  return out;
}

async function readExif(file) {
  try {
    return (
      (await exifr.parse(file, {
        tiff: true, exif: true, gps: false, xmp: true, iptc: true, icc: false,
        mergeOutput: true, translateValues: false, reviveValues: false,
      })) || {}
    );
  } catch {
    return {};
  }
}

// Scansione grezza del file: intercetta XMP/IPTC in forma testuale, manifest C2PA
// che la libreria non ha saputo leggere, e i parametri testuali di Stable Diffusion/ComfyUI nei PNG.
async function rawScan(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder("latin1").decode(buf);
  return {
    sourceFull: text.includes(SOURCE_FULL),
    sourcePartial: text.includes(SOURCE_PARTIAL),
    c2paMarker: text.includes("c2pa") && text.includes("jumb"),
    sdParams: /Steps: \d+, Sampler:/.test(text) || /"class_type"\s*:\s*"(KSampler|CheckpointLoader)/.test(text),
  };
}

const first = (...v) => v.find((x) => x != null && x !== "");

export async function analyzeMetadata(file) {
  const [exif, c2pa, raw] = await Promise.all([readExif(file), readC2pa(file), rawScan(file)]);
  const findings = []; // { level: "ai" | "info" | "neutral", text }
  let declaredAI = false;

  const dst = String(first(exif.DigitalSourceType, "") || "") + " " + c2pa.sourceTypes.join(" ");
  if (dst.includes(SOURCE_PARTIAL) || raw.sourcePartial) {
    declaredAI = true;
    findings.push({ level: "ai", text: "Il file dichiara di contenere elementi generati con AI (compositeWithTrainedAlgorithmicMedia)." });
  } else if (dst.includes(SOURCE_FULL) || raw.sourceFull) {
    declaredAI = true;
    findings.push({ level: "ai", text: "Il file dichiara di essere stato generato con AI (trainedAlgorithmicMedia)." });
  }

  const software = first(exif.Software, exif.CreatorTool, exif.HistorySoftwareAgent, c2pa.generator);
  if (software && AI_SOFTWARE.test(String(software))) {
    declaredAI = true;
    findings.push({ level: "ai", text: `Software di creazione riconosciuto come generatore AI: ${software}.` });
  } else if (software) {
    findings.push({ level: "info", text: `Software indicato: ${software}.` });
  }

  if (raw.sdParams) {
    declaredAI = true;
    findings.push({ level: "ai", text: "Nel file ci sono i parametri di generazione tipici di Stable Diffusion / ComfyUI." });
  }

  if (c2pa.present) {
    const who = c2pa.issuer ? ` Firmato da: ${c2pa.issuer}.` : "";
    findings.push({ level: declaredAI ? "ai" : "info", text: `Content Credentials (C2PA) presenti.${who}` });
  } else if (raw.c2paMarker) {
    findings.push({ level: "info", text: "Rilevata una struttura C2PA nel file, ma non è stato possibile verificarla." });
  } else {
    findings.push({ level: "neutral", text: "Nessun Content Credentials (C2PA) trovato. È normale: la maggior parte dei file non li ha." });
  }

  const camera = [exif.Make, exif.Model].filter(Boolean).join(" ");
  const shot = [exif.ExposureTime && "esposizione", exif.FNumber && "diaframma", exif.ISO && "ISO", exif.LensModel && "obiettivo", exif.DateTimeOriginal && "data di scatto"].filter(Boolean);
  if (camera || shot.length) {
    findings.push({
      level: "neutral",
      text: `Dati di fotocamera presenti${camera ? ` (${camera})` : ""}${shot.length ? `: ${shot.join(", ")}` : ""}. Si possono copiare o falsificare, quindi non dimostrano che la foto sia reale.`,
    });
  } else {
    findings.push({
      level: "neutral",
      text: "Nessun dato di fotocamera. Succede con le immagini AI, ma anche con screenshot e foto passate da social, chat o editor: da solo non è un indizio forte.",
    });
  }

  return { declaredAI, findings, hasCamera: Boolean(camera || shot.length), c2paPresent: c2pa.present };
}
