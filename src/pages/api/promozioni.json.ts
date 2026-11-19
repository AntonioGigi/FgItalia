import type { APIRoute } from 'astro';
import { promozioniAttive } from '../../lib/promozioni';

/** Promozioni attive: la funzione degli avvisi le legge dopo ogni pubblicazione del sito */
export const GET: APIRoute = async () => {
  const promozioni = (await promozioniAttive()).map((p) => ({
      // la chiave cambia se cambiano sconto o date: una promozione rifatta viene annunciata di nuovo
      id: `${p.id}:${p.data.sconto}:${p.data.dal.toISOString().slice(0, 10)}`,
      titolo: p.data.titolo,
      sconto: p.data.sconto,
      al: p.data.al?.toISOString().slice(0, 10),
      dettagli: p.body?.trim() || undefined,
      avvisaIscritti: p.data.avvisa_iscritti,
  }));
  return new Response(JSON.stringify(promozioni), { headers: { 'Content-Type': 'application/json' } });
};
