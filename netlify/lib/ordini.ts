import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

export const STATI = {
  in_attesa_pagamento: 'In attesa di pagamento',
  ricevuto: 'Ricevuto',
  in_lavorazione: 'In lavorazione',
  spedito: 'Spedito',
  consegnato: 'Consegnato',
  annullato: 'Annullato',
} as const;

export type StatoOrdine = keyof typeof STATI;

export interface Indirizzo {
  nome?: string;
  via?: string;
  via2?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  paese?: string;
}

export interface Ordine {
  numero: string;
  /** codice segreto nel link inviato al cliente per vedere lo stato dell'ordine */
  token: string;
  creato: string;
  stato: StatoOrdine;
  pagato: boolean;
  cliente: { nome: string; email: string; telefono?: string };
  spedizione: Indirizzo;
  fatturazione: Indirizzo & { partitaIva?: string; codiceSdiPec?: string; codiceFiscale?: string };
  righe: { id?: string; titolo: string; quantita: number; unitarioCent: number; totaleCent: number }[];
  totali: { prodottiCent: number; spedizioneCent: number; totaleCent: number };
  consegna?: { corriere?: string; tracking?: string; link?: string };
  storico: { stato: StatoOrdine; data: string; nota?: string }[];
  stripe: { sessione: string; pagamento?: string };
  /** id dell'account del cliente, se era collegato al momento dell'acquisto */
  account?: string;
  /** fattura in PDF caricata dal pannello ordini (il file è nell'archivio "fatture") */
  fattura?: { nome: string; caricata: string };
}

export const archivioOrdini = () => getStore({ name: 'ordini', consistency: 'strong' });
export const archivioFatture = () => getStore({ name: 'fatture', consistency: 'strong' });

/** Es. FG-261026-7KQ3: data + 4 caratteri casuali (senza lettere ambigue) */
export function nuovoNumeroOrdine(data = new Date()): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const casuale = [...randomBytes(4)].map((b) => alfabeto[b % alfabeto.length]).join('');
  const aammgg = data.toISOString().slice(2, 10).replace(/-/g, '');
  return `FG-${aammgg}-${casuale}`;
}

export const nuovoToken = () => randomBytes(18).toString('base64url');

export const numeroValido = (n: unknown): n is string => typeof n === 'string' && /^FG-\d{6}-[A-Z0-9]{4}$/.test(n);

export async function leggiOrdine(numero: string): Promise<Ordine | null> {
  if (!numeroValido(numero)) return null;
  return (await archivioOrdini().get(numero, { type: 'json' })) as Ordine | null;
}

export const salvaOrdine = (ordine: Ordine) => archivioOrdini().setJSON(ordine.numero, ordine);

export async function elencoOrdini(): Promise<Ordine[]> {
  const archivio = archivioOrdini();
  const { blobs } = await archivio.list();
  const ordini = await Promise.all(blobs.map((b) => archivio.get(b.key, { type: 'json' }) as Promise<Ordine | null>));
  return ordini.filter((o): o is Ordine => !!o).sort((a, b) => b.creato.localeCompare(a.creato));
}

/** Quello che il cliente può vedere del proprio ordine */
export function vistaCliente(o: Ordine) {
  return {
    numero: o.numero,
    creato: o.creato,
    stato: o.stato,
    statoTesto: STATI[o.stato],
    pagato: o.pagato,
    righe: o.righe,
    totali: o.totali,
    consegna: o.consegna,
    storico: o.storico,
    spedizione: { citta: o.spedizione.citta, provincia: o.spedizione.provincia },
    fattura: !!o.fattura,
  };
}
