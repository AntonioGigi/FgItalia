import type { Config } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { errore, json } from '../lib/ambiente';
import { leggiOrdine, vistaCliente } from '../lib/ordini';

const uguali = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Stato dell'ordine per il cliente: si accede con numero + codice del link nell'email,
 * oppure con numero + email usata per l'acquisto.
 */
export default async (req: Request) => {
  const parametri = new URL(req.url).searchParams;
  const numero = (parametri.get('n') ?? '').trim().toUpperCase();
  const token = parametri.get('t') ?? '';
  const email = (parametri.get('e') ?? '').trim().toLowerCase();

  const ordine = await leggiOrdine(numero);
  const autorizzato =
    ordine && ((token && ordine.token && uguali(token, ordine.token)) || (email && uguali(email, ordine.cliente.email.toLowerCase())));
  if (!ordine || !autorizzato) return errore('Ordine non trovato: controlla il numero e l’email.', 404);
  return json(vistaCliente(ordine));
};

export const config: Config = { path: '/api/ordine' };
