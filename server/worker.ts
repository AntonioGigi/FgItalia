/**
 * Worker Cloudflare di FGItalia: serve il sito (cartella dist/, generata da Astro) e
 * risponde agli indirizzi /api/… con le funzioni in server/funzioni.
 * Le funzioni programmate partono dagli orari in wrangler.jsonc → triggers.crons.
 */
import { impostaArchivio, type BucketR2 } from './lib/archivio';
import { impostaLettoreSito, impostaOrigine } from './lib/ambiente';
import type { Config, Context } from './lib/tipi';

import * as accountDocumento from './funzioni/account-documento.mts';
import * as accountGoogle from './funzioni/account-google.mts';
import * as account from './funzioni/account.mts';
import * as annunci from './funzioni/annunci.mts';
import * as checkout from './funzioni/checkout.mts';
import * as cmsToken from './funzioni/cms-token.mts';
import * as gestioneOrdini from './funzioni/gestione-ordini.mts';
import * as iscrizione from './funzioni/iscrizione.mts';
import * as messaggio from './funzioni/messaggio.mts';
import * as ordine from './funzioni/ordine.mts';
import * as promemoriaManutenzione from './funzioni/promemoria-manutenzione.mts';
import * as stripeWebhook from './funzioni/stripe-webhook.mts';

interface Funzione {
  default: (req: Request, context?: Context) => Response | Promise<Response>;
  config: Config;
}

const funzioni: Funzione[] = [
  accountDocumento,
  accountGoogle,
  account,
  annunci,
  checkout,
  cmsToken,
  gestioneOrdini,
  iscrizione,
  messaggio,
  ordine,
  promemoriaManutenzione,
  stripeWebhook,
] as Funzione[];

/** percorso → funzione, es. "/api/checkout" */
export const rotte = new Map<string, Funzione['default']>();
/** orario cron → funzioni da eseguire */
export const programmate = new Map<string, Funzione['default'][]>();
for (const f of funzioni) {
  for (const percorso of [f.config.path ?? []].flat()) rotte.set(percorso, f.default);
  if (f.config.schedule) programmate.set(f.config.schedule, [...(programmate.get(f.config.schedule) ?? []), f.default]);
}

interface Ambiente {
  ASSETS: { fetch(richiesta: Request): Promise<Response> };
  DATI: BucketR2;
  [variabile: string]: unknown;
}

function prepara(env: Ambiente) {
  // variabili e segreti del pannello Cloudflare → process.env, come le leggono le funzioni
  for (const [nome, valore] of Object.entries(env)) if (typeof valore === 'string') process.env[nome] = valore;
  impostaArchivio(env.DATI);
  impostaLettoreSito((r) => env.ASSETS.fetch(r));
}

export default {
  async fetch(richiesta: Request, env: Ambiente): Promise<Response> {
    prepara(env);
    const url = new URL(richiesta.url);
    impostaOrigine(url.origin);
    const funzione = rotte.get(url.pathname.replace(/\/$/, '') || '/');
    // tutto il resto (pagine, immagini, /api/*.json generati da Astro) sono file del sito
    if (!funzione) return env.ASSETS.fetch(richiesta);
    try {
      return await funzione(richiesta, { ip: richiesta.headers.get('cf-connecting-ip') ?? undefined });
    } catch (e) {
      console.error(`Errore in ${url.pathname}`, e);
      return new Response(JSON.stringify({ errore: 'Errore del server, riprova tra poco' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  },

  async scheduled(evento: { cron: string }, env: Ambiente, ctx: { waitUntil(p: Promise<unknown>): void }) {
    prepara(env);
    for (const f of programmate.get(evento.cron) ?? []) {
      ctx.waitUntil(
        Promise.resolve(f(new Request('https://cron.local/'))).catch((e) => console.error(`Errore nella funzione programmata (${evento.cron})`, e)),
      );
    }
  },
};
