import { getStore } from '@netlify/blobs';
import { impostaArchivio, type BucketR2 } from './archivio';

/**
 * Su Netlify l'archivio dati usa Netlify Blobs, con gli stessi archivi di prima
 * ("ordini", "clienti"…): la chiave "ordini/FG-123" diventa la chiave "FG-123" dell'archivio "ordini".
 * Serve solo finché il dominio non passa a Cloudflare.
 */
const dividi = (percorso: string) => {
  const i = percorso.indexOf('/');
  return { archivio: getStore({ name: percorso.slice(0, i), consistency: 'strong' }), chiave: percorso.slice(i + 1) };
};

const blobs: BucketR2 = {
  async get(percorso) {
    const { archivio, chiave } = dividi(percorso);
    const dati = await archivio.get(chiave, { type: 'arrayBuffer' });
    if (!dati) return null;
    return { text: async () => new TextDecoder().decode(dati), arrayBuffer: async () => dati };
  },
  async put(percorso, valore) {
    const { archivio, chiave } = dividi(percorso);
    if (typeof valore === 'string') return archivio.set(chiave, valore);
    const byte = valore instanceof ArrayBuffer ? valore : valore.buffer.slice(valore.byteOffset, valore.byteOffset + valore.byteLength);
    return archivio.set(chiave, byte as ArrayBuffer);
  },
  async delete(percorso) {
    const { archivio, chiave } = dividi(percorso);
    await archivio.delete(chiave);
  },
  async list({ prefix }) {
    const { archivio, chiave } = dividi(prefix);
    const { blobs: elenco } = await archivio.list({ prefix: chiave || undefined });
    const nome = prefix.slice(0, prefix.indexOf('/'));
    return { objects: elenco.map((b) => ({ key: `${nome}/${b.key}` })), truncated: false };
  },
};

export const preparaNetlify = () => impostaArchivio(blobs);
