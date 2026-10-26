/**
 * Carrello nel browser: resta salvato sul dispositivo del cliente (localStorage).
 * Contiene solo codici prodotto e quantità; prezzi e disponibilità si leggono dal catalogo.
 */
import { QUANTITA_MASSIMA, type Catalogo, type RigaCarrello } from './negozio';

const CHIAVE = 'fgitalia-carrello';
export const EVENTO = 'carrello-aggiornato';

export function leggiCarrello(): RigaCarrello[] {
  try {
    const dati = JSON.parse(localStorage.getItem(CHIAVE) ?? '[]');
    return Array.isArray(dati) ? dati.filter((r) => r && typeof r.id === 'string' && r.quantita > 0) : [];
  } catch {
    return [];
  }
}

function salva(righe: RigaCarrello[]) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(righe));
  } catch {
    /* navigazione privata: il carrello vale solo per questa pagina */
  }
  window.dispatchEvent(new CustomEvent(EVENTO));
}

export function impostaQuantita(id: string, quantita: number) {
  const q = Math.max(0, Math.min(QUANTITA_MASSIMA, Math.floor(quantita)));
  const righe = leggiCarrello().filter((r) => r.id !== id);
  const indice = leggiCarrello().findIndex((r) => r.id === id);
  if (q > 0) righe.splice(indice === -1 ? righe.length : indice, 0, { id, quantita: q });
  salva(righe);
}

export function aggiungi(id: string, quantita = 1) {
  const attuale = leggiCarrello().find((r) => r.id === id)?.quantita ?? 0;
  impostaQuantita(id, attuale + quantita);
}

export const svuotaCarrello = () => salva([]);

export const pezziNelCarrello = () => leggiCarrello().reduce((s, r) => s + r.quantita, 0);

let catalogo: Promise<Catalogo> | undefined;
export function caricaCatalogo(): Promise<Catalogo> {
  catalogo ??= fetch('/api/catalogo.json').then((r) => {
    if (!r.ok) throw new Error('catalogo');
    return r.json();
  });
  return catalogo;
}
