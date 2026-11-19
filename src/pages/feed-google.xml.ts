import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { prodottiPubblicati } from '../lib/catalogo';
import { sito } from '../lib/sito';
import { promozioniAttive, scontoDa } from '../lib/promozioni';

/** Aliquota IVA: Google Merchant Center vuole i prezzi IVA inclusa */
const IVA = 0.22;

const disponibilitaGoogle = {
  disponibile: 'in_stock',
  su_ordinazione: 'preorder',
  esaurito: 'out_of_stock',
} as const;

const xml = (testo: string) =>
  testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Feed prodotti per Google Merchant Center: i prodotti con prezzo compaiono gratis
 * nella scheda "Shopping" di Google. Da registrare in Merchant Center con l'indirizzo
 * https://www.fgitalia.it/feed-google.xml
 */
export const GET: APIRoute = async ({ site }) => {
  const prodotti = (await prodottiPubblicati()).filter((p) => p.data.prezzo && p.data.immagini.length);
  const promozioni = await promozioniAttive();
  const voci = await Promise.all(
    prodotti.map(async (p) => {
      const marca = p.data.marca ? await getEntry(p.data.marca) : undefined;
      const categoria = await getEntry(p.data.categoria);
      const prezzoIvato = ((p.data.prezzo ?? 0) * (1 + IVA)).toFixed(2);
      const sconto = scontoDa(promozioni, p);
      // Google vuole il prezzo pieno in g:price e quello scontato in g:sale_price
      const offerta = sconto
        ? `\n      <g:sale_price>${(sconto.prezzo * (1 + IVA)).toFixed(2)} EUR</g:sale_price>${
            sconto.promozione.data.al
              ? `\n      <g:sale_price_effective_date>${sconto.promozione.data.dal.toISOString().slice(0, 10)}T00:00+01:00/${sconto.promozione.data.al.toISOString().slice(0, 10)}T23:59+01:00</g:sale_price_effective_date>`
              : ''
          }`
        : '';
      return `    <item>
      <g:id>${xml(p.id)}</g:id>
      <g:title>${xml(p.data.titolo)}</g:title>
      <g:description>${xml(p.data.descrizione_breve)}</g:description>
      <g:link>${new URL(`/prodotti/${p.id}/`, site)}</g:link>
      <g:image_link>${new URL(p.data.immagini[0], site)}</g:image_link>
      <g:availability>${disponibilitaGoogle[p.data.disponibilita]}</g:availability>
      <g:price>${prezzoIvato} EUR</g:price>${offerta}
      <g:condition>new</g:condition>
      ${marca ? `<g:brand>${xml(marca.data.nome)}</g:brand>` : '<g:identifier_exists>no</g:identifier_exists>'}
      <g:product_type>${xml([categoria?.data.titolo, p.data.sottocategoria].filter(Boolean).join(' > '))}</g:product_type>
    </item>`;
    }),
  );

  const corpo = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(sito.ragione_sociale)}</title>
    <link>${site}</link>
    <description>${xml(sito.slogan)}</description>
${voci.join('\n')}
  </channel>
</rss>
`;
  return new Response(corpo, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
