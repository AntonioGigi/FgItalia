import { beforeEach, describe, expect, it, vi } from 'vitest';

// ——— finti servizi esterni: archivio Netlify Blobs e Brevo ———
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
const emailInviate: string[] = [];
vi.stubGlobal('fetch', async (url: string, opzioni?: RequestInit) => {
  if (url.endsWith('/smtp/email')) emailInviate.push(JSON.parse(String(opzioni?.body)).subject);
  return new Response(JSON.stringify({ id: 1 }), { status: 201 });
});
// le pause anti-tentativi rallenterebbero i test: qui scattano subito
vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => (fn(), 0)) as unknown as typeof setTimeout);

Object.assign(process.env, {
  URL: 'https://www.fgitalia.it',
  BREVO_API_KEY: 'brevo',
  BREVO_LISTA_ID: '3',
  EMAIL_MITTENTE: 'ordini@fgitalia.it',
  ADMIN_PASSWORD: 'una-password-lunga',
  SESSION_SECRET: 'segreto-di-prova',
});

const { default: account } = await import('../netlify/functions/account.mts');
const { default: gestione } = await import('../netlify/functions/gestione-ordini.mts');
const { default: statoOrdine } = await import('../netlify/functions/ordine.mts');
const { passwordDebole } = await import('../netlify/lib/clienti');
const { conta, bloccato, superaLimite } = await import('../netlify/lib/limiti');

const chiamata = (url: string, corpo: unknown, ip = '1.1.1.1') =>
  new Request(url, {
    method: 'POST',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
  });
const api = (corpo: Record<string, unknown>, ip?: string) => account(chiamata('https://www.fgitalia.it/api/account', corpo, ip));

const registrazione = (email: string, password = 'Tecar-Acireale-2026') => ({
  azione: 'registra',
  email,
  password,
  nome: 'Anna Fisio',
  professione: 'Fisioterapista',
  professionista: true,
});

beforeEach(() => {
  archivi.clear();
  emailInviate.length = 0;
});

describe('password', () => {
  it('rifiuta le password più usate e quelle che contengono l’email', () => {
    expect(passwordDebole('12345678')).toBeDefined();
    expect(passwordDebole('Password')).toBeDefined();
    expect(passwordDebole('aaaaaaaaaa')).toBeDefined();
    expect(passwordDebole('11112222')).toBeDefined();
    expect(passwordDebole('anna.rossi99', 'anna.rossi@example.com')).toBeDefined();
    expect(passwordDebole('Tecar-Acireale-2026', 'anna@example.com')).toBeUndefined();
  });

  it('la registrazione non accetta una password debole', async () => {
    const r = await api(registrazione('anna@example.com', 'password123'));
    expect(r.status).toBe(400);
    expect((await r.json()).errore).toContain('più usate');
  });
});

