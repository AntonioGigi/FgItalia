import type { Catalogo } from '../../src/lib/negozio';
import { urlSito } from './ambiente';
import type { Schede } from './clienti';

/**
 * Legge un file JSON pubblicato dal sito stesso. Se c'è la richiesta del cliente si usa il suo
 * indirizzo e si inoltrano cookie e credenziali: così funziona anche con il sito protetto da
 * password, sulle anteprime e prima che il dominio principale punti a Netlify.
 */
async function leggiDalSito<T>(percorso: string, richiesta?: Request): Promise<T> {
  const base = richiesta ? new URL(richiesta.url).origin : urlSito();
  const intestazioni: Record<string, string> = { 'Cache-Control': 'no-cache' };
  for (const nome of ['cookie', 'authorization']) {
    const valore = richiesta?.headers.get(nome);
    if (valore) intestazioni[nome] = valore;
  }
  const risposta = await fetch(`${base}${percorso}`, { headers: intestazioni });
  if (!risposta.ok) throw new Error(`${percorso} non disponibile (${risposta.status})`);
  return (await risposta.json()) as T;
}

/** Prezzi e disponibilità dalla versione pubblicata del sito */
export const leggiCatalogo = (richiesta?: Request) => leggiDalSito<Catalogo>('/api/catalogo.json', richiesta);

/** Documenti, consumabili e intervalli di manutenzione dei prodotti, per l'area clienti */
export const leggiSchede = (richiesta?: Request) => leggiDalSito<Schede>('/api/area-clienti.json', richiesta);
