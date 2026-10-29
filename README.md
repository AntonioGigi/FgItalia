# FGItalia – sito web e negozio online

Nuovo sito di **FGItalia di Francesco Gieri** (prodotti per la fisioterapia, Acireale), riscritto da zero.

- **Tecnologia:** [Astro](https://astro.build) (sito statico velocissimo) + funzioni server Netlify per il negozio.
- **Pannello contenuti** su `/admin/` ([Decap CMS](https://decapcms.org)): prodotti, prezzi, disponibilità, corsi, novità, categorie, marchi, contatti, spedizione.
- **Negozio:** carrello, pagamento sicuro con [Stripe](https://stripe.com) (carta, PayPal, Apple Pay, Google Pay), oppure ordine su WhatsApp.
- **Ordini:** email a FGItalia per ogni ordine, email di conferma al cliente, pagina `/ordine/` dove il cliente segue lo stato, pannello `/gestione-ordini/` per segnare "in lavorazione", "spedito" (con tracking) e "consegnato": il cliente riceve un'email a ogni passaggio.
- **Area clienti** (`/account/`, riservata ai professionisti): accesso con email e password, storico ordini con fatture in PDF, dati fiscali salvati (P.IVA, SDI, PEC) e già compilati al pagamento, manuali e certificati CE dei prodotti acquistati, riordino rapido dei consumabili, preventivi PDF dal carrello, promemoria di manutenzione delle apparecchiature e richieste di assistenza prioritarie.
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
| Funzioni server (pagamento, ordini, email, avvisi, area clienti) | `netlify/functions/`, `netlify/lib/` |
| Area clienti | `src/pages/account/`, `netlify/functions/account*.mts`, `netlify/lib/clienti.ts` |
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
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | facoltative: accesso con Google per i clienti (vedi sotto) |
| `SESSION_SECRET` | chiave segreta per l'area clienti: una frase lunga e casuale (almeno 32 caratteri). Se la cambi, tutti i clienti devono rifare l'accesso |
| `INSTAGRAM_TOKEN` | facoltativo: mostra gli ultimi post Instagram in home |

### Area clienti
Gli account dei clienti, i preventivi e le richieste di assistenza sono salvati su Netlify (Blobs), come gli ordini: non servono altri servizi.

1. Aggiungi la variabile `SESSION_SECRET` (vedi tabella sopra). Per generarla puoi usare un gestore di password o il comando `openssl rand -base64 48`.
2. **Fatture:** dopo aver emesso la fattura elettronica, apri l'ordine in `/gestione-ordini/` e carica la copia PDF. Il cliente la riceve per email e la ritrova nel suo account.
3. **Documenti dei prodotti:** nel pannello `/admin/`, in ogni prodotto, la lista "Manuali, certificati CE e altri documenti" accetta i PDF. I clienti che hanno acquistato il prodotto li vedono nell'area clienti (compaiono anche nella scheda del prodotto).
4. **Riordino rapido:** i prodotti della categoria "Materiali di consumo" compaiono in automatico; per altri prodotti accendi "Materiale di consumo".
5. **Manutenzione:** le apparecchiature hanno un promemoria ogni 12 mesi, modificabile per prodotto con "Manutenzione ogni (mesi)" (0 = nessuna). Ogni mattina il sito manda un'email ai clienti con una scadenza entro 30 giorni.
6. **Assistenza:** le richieste arrivano via email a `EMAIL_NOTIFICHE` (quelle con lo studio fermo hanno 🔴 nell'oggetto) e si gestiscono in `/gestione-ordini/`, scheda "Assistenza". Rispondendo all'email si scrive direttamente al cliente.
7. **Preventivi:** ogni preventivo scaricato da un cliente arriva anche via email a FGItalia, utile per richiamarlo.

## Accesso con Google (area clienti)

1. Su [console.cloud.google.com](https://console.cloud.google.com) crea un progetto "FGItalia".
2. *API e servizi → Schermata consenso OAuth*: tipo **Esterno**, nome "FGItalia", email di assistenza, dominio autorizzato `fgitalia.it`, link alla privacy `https://www.fgitalia.it/privacy/`. Lascia gli ambiti di base (email, profilo) e premi **Pubblica app**.
3. *Credenziali → Crea credenziali → ID client OAuth → Applicazione web*. In **URI di reindirizzamento autorizzati** aggiungi `https://www.fgitalia.it/api/account/google/ritorno` (e, per le prove, `https://NOME-SITO.netlify.app/api/account/google/ritorno`).
4. Copia **ID client** e **Client secret** su Netlify nelle variabili `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, poi ripubblica.
5. Nel pannello `/admin/`, *Impostazioni del sito*, attiva **Accesso con Google nell'area clienti**.

Chi entra con Google per la prima volta completa la registrazione con professione e dichiarazione di operatore del settore. Se l'email coincide con un account esistente, i due si collegano (Google ha già verificato l'email).

## Sicurezza

Cosa fa il sito:
- **HTTPS ovunque** (certificato automatico di Netlify, `Strict-Transport-Security`).
- **Content Security Policy** in ogni pagina (`astro.config.mjs`): il browser esegue solo gli script del sito, riconosciuti dalla loro impronta SHA-256. Insieme a `X-Frame-Options`, `Permissions-Policy` e `Cross-Origin-Opener-Policy` (in `netlify.toml`) protegge da codice iniettato e da pagine false che incorniciano il sito.
- **Pagamenti:** i dati di carta e PayPal restano su Stripe (PCI DSS); il sito ricalcola i prezzi lato server e accetta solo notifiche di pagamento firmate da Stripe.
- **Verifica in due passaggi (codici TOTP a 6 cifre, app tipo Google Authenticator):** per il pannello ordini (sezione *Sicurezza*) e, facoltativa, per i clienti (*I miei dati*). Segreto cifrato AES-256-GCM, codici usabili una volta sola, 8 codici di recupero salvati solo come impronta, 5 tentativi sbagliati ogni 15 minuti. Vale anche per chi entra con Google. Se si perdono telefono e codici del pannello: su Netlify, *Blobs → sicurezza*, cancellare `pannello-due-fattori`.
- **Area clienti:** password con scrypt e sale casuale, password troppo comuni rifiutate, sessione in cookie firmato `HttpOnly`/`Secure`/`SameSite`, cambio password che chiude le altre sessioni, richieste accettate solo dal sito stesso.
- **Limiti contro i tentativi a raffica** (`netlify/lib/limiti.ts`): accesso clienti (8 errori per account, 20 per connessione ogni 15 minuti), pannello ordini (5 errori per connessione ogni 15 minuti, 30 in tutto ogni ora), recupero password (3 email all'ora per indirizzo), registrazioni, ricerca ordini, pagamenti e iscrizioni. I contatori usano impronte: niente IP o email in chiaro.
- **Documenti:** fatture, preventivi e ordini si scaricano solo dal titolare; le pagine con dati personali non vanno in cache né su Google.
- **Errori:** al visitatore solo un codice, il dettaglio resta nei log di Netlify.

Cosa deve fare chi gestisce il sito:
- Attivare la **verifica in due passaggi (2FA)** su GitHub, Netlify, Stripe, Brevo e Aruba: chi entra in uno di questi account vede tutti i dati.
- Usare password lunghe e diverse per `ADMIN_PASSWORD`, `SESSION_SECRET` (almeno 32 caratteri casuali) e gli account dei servizi.
- In GitHub, *Settings → Code security*: attivare **Dependabot security updates** per ricevere le correzioni di sicurezza delle librerie.
- Se una chiave finisce dove non deve (chat, email, foto): rigenerarla subito sul servizio e aggiornarla su Netlify.

### Google
- [Google Search Console](https://search.google.com/search-console): aggiungi il sito e invia la sitemap `https://www.fgitalia.it/sitemap.xml`.
- [Google Merchant Center](https://merchants.google.com): aggiungi il feed `https://www.fgitalia.it/feed-google.xml` per comparire gratis in Google Shopping.
- [Google Business Profile](https://www.google.com/business/): scheda dell'azienda su Maps con link al sito.

**Instagram (facoltativo):** imposta `INSTAGRAM_TOKEN` (token della *Instagram API with Instagram Login* di un account Business/Creator) per mostrare gli ultimi post in home. Il token va rinnovato prima della scadenza (60 giorni). Il sito legge i post a ogni pubblicazione.
