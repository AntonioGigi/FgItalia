import { describe, expect, it } from 'vitest';
import { calcolaTotali, normalizzaCarrello, prezzoIvatoCent, type Catalogo } from '../src/lib/negozio';

const catalogo: Catalogo = {
  negozioAttivo: true,
  spedizione: { costo: 9.9, gratisDa: 150 },
  prodotti: {
    crema: { titolo: 'Crema', prezzo: 12.3, disponibilita: 'disponibile' },
    laser: { titolo: 'Laser', prezzo: 1631.15, disponibilita: 'su_ordinazione' },
    esaurito: { titolo: 'Esaurito', prezzo: 10, disponibilita: 'esaurito' },
    richiesta: { titolo: 'Su richiesta', disponibilita: 'disponibile' },
  },
};

describe('prezzi IVA inclusa', () => {
  it('ricostruisce i prezzi tondi del vecchio negozio', () => {
    expect(prezzoIvatoCent(12.3)).toBe(1501);
    expect(prezzoIvatoCent(1631.15)).toBe(199000);
    expect(prezzoIvatoCent(351.64)).toBe(42900);
  });
});

describe('normalizzaCarrello', () => {
  it('scarta prodotti inesistenti, esauriti, senza prezzo e quantità non valide', () => {
    const righe = normalizzaCarrello(
      [
        { id: 'crema', quantita: 2 },
        { id: 'esaurito', quantita: 1 },
        { id: 'richiesta', quantita: 1 },
        { id: 'inventato', quantita: 1 },
        { id: 'laser', quantita: 0 },
        { id: 'crema', quantita: '1' },
        { id: 'laser', quantita: -3 },
        'spazzatura',
      ],
      catalogo,
    );
    expect(righe).toEqual([{ id: 'crema', quantita: 3 }]);
  });

  it('limita la quantità massima', () => {
    expect(normalizzaCarrello([{ id: 'crema', quantita: 5000 }], catalogo)).toEqual([{ id: 'crema', quantita: 99 }]);
  });

  it('accetta solo array', () => {
    expect(normalizzaCarrello({ id: 'crema' }, catalogo)).toEqual([]);
  });
});

describe('calcolaTotali', () => {
  it('aggiunge la spedizione sotto la soglia', () => {
    const t = calcolaTotali([{ id: 'crema', quantita: 2 }], catalogo);
    expect(t.prodottiCent).toBe(3002);
    expect(t.spedizioneCent).toBe(990);
    expect(t.totaleCent).toBe(3992);
    expect(t.mancaPerGratisCent).toBe(15000 - 2460);
  });

  it('spedizione gratuita sopra la soglia di imponibile', () => {
    const t = calcolaTotali([{ id: 'laser', quantita: 1 }], catalogo);
    expect(t.spedizioneCent).toBe(0);
    expect(t.totaleCent).toBe(199000);
    expect(t.mancaPerGratisCent).toBe(0);
    expect(t.ivaCent).toBe(199000 - Math.round(199000 / 1.22));
  });

  it('carrello vuoto: nessuna spedizione', () => {
    const t = calcolaTotali([], catalogo);
    expect(t.totaleCent).toBe(0);
    expect(t.spedizioneCent).toBe(0);
  });

  it('soglia zero: spedizione sempre a pagamento', () => {
    const t = calcolaTotali([{ id: 'laser', quantita: 1 }], { ...catalogo, spedizione: { costo: 5, gratisDa: 0 } });
    expect(t.spedizioneCent).toBe(500);
  });
});
