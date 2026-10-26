import type { Catalogo } from '../../src/lib/negozio';
import { urlSito } from './ambiente';
import type { Schede } from './clienti';

/** Legge prezzi e disponibilità dalla versione pubblicata del sito */
export async function leggiCatalogo(): Promise<Catalogo> {
  const risposta = await fetch(`${urlSito()}/api/catalogo.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!risposta.ok) throw new Error(`Catalogo non disponibile (${risposta.status})`);
  return (await risposta.json()) as Catalogo;
}

/** Documenti, consumabili e intervalli di manutenzione dei prodotti, per l'area clienti */
export async function leggiSchede(): Promise<Schede> {
  const risposta = await fetch(`${urlSito()}/api/area-clienti.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!risposta.ok) throw new Error(`Schede prodotto non disponibili (${risposta.status})`);
  return (await risposta.json()) as Schede;
}
