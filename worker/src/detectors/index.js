// Interfaccia "detector":
//   { name, isConfigured(env), analyze({ bytes, type }, env) }
// analyze restituisce:
//   { provider, aiScore: 0..1, generators: { nome: 0..1 } | null, operations: number }
// Per aggiungere un provider: crea un file, esporta un oggetto con questa forma
// e aggiungilo a DETECTORS (l'ordine è l'ordine di fallback).
import { sightengine } from "./sightengine.js";

export const DETECTORS = [sightengine];

export class DetectorError extends Error {
  constructor(message, { quota = false } = {}) {
    super(message);
    this.quota = quota; // true = provider senza crediti/limite raggiunto
  }
}

export async function runDetectors(image, env, detectors = DETECTORS) {
  let lastErr = null;
  for (const d of detectors) {
    if (!d.isConfigured(env)) continue;
    try {
      return await d.analyze(image, env);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new DetectorError("Nessun provider configurato");
}
