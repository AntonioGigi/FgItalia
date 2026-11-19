import type { Config } from '@netlify/functions';

/**
 * Ogni notte ripubblica il sito, così le promozioni iniziano e finiscono da sole
 * nel giorno giusto e i corsi passati scendono tra i "già svolti".
 * Serve la variabile NETLIFY_BUILD_HOOK (Netlify → Build & deploy → Build hooks).
 */
export default async () => {
  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (!hook) {
    console.log('NETLIFY_BUILD_HOOK non impostata: aggiornamento notturno saltato');
    return new Response('non configurato');
  }
  const r = await fetch(hook, { method: 'POST' });
  console.log(`Aggiornamento notturno richiesto: ${r.status}`);
  return new Response('ok');
};

// 23:05 UTC = 00:05 in Italia d'inverno, 01:05 d'estate: sempre appena passata la mezzanotte italiana
export const config: Config = { schedule: '5 23 * * *' };
