import { beforeEach, describe, expect, it, vi } from 'vitest';

// ——— finti servizi esterni: archivio Netlify Blobs, Brevo e Google ———
const archivi = new Map<string, Map<string, unknown>>();
vi.mock('@netlify/blobs', () => ({
  getStore: ({ name }: { name: string }) => {
    if (!archivi.has(name)) archivi.set(name, new Map());
    const a = archivi.get(name)!;
    return {
      get: async (k: string) => (a.has(k) ? structuredClone(a.get(k)) : null),
      set: async (k: string, v: unknown) => void a.set(k, v),
      setJSON: async (k: string, v: unknown) => void a.set(k, structuredClone(v)),
      delete: async (k: string) => void a.delete(k),
      list: async () => ({ blobs: [...a.keys()].map((key) => ({ key })) }),
    };
  },
}));

let tokenGoogle: Record<string, unknown> = {};
const richiesteGoogle: URLSearchParams[] = [];
vi.stubGlobal('fetch', async (url: string, opzioni?: RequestInit) => {
  if (url === 'https://oauth2.googleapis.com/token') {
    richiesteGoogle.push(new URLSearchParams(String(opzioni?.body)));
    const payload = Buffer.from(JSON.stringify(tokenGoogle)).toString('base64url');
    return new Response(JSON.stringify({ id_token: `eyJhbGciOiJSUzI1NiJ9.${payload}.firma` }));
  }
  return new Response(JSON.stringify({ id: 1 }), { status: 201 });
});
vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => (fn(), 0)) as unknown as typeof setTimeout);

Object.assign(process.env, {
  URL: 'https://www.fgitalia.it',
  BREVO_API_KEY: 'brevo',
  BREVO_LISTA_ID: '3',
  EMAIL_MITTENTE: 'ordini@fgitalia.it',
  ADMIN_PASSWORD: 'una-password-lunga',
  SESSION_SECRET: 'segreto-di-prova-abbastanza-lungo',
  GOOGLE_CLIENT_ID: 'id-cliente.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'segreto-google',
});

const { default: account } = await import('../netlify/functions/account.mts');
const { default: google } = await import('../netlify/functions/account-google.mts');
const { default: gestione } = await import('../netlify/functions/gestione-ordini.mts');
const { codice, daBase32, passoAttuale, passoDelCodice, base32, nuoviCodiciRecupero } = await import('../netlify/lib/dueFattori');
const { controllaDatiGoogle } = await import('../netlify/lib/google');

/** Cookie del "browser" di prova */
let cookie = new Map<string, string>();
function salvaCookie(r: Response) {
  for (const c of r.headers.getSetCookie()) {
    const [coppia, ...attributi] = c.split(';');
    const [nome, ...valore] = coppia.split('=');
    if (attributi.some((a) => a.trim() === 'Max-Age=0')) cookie.delete(nome.trim());
    else cookie.set(nome.trim(), valore.join('='));
  }
  return r;
}
const intestazioni = () => ({
  'content-type': 'application/json',
  cookie: [...cookie].map(([k, v]) => `${k}=${v}`).join('; '),
  'x-nf-client-connection-ip': '1.2.3.4',
});
const api = async (corpo: Record<string, unknown>) =>
  salvaCookie(await account(new Request('https://www.fgitalia.it/api/account', { method: 'POST', body: JSON.stringify(corpo), headers: intestazioni() })));
const vai = async (url: string) => salvaCookie(await google(new Request(url, { headers: intestazioni() })));

/** Codice che l'app mostrerebbe adesso (o al passo successivo, per non riusare lo stesso) */
const codiceApp = (chiave: string, scarto = 0) => codice(daBase32(chiave), passoAttuale() + scarto);

const registrazione = {
  azione: 'registra',
  email: 'anna@example.com',
  password: 'Tecar-Acireale-2026',
  nome: 'Anna Fisio',
  professione: 'Fisioterapista',
  professionista: true,
};

beforeEach(() => {
  archivi.clear();
  cookie = new Map();
  richiesteGoogle.length = 0;
});

