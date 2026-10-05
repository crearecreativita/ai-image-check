// Unica fonte di verità per i limiti. Verificati su sightengine.com/pricing
// e sightengine.com/docs/ai-generated-image-detection il 2026-10-05.
export const CONFIG = {
  // Piano free Sightengine: 2.000 operazioni/mese, max 500/giorno, 1 richiesta/s.
  PROVIDER_MONTHLY_OPS: 2000,
  PROVIDER_DAILY_OPS: 500,
  // Il modello genai costa 5 operazioni per chiamata (campo request.operations nella risposta).
  OPS_PER_CALL: 5,
  // Margine di sicurezza: usiamo al massimo il 95% del budget del provider.
  SAFETY_FACTOR: 0.95,

  // Per utente (IP): analisi API al giorno.
  PER_IP_DAILY_CALLS: 3,

  // Cache dei risultati (per hash SHA-256), in secondi: 30 giorni.
  CACHE_TTL_SECONDS: 30 * 24 * 3600,

  // Upload massimo accettato (l'immagine ridotta dal browser pesa di norma < 400 KB).
  MAX_UPLOAD_BYTES: 2 * 1024 * 1024,
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp"],
};

export function budgetCalls() {
  const c = CONFIG;
  return {
    daily: Math.floor((c.PROVIDER_DAILY_OPS * c.SAFETY_FACTOR) / c.OPS_PER_CALL),
    monthly: Math.floor((c.PROVIDER_MONTHLY_OPS * c.SAFETY_FACTOR) / c.OPS_PER_CALL),
  };
}