describe('limiti di frequenza', () => {
  it('la finestra si chiude da sola', async () => {
    await conta('prova', 1000, 0);
    await conta('prova', 1000, 500);
    expect(await bloccato('prova', 2, 900)).toBe(true);
    expect(await bloccato('prova', 2, 1500)).toBe(false);
    expect(await superaLimite('altra', 1, 1000, 0)).toBe(false);
    expect(await superaLimite('altra', 1, 1000, 10)).toBe(true);
  });

  it('nell’archivio non finiscono IP né email in chiaro', async () => {
    await conta('accedi-email:anna@example.com', 1000);
    const chiavi = [...(archivi.get('limiti')?.keys() ?? [])];
    expect(chiavi).toHaveLength(1);
    expect(chiavi[0]).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('area clienti', () => {
  it('dopo 8 password sbagliate l’account si blocca per un po’, anche con la password giusta', async () => {
    expect((await api(registrazione('anna@example.com'))).status).toBe(200);
    for (let i = 0; i < 8; i++) {
      expect((await api({ azione: 'accedi', email: 'anna@example.com', password: `sbagliata-${i}` }, `10.0.0.${i}`)).status).toBe(401);
    }
    const r = await api({ azione: 'accedi', email: 'anna@example.com', password: 'Tecar-Acireale-2026' }, '9.9.9.9');
    expect(r.status).toBe(429);
    // un altro cliente non è toccato
    expect((await api(registrazione('marco@example.com'), '2.2.2.2')).status).toBe(200);
    expect((await api({ azione: 'accedi', email: 'marco@example.com', password: 'Tecar-Acireale-2026' }, '2.2.2.2')).status).toBe(200);
  });

  it('un accesso riuscito azzera il conteggio degli errori', async () => {
    await api(registrazione('anna@example.com'));
    for (let i = 0; i < 7; i++) await api({ azione: 'accedi', email: 'anna@example.com', password: 'no' });
    expect((await api({ azione: 'accedi', email: 'anna@example.com', password: 'Tecar-Acireale-2026' })).status).toBe(200);
    for (let i = 0; i < 7; i++) await api({ azione: 'accedi', email: 'anna@example.com', password: 'no' });
    expect((await api({ azione: 'accedi', email: 'anna@example.com', password: 'Tecar-Acireale-2026' })).status).toBe(200);
  });

  it('al massimo 5 registrazioni all’ora dalla stessa connessione', async () => {
    for (let i = 0; i < 5; i++) expect((await api(registrazione(`c${i}@example.com`), '3.3.3.3')).status).toBe(200);
    expect((await api(registrazione('c6@example.com'), '3.3.3.3')).status).toBe(429);
    expect((await api(registrazione('c6@example.com'), '4.4.4.4')).status).toBe(200);
  });

  it('“password dimenticata” non manda valanghe di email e risponde sempre allo stesso modo', async () => {
    await api(registrazione('anna@example.com'));
    emailInviate.length = 0; // l'email di benvenuto non conta
    for (let i = 0; i < 6; i++) {
      const r = await api({ azione: 'password-dimenticata', email: 'anna@example.com' }, `11.0.0.${i}`);
      expect(await r.json()).toEqual({ inviata: true });
    }
    expect(emailInviate).toHaveLength(3);
  });
});

describe('pannello ordini', () => {
  it('dopo 5 password sbagliate dalla stessa connessione blocca l’accesso', async () => {
    const accedi = (password: string, ip: string) => gestione(chiamata('https://x/api/gestione-ordini', { azione: 'accedi', password }, ip));
    for (let i = 0; i < 5; i++) expect((await accedi('sbagliata', '5.5.5.5')).status).toBe(401);
    expect((await accedi('una-password-lunga', '5.5.5.5')).status).toBe(429);
    // da un'altra connessione la password giusta funziona ancora
    expect((await accedi('una-password-lunga', '6.6.6.6')).status).toBe(200);
  });

  it('30 errori in un’ora da connessioni diverse bloccano il pannello per tutti', async () => {
    const accedi = (password: string, ip: string) => gestione(chiamata('https://x/api/gestione-ordini', { azione: 'accedi', password }, ip));
    for (let i = 0; i < 30; i++) await accedi('sbagliata', `7.7.${i}.1`);
    expect((await accedi('una-password-lunga', '8.8.8.8')).status).toBe(429);
  });
});

describe('ricerca ordini', () => {
  it('chi prova numeri d’ordine a caso viene fermato', async () => {
    const cerca = () =>
      statoOrdine(new Request('https://x/api/ordine?n=FG-261026-AAAA&e=a@b.it', { headers: { 'x-nf-client-connection-ip': '9.9.9.9' } }));
    for (let i = 0; i < 20; i++) expect((await cerca()).status).toBe(404);
    expect((await cerca()).status).toBe(429);
  });
});

describe('accesso al pannello dei contenuti (/admin/)', () => {
  it('dà il token GitHub solo a chi è entrato nel pannello ordini', async () => {
    const { default: cmsToken } = await import('../netlify/functions/cms-token.mts');
    const { creaGettone } = await import('../netlify/lib/accesso');
    const chiedi = (gettone?: string) =>
      cmsToken(
        new Request('https://x/api/cms-token', {
          method: 'POST',
          headers: { 'x-nf-client-connection-ip': '12.0.0.1', ...(gettone && { authorization: `Bearer ${gettone}` }) },
        }),
      );
    expect((await chiedi()).status).toBe(401);
    expect((await chiedi(creaGettone('password-sbagliata'))).status).toBe(401);

    const valido = creaGettone('una-password-lunga');
    delete process.env.GITHUB_CMS_TOKEN;
    const senza = await chiedi(valido);
    expect(senza.status).toBe(503);
    expect((await senza.json()).errore).toContain('GITHUB_CMS_TOKEN');

    process.env.GITHUB_CMS_TOKEN = 'github_pat_prova';
    expect(await (await chiedi(valido)).json()).toEqual({ token: 'github_pat_prova' });
  });
});
