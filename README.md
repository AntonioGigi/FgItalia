# FGItalia – sito web

Nuovo sito di **FGItalia di Francesco Gieri** (apparecchiature elettromedicali, Acireale), riscritto da zero.

- **Tecnologia:** [Astro](https://astro.build): sito statico, velocissimo e sicuro, senza database né WordPress da aggiornare.
- **Pannello di gestione:** su `/admin/` ([Decap CMS](https://decapcms.org)) si modificano prodotti, novità, categorie, marchi, contatti e social senza toccare il codice.
- **Social:** pulsante WhatsApp fisso, link Instagram/Facebook, condivisione dei prodotti, anteprime curate quando si condivide un link e (facoltativo) ultimi post Instagram in home.
- **Preventivi:** modulo contatti (Netlify Forms) e pulsante "Richiedi preventivo" su ogni prodotto, già compilato con il nome del prodotto.

## Struttura

| Cosa | Dove |
| --- | --- |
| Dati aziendali, telefono, WhatsApp, email, social | `src/data/impostazioni.json` |
| Prodotti (uno per file) | `src/content/prodotti/*.md` |
| Categorie / Marchi | `src/content/categorie/*.json`, `src/content/marchi/*.json` |
| Novità e offerte | `src/content/novita/*.md` |
| Foto e PDF caricati dal pannello | `public/uploads/` |
| Pagine | `src/pages/` |
| Configurazione del pannello | `public/admin/config.yml` |

## Sviluppo

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # controllo dei tipi + sito in dist/
```

## Messa online (Netlify, gratuito)

1. Su [netlify.com](https://www.netlify.com), *Add new site → Import from GitHub* e scegli questo repository (ramo `main`). Le impostazioni di build sono già in `netlify.toml`.
2. **Modulo preventivi:** in *Site configuration → Forms → Form notifications* aggiungi una notifica email verso l'indirizzo di FGItalia.
3. **Pannello `/admin/`:** in *Site configuration → Access & security → OAuth* installa il provider **GitHub** (servono Client ID e Secret di una GitHub OAuth App con callback `https://api.netlify.com/auth/done`). Chi deve usare il pannello accede con un account GitHub che abbia accesso in scrittura al repository.
4. **Dominio:** in *Domain management* aggiungi `fgitalia.it` e `www.fgitalia.it`, poi presso il registrar del dominio imposta i DNS indicati da Netlify. Il certificato HTTPS è automatico. I vecchi indirizzi WordPress noti sono reindirizzati in `netlify.toml`.
5. **Instagram (facoltativo):** imposta la variabile d'ambiente `INSTAGRAM_TOKEN` (token della *Instagram API with Instagram Login* di un account Business/Creator) per mostrare gli ultimi post in home. Il token va rinnovato prima della scadenza (60 giorni). Il sito legge i post a ogni pubblicazione.
