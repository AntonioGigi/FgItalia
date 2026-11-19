import { getCollection, type CollectionEntry } from 'astro:content';
import type { Prodotto } from './catalogo';

export type Promozione = CollectionEntry<'promozioni'>;

export interface Sconto {
  /** percentuale, es. 10 */
  percentuale: number;
  /** prezzo di listino IVA esclusa */
  listino: number;
  /** prezzo scontato IVA esclusa, arrotondato al centesimo */
  prezzo: number;
  promozione: Promozione;
}

/** Data di oggi in Italia (AAAA-MM-GG): conta il calendario italiano, non quello UTC del server */
export const giornoItaliano = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
const giorno = (d: Date) => d.toISOString().slice(0, 10);

/** Promozione valida oggi (dal/al compresi): il sito si ripubblica ogni notte, così inizio e fine scattano da soli */
export function promozioneAttiva(p: Promozione['data'], adesso = new Date()): boolean {
  const oggi = giornoItaliano(adesso);
  return p.pubblicato && giorno(p.dal) <= oggi && (!p.al || giorno(p.al) >= oggi);
}

let cache: Promise<Promozione[]> | undefined;
export function promozioniAttive(): Promise<Promozione[]> {
  cache ??= getCollection('promozioni', ({ data }) => promozioneAttiva(data)).then((elenco) =>
    elenco.sort((a, b) => b.data.sconto - a.data.sconto),
  );
  return cache;
}

export function siApplica(p: Promozione['data'], prodotto: Pick<Prodotto, 'id'> & { data: Pick<Prodotto['data'], 'categoria'> }): boolean {
  if (p.applica_a === 'tutti') return true;
  if (p.applica_a === 'categorie') return p.categorie.some((c) => c.id === prodotto.data.categoria.id);
  return p.prodotti.some((x) => x.id === prodotto.id);
}

export const arrotonda = (euro: number) => Math.round(euro * 100) / 100;

/** Lo sconto più alto fra le promozioni attive che valgono per il prodotto (se ha un prezzo) */
export function scontoDa(promozioni: Promozione[], prodotto: Prodotto): Sconto | undefined {
  const listino = prodotto.data.prezzo;
  if (!listino) return undefined;
  const migliore = promozioni.filter((p) => siApplica(p.data, prodotto)).sort((a, b) => b.data.sconto - a.data.sconto)[0];
  if (!migliore) return undefined;
  return { percentuale: migliore.data.sconto, listino, prezzo: arrotonda(listino * (1 - migliore.data.sconto / 100)), promozione: migliore };
}

export async function scontoPer(prodotto: Prodotto): Promise<Sconto | undefined> {
  return scontoDa(await promozioniAttive(), prodotto);
}

/** Prezzo da far pagare (IVA esclusa): scontato se c'è una promozione */
export async function prezzoEffettivo(prodotto: Prodotto): Promise<number | undefined> {
  return (await scontoPer(prodotto))?.prezzo ?? prodotto.data.prezzo;
}
