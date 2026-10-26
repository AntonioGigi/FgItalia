import { getStore } from '@netlify/blobs';
import { urlSito } from '../lib/ambiente';
import { emailNuovoCorso, inviaCampagna } from '../lib/email';

interface Corso {
  id: string;
  titolo: string;
  data: string;
  orario?: string;
  luogo?: string;
  docente?: string;
  prezzo?: number;
  riassunto: string;
  immagine?: string;
  avvisaIscritti: boolean;
}

/**
 * Parte da sola dopo ogni pubblicazione del sito (il nome del file è l'evento Netlify):
 * se tra i prossimi corsi ce n'è uno nuovo, invia un'email a tutti gli iscritti agli avvisi.
 * Ogni corso viene annunciato una volta sola.
 */
export default async () => {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_LISTA_ID) return new Response('Avvisi non configurati');

  const risposta = await fetch(`${urlSito()}/api/corsi.json`);
  if (!risposta.ok) return new Response('Corsi non disponibili', { status: 502 });
  const corsi = (await risposta.json()) as Corso[];

  const annunciati = getStore({ name: 'corsi-annunciati', consistency: 'strong' });
  for (const corso of corsi) {
    if (!corso.avvisaIscritti || (await annunciati.get(corso.id))) continue;
    // segno subito il corso: meglio un avviso perso che doppio
    await annunciati.set(corso.id, new Date().toISOString());
    const { oggetto, html } = emailNuovoCorso(corso);
    try {
      await inviaCampagna(`Corso: ${corso.titolo}`, oggetto, html);
      console.log(`Avviso inviato per il corso ${corso.id}`);
    } catch (e) {
      console.error(`Avviso non inviato per il corso ${corso.id}`, e);
      await annunciati.delete(corso.id);
    }
  }
  return new Response('ok');
};
