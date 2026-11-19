import { getStore } from '@netlify/blobs';
import { ALIQUOTA_IVA, calcolaTotali, centesimi, type Catalogo, type RigaCarrello } from '../../src/lib/negozio';
import type { Cliente, DatiFatturazione } from './clienti';

/** Preventivi scaricati dai clienti e richieste di assistenza tecnica */

export const VALIDITA_PREVENTIVO_GIORNI = 30;

export interface RigaPreventivo {
  /** prodotto del catalogo; vuoto per le voci libere scritte a mano nel pannello */
  id: string;
  titolo: string;
  codice?: string;
  quantita: number;
  /** prezzo unitario di listino prima dello sconto (solo se c'è uno sconto) */
  listinoCent?: number;
  /** sconto in percentuale, da 0 a 100 */
  sconto?: number;
  /** prezzo unitario netto, già scontato */
  nettoCent: number;
  totaleNettoCent: number;
}

export interface Preventivo {
  numero: string;
  creato: string;
  validoFino: string;
  /** id vuoto se il destinatario non ha un account sul sito */
  cliente: { id: string; nome: string; email: string; telefono?: string; fatturazione: DatiFatturazione };
  righe: RigaPreventivo[];
  spedizioneNettoCent: number;
  imponibileCent: number;
  ivaCent: number;
  totaleCent: number;
  note?: string;
  /** "fgitalia" per i preventivi fatti a mano dal pannello, assente per quelli scaricati dal carrello */
  autore?: 'fgitalia';
  modificato?: string;
}

export const archivioPreventivi = () => getStore({ name: 'preventivi', consistency: 'strong' });

/**
 * Prezzi IVA esclusa, come si usa fra professionisti. Il totale è lo stesso che il cliente
 * pagherebbe con il carrello; l'IVA è la differenza, così i conti tornano al centesimo.
 */
export function creaPreventivo(
  numero: string,
  carrello: RigaCarrello[],
  catalogo: Catalogo,
  cliente: Cliente,
  codici: Record<string, string | undefined>,
  note?: string,
  adesso = new Date(),
): Preventivo | null {
  const totali = calcolaTotali(carrello, catalogo);
  if (!totali.righe.length) return null;
  const righe = totali.righe.map((r) => {
    const nettoCent = centesimi(catalogo.prodotti[r.id].prezzo!);
    return { id: r.id, titolo: r.titolo, codice: codici[r.id], quantita: r.quantita, nettoCent, totaleNettoCent: nettoCent * r.quantita };
  });
  const spedizioneNettoCent = Math.round(totali.spedizioneCent / (1 + ALIQUOTA_IVA));
  const imponibileCent = righe.reduce((s, r) => s + r.totaleNettoCent, 0) + spedizioneNettoCent;
  const validoFino = new Date(adesso.getTime() + VALIDITA_PREVENTIVO_GIORNI * 86_400_000);
  return {
    numero,
    creato: adesso.toISOString(),
    validoFino: validoFino.toISOString().slice(0, 10),
    cliente: { id: cliente.id, nome: cliente.nome, email: cliente.email, telefono: cliente.telefono, fatturazione: cliente.fatturazione },
    righe,
    spedizioneNettoCent,
    imponibileCent,
    ivaCent: totali.totaleCent - imponibileCent,
    totaleCent: totali.totaleCent,
    ...(note && { note }),
  };
}

export interface VocePreventivoManuale {
  id?: string;
  titolo: string;
  codice?: string;
  quantita: number;
  /** euro, IVA esclusa, prima dello sconto */
  prezzo: number;
  sconto?: number;
}

export interface DatiPreventivoManuale {
  cliente: Preventivo['cliente'];
  righe: VocePreventivoManuale[];
  /** euro, IVA esclusa */
  spedizione?: number;
  validitaGiorni?: number;
  note?: string;
}

/**
 * Preventivo fatto da FGItalia nel pannello: prezzi e sconti liberi, anche per prodotti
 * che non sono sul sito. Prezzi IVA esclusa, IVA al 22% calcolata sul totale imponibile.
 */
