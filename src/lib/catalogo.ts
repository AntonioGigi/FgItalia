import { getCollection, type CollectionEntry } from 'astro:content';

export type Prodotto = CollectionEntry<'prodotti'>;

export async function prodottiPubblicati(): Promise<Prodotto[]> {
  const tutti = await getCollection('prodotti', ({ data }) => data.pubblicato);
  return tutti.sort((a, b) => a.data.titolo.localeCompare(b.data.titolo, 'it'));
}

export async function categorieOrdinate() {
  const categorie = await getCollection('categorie');
  return categorie.sort((a, b) => a.data.ordine - b.data.ordine);
}

export async function marchiOrdinati() {
  const marchi = await getCollection('marchi');
  return marchi.sort((a, b) => a.data.nome.localeCompare(b.data.nome, 'it'));
}

export async function novitaPubblicate() {
  const tutte = await getCollection('novita', ({ data }) => data.pubblicato);
  return tutte.sort((a, b) => b.data.data.getTime() - a.data.data.getTime());
}
