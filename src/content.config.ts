import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Il pannello di gestione può salvare i campi facoltativi vuoti come "" o null:
// li trattiamo come assenti, così un campo lasciato vuoto non blocca la pubblicazione.
const vuotoComeAssente = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

const categorie = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/categorie' }),
  schema: z.object({
    titolo: z.string(),
    descrizione: z.string(),
    icona: z.enum(['fisioterapia', 'consumabili', 'strumenti', 'palestra', 'monitor', 'diagnostica', 'riabilitazione', 'medicale']),
    ordine: z.number().default(99),
  }),
});

const marchi = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/marchi' }),
  schema: z.object({
    nome: z.string(),
    logo: vuotoComeAssente(z.string()),
    sito: vuotoComeAssente(z.string()),
  }),
});

const prodotti = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/prodotti' }),
  schema: z.object({
    titolo: z.string(),
    categoria: reference('categorie'),
    sottocategoria: vuotoComeAssente(z.string()),
    marca: vuotoComeAssente(reference('marchi')),
    codice: vuotoComeAssente(z.string()),
    descrizione_breve: z.string(),
    /** Prezzo in euro IVA esclusa; se manca il sito mostra "Prezzo su richiesta" */
    prezzo: z.preprocess((v) => (v === '' || v === null || v === 0 ? undefined : v), z.coerce.number().positive().optional()),
    disponibilita: z.preprocess(
      (v) => v || undefined,
      z.enum(['disponibile', 'su_ordinazione', 'esaurito']).default('disponibile'),
    ),
    immagini: z.preprocess((v) => v ?? [], z.array(z.string())),
    specifiche: z.preprocess((v) => v ?? [], z.array(z.object({ nome: z.string(), valore: z.coerce.string() }))),
    scheda_pdf: vuotoComeAssente(z.string()),
    /** manuali, certificati CE e altri documenti: compaiono nella scheda e nell'area clienti di chi l'ha acquistato */
    documenti: z.preprocess(
      (v) => v ?? [],
      z.array(
        z.object({
          titolo: z.string(),
          file: z.string(),
          tipo: z.preprocess((v) => v || undefined, z.enum(['manuale', 'certificato_ce', 'dichiarazione', 'scheda', 'altro']).default('altro')),
        }),
      ),
    ),
    /** prodotto che si riordina spesso (creme, elettrodi, tape…); se manca vale per la categoria "materiali di consumo" */
    consumabile: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.boolean().optional()),
    /** ogni quanti mesi va fatta la manutenzione o la verifica di sicurezza; se manca vale 12 per le apparecchiature */
    manutenzione_mesi: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().min(0).max(120).optional()),
    in_evidenza: z.boolean().default(false),
    pubblicato: z.boolean().default(true),
  }),
});

const novita = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/novita' }),
  schema: z.object({
    titolo: z.string(),
    data: z.coerce.date(),
    immagine: vuotoComeAssente(z.string()),
    riassunto: z.string(),
    pubblicato: z.boolean().default(true),
  }),
});

const corsi = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/corsi' }),
  schema: z.object({
    titolo: z.string(),
    data: z.coerce.date(),
    orario: vuotoComeAssente(z.string()),
    luogo: vuotoComeAssente(z.string()),
    docente: vuotoComeAssente(z.string()),
    prezzo: z.preprocess((v) => (v === '' || v === null || v === 0 ? undefined : v), z.coerce.number().positive().optional()),
    immagine: vuotoComeAssente(z.string()),
    riassunto: z.string(),
    /** alla pubblicazione invia un'email agli iscritti agli avvisi */
    avvisa_iscritti: z.boolean().default(true),
    pubblicato: z.boolean().default(true),
  }),
});

/**
 * Promozioni: sconto in percentuale su tutti i prodotti, su alcune categorie o su
 * singoli prodotti, dal giorno "dal" al giorno "al" compresi. Il prezzo scontato vale
 * ovunque (catalogo, carrello, pagamento, preventivi) perché passa da src/lib/promozioni.ts.
 */
const promozioni = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/promozioni' }),
  schema: z.object({
    titolo: z.string(),
    sconto: z.coerce.number().min(1).max(90),
    applica_a: z.enum(['tutti', 'categorie', 'prodotti']).default('tutti'),
    categorie: z.preprocess((v) => v ?? [], z.array(reference('categorie'))),
    prodotti: z.preprocess((v) => v ?? [], z.array(reference('prodotti'))),
    dal: z.coerce.date(),
    al: vuotoComeAssente(z.coerce.date()),
    /** striscia in cima a tutte le pagine del sito */
    banner: z.boolean().default(true),
    /** alla pubblicazione invia un'email agli iscritti agli avvisi */
    avvisa_iscritti: z.boolean().default(false),
    pubblicato: z.boolean().default(true),
  }),
});

export const collections = { categorie, marchi, prodotti, novita, corsi, promozioni };
