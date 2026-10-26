import type { Catalogo } from '../../src/lib/negozio';
import { urlSito } from './ambiente';

/** Legge prezzi e disponibilità dalla versione pubblicata del sito */
export async function leggiCatalogo(): Promise<Catalogo> {
  const risposta = await fetch(`${urlSito()}/api/catalogo.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!risposta.ok) throw new Error(`Catalogo non disponibile (${risposta.status})`);
  return (await risposta.json()) as Catalogo;
}
