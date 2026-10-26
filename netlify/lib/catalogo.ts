import type { Catalogo } from '../../src/lib/negozio';
import { urlSito } from './ambiente';
import type { Schede } from './clienti';

/**
 * Legge prezzi e disponibilità dalla versione pubblicata del sito.
 * `base` è l'indirizzo da cui arriva la richiesta: così funziona anche quando il dominio
 * principale non punta ancora a Netlify o si prova un'anteprima.
 */
export async function leggiCatalogo(base = urlSito()): Promise<Catalogo> {
  const risposta = await fetch(`${base}/api/catalogo.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!risposta.ok) throw new Error(`Catalogo non disponibile (${risposta.status})`);
  return (await risposta.json()) as Catalogo;
}

/** Documenti, consumabili e intervalli di manutenzione dei prodotti, per l'area clienti */
export async function leggiSchede(base = urlSito()): Promise<Schede> {
  const risposta = await fetch(`${base}/api/area-clienti.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!risposta.ok) throw new Error(`Schede prodotto non disponibili (${risposta.status})`);
  return (await risposta.json()) as Schede;
}
