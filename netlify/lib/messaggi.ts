import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

/** Messaggi arrivati dai moduli del sito (richiesta preventivo, iscrizione ai corsi) */
export interface Messaggio {
  id: string;
  tipo: 'preventivo' | 'corsi';
  ricevuto: string;
  nome: string;
  email: string;
  telefono?: string;
  /** campi aggiuntivi già etichettati, nell'ordine del modulo */
  dettagli: { etichetta: string; valore: string }[];
  testo?: string;
  letto: boolean;
  archiviato: boolean;
}

export const archivioMessaggi = () => getStore({ name: 'messaggi', consistency: 'strong' });

/** id ordinabile per data: i più recenti in cima leggendo le chiavi al contrario */
export const nuovoIdMessaggio = (adesso = new Date()) => `${adesso.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`;
export const idMessaggioValido = (id: unknown): id is string => typeof id === 'string' && /^\d{14}-[0-9a-f]{8}$/.test(id);

export async function elencoMessaggi(): Promise<Messaggio[]> {
  const archivio = archivioMessaggi();
  const { blobs } = await archivio.list();
  const chiavi = blobs.map((b) => b.key).filter(idMessaggioValido).sort().reverse().slice(0, 300);
  const messaggi = await Promise.all(chiavi.map((k) => archivio.get(k, { type: 'json' }) as Promise<Messaggio | null>));
  return messaggi.filter((m): m is Messaggio => !!m);
}
