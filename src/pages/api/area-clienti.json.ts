import type { APIRoute } from 'astro';
import { prodottiPubblicati } from '../../lib/catalogo';

const TITOLI_DOCUMENTI = { scheda: 'Scheda tecnica' };

/**
 * Per l'area clienti: documenti di ogni prodotto, quali sono materiali di consumo da
 * riordinare e ogni quanti mesi va fatta la manutenzione delle apparecchiature.
 */
export const GET: APIRoute = async () => {
  const schede = Object.fromEntries(
    (await prodottiPubblicati()).map((p) => {
      const d = p.data;
      const apparecchiatura = d.categoria.id === 'apparecchiature';
      const mesi = d.manutenzione_mesi ?? (apparecchiatura ? 12 : 0);
      return [
        p.id,
        {
          titolo: d.titolo,
          codice: d.codice,
          immagine: d.immagini[0],
          consumabile: d.consumabile ?? d.categoria.id === 'materiali-di-consumo',
          ...(mesi > 0 && { manutenzioneMesi: mesi }),
          documenti: [
            ...(d.scheda_pdf ? [{ titolo: TITOLI_DOCUMENTI.scheda, file: d.scheda_pdf, tipo: 'scheda' }] : []),
            ...d.documenti,
          ],
        },
      ];
    }),
  );
  return new Response(JSON.stringify(schede), { headers: { 'Content-Type': 'application/json' } });
};
