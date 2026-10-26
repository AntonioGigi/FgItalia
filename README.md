# FGItalia – sito web e negozio online

Nuovo sito di **FGItalia di Francesco Gieri** (prodotti per la fisioterapia, Acireale), riscritto da zero.

- **Tecnologia:** [Astro](https://astro.build) (sito statico velocissimo) + funzioni server Netlify per il negozio.
- **Pannello contenuti** su `/admin/` ([Decap CMS](https://decapcms.org)): prodotti, prezzi, disponibilità, corsi, novità, categorie, marchi, contatti, spedizione.
- **Negozio:** carrello, pagamento sicuro con [Stripe](https://stripe.com) (carta, PayPal, Apple Pay, Google Pay), oppure ordine su WhatsApp.
- **Ordini:** email a FGItalia per ogni ordine, email di conferma al cliente, pagina `/ordine/` dove il cliente segue lo stato, pannello `/gestione-ordini/` per segnare "in lavorazione", "spedito" (con tracking) e "consegnato": il cliente riceve un'email a ogni passaggio.
- **Avvisi:** iscrizione agli avvisi su corsi e offerte; quando si pubblica un nuovo corso parte da sola un'email a tutti gli iscritti ([Brevo](https://www.brevo.com), piano gratuito).
- **Social e Google:** WhatsApp, Instagram, Facebook, anteprime per la condivisione, dati strutturati, sitemap, feed prodotti per Google Shopping (`/feed-google.xml`).

## Struttura

| Cosa | Dove |
| --- | --- |
| Dati aziendali, telefono, WhatsApp, email, social | `src/data/impostazioni.json` |
| Prodotti (uno per file, con prezzo IVA esclusa) | `src/content/prodotti/*.md` |
| Corsi di formazione | `src/content/corsi/*.md` |
| Categorie / Marchi | `src/content/categorie/*.json`, `src/content/marchi/*.json` |
| Novità e offerte | `src/content/novita/*.md` |
| Foto prodotti, schede tecniche PDF, foto dello showroom | `public/uploads/` |
| Pagine | `src/pages/` |
| Conti del negozio (IVA, spedizione) | `src/lib/negozio.ts` |
| Funzioni server (pagamento, ordini, email, avvisi) | `netlify/functions/`, `netlify/lib/` |
| Test automatici | `tests/` (`npm test`) |
| Configurazione del pannello | `public/admin/config.yml` |

## Sviluppo

```sh
npm install
npm run dev      # http://localhost:4321
npm test         # test automatici di conti, pagamenti e ordini
npm run build    # controlli + test + sito in dist/
```

## Messa online (Netlify, gratuito)

1. Su [netlify.com](https://www.netlify.com), *Add new site → Import from GitHub* e scegli questo repository (ramo `main`). Le impostazioni di build sono già in `netlify.toml`.
2. **Moduli contatti e corsi:** in *Site configuration → Forms → Form notifications* aggiungi una notifica email verso l'indirizzo di FGItalia.
3. **Pannello `/admin/`:** in *Site configuration → Access & security → OAuth* installa il provider **GitHub** (servono Client ID e Secret di una GitHub OAuth App con callback `https://api.netlify.com/auth/done`). Chi deve usare il pannello accede con un account GitHub che abbia accesso in scrittura al repository.
4. **Dominio:** in *Domain management* aggiungi `fgitalia.it` e `www.fgitalia.it`, poi presso il registrar del dominio imposta i DNS indicati da Netlify. Il certificato HTTPS è automatico. Tutti i vecchi indirizzi WordPress (prodotti, categorie, pagine) sono reindirizzati alle nuove pagine in `public/_redirects`.

## Attivare pagamenti, ordini e avvisi

Tutte le chiavi vanno in Netlify, *Site configuration → Environment variables* (mai nel codice).

### Stripe (pagamenti)
1. Crea l'account su [stripe.com](https://stripe.com) con i dati di FGItalia (P.IVA, IBAN per gli accrediti).
2. *Impostazioni → Metodi di pagamento*: attiva carte, **PayPal**, Apple Pay e Google Pay.
3. *Sviluppatori → Chiavi API*: copia la chiave segreta in `STRIPE_SECRET_KEY`.
4. *Sviluppatori → Webhook → Aggiungi endpoint*: indirizzo `https://www.fgitalia.it/api/stripe-webhook`, eventi `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. Copia il "segreto di firma" in `STRIPE_WEBHOOK_SECRET`.
5. Consigliato: installa l'app Stripe sul telefono per ricevere una notifica a ogni pagamento.

Per provare senza soldi veri usa prima le chiavi "di test" di Stripe e la carta `4242 4242 4242 4242`.

### Brevo (email)
1. Crea l'account gratuito su [brevo.com](https://www.brevo.com) e verifica l'indirizzo mittente (es. `ordini@fgitalia.it`) e, se possibile, il dominio `fgitalia.it`.
2. *SMTP & API → API keys*: crea una chiave e mettila in `BREVO_API_KEY`.
3. *Contatti → Liste*: crea la lista "Avvisi corsi e offerte" e metti il suo numero (ID) in `BREVO_LISTA_ID`.

### Altre variabili
| Variabile | A cosa serve |
| --- | --- |
| `EMAIL_MITTENTE` | indirizzo verificato su Brevo da cui partono le email |
| `EMAIL_NOTIFICHE` | dove ricevere gli avvisi dei nuovi ordini (se vuota: l'email del sito) |
| `ADMIN_PASSWORD` | password del pannello ordini `/gestione-ordini/` (lunga, almeno 12 caratteri) |
| `INSTAGRAM_TOKEN` | facoltativo: mostra gli ultimi post Instagram in home |

### Google
- [Google Search Console](https://search.google.com/search-console): aggiungi il sito e invia la sitemap `https://www.fgitalia.it/sitemap.xml`.
- [Google Merchant Center](https://merchants.google.com): aggiungi il feed `https://www.fgitalia.it/feed-google.xml` per comparire gratis in Google Shopping.
- [Google Business Profile](https://www.google.com/business/): scheda dell'azienda su Maps con link al sito.

**Instagram (facoltativo):** imposta `INSTAGRAM_TOKEN` (token della *Instagram API with Instagram Login* di un account Business/Creator) per mostrare gli ultimi post in home. Il token va rinnovato prima della scadenza (60 giorni). Il sito legge i post a ogni pubblicazione.
