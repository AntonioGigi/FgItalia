import type { Config, Context } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { errore, json } from '../lib/ambiente';
import { bloccato, conta, ipRichiesta, MINUTI } from '../lib/limiti';
import { leggiOrdine, vistaCliente } from '../lib/ordini';

const uguali = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Stato dell'ordine per il cliente: si accede con numero + codice del link nell'email,
 * oppure con numero + email usata per l'acquisto.
 */
export default async (req: Request, context?: Context) => {
  // contro chi prova numeri d'ordine a caso: al massimo 20 ricerche fallite ogni 15 minuti per connessione
  const chiave = `ordine-ip:${ipRichiesta(req, context)}`;
  if (await bloccato(chiave, 20)) return errore('Troppe ricerche ravvicinate: riprova tra qualche minuto.', 429);
  const parametri = new URL(req.url).searchParams;
  const numero = (parametri.get('n') ?? '').trim().toUpperCase();
  const token = parametri.get('t') ?? '';
  const email = (parametri.get('e') ?? '').trim().toLowerCase();

  const ordine = await leggiOrdine(numero);
  const autorizzato =
    ordine && ((token && ordine.token && uguali(token, ordine.token)) || (email && uguali(email, ordine.cliente.email.toLowerCase())));
  if (!ordine || !autorizzato) {
    await conta(chiave, 15 * MINUTI);
    return errore('Ordine non trovato: controlla il numero e l’email.', 404);
  }
  return json(vistaCliente(ordine));
};

export const config: Config = { path: '/api/ordine' };
