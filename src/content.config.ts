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
    pubblicato: z.boolean().default(true),
  }),
});

export const collections = { categorie, marchi, prodotti, novita, corsi };
