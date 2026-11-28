import { describe, expect, it } from 'vitest';
import { CORRENTI, FASI, ZONE, durataSeduta, frequenzeCanale, inErogazione, limita, modalita, profondita, programmaEsempio, tempo } from '../src/lib/back4';

const canale = (attivo: boolean, modalita: string, intensita: number, durata: number, extra = {}) => ({ attivo, modalita, intensita, durata, ...extra });

describe('simulatore BACK4', () => {
  it('ha le frequenze della scheda tecnica', () => {
    const frequenze = new Set(CORRENTI.flatMap((c) => [...c.modalita.flatMap((m) => m.frequenze), ...(c.frequenzeScelta ?? [])]));
    for (const f of ['300 kHz', '500 kHz', '1000 kHz', '2 Hz', '5 Hz', '25 Hz', '1500 Hz', '4000 Hz']) expect(frequenze).toContain(f);
    expect(modalita('cet', 'deep').frequenze).toEqual(['300 kHz']);
    expect(modalita('mix', 'qualsiasi').id).toBe('pulse');
    expect(frequenzeCanale('tens', canale(true, 'static', 40, 60, { frequenza: '5 Hz' }))).toEqual(['5 Hz']);
    expect(frequenzeCanale('mix', canale(true, 'pulse', 40, 60, { frequenza: '25 Hz' }))).toEqual(['1000 kHz', '25 Hz']);
  });

  it('potenza e tempi restano nei limiti', () => {
    expect(limita(140, 0, 100)).toBe(100);
    expect(limita(-3, 0, 100)).toBe(0);
    expect(tempo(150)).toBe('02:30');
  });

  it('due vie indipendenti: TECAR in sequenza su una, stimolazioni sull’altra', () => {
    const canali = {
      cet: canale(true, 'soft', 80, 150),
      ret: canale(true, 'deep', 50, 150),
      tens: canale(true, 'static', 40, 150),
      ems: canale(false, 'radial', 0, 600),
    };
    expect(durataSeduta(canali)).toBe(300);
    expect(inErogazione(canali, 10)).toMatchObject({ via1: 'cet', via2: 'tens' });
    const dopo = inErogazione(canali, 200);
    expect(dopo.via1).toBe('ret');
    expect(dopo.via2).toBeUndefined();
    expect(dopo.restanti.ret).toBe(100);
  });

  it('la profondità d’azione segue correnti e potenza', () => {
    const p = profondita({ ret: canale(true, 'deep', 80, 60), tens: canale(true, 'static', 40, 60) });
    expect(p.duri.livello).toBe(0.8);
    expect(p.nervi.livello).toBe(0.4);
    expect(p.molli.livello).toBe(0);
  });

  it('ogni zona e fase dà un programma di esempio valido', () => {
    for (const z of ZONE)
      for (const f of FASI) {
        const attivi = Object.values(programmaEsempio(z.id, f.id)).filter((c) => c.attivo);
        expect(attivi.length).toBeGreaterThan(0);
        for (const c of attivi) expect(c.intensita).toBeGreaterThan(0);
      }
  });
});
