import { getCollection, type CollectionEntry } from 'astro:content';

export type Prodotto = CollectionEntry<'prodotti'>;

/** Prodotti visibili, ordinati per categoria, sottocategoria e nome */
export async function prodottiPubblicati(): Promise<Prodotto[]> {
  const tutti = await getCollection('prodotti', ({ data }) => data.pubblicato);
  const ordine = new Map((await getCollection('categorie')).map((c) => [c.id, c.data.ordine]));
  return tutti.sort(
    (a, b) =>
      (ordine.get(a.data.categoria.id) ?? 99) - (ordine.get(b.data.categoria.id) ?? 99) ||
      (a.data.sottocategoria ?? '').localeCompare(b.data.sottocategoria ?? '', 'it') ||
      a.data.titolo.localeCompare(b.data.titolo, 'it', { numeric: true }),
  );
}

export async function categorieOrdinate() {
  const categorie = await getCollection('categorie');
  return categorie.sort((a, b) => a.data.ordine - b.data.ordine);
}

export async function marchiOrdinati() {
  const marchi = await getCollection('marchi');
  return marchi.sort((a, b) => a.data.nome.localeCompare(b.data.nome, 'it'));
}

/** Raggruppa i prodotti per sottocategoria, mantenendo l'ordine di apparizione */
export function perSottocategoria(prodotti: Prodotto[]): [string, Prodotto[]][] {
  const gruppi = new Map<string, Prodotto[]>();
  for (const p of prodotti) {
    const chiave = p.data.sottocategoria ?? 'Altro';
    gruppi.set(chiave, [...(gruppi.get(chiave) ?? []), p]);
  }
  return [...gruppi.entries()].sort(([a], [b]) => (a === 'Altro' ? 1 : b === 'Altro' ? -1 : a.localeCompare(b, 'it')));
}

export async function corsiPubblicati() {
  const tutti = await getCollection('corsi', ({ data }) => data.pubblicato);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const prossimi = tutti.filter((c) => c.data.data >= oggi).sort((a, b) => a.data.data.getTime() - b.data.data.getTime());
  const passati = tutti.filter((c) => c.data.data < oggi).sort((a, b) => b.data.data.getTime() - a.data.data.getTime());
  return { prossimi, passati };
}

export async function novitaPubblicate() {
  const tutte = await getCollection('novita', ({ data }) => data.pubblicato);
  return tutte.sort((a, b) => b.data.data.getTime() - a.data.data.getTime());
}
