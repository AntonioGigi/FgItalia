import type { APIRoute } from 'astro';
import { corsiPubblicati } from '../../lib/catalogo';

/** Prossimi corsi: la funzione degli avvisi lo legge dopo ogni pubblicazione del sito */
export const GET: APIRoute = async () => {
  const { prossimi } = await corsiPubblicati();
  const corsi = prossimi.map((c) => ({
    id: c.id,
    titolo: c.data.titolo,
    data: c.data.data.toISOString().slice(0, 10),
    orario: c.data.orario,
    luogo: c.data.luogo,
    docente: c.data.docente,
    prezzo: c.data.prezzo,
    riassunto: c.data.riassunto,
    immagine: c.data.immagine,
    avvisaIscritti: c.data.avvisa_iscritti,
  }));
  return new Response(JSON.stringify(corsi), { headers: { 'Content-Type': 'application/json' } });
};
