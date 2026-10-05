// URL della Worker dopo il deploy (vedi README). Nessun segreto qui.
export const API_URL = "https://ai-image-check.TUOSUBDOMINIO.workers.dev";

export const MAX_INPUT_BYTES = 25 * 1024 * 1024; // file originale accettato nel browser
export const RESIZE_MAX_SIDE = 1024;
export const JPEG_QUALITY = 0.85;

// Ampiezza della fascia di incertezza attorno al punteggio del provider (+/-).
export const UNCERTAINTY = 0.15;
