import { expect, it, vi } from 'vitest';

vi.mock('@netlify/blobs', () => {
  const archivi = new Map<string, Map<string, unknown>>();
  return {
    getStore: ({ name }: { name: string }) => {
      if (!archivi.has(name)) archivi.set(name, new Map());
      const a = archivi.get(name)!;
      return {
        get: async (k: string) => (a.has(k) ? new TextEncoder().encode(String(a.get(k))).buffer : null),
        set: async (k: string, v: unknown) => void a.set(k, v),
        delete: async (k: string) => void a.delete(k),
        list: async () => ({ blobs: [...a.keys()].map((key) => ({ key })) }),
      };
    },
  };
});
const email: string[] = [];
vi.stubGlobal('fetch', async (url: string, opzioni?: RequestInit) => {
  if (url.includes('brevo')) email.push(JSON.parse(String(opzioni?.body)).htmlContent);
  return new Response('{}', { status: 201 });
});
// il dominio non punta ancora al sito nuovo: URL dice www.fgitalia.it, ma il sito risponde dall'indirizzo Netlify
Object.assign(process.env, { URL: 'https://www.fgitalia.it', ADMIN_PASSWORD: 'una-password-lunga', BREVO_API_KEY: 'x', EMAIL_MITTENTE: 'commerciale@fgitalia.it', EMAIL_NOTIFICHE: 'papa@example.com' });

it('logo sempre raggiungibile nelle email, link dall’indirizzo da cui il sito sta rispondendo', async () => {
  const { default: gestione } = await import('../server/netlify/gestione-ordini.mts');
  const chiedi = (corpo: unknown, gettone = '') =>
    gestione(
      new Request('https://luminous-figolla-66d919.netlify.app/api/gestione-ordini', {
        method: 'POST',
        body: JSON.stringify(corpo),
        headers: { authorization: `Bearer ${gettone}` },
      }),
      { ip: '1.1.1.1' },
    );
  const { gettone } = await (await chiedi({ azione: 'accedi', password: 'una-password-lunga' })).json();
  expect(await (await chiedi({ azione: 'prova-email' }, gettone)).json()).toMatchObject({ inviata: true });
  expect(email[0]).toContain('src="https://raw.githubusercontent.com/AntonioGigi/FgItalia/main/public/uploads/logo-fgitalia.png"');
  const { urlSito } = await import('../server/lib/ambiente');
  expect(urlSito()).toBe('https://luminous-figolla-66d919.netlify.app');
});
