import { getStore } from '@netlify/blobs';
import { ALIQUOTA_IVA, calcolaTotali, centesimi, type Catalogo, type RigaCarrello } from '../../src/lib/negozio';
import type { Cliente, DatiFatturazione } from './clienti';

/** Preventivi scaricati dai clienti e richieste di assistenza tecnica */

export const VALIDITA_PREVENTIVO_GIORNI = 30;

export interface Preventivo {
  numero: string;
  creato: string;
  validoFino: string;
  cliente: { id: string; nome: string; email: string; telefono?: string; fatturazione: DatiFatturazione };
  righe: { id: string; titolo: string; codice?: string; quantita: number; nettoCent: number; totaleNettoCent: number }[];
  spedizioneNettoCent: number;
  imponibileCent: number;
  ivaCent: number;
  totaleCent: number;
  note?: string;
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
