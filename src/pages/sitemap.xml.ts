import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { prodottiPubblicati, novitaPubblicate } from '../lib/catalogo';

export const GET: APIRoute = async ({ site }) => {
  const percorsi = [
    '/',
    '/prodotti/',
    '/chi-siamo/',
    '/novita/',
    '/corsi/',
    '/contatti/',
    '/privacy/',
    ...(await getCollection('categorie')).map((c) => `/categorie/${c.id}/`),
    ...(await prodottiPubblicati()).map((p) => `/prodotti/${p.id}/`),
    ...(await novitaPubblicate()).map((n) => `/novita/${n.id}/`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${percorsi.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
