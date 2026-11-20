import type { Catalogo } from '../../src/lib/negozio';
import { richiestaAlSito } from './ambiente';
import type { Schede } from './clienti';

/** Legge un file JSON pubblicato dal sito stesso (sul worker direttamente dai file, senza passare da internet) */
async function leggiDalSito<T>(percorso: string, _richiesta?: Request): Promise<T> {
  const risposta = await richiestaAlSito(percorso, { headers: { 'Cache-Control': 'no-cache' } });
  if (!risposta.ok) throw new Error(`${percorso} non disponibile (${risposta.status})`);
  return (await risposta.json()) as T;
}

/** Prezzi e disponibilità dalla versione pubblicata del sito */
export const leggiCatalogo = (richiesta?: Request) => leggiDalSito<Catalogo>('/api/catalogo.json', richiesta);

/** Documenti, consumabili e intervalli di manutenzione dei prodotti, per l'area clienti */
export const leggiSchede = (richiesta?: Request) => leggiDalSito<Schede>('/api/area-clienti.json', richiesta);
