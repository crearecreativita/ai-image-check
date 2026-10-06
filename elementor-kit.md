# Kit per la pagina Elementor "AI Image Check"

Schema identico a Inquadrami: duplica la pagina "TOOL - Genera QR Code" (ID 10084) e sostituisci i contenuti qui sotto.

## Impostazioni pagina
- Titolo interno: `TOOL - Verifica immagine AI`
- Slug: `verifica-immagine-ai`
- Title SEO (Yoast): `Verifica immagine AI gratis: è generata con l'intelligenza artificiale? | Creare Creatività`
- Meta description: `Carica un'immagine e scopri se potrebbe essere generata con AI. Leggo i metadati e analizzo i pixel: un indizio con margine di errore, non una prova. Gratis.`
- Parola chiave principale: `verifica immagine AI`

## Hero (primo contenitore "Header")
- Heading (con la parte rosa come negli altri tool): `Scopri se un'immagine è AI`  (rosa: `AI`)
- Sottotitolo (testo maiuscolo piccolo): `VERIFICA IMMAGINE AI GRATIS`

## Widget HTML dell'iframe (secondo blocco)
Sostituisci il contenuto del widget HTML con:

```html
<iframe loading="lazy" id="aicheck-frame" src="https://aicheck.crearecreativita.it/?embed=1" style="width:100%;height:900px;border:0;display:block" scrolling="no" title="AI Image Check"></iframe>
<noscript><iframe id="aicheck-frame-ns" src="https://aicheck.crearecreativita.it/?embed=1" style="width:100%;height:900px;border:0;display:block" scrolling="no" title="AI Image Check"></iframe></noscript>
<script>
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://aicheck.crearecreativita.it') return;
  if (!e.data || e.data.type !== 'aicheck-height') return;
  document.getElementById('aicheck-frame').style.height = e.data.height + 'px';
});
</script>
```

## Larghezza a 1280 px
Il tool nell'iframe riempie tutta la larghezza che gli dai, quindi la misura si imposta in Elementor, non nel codice:
1. Apri la pagina duplicata in Elementor e seleziona il contenitore che racchiude il widget HTML dell'iframe (nel QR è quello con "Larghezza contenuto" a 1024 px).
2. Layout > Larghezza contenuto > Boxed > `1280` px.
3. Controlla anche il contenitore esterno: nel QR ha 20 px di padding laterale, lascialo così per il mobile.

## FAQ (accordion) — titolo sezione: `Domande frequenti`

1. **Come capisco se un'immagine è stata generata con l'AI?**
Il tool fa due controlli. Prima legge i metadati del file (Content Credentials C2PA, EXIF, XMP) cercando dichiarazioni di origine AI e software di generazione noti. Se non trova niente di chiaro, analizza i pixel dell'immagine con un modello di rilevamento e restituisce una stima in percentuale.

2. **Quanto è affidabile il risultato?**
È un indizio, non una prova. Nessun sistema di rilevamento è affidabile al 100%: foto vere possono risultare sospette e immagini AI possono passare inosservate. Per questo il risultato è una stima con un margine indicativo e non un verdetto.

3. **Cosa sono i Content Credentials (C2PA)?**
Sono dati firmati che alcuni strumenti e fotocamere aggiungono al file per dichiarare come è stato creato o modificato. Se ci sono, sono un'informazione utile. Se mancano non dicono nulla, perché si perdono facilmente con screenshot, social e chat.

4. **Perché una foto vera può risultare sospetta?**
Screenshot, foto molto ritoccate, immagini ricompresse o passate da social e chat perdono dettagli e metadati, e questo può confondere il rilevamento. Succede anche con grafiche vettoriali e illustrazioni digitali.

5. **Le mie immagini vengono salvate?**
No. I metadati vengono letti nel tuo browser. Per l'analisi visiva una versione ridotta dell'immagine viene inviata a un servizio esterno. Conserviamo solo l'impronta del file (hash) e il risultato per 30 giorni.

6. **Posso analizzare quante immagini voglio?**
La lettura dei metadati non ha limiti. L'analisi visiva ha un numero giornaliero di analisi per utente e un tetto complessivo al giorno: quando è esaurito resta attiva l'analisi dei metadati.

## Schema FAQ (secondo widget HTML in fondo alla pagina)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {"@type": "Question", "name": "Come capisco se un'immagine è stata generata con l'AI?", "acceptedAnswer": {"@type": "Answer", "text": "Il tool fa due controlli. Prima legge i metadati del file (Content Credentials C2PA, EXIF, XMP) cercando dichiarazioni di origine AI e software di generazione noti. Se non trova niente di chiaro, analizza i pixel dell'immagine con un modello di rilevamento e restituisce una stima in percentuale."}},
    {"@type": "Question", "name": "Quanto è affidabile il risultato?", "acceptedAnswer": {"@type": "Answer", "text": "È un indizio, non una prova. Nessun sistema di rilevamento è affidabile al 100%: foto vere possono risultare sospette e immagini AI possono passare inosservate. Per questo il risultato è una stima con un margine indicativo e non un verdetto."}},
    {"@type": "Question", "name": "Cosa sono i Content Credentials (C2PA)?", "acceptedAnswer": {"@type": "Answer", "text": "Sono dati firmati che alcuni strumenti e fotocamere aggiungono al file per dichiarare come è stato creato o modificato. Se ci sono, sono un'informazione utile. Se mancano non dicono nulla, perché si perdono facilmente con screenshot, social e chat."}},
    {"@type": "Question", "name": "Perché una foto vera può risultare sospetta?", "acceptedAnswer": {"@type": "Answer", "text": "Screenshot, foto molto ritoccate, immagini ricompresse o passate da social e chat perdono dettagli e metadati, e questo può confondere il rilevamento. Succede anche con grafiche vettoriali e illustrazioni digitali."}},
    {"@type": "Question", "name": "Le mie immagini vengono salvate?", "acceptedAnswer": {"@type": "Answer", "text": "No. I metadati vengono letti nel tuo browser. Per l'analisi visiva una versione ridotta dell'immagine viene inviata a un servizio esterno. Conserviamo solo l'impronta del file (hash) e il risultato per 30 giorni."}},
    {"@type": "Question", "name": "Posso analizzare quante immagini voglio?", "acceptedAnswer": {"@type": "Answer", "text": "La lettura dei metadati non ha limiti. L'analisi visiva ha un numero giornaliero di analisi per utente e un tetto complessivo al giorno: quando è esaurito resta attiva l'analisi dei metadati."}}
  ]
}
</script>
```

## Menu
Aspetto > Menu > voce "Tool": aggiungi un link personalizzato
- URL: `https://www.crearecreativita.it/verifica-immagine-ai/`
- Testo: `Verifica immagine AI`

## Le sezioni "Prompt/Form" in fondo
Il blocco con il form di contatto lo lasci come nella pagina QR (cambia solo il titolo se vuoi).
