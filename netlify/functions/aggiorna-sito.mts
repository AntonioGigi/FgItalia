import type { Config } from '@netlify/functions';
import { urlSito } from '../lib/ambiente';

/** Data di oggi in Italia (AAAA-MM-GG) */
export const oggiInItalia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);

/**
 * Ogni notte controlla se oggi una promozione inizia o finisce (o un corso è appena passato)
 * e SOLO in quel caso ripubblica il sito: ogni pubblicazione consuma crediti Netlify.
 * Serve la variabile NETLIFY_BUILD_HOOK (Netlify → Build & deploy → Build hooks).
 */
export default async (adesso = new Date()) => {
  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (!hook) return new Response('NETLIFY_BUILD_HOOK non impostata');

  const r = await fetch(`${urlSito()}/api/cambi-programmati.json`);
  if (!r.ok) return new Response('Date non disponibili', { status: 502 });
  const giorni = (await r.json()) as string[];
  const oggi = oggiInItalia(adesso instanceof Date ? adesso : new Date());
  if (!giorni.includes(oggi)) return new Response(`Nessun cambio previsto per il ${oggi}`);

  const risposta = await fetch(hook, { method: 'POST' });
  console.log(`Ripubblicazione del ${oggi} richiesta: ${risposta.status}`);
  return new Response('ok');
};

// 23:05 UTC = 00:05 in Italia d'inverno, 01:05 d'estate: sempre appena passata la mezzanotte italiana
export const config: Config = { schedule: '5 23 * * *' };
