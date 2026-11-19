import { describe, expect, it, vi } from 'vitest';

vi.mock('astro:content', () => ({ getCollection: async () => [] }));
const { promozioneAttiva, scontoDa, giornoItaliano } = await import('../src/lib/promozioni');
const { calcolaTotali } = await import('../src/lib/negozio');

const promo = (dati: Record<string, unknown>, id = 'p') =>
  ({
    id,
    data: {
      titolo: 'Promo',
      sconto: 10,
      applica_a: 'tutti',
      categorie: [],
      prodotti: [],
      dal: new Date('2026-11-20'),
      al: new Date('2026-11-30'),
      banner: true,
      avvisa_iscritti: false,
      pubblicato: true,
      ...dati,
    },
  }) as any;
const prodotto = (id: string, prezzo: number | undefined, categoria = 'creme') => ({ id, data: { prezzo, categoria: { id: categoria } } }) as any;

describe('promozioni', () => {
  it('valgono dal primo all’ultimo giorno compresi, secondo il calendario italiano', () => {
    const { data } = promo({});
    expect(promozioneAttiva(data, new Date('2026-11-19T22:30:00Z'))).toBe(false); // 23:30 in Italia
    expect(promozioneAttiva(data, new Date('2026-11-19T23:05:00Z'))).toBe(true); // 00:05 del 20 in Italia
    expect(promozioneAttiva(data, new Date('2026-11-30T21:00:00Z'))).toBe(true);
    expect(promozioneAttiva(data, new Date('2026-11-30T23:30:00Z'))).toBe(false); // già 1 dicembre
    expect(promozioneAttiva({ ...data, al: undefined }, new Date('2027-06-01T10:00:00Z'))).toBe(true);
    expect(promozioneAttiva({ ...data, pubblicato: false }, new Date('2026-11-25T10:00:00Z'))).toBe(false);
    expect(giornoItaliano(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  });

  it('applica lo sconto migliore solo ai prodotti giusti e con prezzo', () => {
    const tutti = promo({ sconto: 10 }, 'tutti');
    const creme = promo({ sconto: 20, applica_a: 'categorie', categorie: [{ id: 'creme' }] }, 'creme');
    const uno = promo({ sconto: 15, applica_a: 'prodotti', prodotti: [{ id: 'laser' }] }, 'uno');
    expect(scontoDa([tutti, creme, uno], prodotto('crema', 12.35))).toMatchObject({ percentuale: 20, listino: 12.35, prezzo: 9.88 });
    expect(scontoDa([tutti, creme, uno], prodotto('laser', 1000, 'apparecchi'))).toMatchObject({ percentuale: 15, prezzo: 850 });
    expect(scontoDa([creme], prodotto('laser', 1000, 'apparecchi'))).toBeUndefined();
    expect(scontoDa([tutti], prodotto('su-richiesta', undefined))).toBeUndefined();
  });

  it('il carrello mostra prezzo pieno e scontato', () => {
    const t = calcolaTotali([{ id: 'crema', quantita: 2 }], {
      negozioAttivo: true,
      spedizione: { costo: 0, gratisDa: 0 },
      prodotti: { crema: { titolo: 'Crema', prezzo: 9, prezzoListino: 10, sconto: 10, disponibilita: 'disponibile' } },
    } as any);
    expect(t.righe[0]).toMatchObject({ unitarioCent: 1098, listinoCent: 1220, sconto: 10, totaleCent: 2196 });
  });
});
