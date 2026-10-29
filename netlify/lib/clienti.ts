import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { variabile } from './ambiente';
import type { DueFattori } from './dueFattori';
import { archivioOrdini, type Indirizzo, type Ordine } from './ordini';

/**
 * Area clienti: account con email e password, salvati su Netlify Blobs.
 * Le password non vengono mai salvate in chiaro (scrypt con sale casuale).
 * La sessione è un cookie firmato con SESSION_SECRET, valido 30 giorni.
 */
const scrypt = promisify(scryptCallback) as (password: string, sale: Buffer, lunghezza: number) => Promise<Buffer>;

export const DURATA_SESSIONE_MS = 30 * 24 * 60 * 60 * 1000;
export const DURATA_REIMPOSTA_MS = 60 * 60 * 1000;
export const COOKIE = 'fg_account';
export const PASSWORD_MINIMA = 8;

export { PROFESSIONI } from '../../src/lib/account';

export interface DatiFatturazione {
  ragioneSociale?: string;
  partitaIva?: string;
  codiceFiscale?: string;
  codiceSdi?: string;
  pec?: string;
  via?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
}

export interface Dispositivo {
  /** "FG-261026-ABCD/genesy-600" per quelli acquistati sul sito, "manuale-…" per quelli aggiunti dal cliente */
  id: string;
  prodottoId?: string;
  titolo: string;
  ordine?: string;
  /** date nel formato AAAA-MM-GG */
  acquistato: string;
  matricola?: string;
  ultimaManutenzione?: string;
  intervalloMesi: number;
  /** scadenza per cui è già partito il promemoria, per non mandarlo due volte */
  avvisato?: string;
}

export interface Cliente {
  id: string;
  email: string;
  nome: string;
  telefono?: string;
  professione: string;
  /** data in cui ha dichiarato di essere un operatore del settore */
  dichiarazioneProfessionista: string;
  creato: string;
  /** vuota per chi si è registrato con Google e non ha ancora scelto una password */
  passwordHash: string;
  /** identificativo Google (campo "sub") se ha collegato l'accesso con Google */
  google?: string;
  /** verifica in due passaggi: attiva, oppure in preparazione finché il cliente non conferma il primo codice */
  dueFattori?: DueFattori;
  /** cambia a ogni nuova password: le sessioni precedenti smettono di funzionare */
  versione: number;
  fatturazione: DatiFatturazione;
  spedizione: Indirizzo;
  dispositivi: Dispositivo[];
  avvisiManutenzione: boolean;
  assistenza: string[];
  preventivi: string[];
  /** cliente Stripe collegato, per avere la pagina di pagamento già compilata */
  stripe?: string;
}

export const archivioClienti = () => getStore({ name: 'clienti', consistency: 'strong' });
/** Per ogni cliente l'elenco dei suoi numeri d'ordine */
export const indiceOrdini = () => getStore({ name: 'ordini-per-cliente', consistency: 'strong' });

export const normalizzaEmail = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
export const emailValida = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 200;

/** Chiave dell'archivio: impronta dell'email (le email possono contenere caratteri non ammessi nelle chiavi) */
export const idCliente = (email: string) => createHash('sha256').update(normalizzaEmail(email)).digest('hex').slice(0, 32);

export async function leggiCliente(id: string): Promise<Cliente | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  return (await archivioClienti().get(id, { type: 'json' })) as Cliente | null;
}

export const clienteDaEmail = (email: string) => leggiCliente(idCliente(email));
export const salvaCliente = (c: Cliente) => archivioClienti().setJSON(c.id, c);
export const eliminaCliente = (c: Cliente) => archivioClienti().delete(c.id);

export async function elencoClienti(): Promise<Cliente[]> {
  const archivio = archivioClienti();
  const { blobs } = await archivio.list();
  const clienti = await Promise.all(blobs.map((b) => archivio.get(b.key, { type: 'json' }) as Promise<Cliente | null>));
  return clienti.filter((c): c is Cliente => !!c);
}

// ——— password ———

