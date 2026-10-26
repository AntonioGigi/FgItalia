/**
 * Conti del negozio, usati sia dal carrello nel browser sia dalle funzioni che
 * creano il pagamento: così il cliente vede esattamente l'importo che pagherà.
 * Tutti gli importi sono in centesimi per evitare errori di arrotondamento.
 */

export const ALIQUOTA_IVA = 0.22;
export const QUANTITA_MASSIMA = 99;

export interface RigaCarrello {
  id: string;
  quantita: number;
}

export interface ProdottoVendibile {
  titolo: string;
  /** euro, IVA esclusa */
  prezzo?: number;
  disponibilita: 'disponibile' | 'su_ordinazione' | 'esaurito';
  immagine?: string;
}

export interface RegoleSpedizione {
  /** euro, IVA inclusa */
  costo: number;
  /** soglia in euro sull'imponibile (IVA esclusa) oltre la quale la spedizione è gratuita; 0 = mai gratis */
  gratisDa: number;
}

export interface Catalogo {
  negozioAttivo: boolean;
  spedizione: RegoleSpedizione;
  prodotti: Record<string, ProdottoVendibile>;
}

export interface RigaCalcolata {
  id: string;
  titolo: string;
  quantita: number;
  immagine?: string;
  /** prezzo unitario IVA inclusa, in centesimi */
  unitarioCent: number;
  totaleCent: number;
}

export interface Totali {
  righe: RigaCalcolata[];
  imponibileCent: number;
  prodottiCent: number;
  spedizioneCent: number;
  totaleCent: number;
  ivaCent: number;
  /** quanto manca all'imponibile per la spedizione gratuita (0 se già gratis o se non prevista) */
  mancaPerGratisCent: number;
}

export const centesimi = (euro: number) => Math.round(euro * 100);

export function prezzoIvatoCent(nettoEuro: number): number {
  return Math.round(nettoEuro * (1 + ALIQUOTA_IVA) * 100);
}

export function acquistabile(p: ProdottoVendibile | undefined): p is ProdottoVendibile & { prezzo: number } {
  return !!p && typeof p.prezzo === 'number' && p.prezzo > 0 && p.disponibilita !== 'esaurito';
}

/** Tiene solo le righe valide: prodotto esistente e acquistabile, quantità intera fra 1 e il massimo */
export function normalizzaCarrello(righe: unknown, catalogo: Catalogo): RigaCarrello[] {
  if (!Array.isArray(righe)) return [];
  const unite = new Map<string, number>();
  for (const r of righe) {
    if (!r || typeof r !== 'object') continue;
    const { id, quantita } = r as Record<string, unknown>;
    if (typeof id !== 'string' || !acquistabile(catalogo.prodotti[id])) continue;
    const q = Math.floor(Number(quantita));
    if (!Number.isFinite(q) || q < 1) continue;
    unite.set(id, Math.min(QUANTITA_MASSIMA, (unite.get(id) ?? 0) + q));
  }
  return [...unite].map(([id, quantita]) => ({ id, quantita }));
}

export function calcolaTotali(carrello: RigaCarrello[], catalogo: Catalogo): Totali {
  const righe: RigaCalcolata[] = [];
  let imponibileCent = 0;
  for (const { id, quantita } of normalizzaCarrello(carrello, catalogo)) {
    const p = catalogo.prodotti[id] as ProdottoVendibile & { prezzo: number };
    const unitarioCent = prezzoIvatoCent(p.prezzo);
    righe.push({ id, titolo: p.titolo, quantita, immagine: p.immagine, unitarioCent, totaleCent: unitarioCent * quantita });
    imponibileCent += centesimi(p.prezzo) * quantita;
  }
  const prodottiCent = righe.reduce((s, r) => s + r.totaleCent, 0);
  const sogliaCent = centesimi(catalogo.spedizione.gratisDa);
  const gratis = sogliaCent > 0 && imponibileCent >= sogliaCent;
  const spedizioneCent = righe.length === 0 || gratis ? 0 : centesimi(catalogo.spedizione.costo);
  const totaleCent = prodottiCent + spedizioneCent;
  return {
    righe,
    imponibileCent,
    prodottiCent,
    spedizioneCent,
    totaleCent,
    ivaCent: totaleCent - Math.round(totaleCent / (1 + ALIQUOTA_IVA)),
    mancaPerGratisCent: righe.length && sogliaCent > 0 && !gratis ? sogliaCent - imponibileCent : 0,
  };
}

const formatoEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

export const euro = (cent: number) => formatoEuro.format(cent / 100);
