import type { APIRoute } from 'astro';
import { prodottiPubblicati } from '../../lib/catalogo';
import { promozioniAttive, scontoDa } from '../../lib/promozioni';
import { sito } from '../../lib/sito';
import type { Catalogo } from '../../lib/negozio';

/**
 * Prezzi e disponibilità attuali, letti dal carrello e dalla funzione di pagamento:
 * il prezzo pagato è sempre quello pubblicato sul sito, mai quello inviato dal browser.
 */
export const GET: APIRoute = async () => {
  const promozioni = await promozioniAttive();
  const catalogo: Catalogo = {
    negozioAttivo: sito.negozio_attivo,
    spedizione: { costo: sito.spedizione_costo, gratisDa: sito.spedizione_gratis_da },
    prodotti: Object.fromEntries(
      (await prodottiPubblicati()).map((p) => {
        const sconto = scontoDa(promozioni, p);
        return [
          p.id,
          {
            titolo: p.data.titolo,
            prezzo: sconto?.prezzo ?? p.data.prezzo,
            ...(sconto && { prezzoListino: sconto.listino, sconto: sconto.percentuale }),
            disponibilita: p.data.disponibilita,
            immagine: p.data.immagini[0],
          },
        ];
      }),
    ),
  };
  return new Response(JSON.stringify(catalogo), { headers: { 'Content-Type': 'application/json' } });
};
