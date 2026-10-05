import { DetectorError } from "./index.js";

export const sightengine = {
  name: "sightengine",

  isConfigured(env) {
    return Boolean(env.SIGHTENGINE_USER && env.SIGHTENGINE_SECRET);
  },

  async analyze({ bytes, type }, env) {
    const form = new FormData();
    form.append("media", new Blob([bytes], { type }), "image");
    form.append("models", "genai");
    form.append("api_user", env.SIGHTENGINE_USER);
    form.append("api_secret", env.SIGHTENGINE_SECRET);

    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}

    if (res.status === 429 || data?.error?.type === "usage_limit") {
      throw new DetectorError("Limite del provider raggiunto", { quota: true });
    }
    if (!res.ok || data?.status !== "success") {
      throw new DetectorError(data?.error?.message || `Sightengine HTTP ${res.status}`);
    }
    const score = data?.type?.ai_generated;
    if (typeof score !== "number") throw new DetectorError("Risposta provider non valida");

    return {
      provider: "sightengine",
      aiScore: score,
      generators: data.type.ai_generators || null,
      operations: data.request?.operations,
    };
  },
};
