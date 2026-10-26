import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { prodottiPubblicati } from '../lib/catalogo';
import { sito } from '../lib/sito';

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
  const voci = await Promise.all(
    prodotti.map(async (p) => {
      const marca = p.data.marca ? await getEntry(p.data.marca) : undefined;
      const categoria = await getEntry(p.data.categoria);
      const prezzoIvato = ((p.data.prezzo ?? 0) * (1 + IVA)).toFixed(2);
      return `    <item>
      <g:id>${xml(p.id)}</g:id>
      <g:title>${xml(p.data.titolo)}</g:title>
      <g:description>${xml(p.data.descrizione_breve)}</g:description>
      <g:link>${new URL(`/prodotti/${p.id}/`, site)}</g:link>
      <g:image_link>${new URL(p.data.immagini[0], site)}</g:image_link>
      <g:availability>${disponibilitaGoogle[p.data.disponibilita]}</g:availability>
      <g:price>${prezzoIvato} EUR</g:price>
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
