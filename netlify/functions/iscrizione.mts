import type { Config } from '@netlify/functions';
import { errore, json } from '../lib/ambiente';
import { aggiungiIscritto } from '../lib/email';

/** Iscrizione agli avvisi su corsi e offerte (lista su Brevo) */
export default async (req: Request) => {
  if (req.method !== 'POST') return errore('Metodo non consentito', 405);
  const dati = await req.formData().catch(() => null);
  if (!dati) return errore('Richiesta non valida');

  // campo nascosto anti-spam: le persone non lo vedono e non lo compilano
  if (dati.get('sito-web')) return json({ ok: true });

  const email = String(dati.get('email') ?? '').trim().toLowerCase();
  const nome = String(dati.get('nome') ?? '').trim().slice(0, 80) || undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return errore('Indirizzo email non valido');
  if (dati.get('privacy') !== 'on') return errore('Serve il consenso per ricevere gli avvisi');

  try {
    await aggiungiIscritto(email, nome);
  } catch (e) {
    console.error('Iscrizione non riuscita', e);
    return errore('Iscrizione non riuscita, riprova più tardi', 502);
  }
  return json({ ok: true });
};

export const config: Config = { path: '/api/iscrizione' };
