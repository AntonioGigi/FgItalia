import type { APIRoute } from 'astro';
import { corsiPubblicati } from '../../lib/catalogo';
import { sito, formatoData } from '../../lib/sito';

const xml = (testo: string) => testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Feed RSS dei prossimi corsi: i servizi di newsletter (es. Brevo, Mailchimp, MailerLite)
 * possono leggerlo e inviare in automatico un'email agli iscritti quando esce un nuovo corso.
 */
export const GET: APIRoute = async ({ site }) => {
  const { prossimi } = await corsiPubblicati();
  const voci = prossimi.map(
    (c) => `    <item>
      <title>${xml(`${c.data.titolo} – ${formatoData.format(c.data.data)}`)}</title>
      <link>${new URL('/corsi/#iscrizione', site)}</link>
      <guid isPermaLink="false">corso-${xml(c.id)}</guid>
      <description>${xml(c.data.riassunto)}</description>
      <pubDate>${c.data.data.toUTCString()}</pubDate>
    </item>`,
  );
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(`Corsi ${sito.nome_breve}`)}</title>
    <link>${new URL('/corsi/', site)}</link>
    <description>Corsi di formazione per fisioterapisti</description>
${voci.join('\n')}
  </channel>
</rss>
`,
    { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } },
  );
};
