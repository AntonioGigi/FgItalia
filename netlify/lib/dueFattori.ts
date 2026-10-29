import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { variabile } from './ambiente';

/**
 * Verifica in due passaggi con codici a 6 cifre (TOTP, RFC 6238): gli stessi delle app
 * Google Authenticator, Microsoft Authenticator, Authy… Il segreto è salvato cifrato
 * (AES-256-GCM con chiave derivata da SESSION_SECRET); i codici di recupero solo come impronta.
 */
export interface DueFattori {
  /** segreto cifrato */
  segreto: string;
  attivo: boolean;
  /** ultimo intervallo di 30 secondi usato: lo stesso codice non vale due volte */
  ultimoPasso?: number;
  /** impronte sha256 dei codici di recupero non ancora usati */
  recupero: string[];
}

const PASSO_S = 30;
const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(byte: Buffer): string {
  let bit = '';
  for (const b of byte) bit += b.toString(2).padStart(8, '0');
  return (bit.match(/.{1,5}/g) ?? []).map((g) => ALFABETO_BASE32[parseInt(g.padEnd(5, '0'), 2)]).join('');
}

export function daBase32(testo: string): Buffer {
  const bit = testo
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '')
    .split('')
    .map((c) => ALFABETO_BASE32.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  return Buffer.from((bit.match(/.{8}/g) ?? []).map((g) => parseInt(g, 2)));
}

/** Codice di 6 cifre per un intervallo di tempo (HOTP, RFC 4226) */
export function codice(segreto: Buffer, passo: number): string {
  const contatore = Buffer.alloc(8);
  contatore.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', segreto).update(contatore).digest();
  const inizio = hmac[hmac.length - 1] & 0x0f;
  const numero = (hmac.readUInt32BE(inizio) & 0x7fffffff) % 1_000_000;
  return String(numero).padStart(6, '0');
}

export const passoAttuale = (adesso = Date.now()) => Math.floor(adesso / 1000 / PASSO_S);

/** Il passo del codice se è valido (accetta 30 secondi di scarto per l'orologio del telefono), altrimenti null */
export function passoDelCodice(segreto: Buffer, inserito: unknown, adesso = Date.now(), ultimoPasso = -1): number | null {
  const pulito = typeof inserito === 'string' ? inserito.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(pulito)) return null;
  const ora = passoAttuale(adesso);
  for (const passo of [ora - 1, ora, ora + 1]) {
    if (passo <= ultimoPasso) continue;
    if (timingSafeEqual(Buffer.from(codice(segreto, passo)), Buffer.from(pulito))) return passo;
  }
  return null;
}

// ——— segreto cifrato ———

const chiave = () => createHash('sha256').update(`due-fattori:${variabile('SESSION_SECRET')}`).digest();

function cifra(dato: Buffer): string {
  const iv = randomBytes(12);
  const cifrario = createCipheriv('aes-256-gcm', chiave(), iv);
  const testo = Buffer.concat([cifrario.update(dato), cifrario.final()]);
  return [iv, cifrario.getAuthTag(), testo].map((b) => b.toString('base64url')).join('.');
}

function decifra(salvato: string): Buffer {
  const [iv, tag, testo] = salvato.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decifrario = createDecipheriv('aes-256-gcm', chiave(), iv);
  decifrario.setAuthTag(tag);
  return Buffer.concat([decifrario.update(testo), decifrario.final()]);
}

// ——— attivazione ———

export interface Preparazione {
  dati: DueFattori;
  /** da scrivere a mano nell'app se non si può inquadrare il QR */
  chiaveManuale: string;
  link: string;
  qr: string;
}

/** Nuovo segreto (ancora non attivo) con link otpauth:// e codice QR in SVG */
export async function prepara(etichetta: string, emittente = 'FGItalia'): Promise<Preparazione> {
  const segreto = randomBytes(20);
  const chiaveManuale = base32(segreto);
  const link = `otpauth://totp/${encodeURIComponent(`${emittente}:${etichetta}`)}?secret=${chiaveManuale}&issuer=${encodeURIComponent(emittente)}&period=${PASSO_S}&digits=6`;
  const qr = await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { dati: { segreto: cifra(segreto), attivo: false, recupero: [] }, chiaveManuale: chiaveManuale.match(/.{1,4}/g)!.join(' '), link, qr };
}

const improntaRecupero = (c: string) => createHash('sha256').update(c.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

/** 8 codici di recupero da mostrare una sola volta; nell'archivio restano solo le impronte */
export function nuoviCodiciRecupero(): { codici: string[]; impronte: string[] } {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codici = Array.from({ length: 8 }, () => {
    const c = [...randomBytes(10)].map((b) => alfabeto[b % alfabeto.length]).join('');
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
  return { codici, impronte: codici.map(improntaRecupero) };
}

/**
 * Controlla un codice dell'app o un codice di recupero.
 * Se è valido aggiorna `dati` (passo usato o codice di recupero consumato) e restituisce true:
 * chi chiama deve poi salvare `dati`.
 */
export function verifica(dati: DueFattori, inserito: unknown, adesso = Date.now()): boolean {
  const passo = passoDelCodice(decifra(dati.segreto), inserito, adesso, dati.ultimoPasso ?? -1);
  if (passo !== null) {
    dati.ultimoPasso = passo;
    return true;
  }
  if (typeof inserito === 'string' && inserito.replace(/[\s-]/g, '').length === 10) {
    const impronta = improntaRecupero(inserito);
    const indice = dati.recupero.indexOf(impronta);
    if (indice >= 0) {
      dati.recupero.splice(indice, 1);
      return true;
    }
  }
  return false;
}
