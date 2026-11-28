import { describe, expect, it } from 'vitest';
import { CORRENTI, durataSeduta, limita, modalita, profondita, programmaEsempio, tempo, ZONE, FASI } from '../src/lib/back4';

describe('simulatore BACK4', () => {
  it('ha le frequenze della scheda tecnica', () => {
    const frequenze = new Set(CORRENTI.flatMap((c) => c.modalita.flatMap((m) => m.frequenze)));
    for (const f of ['300 kHz', '500 kHz', '1000 kHz', '2 Hz', '5 Hz', '25 Hz', '1500 Hz', '4000 Hz']) expect(frequenze).toContain(f);
    expect(modalita('cet', 'deep').frequenze).toEqual(['300 kHz']);
    expect(modalita('mix', 'qualsiasi').id).toBe('pulse');
  });

  it('potenza e tempi restano nei limiti', () => {
    expect(limita(140, 0, 100)).toBe(100);
    expect(limita(-3, 0, 100)).toBe(0);
    expect(tempo(225)).toBe('03:45');
    expect(durataSeduta({ cet: { attivo: true, modalita: 'deep', intensita: 50, durata: 240 }, ret: { attivo: false, modalita: 'med', intensita: 0, durata: 600 } })).toBe(240);
  });

  it('la profondità d’azione segue correnti e potenza', () => {
    const p = profondita({ ret: { attivo: true, modalita: 'focal', intensita: 80, durata: 60 }, tens: { attivo: true, modalita: 'chronic', intensita: 40, durata: 60 } });
    expect(p.duri.livello).toBe(0.8);
    expect(p.nervi.livello).toBe(0.4);
    expect(p.cute.livello).toBe(0);
  });

  it('ogni zona e fase dà un programma di esempio valido', () => {
    for (const z of ZONE)
      for (const f of FASI) {
        const prog = programmaEsempio(z.id, f.id);
        const attivi = Object.values(prog).filter((c) => c?.attivo);
        expect(attivi.length).toBeGreaterThan(0);
        for (const c of attivi) {
          expect(c!.intensita).toBeGreaterThan(0);
          expect(c!.intensita).toBeLessThanOrEqual(100);
          expect(c!.durata).toBeGreaterThan(0);
        }
      }
  });
});