export async function cifraPassword(password: string): Promise<string> {
  const sale = randomBytes(16);
  const hash = await scrypt(password, sale, 64);
  return `scrypt$${sale.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verificaPassword(password: unknown, salvata: string): Promise<boolean> {
  if (typeof password !== 'string') return false;
  const [schema, sale, hash] = salvata.split('$');
  if (schema !== 'scrypt' || !sale || !hash) return false;
  const atteso = Buffer.from(hash, 'base64url');
  const calcolato = await scrypt(password, Buffer.from(sale, 'base64url'), atteso.length);
  return timingSafeEqual(atteso, calcolato);
}

export const passwordAccettabile = (p: unknown): p is string => typeof p === 'string' && p.length >= PASSWORD_MINIMA && p.length <= 200;

/** Password fra le più usate al mondo (e varianti ovvie): sono le prime che provano i programmi di attacco */
const PASSWORD_COMUNI = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344', 'password',
  'password1', 'password123', 'passw0rd', 'qwertyui', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'iloveyou', 'abcd1234',
  'abc12345', 'aaaaaaaa', 'princess', 'sunshine', 'football', 'baseball', 'superman', 'welcome1', 'admin123',
  'changeme', 'ciao1234', 'ciaociao', 'juventus', 'napoli1926', 'fisioterapia', 'fgitalia', 'fgitalia1',
]);

/** Spiega perché la password è troppo facile da indovinare, oppure undefined se va bene */
export function passwordDebole(p: string, email = ''): string | undefined {
  const minuscola = p.toLowerCase();
  const nomeEmail = email.split('@')[0]?.toLowerCase();
  if (PASSWORD_COMUNI.has(minuscola) || /^(.)\1+$/.test(p) || /^\d+$/.test(p) && new Set(p).size <= 3)
    return 'Questa password è tra le più usate: scegline una meno prevedibile.';
  if (nomeEmail && nomeEmail.length >= 4 && minuscola.includes(nomeEmail)) return 'La password non deve contenere il tuo indirizzo email.';
  return undefined;
}

// ——— sessione e link per reimpostare la password ———

const firma = (dati: string) => createHmac('sha256', variabile('SESSION_SECRET')).update(dati).digest('base64url');

function uguali(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function creaSessione(c: Cliente, adesso = Date.now()): string {
  const dati = `${c.id}.${adesso + DURATA_SESSIONE_MS}.${c.versione}`;
  return `${dati}.${firma(`sessione.${dati}`)}`;
}

/** Restituisce l'id del cliente e la versione della password se il gettone è integro e non scaduto */
export function leggiSessione(gettone: string | undefined, adesso = Date.now()): { id: string; versione: number } | null {
  const [id, scadenza, versione, valore] = (gettone ?? '').split('.');
  if (!id || !scadenza || !versione || !valore || Number(scadenza) < adesso) return null;
  if (!uguali(valore, firma(`sessione.${id}.${scadenza}.${versione}`))) return null;
  return { id, versione: Number(versione) };
}

/** Il link vale un'ora e una sola volta: dentro c'è un pezzo dell'impronta della password attuale */
export function creaLinkReimposta(c: Cliente, adesso = Date.now()): string {
  const dati = `${c.id}.${adesso + DURATA_REIMPOSTA_MS}`;
  return `${dati}.${firma(`reimposta.${dati}.${c.passwordHash}`)}`;
}

export async function clienteDaLinkReimposta(gettone: unknown, adesso = Date.now()): Promise<Cliente | null> {
  if (typeof gettone !== 'string') return null;
  const [id, scadenza, valore] = gettone.split('.');
  if (!id || !scadenza || !valore || Number(scadenza) < adesso) return null;
  const cliente = await leggiCliente(id);
  if (!cliente || !uguali(valore, firma(`reimposta.${id}.${scadenza}.${cliente.passwordHash}`))) return null;
  return cliente;
}

export function leggiCookie(req: Request, nome = COOKIE): string | undefined {
  for (const parte of (req.headers.get('cookie') ?? '').split(';')) {
    const [chiave, ...valore] = parte.trim().split('=');
    if (chiave === nome) return decodeURIComponent(valore.join('='));
  }
  return undefined;
}

export const cookieSessione = (gettone: string) =>
  `${COOKIE}=${encodeURIComponent(gettone)}; Path=/api; Max-Age=${DURATA_SESSIONE_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const cookieUscita = () => `${COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Il cliente collegato alla richiesta, se la sessione è valida */
export async function clienteDaRichiesta(req: Request): Promise<Cliente | null> {
  const sessione = leggiSessione(leggiCookie(req));
  if (!sessione) return null;
  const cliente = await leggiCliente(sessione.id);
  return cliente && cliente.versione === sessione.versione ? cliente : null;
}

// ——— ordini del cliente ———

export async function numeriOrdini(id: string): Promise<string[]> {
  return ((await indiceOrdini().get(id, { type: 'json' })) as string[] | null) ?? [];
}

export async function collegaOrdine(id: string, numero: string) {
  const numeri = await numeriOrdini(id);
  if (!numeri.includes(numero)) await indiceOrdini().setJSON(id, [...numeri, numero]);
}

/** Alla registrazione collega gli ordini già fatti con la stessa email */
export async function collegaOrdiniPrecedenti(c: Cliente) {
  const archivio = archivioOrdini();
  const { blobs } = await archivio.list();
  const trovati: string[] = [];
  for (const b of blobs) {
    const o = (await archivio.get(b.key, { type: 'json' })) as Ordine | null;
    if (o && normalizzaEmail(o.cliente.email) === c.email) trovati.push(o.numero);
  }
  const numeri = await numeriOrdini(c.id);
  const uniti = [...new Set([...numeri, ...trovati])];
  if (uniti.length !== numeri.length) await indiceOrdini().setJSON(c.id, uniti);
}

export async function ordiniCliente(c: Cliente): Promise<Ordine[]> {
  const archivio = archivioOrdini();
  const ordini = await Promise.all((await numeriOrdini(c.id)).map((n) => archivio.get(n, { type: 'json' }) as Promise<Ordine | null>));
  return ordini.filter((o): o is Ordine => !!o).sort((a, b) => b.creato.localeCompare(a.creato));
}

// ——— dispositivi e manutenzione ———

/** Informazioni pubblicate sul sito per l'area clienti (src/pages/api/area-clienti.json.ts) */
export interface SchedaAreaClienti {
  titolo: string;
  codice?: string;
  immagine?: string;
  consumabile: boolean;
  /** ogni quanti mesi va fatta la manutenzione o la verifica di sicurezza; assente se non è un'apparecchiatura */
  manutenzioneMesi?: number;
  documenti: { titolo: string; file: string; tipo: string }[];
}

export type Schede = Record<string, SchedaAreaClienti>;

export const oggiIso = (adesso = new Date()) => adesso.toISOString().slice(0, 10);
export const dataValida = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

export function aggiungiMesi(data: string, mesi: number): string {
  const [a, m, g] = data.split('-').map(Number);
  const risultato = new Date(Date.UTC(a, m - 1 + mesi, 1));
  const ultimoGiorno = new Date(Date.UTC(risultato.getUTCFullYear(), risultato.getUTCMonth() + 1, 0)).getUTCDate();
  risultato.setUTCDate(Math.min(g, ultimoGiorno));
  return risultato.toISOString().slice(0, 10);
}

export const prossimaManutenzione = (d: Dispositivo) => aggiungiMesi(d.ultimaManutenzione ?? d.acquistato, d.intervalloMesi);

/** Aggiunge i dispositivi comprati sul sito che non sono ancora nell'elenco del cliente. Restituisce true se ha cambiato qualcosa. */
export function sincronizzaDispositivi(c: Cliente, ordini: Ordine[], schede: Schede): boolean {
  let cambiato = false;
  for (const o of ordini) {
    if (!o.pagato || o.stato === 'annullato') continue;
    for (const r of o.righe) {
      const scheda = r.id ? schede[r.id] : undefined;
      if (!r.id || !scheda?.manutenzioneMesi) continue;
      for (let i = 0; i < Math.min(r.quantita, 10); i++) {
        const id = `${o.numero}/${r.id}${i ? `/${i + 1}` : ''}`;
        if (c.dispositivi.some((d) => d.id === id)) continue;
        c.dispositivi.push({
          id,
          prodottoId: r.id,
          titolo: r.titolo,
          ordine: o.numero,
          acquistato: o.creato.slice(0, 10),
          intervalloMesi: scheda.manutenzioneMesi,
        });
        cambiato = true;
      }
    }
  }
  return cambiato;
}

/** Dispositivi la cui manutenzione scade entro `giorni` e per cui non è ancora partito il promemoria */
export function dispositiviDaRicordare(c: Cliente, oggi = oggiIso(), giorni = 30): Dispositivo[] {
  if (!c.avvisiManutenzione) return [];
  const limite = new Date(Date.parse(oggi) + giorni * 86_400_000).toISOString().slice(0, 10);
  return c.dispositivi.filter((d) => {
    const scadenza = prossimaManutenzione(d);
    return scadenza <= limite && d.avvisato !== scadenza;
  });
}

// ——— numeri di pratica (assistenza, preventivi) ———

export function nuovoNumero(prefisso: string, data = new Date()): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const casuale = [...randomBytes(4)].map((b) => alfabeto[b % alfabeto.length]).join('');
  return `${prefisso}-${data.toISOString().slice(2, 10).replace(/-/g, '')}-${casuale}`;
}

export const numeroPraticaValido = (prefisso: string, n: unknown): n is string =>
  typeof n === 'string' && new RegExp(`^${prefisso}-\\d{6}-[A-Z0-9]{4}$`).test(n);

/** Quello che il browser riceve del cliente (mai l'impronta della password) */
export function vistaAccount(c: Cliente) {
  const { passwordHash, versione: _versione, stripe: _stripe, google, dueFattori, ...resto } = c;
  return {
    ...resto,
    haPassword: !!passwordHash,
    conGoogle: !!google,
    dueFattori: !!dueFattori?.attivo,
    codiciRecupero: dueFattori?.attivo ? dueFattori.recupero.length : 0,
    dispositivi: c.dispositivi.map((d) => ({ ...d, prossima: prossimaManutenzione(d) })),
  };
}

// ——— accesso in due tempi (codice dopo password o Google) ———

export const COOKIE_ATTESA = 'fg_attesa';
const DURATA_ATTESA_MS = 5 * 60 * 1000;

/** Gettone di pochi minuti: password (o Google) già verificata, manca il codice a 6 cifre */
export function creaAttesa(c: Cliente, adesso = Date.now()): string {
  const dati = `${c.id}.${adesso + DURATA_ATTESA_MS}.${c.versione}`;
  return `${dati}.${firma(`attesa.${dati}`)}`;
}

export async function clienteInAttesa(req: Request, adesso = Date.now()): Promise<Cliente | null> {
  const [id, scadenza, versione, valore] = (leggiCookie(req, COOKIE_ATTESA) ?? '').split('.');
  if (!id || !scadenza || !versione || !valore || Number(scadenza) < adesso) return null;
  if (!uguali(valore, firma(`attesa.${id}.${scadenza}.${versione}`))) return null;
  const cliente = await leggiCliente(id);
  return cliente && cliente.versione === Number(versione) ? cliente : null;
}

export const cookieAttesa = (gettone: string) =>
  `${COOKIE_ATTESA}=${encodeURIComponent(gettone)}; Path=/api/account; Max-Age=${DURATA_ATTESA_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const cookieAttesaFinita = () => `${COOKIE_ATTESA}=; Path=/api/account; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

// ——— registrazione con Google (in attesa di professione e dichiarazione) ———

export const COOKIE_NUOVO_GOOGLE = 'fg_google_nuovo';
const DURATA_NUOVO_MS = 20 * 60 * 1000;

export interface NuovoGoogle {
  email: string;
  nome: string;
  google: string;
  scade: number;
}

export function creaNuovoGoogle(dati: Omit<NuovoGoogle, 'scade'>, adesso = Date.now()): string {
  const corpo = Buffer.from(JSON.stringify({ ...dati, scade: adesso + DURATA_NUOVO_MS })).toString('base64url');
  return `${corpo}.${firma(`nuovo-google.${corpo}`)}`;
}

export function leggiNuovoGoogle(req: Request, adesso = Date.now()): NuovoGoogle | null {
  const [corpo, valore] = (leggiCookie(req, COOKIE_NUOVO_GOOGLE) ?? '').split('.');
  if (!corpo || !valore || !uguali(valore, firma(`nuovo-google.${corpo}`))) return null;
  try {
    const dati = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as NuovoGoogle;
    return dati.scade > adesso ? dati : null;
  } catch {
    return null;
  }
}

export const cookieNuovoGoogle = (gettone: string) =>
  `${COOKIE_NUOVO_GOOGLE}=${encodeURIComponent(gettone)}; Path=/api/account; Max-Age=${DURATA_NUOVO_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const cookieNuovoGoogleFinito = () => `${COOKIE_NUOVO_GOOGLE}=; Path=/api/account; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
