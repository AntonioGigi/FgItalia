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
    icona: z.enum(['monitor', 'diagnostica', 'fisioterapia', 'riabilitazione', 'medicale', 'consumabili']),
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
    marca: vuotoComeAssente(reference('marchi')),
    codice: vuotoComeAssente(z.string()),
    descrizione_breve: z.string(),
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

export const collections = { categorie, marchi, prodotti, novita };
