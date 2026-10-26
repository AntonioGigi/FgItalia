import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Accesso al pannello ordini: la password è nella variabile ADMIN_PASSWORD.
 * Dopo l'accesso il browser riceve un gettone firmato valido 30 giorni;
 * cambiando la password tutti i gettoni smettono di funzionare.
 */
const DURATA_MS = 30 * 24 * 60 * 60 * 1000;

const firma = (dati: string, chiave: string) => createHmac('sha256', chiave).update(dati).digest('base64url');

function uguali(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordCorretta(tentativo: unknown, password: string): boolean {
  return typeof tentativo === 'string' && uguali(firma(tentativo, 'confronto'), firma(password, 'confronto'));
}

export function creaGettone(password: string, adesso = Date.now()): string {
  const scadenza = String(adesso + DURATA_MS);
  return `${scadenza}.${firma(scadenza, password)}`;
}

export function gettoneValido(gettone: unknown, password: string, adesso = Date.now()): boolean {
  if (typeof gettone !== 'string') return false;
  const [scadenza, valore] = gettone.split('.');
  if (!scadenza || !valore || Number(scadenza) < adesso) return false;
  return uguali(valore, firma(scadenza, password));
}

export function gettoneDaRichiesta(req: Request): string | undefined {
  const intestazione = req.headers.get('authorization') ?? '';
  return intestazione.startsWith('Bearer ') ? intestazione.slice(7) : undefined;
}