describe('codici a 6 cifre (RFC 6238)', () => {
  const segreto = Buffer.from('12345678901234567890');
  it('coincidono con gli esempi ufficiali', () => {
    expect(codice(segreto, Math.floor(59 / 30))).toBe('287082');
    expect(codice(segreto, Math.floor(1111111109 / 30))).toBe('081804');
    expect(codice(segreto, Math.floor(1234567890 / 30))).toBe('005924');
  });

  it('accettano 30 secondi di scarto ma non il riuso dello stesso codice', () => {
    const adesso = 1_700_000_000_000;
    const passo = passoAttuale(adesso);
    expect(passoDelCodice(segreto, codice(segreto, passo - 1), adesso)).toBe(passo - 1);
    expect(passoDelCodice(segreto, codice(segreto, passo - 2), adesso)).toBeNull();
    expect(passoDelCodice(segreto, codice(segreto, passo), adesso, passo)).toBeNull();
    expect(passoDelCodice(segreto, 'abc123', adesso)).toBeNull();
  });

  it('base32 andata e ritorno', () => {
    const b = Buffer.from('ciao FGItalia!');
    expect(daBase32(base32(b)).equals(b)).toBe(true);
  });

  it('8 codici di recupero diversi', () => {
    const { codici, impronte } = nuoviCodiciRecupero();
    expect(new Set(codici).size).toBe(8);
    expect(codici[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(impronte[0]).not.toContain(codici[0]);
  });
});

describe('verifica in due passaggi dei clienti', () => {
  it('attivazione, accesso con codice, codice di recupero usabile una volta', async () => {
    await api(registrazione);
    const { chiave, qr } = await (await api({ azione: 'due-fattori-prepara' })).json();
    expect(qr).toContain('<svg');
    // nell'archivio il segreto non è leggibile
    expect(JSON.stringify([...archivi.get('clienti')!.values()])).not.toContain(chiave.replace(/\s/g, ''));

    expect((await api({ azione: 'due-fattori-attiva', codice: '000000' })).status).toBe(400);
    const attivazione = await api({ azione: 'due-fattori-attiva', codice: codiceApp(chiave) });
    const { codici, account: vista } = await attivazione.json();
    expect(vista.dueFattori).toBe(true);
    expect(codici).toHaveLength(8);

    // uscita e nuovo accesso: la password da sola non basta
    await api({ azione: 'esci' });
    const passo1 = await (await api({ azione: 'accedi', email: 'anna@example.com', password: 'Tecar-Acireale-2026' })).json();
    expect(passo1).toEqual({ serveCodice: true });
    expect(cookie.has('fg_account')).toBe(false);
    expect((await api({ azione: 'profilo' })).status).toBe(401);

    expect((await api({ azione: 'accedi-codice', codice: '123456' })).status).toBe(401);
    expect((await api({ azione: 'accedi-codice', codice: codiceApp(chiave, 1) })).status).toBe(200);
    expect((await api({ azione: 'profilo' })).status).toBe(200);

    // codice di recupero: vale una sola volta
    await api({ azione: 'esci' });
    await api({ azione: 'accedi', email: 'anna@example.com', password: 'Tecar-Acireale-2026' });
    expect((await api({ azione: 'accedi-codice', codice: codici[0] })).status).toBe(200);
    await api({ azione: 'esci' });
    await api({ azione: 'accedi', email: 'anna@example.com', password: 'Tecar-Acireale-2026' });
    expect((await api({ azione: 'accedi-codice', codice: codici[0] })).status).toBe(401);
  });

  it('dopo 5 codici sbagliati blocca', async () => {
    await api(registrazione);
    const { chiave } = await (await api({ azione: 'due-fattori-prepara' })).json();
    await api({ azione: 'due-fattori-attiva', codice: codiceApp(chiave) });
    await api({ azione: 'esci' });
    await api({ azione: 'accedi', email: 'anna@example.com', password: 'Tecar-Acireale-2026' });
    for (let i = 0; i < 5; i++) await api({ azione: 'accedi-codice', codice: '111111' });
    expect((await api({ azione: 'accedi-codice', codice: codiceApp(chiave, 1) })).status).toBe(429);
  });

  it('per disattivarla serve un codice valido', async () => {
    await api(registrazione);
    const { chiave } = await (await api({ azione: 'due-fattori-prepara' })).json();
    await api({ azione: 'due-fattori-attiva', codice: codiceApp(chiave) });
    expect((await api({ azione: 'due-fattori-disattiva', codice: '000000' })).status).toBe(403);
    const r = await api({ azione: 'due-fattori-disattiva', codice: codiceApp(chiave, 1) });
    expect((await r.json()).account.dueFattori).toBe(false);
  });
});

describe('accesso con Google', () => {
  const datiGoogle = (email = 'marco@example.com', sub = 'google-123') => ({
    iss: 'https://accounts.google.com',
    aud: 'id-cliente.apps.googleusercontent.com',
    sub,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email,
    email_verified: true,
    name: 'Marco Bianchi',
  });

  /** Simula il giro: partenza → pagina Google → ritorno con il codice */
  async function giroGoogle(dati: Record<string, unknown>) {
    tokenGoogle = dati;
    const partenza = await vai('https://www.fgitalia.it/api/account/google');
    const versoGoogle = new URL(partenza.headers.get('location')!);
    expect(versoGoogle.origin).toBe('https://accounts.google.com');
    expect(versoGoogle.searchParams.get('code_challenge_method')).toBe('S256');
    const stato = versoGoogle.searchParams.get('state')!;
    return vai(`https://www.fgitalia.it/api/account/google/ritorno?code=abc&state=${stato}`);
  }

  it('controlla i dati del token', () => {
    const id = 'id-cliente.apps.googleusercontent.com';
    expect(controllaDatiGoogle(datiGoogle(), id)).toBeNull();
    expect(controllaDatiGoogle({ ...datiGoogle(), aud: 'altro' }, id)).toBe('destinatario');
    expect(controllaDatiGoogle({ ...datiGoogle(), iss: 'https://evil.example' }, id)).toBe('emittente');
    expect(controllaDatiGoogle({ ...datiGoogle(), email_verified: false }, id)).toBe('email');
    expect(controllaDatiGoogle({ ...datiGoogle(), exp: 1 }, id)).toBe('scaduto');
  });

  it('nuovo cliente: completa con professione e dichiarazione, poi è dentro', async () => {
    const ritorno = await giroGoogle(datiGoogle());
    expect(ritorno.headers.get('location')).toBe('https://www.fgitalia.it/account/?completa=google');
    // il codice viene scambiato con PKCE
    expect(richiesteGoogle[0].get('code_verifier')).toBeTruthy();
    expect((await api({ azione: 'completa-google', professione: 'Fisioterapista', professionista: false })).status).toBe(400);
    const r = await api({ azione: 'completa-google', professione: 'Fisioterapista', professionista: true });
    expect(await r.json()).toEqual({ nome: 'Marco Bianchi' });
    const profilo = await (await api({ azione: 'profilo' })).json();
    expect(profilo.account).toMatchObject({ email: 'marco@example.com', conGoogle: true, haPassword: false });
    // senza password: l'accesso con password non funziona, può sceglierne una
    expect((await api({ azione: 'cambia-password', nuova: 'Elettrodi-Catania-77' })).status).toBe(200);
  });

  it('cliente già registrato con la stessa email: si collega ed entra', async () => {
    await api(registrazione);
    await api({ azione: 'esci' });
    const ritorno = await giroGoogle(datiGoogle('anna@example.com', 'google-anna'));
    expect(ritorno.headers.get('location')).toBe('https://www.fgitalia.it/account/');
    expect((await api({ azione: 'profilo' })).status).toBe(200);
  });

  it('con la verifica in due passaggi Google non basta: serve il codice', async () => {
    await api(registrazione);
    const { chiave } = await (await api({ azione: 'due-fattori-prepara' })).json();
    await api({ azione: 'due-fattori-attiva', codice: codiceApp(chiave) });
    await api({ azione: 'esci' });
    const ritorno = await giroGoogle(datiGoogle('anna@example.com', 'google-anna'));
    expect(ritorno.headers.get('location')).toBe('https://www.fgitalia.it/account/?codice=1');
    expect((await api({ azione: 'profilo' })).status).toBe(401);
    expect((await api({ azione: 'accedi-codice', codice: codiceApp(chiave, 1) })).status).toBe(200);
  });

  it('rifiuta un ritorno senza lo stato giusto e token non validi', async () => {
    await vai('https://www.fgitalia.it/api/account/google');
    const falso = await vai('https://www.fgitalia.it/api/account/google/ritorno?code=abc&state=inventato');
    expect(falso.headers.get('location')).toContain('errore=google-scaduto');
    const nonVerificata = await giroGoogle({ ...datiGoogle(), email_verified: false });
    expect(nonVerificata.headers.get('location')).toContain('errore=google-non-valido');
  });
});

describe('verifica in due passaggi del pannello ordini', () => {
  const chiama = async (corpo: Record<string, unknown>, gettone?: string) =>
    gestione(
      new Request('https://x/api/gestione-ordini', {
        method: 'POST',
        body: JSON.stringify(corpo),
        headers: { 'x-nf-client-connection-ip': '4.3.2.1', ...(gettone && { authorization: `Bearer ${gettone}` }) },
      }),
    );

  it('attivazione e accesso con password + codice', async () => {
    const { gettone } = await (await chiama({ azione: 'accedi', password: 'una-password-lunga' })).json();
    expect(await (await chiama({ azione: 'sicurezza-stato' }, gettone)).json()).toEqual({ attiva: false, codiciRimasti: 0 });
    const { chiave } = await (await chiama({ azione: 'sicurezza-prepara' }, gettone)).json();
    const { codici } = await (await chiama({ azione: 'sicurezza-attiva', codice: codiceApp(chiave) }, gettone)).json();
    expect(codici).toHaveLength(8);

    expect(await (await chiama({ azione: 'accedi', password: 'una-password-lunga' })).json()).toEqual({ serveCodice: true });
    expect((await chiama({ azione: 'accedi', password: 'una-password-lunga', codice: '000000' })).status).toBe(401);
    const ok = await (await chiama({ azione: 'accedi', password: 'una-password-lunga', codice: codiceApp(chiave, 1) })).json();
    expect(ok.gettone).toBeTruthy();
    // con un codice di recupero, se il telefono non c'è
    const recupero = await (await chiama({ azione: 'accedi', password: 'una-password-lunga', codice: codici[3] })).json();
    expect(recupero.gettone).toBeTruthy();
  });
});
