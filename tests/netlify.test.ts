import { describe, expect, it, vi } from 'vitest';

// Netlify Blobs finto: come quello vero, un archivio per nome
const archivi = new Map<string, Map<string, string | ArrayBuffer>>();
vi.mock('@netlify/blobs', () => ({
  getStore: ({ name }: { name: string }) => {
    if (!archivi.has(name)) archivi.set(name, new Map());
    const a = archivi.get(name)!;
    return {
      get: async (k: string) => {
        const v = a.get(k);
        return v === undefined ? null : typeof v === 'string' ? new TextEncoder().encode(v).buffer : v;
      },
      set: async (k: string, v: string | ArrayBuffer) => void a.set(k, v),
      delete: async (k: string) => void a.delete(k),
      list: async ({ prefix = '' } = {}) => ({ blobs: [...a.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    };
  },
}));
vi.stubGlobal('fetch', async () => new Response('{}'));
Object.assign(process.env, { URL: 'https://www.fgitalia.it', ADMIN_PASSWORD: 'una-password-lunga' });

describe('versione Netlify (finché il dominio non passa a Cloudflare)', () => {
  it('le funzioni usano gli archivi Netlify Blobs di prima, con gli stessi nomi', async () => {
    // un messaggio salvato prima del trasloco, nell'archivio "messaggi"
    archivi.set('messaggi', new Map([['20261119203000-aaaaaaaa', JSON.stringify({ id: '20261119203000-aaaaaaaa', nome: 'Anna', letto: false, archiviato: false })]]));
    const { default: gestione } = await import('../server/netlify/gestione-ordini.mts');
    const chiedi = (corpo: unknown, gettone = '') =>
      gestione(new Request('https://x/api/gestione-ordini', { method: 'POST', body: JSON.stringify(corpo), headers: { authorization: `Bearer ${gettone}` } }), {
        ip: '1.1.1.1',
      });
    const { gettone } = await (await chiedi({ azione: 'accedi', password: 'una-password-lunga' })).json();
    expect(gettone).toBeTruthy();
    const messaggi = await (await chiedi({ azione: 'messaggi-elenco' }, gettone)).json();
    expect(messaggi.map((m: { nome: string }) => m.nome)).toEqual(['Anna']);
    // i contatori anti-tentativi finiscono nell'archivio "limiti", come prima
    await chiedi({ azione: 'accedi', password: 'sbagliata' });
    expect(archivi.get('limiti')?.size).toBeGreaterThan(0);
  });
});
