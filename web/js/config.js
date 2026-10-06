// URL della Worker dopo il deploy (vedi README). Nessun segreto qui.
export const API_URL = "https://ai-image-check.ale-minotto.workers.dev";

export const MAX_INPUT_BYTES = 25 * 1024 * 1024; // file originale accettato nel browser
export const RESIZE_MAX_SIDE = 1024;
export const JPEG_QUALITY = 0.85;

// Margine indicativo attorno al punteggio: stretto agli estremi (0 o 1), più largo al centro.
// È un'euristica di presentazione, non un intervallo di confidenza statistico.
export const UNCERTAINTY_MIN = 0.04;
export const UNCERTAINTY_MAX = 0.2;
