import type { Config, Context } from '@netlify/functions';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { variabile, variabileFacoltativa } from '../lib/ambiente';
import {
  clienteDaEmail,
  cookieAttesa,
  cookieNuovoGoogle,
  cookieSessione,
  creaAttesa,
  creaNuovoGoogle,
  creaSessione,
  emailValida,
  leggiCookie,
  normalizzaEmail,
  salvaCliente,
} from '../lib/clienti';
import { controllaDatiGoogle, type DatiGoogle } from '../lib/google';
import { ipRichiesta, ORE, superaLimite } from '../lib/limiti';

/**
 * "Continua con Google" per l'area clienti (OpenID Connect con PKCE).
 * /api/account/google          → manda il cliente alla pagina di Google
 * /api/account/google/ritorno  → Google lo rimanda qui con un codice da scambiare
 * Servono GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (Google Cloud → API e servizi → Credenziali).
 */
const AUTORIZZA = 'https://accounts.google.com/o/oauth2/v2/auth';
const GETTONE = 'https://oauth2.googleapis.com/token';
const COOKIE_STATO = 'fg_google';
const DURATA_STATO_S = 10 * 60;

const base64url = (b: Buffer) => b.toString('base64url');
const firma = (dati: string) => createHmac('sha256', variabile('SESSION_SECRET')).update(`google.${dati}`).digest('base64url');
const uguali = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const vaiA = (url: string, ...cookie: string[]) => {
  const risposta = new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
  for (const c of cookie) risposta.headers.append('Set-Cookie', c);
  return risposta;
};

const cookieStato = (valore: string, durata = DURATA_STATO_S) =>
  `${COOKIE_STATO}=${encodeURIComponent(valore)}; Path=/api/account/google; Max-Age=${durata}; HttpOnly; Secure; SameSite=Lax`;

export default async (req: Request, context?: Context) => {
  const url = new URL(req.url);
  const origine = url.origin;
  const clientId = variabileFacoltativa('GOOGLE_CLIENT_ID');
  const clientSecret = variabileFacoltativa('GOOGLE_CLIENT_SECRET');
  const errore = (motivo: string) => vaiA(`${origine}/account/?errore=google-${motivo}`, cookieStato('', 0));
  if (!clientId || !clientSecret) return errore('non-configurato');
  const ritornoUrl = `${origine}/api/account/google/ritorno`;

  // ——— 1. partenza verso Google ———
  if (!url.pathname.endsWith('/ritorno')) {
    if (await superaLimite(`google-ip:${ipRichiesta(req, context)}`, 30, ORE)) return errore('troppi-tentativi');
    const stato = base64url(randomBytes(16));
    const verificatore = base64url(randomBytes(32));
    const sfida = base64url(createHash('sha256').update(verificatore).digest());
    const scadenza = Date.now() + DURATA_STATO_S * 1000;
    const valore = `${stato}.${verificatore}.${scadenza}`;
    const parametri = new URLSearchParams({
      client_id: clientId,
      redirect_uri: ritornoUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state: stato,
      code_challenge: sfida,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return vaiA(`${AUTORIZZA}?${parametri}`, cookieStato(`${valore}.${firma(valore)}`));
  }

  // ——— 2. ritorno da Google ———
  if (url.searchParams.get('error')) return errore('annullato');
  const [stato, verificatore, scadenza, valore] = (leggiCookie(req, COOKIE_STATO) ?? '').split('.');
  const integro = stato && verificatore && scadenza && valore && uguali(valore, firma(`${stato}.${verificatore}.${scadenza}`));
  if (!integro || Number(scadenza) < Date.now() || url.searchParams.get('state') !== stato) return errore('scaduto');

  let dati: DatiGoogle;
  try {
    const risposta = await fetch(GETTONE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code') ?? '',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: ritornoUrl,
        grant_type: 'authorization_code',
        code_verifier: verificatore,
      }),
    });
    const corpo = (await risposta.json()) as { id_token?: string };
    if (!risposta.ok || !corpo.id_token) throw new Error(`Google ha risposto ${risposta.status}`);
    dati = JSON.parse(Buffer.from(corpo.id_token.split('.')[1], 'base64url').toString());
  } catch (e) {
    console.error('Accesso con Google non riuscito', e);
    return errore('non-riuscito');
  }
  if (controllaDatiGoogle(dati, clientId)) return errore('non-valido');

  const email = normalizzaEmail(dati.email);
  if (!emailValida(email)) return errore('non-valido');
  const cliente = await clienteDaEmail(email);

  // nuovo cliente: prima di creare l'account servono professione e dichiarazione
  if (!cliente) {
    const nuovo = creaNuovoGoogle({ email, nome: (dati.name ?? '').slice(0, 120), google: dati.sub });
    return vaiA(`${origine}/account/?completa=google`, cookieStato('', 0), cookieNuovoGoogle(nuovo));
  }
  if (cliente.google && cliente.google !== dati.sub) return errore('altro-account');
  if (!cliente.google) {
    // email verificata da Google uguale a quella dell'account: si collegano
    cliente.google = dati.sub;
    await salvaCliente(cliente);
  }
  if (cliente.dueFattori?.attivo) return vaiA(`${origine}/account/?codice=1`, cookieStato('', 0), cookieAttesa(creaAttesa(cliente)));
  return vaiA(`${origine}/account/`, cookieStato('', 0), cookieSessione(creaSessione(cliente)));
};

export const config: Config = { path: ['/api/account/google', '/api/account/google/ritorno'] };
