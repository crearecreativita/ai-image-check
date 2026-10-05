# AI Image Check

Mini-tool web che stima se un'immagine è stata generata con AI. Interfaccia in italiano, costo zero.
Il risultato è sempre un **indizio con una fascia di incertezza, mai un verdetto**.

## Come funziona

1. **Nel browser** (gratis, illimitato): lettura di C2PA / Content Credentials (c2pa-js), EXIF/IPTC/XMP (exifr), ricerca di `trainedAlgorithmicMedia`, di software di generazione noti e dei parametri Stable Diffusion/ComfyUI nei PNG. Se i metadati dichiarano chiaramente un'origine AI, il risultato si ferma qui e **l'immagine non viene inviata a nessuno**.
2. Altrimenti il browser calcola lo SHA-256 del file e lo riduce (lato lungo max 1024 px, JPEG 85).
3. La **Worker Cloudflare** controlla la cache KV per hash (30 giorni). Se manca, chiama Sightengine (modello `genai`) e salva solo hash + risultato.
4. Il frontend mostra probabilità AI con fascia (±15 punti, arrotondata a 5), generatore più simile (se >= 50% e fornito dall'API) e il disclaimer.

```
web/      frontend statico (GitHub Pages), vendor/ contiene c2pa-js ed exifr già pronti
worker/   Cloudflare Worker (src/config.js = tutti i limiti, src/detectors/ = provider)
tests/    istruzioni per i test con immagini reali
```

## Limiti gratuiti (verificati il 2026-10-05)

| Servizio | Limite free | Fonte |
|---|---|---|
| Sightengine | 2.000 operazioni/mese, max 500/giorno, 1 richiesta/s | [sightengine.com/pricing](https://sightengine.com/pricing) |
| Sightengine genai | 5 operazioni per chiamata (campo `request.operations` nella risposta di esempio) | [docs genai](https://sightengine.com/docs/ai-generated-image-detection); la pagina prezzi non lo dice, conferma da fonti terze: ricontrolla nella tua dashboard |
| Quindi | circa **400 analisi/mese, 100/giorno** | calcolo |
| Cloudflare Workers free | 100.000 richieste/giorno | [developers.cloudflare.com/workers/platform/limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Cloudflare KV free | 100.000 letture/giorno, 1.000 scritture/giorno | [developers.cloudflare.com/kv/platform/limits](https://developers.cloudflare.com/kv/platform/limits/) |

Le righe Cloudflare sono quelle che conoscevo, non le ho riverificate in questa sessione: controlla le pagine.
Ogni analisi nuova usa 4 scritture KV (cache + 3 contatori), quindi con il tetto di 95 chiamate/giorno restiamo a circa 380 scritture, sotto il limite.

Valori applicati in `worker/src/config.js` (unico file da toccare se i piani cambiano):
budget usato al 95% (`SAFETY_FACTOR`), quindi **95 chiamate/giorno e 380/mese**; **3 analisi API al giorno per IP**; upload massimo 2 MB; solo JPEG/PNG/WebP (controllo sui byte, non sul nome).
Se la Worker legge `request.operations` maggiore di 5, conta la chiamata in proporzione.

Quando il budget è finito la Worker risponde 429 e il sito mostra: "Analisi avanzata esaurita per oggi, resta attiva l'analisi dei metadati". La pagina controlla `/status` al caricamento e mostra un avviso in anticipo.

## Setup

### 1. Account
- Cloudflare: [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (nessuna carta richiesta).
- Sightengine: [dashboard.sightengine.com/signup](https://dashboard.sightengine.com/signup). Dalla dashboard copia `API user` e `API secret`.
- GitHub: un repository pubblico per il frontend.

### 2. Deploy della Worker
```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create CACHE
```
Incolla l'`id` stampato in `wrangler.toml` (campo `id`). Poi imposta in `wrangler.toml` `ALLOWED_ORIGIN` con il dominio del frontend, es. `https://tuonome.github.io` (più origini separate da virgola; per i test locali aggiungi `http://localhost:8123`).

```bash
npx wrangler secret put SIGHTENGINE_USER
npx wrangler secret put SIGHTENGINE_SECRET
npx wrangler secret put IP_SALT      # una stringa casuale qualsiasi (opzionale ma consigliato)
npx wrangler deploy
```
Wrangler stampa l'URL, tipo `https://ai-image-check.<tuo-subdominio>.workers.dev`.

### 3. Frontend
In `web/js/config.js` sostituisci `API_URL` con l'URL della Worker. Poi pubblica la cartella `web/`:

- **Più semplice**: Settings > Pages del repo > Source "GitHub Actions" e aggiungi `.github/workflows/pages.yml` (già incluso) che pubblica `web/`.
- In locale: `cd web && python3 -m http.server 8123`.

### 4. Test
```bash
cd worker && npm test     # 5 test: cache, CORS, tipo file, limite IP, budget
```
Poi i test con immagini reali: vedi `tests/README.md`.

## Aggiungere un secondo provider
Crea `worker/src/detectors/nomeprovider.js` che esporta `{ name, isConfigured(env), analyze({bytes, type}, env) }` e restituisce `{ provider, aiScore (0..1), generators, operations }`, poi aggiungilo all'array `DETECTORS` in `worker/src/detectors/index.js`. L'ordine è l'ordine di fallback: se il primo fallisce o ha finito i crediti, si prova il successivo.

## Note oneste
- **Cache per hash dichiarato dal client**: un utente malintenzionato potrebbe inviare un hash falso e "avvelenare" la cache per quel hash. Rischio basso per un uso personale; per blindarlo, la Worker dovrebbe ricalcolare l'hash (ma l'hash dell'originale non è verificabile sull'immagine ridotta).
- I contatori KV non sono atomici: richieste simultanee possono perderne qualcuna. Il margine del 5% lo copre.
- Il ridimensionamento a 1024 px e la ricompressione possono indebolire i segnali che il detector usa: è il prezzo del risparmio di banda.
- I detector sbagliano, soprattutto su screenshot, immagini molto ritoccate o ricomprese. Per questo si mostra una fascia e non un numero.
- c2pa-js è di Adobe (licenza MIT/Apache, vedi il repository originale); exifr è MIT. Sono copiati in `web/vendor` perché il worker C2PA deve stare sullo stesso dominio.
