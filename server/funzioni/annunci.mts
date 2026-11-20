import type { Config } from '../lib/tipi';
import { getStore } from '../lib/archivio';
import { richiestaAlSito } from '../lib/ambiente';
import { emailNuovoCorso, emailPromozione, inviaCampagna } from '../lib/email';

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

interface Promozione {
  id: string;
  titolo: string;
  sconto: number;
  al?: string;
  dettagli?: string;
  avvisaIscritti: boolean;
}

interface Avviso {
  id: string;
  avvisaIscritti: boolean;
  nome: string;
  email: () => { oggetto: string; html: string };
}

async function leggi<T>(percorso: string): Promise<T[]> {
  const risposta = await richiestaAlSito(percorso);
  if (!risposta.ok) {
    console.error(`${percorso} non disponibile (${risposta.status})`);
    return [];
  }
  return (await risposta.json()) as T[];
}

/** Ogni corso o promozione viene annunciato una volta sola */
async function annuncia(archivio: string, avvisi: Avviso[]) {
  const annunciati = getStore({ name: archivio, consistency: 'strong' });
  for (const a of avvisi) {
    if (!a.avvisaIscritti || (await annunciati.get(a.id))) continue;
    // segno subito: meglio un avviso perso che doppio
    await annunciati.set(a.id, new Date().toISOString());
    const { oggetto, html } = a.email();
    try {
      await inviaCampagna(a.nome, oggetto, html);
      console.log(`Avviso inviato: ${a.id}`);
    } catch (e) {
      console.error(`Avviso non inviato: ${a.id}`, e);
      await annunciati.delete(a.id);
    }
  }
}

/**
 * Parte da sola ogni ora (vedi wrangler.jsonc → triggers.crons), quindi poco dopo ogni pubblicazione:
 * se c'è un corso nuovo o una promozione appena iniziata con "Avvisa gli iscritti",
 * invia un'email a tutti gli iscritti agli avvisi.
 */
export default async () => {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_LISTA_ID) return new Response('Avvisi non configurati');

  const corsi = await leggi<Corso>('/api/corsi.json');
  await annuncia(
    'corsi-annunciati',
    corsi.map((c) => ({ id: c.id, avvisaIscritti: c.avvisaIscritti, nome: `Corso: ${c.titolo}`, email: () => emailNuovoCorso(c) })),
  );

  const promozioni = await leggi<Promozione>('/api/promozioni.json');
  await annuncia(
    'promozioni-annunciate',
    promozioni.map((p) => ({ id: p.id, avvisaIscritti: p.avvisaIscritti, nome: `Promozione: ${p.titolo}`, email: () => emailPromozione(p) })),
  );
  return new Response('ok');
};

// ogni ora: annuncia i corsi e le promozioni pubblicati da poco (una sola volta ciascuno)
export const config: Config = { schedule: '17 * * * *' };