export function creaPreventivoManuale(numero: string, d: DatiPreventivoManuale, adesso = new Date(), creato?: string): Preventivo | null {
  const righe: RigaPreventivo[] = d.righe
    .filter((r) => r.titolo.trim() && r.quantita > 0 && Number.isFinite(r.prezzo) && r.prezzo >= 0)
    .map((r) => {
      const listinoCent = centesimi(r.prezzo);
      const sconto = Math.min(100, Math.max(0, Math.round((r.sconto ?? 0) * 100) / 100));
      const nettoCent = Math.round(listinoCent * (1 - sconto / 100));
      const quantita = Math.min(9999, Math.round(r.quantita));
      return {
        id: r.id ?? '',
        titolo: r.titolo.trim(),
        ...(r.codice?.trim() && { codice: r.codice.trim() }),
        quantita,
        ...(sconto > 0 && { listinoCent, sconto }),
        nettoCent,
        totaleNettoCent: nettoCent * quantita,
      };
    });
  if (!righe.length) return null;
  const spedizioneNettoCent = d.spedizione && d.spedizione > 0 ? centesimi(d.spedizione) : 0;
  const imponibileCent = righe.reduce((s, r) => s + r.totaleNettoCent, 0) + spedizioneNettoCent;
  const ivaCent = Math.round(imponibileCent * ALIQUOTA_IVA);
  const inizio = creato ? new Date(creato) : adesso;
  const giorni = Math.min(365, Math.max(1, Math.round(d.validitaGiorni ?? VALIDITA_PREVENTIVO_GIORNI)));
  return {
    numero,
    creato: inizio.toISOString(),
    validoFino: new Date(inizio.getTime() + giorni * 86_400_000).toISOString().slice(0, 10),
    cliente: d.cliente,
    righe,
    spedizioneNettoCent,
    imponibileCent,
    ivaCent,
    totaleCent: imponibileCent + ivaCent,
    ...(d.note?.trim() && { note: d.note.trim() }),
    autore: 'fgitalia',
    ...(creato && { modificato: adesso.toISOString() }),
  };
}

export async function elencoPreventivi(): Promise<Preventivo[]> {
  const archivio = archivioPreventivi();
  const { blobs } = await archivio.list();
  const tutti = await Promise.all(blobs.map((b) => archivio.get(b.key, { type: 'json' }) as Promise<Preventivo | null>));
  return tutti.filter((p): p is Preventivo => !!p).sort((a, b) => b.creato.localeCompare(a.creato));
}

export const TIPI_ASSISTENZA = {
  guasto: 'Guasto o malfunzionamento',
  manutenzione: 'Manutenzione o verifica di sicurezza',
  calibrazione: 'Calibrazione',
  ricambi: 'Ricambi e accessori',
  uso: 'Domanda sull’uso',
  altro: 'Altro',
} as const;

export const STATI_ASSISTENZA = {
  aperta: 'Ricevuta',
  in_lavorazione: 'In lavorazione',
  in_attesa_cliente: 'In attesa di una tua risposta',
  chiusa: 'Risolta',
} as const;

export type TipoAssistenza = keyof typeof TIPI_ASSISTENZA;
export type StatoAssistenza = keyof typeof STATI_ASSISTENZA;

export interface RichiestaAssistenza {
  numero: string;
  creato: string;
  aggiornato: string;
  cliente: { id: string; nome: string; email: string; telefono?: string; professione: string };
  dispositivo?: { titolo: string; matricola?: string; ordine?: string; acquistato?: string };
  tipo: TipoAssistenza;
  /** studio fermo: la richiesta ha la precedenza */
  fermo: boolean;
  descrizione: string;
  stato: StatoAssistenza;
  storico: { stato: StatoAssistenza; data: string; nota?: string; autore: 'cliente' | 'fgitalia' }[];
}

export const archivioAssistenza = () => getStore({ name: 'assistenza', consistency: 'strong' });

export async function leggiRichiesta(numero: string): Promise<RichiestaAssistenza | null> {
  return (await archivioAssistenza().get(numero, { type: 'json' })) as RichiestaAssistenza | null;
}

export const salvaRichiesta = (r: RichiestaAssistenza) => archivioAssistenza().setJSON(r.numero, r);

export async function elencoRichieste(): Promise<RichiestaAssistenza[]> {
  const archivio = archivioAssistenza();
  const { blobs } = await archivio.list();
  const tutte = await Promise.all(blobs.map((b) => archivio.get(b.key, { type: 'json' }) as Promise<RichiestaAssistenza | null>));
  // prima le aperte con lo studio fermo, poi le altre aperte, poi le chiuse; dentro ogni gruppo le più recenti
  const peso = (r: RichiestaAssistenza) => (r.stato === 'chiusa' ? 2 : r.fermo ? 0 : 1);
  return tutte
    .filter((r): r is RichiestaAssistenza => !!r)
    .sort((a, b) => peso(a) - peso(b) || b.aggiornato.localeCompare(a.aggiornato));
}
