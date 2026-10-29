import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

/**
 * Limiti di frequenza contro i tentativi a raffica (password indovinate, spam di
 * registrazioni, ricerche di ordini altrui). I contatori stanno su Netlify Blobs con
 * chiavi "impronta" (sha256): nell'archivio non finiscono indirizzi IP né email in chiaro.
 */
interface Contatore {
  tentativi: number;
  /** fine della finestra di conteggio, in millisecondi */
  scade: number;
}

const archivioLimiti = () => getStore({ name: 'limiti', consistency: 'strong' });
const impronta = (chiave: string) => createHash('sha256').update(chiave).digest('hex').slice(0, 40);

export const MINUTI = 60 * 1000;
export const ORE = 60 * MINUTI;

/** Indirizzo del visitatore (Netlify lo passa nel context o nell'intestazione x-nf-client-connection-ip) */
export function ipRichiesta(req: Request, context?: { ip?: string }): string {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'sconosciuto';
}

async function leggi(chiave: string, adesso: number): Promise<Contatore> {
  const c = (await archivioLimiti().get(impronta(chiave), { type: 'json' })) as Contatore | null;
  return c && c.scade > adesso ? c : { tentativi: 0, scade: 0 };
}

/** true se la chiave ha già raggiunto il massimo nella finestra in corso (non conta questo tentativo) */
export async function bloccato(chiave: string, massimo: number, adesso = Date.now()): Promise<boolean> {
  return (await leggi(chiave, adesso)).tentativi >= massimo;
}

/** Conta un tentativo; la finestra parte dal primo tentativo */
export async function conta(chiave: string, finestraMs: number, adesso = Date.now()): Promise<number> {
  const c = await leggi(chiave, adesso);
  const nuovo = { tentativi: c.tentativi + 1, scade: c.scade || adesso + finestraMs };
  await archivioLimiti().setJSON(impronta(chiave), nuovo);
  return nuovo.tentativi;
}

/** Conta il tentativo e dice se ha superato il massimo: per le azioni da limitare sempre (registrazioni, ricerche…) */
export async function superaLimite(chiave: string, massimo: number, finestraMs: number, adesso = Date.now()): Promise<boolean> {
  return (await conta(chiave, finestraMs, adesso)) > massimo;
}

export const azzera = (chiave: string) => archivioLimiti().delete(impronta(chiave));
