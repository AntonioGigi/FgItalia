/**
 * Archivio dei dati del negozio (ordini, clienti, preventivi, messaggi…) su Cloudflare R2.
 * Ogni "archivio" è una cartella del bucket: <nome>/<chiave>. R2 è a consistenza forte:
 * quello che si scrive si rilegge subito, anche da un'altra richiesta.
 */

/** Il minimo di R2 che usiamo (i tipi completi sono in @cloudflare/workers-types) */
interface OggettoR2 {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface BucketR2 {
  get(chiave: string): Promise<OggettoR2 | null>;
  put(chiave: string, valore: string | ArrayBuffer | ArrayBufferView, opzioni?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(chiave: string): Promise<void>;
  list(opzioni: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

let bucket: BucketR2 | undefined;
/** Lo imposta il worker a ogni richiesta (binding DATI in wrangler.jsonc) */
export const impostaArchivio = (b: BucketR2) => void (bucket = b);

function r2(): BucketR2 {
  if (!bucket) throw new Error('Archivio dati non collegato (binding R2 "DATI" mancante)');
  return bucket;
}

type Tipo = 'text' | 'json' | 'arrayBuffer';

export function getStore({ name }: { name: string; consistency?: 'strong' }) {
  const percorso = (chiave: string) => `${name}/${chiave}`;
  async function get(chiave: string): Promise<string | null>;
  async function get(chiave: string, opzioni: { type: 'text' }): Promise<string | null>;
  async function get(chiave: string, opzioni: { type: 'json' }): Promise<any>;
  async function get(chiave: string, opzioni: { type: 'arrayBuffer' }): Promise<ArrayBuffer | null>;
  async function get(chiave: string, opzioni?: { type?: Tipo }): Promise<unknown> {
    const oggetto = await r2().get(percorso(chiave));
    if (!oggetto) return null;
    if (opzioni?.type === 'arrayBuffer') return oggetto.arrayBuffer();
    const testo = await oggetto.text();
    return opzioni?.type === 'json' ? JSON.parse(testo) : testo;
  }
  return {
    get,
    set: async (chiave: string, valore: string | ArrayBuffer) => void (await r2().put(percorso(chiave), valore)),
    setJSON: async (chiave: string, valore: unknown) =>
      void (await r2().put(percorso(chiave), JSON.stringify(valore), { httpMetadata: { contentType: 'application/json' } })),
    delete: (chiave: string) => r2().delete(percorso(chiave)),
    /** Tutte le chiavi dell'archivio (R2 ne restituisce al massimo 1000 per volta) */
    async list() {
      const blobs: { key: string }[] = [];
      let cursor: string | undefined;
      do {
        const pagina = await r2().list({ prefix: `${name}/`, cursor, limit: 1000 });
        for (const o of pagina.objects) blobs.push({ key: o.key.slice(name.length + 1) });
        cursor = pagina.truncated ? pagina.cursor : undefined;
      } while (cursor);
      return { blobs };
    },
  };
}
