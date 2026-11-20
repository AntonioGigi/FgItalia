import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const giorno = (d: Date) => d.toISOString().slice(0, 10);
const giornoDopo = (d: Date) => giorno(new Date(d.getTime() + 86_400_000));

/**
 * Giorni (calendario italiano, AAAA-MM-GG) in cui il sito pubblicato cambia da solo:
 * inizio e fine delle promozioni, corsi che passano tra i "già svolti".
 * La ripubblicazione notturna parte solo in questi giorni, per non pubblicare senza motivo.
 */
export const GET: APIRoute = async () => {
  const giorni = new Set<string>();
  for (const { data } of await getCollection('promozioni', ({ data }) => data.pubblicato)) {
    giorni.add(giorno(data.dal));
    if (data.al) giorni.add(giornoDopo(data.al));
  }
  for (const { data } of await getCollection('corsi', ({ data }) => data.pubblicato)) giorni.add(giornoDopo(data.data));
  return new Response(JSON.stringify([...giorni].sort()), { headers: { 'Content-Type': 'application/json' } });
};
