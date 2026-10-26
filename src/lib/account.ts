/**
 * Area clienti nel browser: chiamate a /api/account e piccoli segni salvati sul dispositivo.
 * La sessione vera è un cookie HttpOnly che il browser non può leggere; qui teniamo solo
 * il nome, per mostrare nell'intestazione che il cliente ha già fatto l'accesso.
 */

/** Professioni fra cui scegliere alla registrazione (le usa anche il server) */
export const PROFESSIONI = [
  'Fisioterapista',
  'Medico',
  'Osteopata',
  'Massofisioterapista',
  'Chinesiologo / Laureato in scienze motorie',
  'Podologo',
  'Studio o centro di riabilitazione',
  'Rivenditore',
  'Altro operatore sanitario',
];

const CHIAVE_NOME = 'fgitalia-cliente';
const CHIAVE_PRO = 'fgitalia-professionista';

export class ErroreAccount extends Error {
  constructor(
    messaggio: string,
    public stato: number,
  ) {
    super(messaggio);
  }
}

export async function api<T = any>(azione: string, dati: Record<string, unknown> = {}): Promise<T> {
  const risposta = await fetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ azione, ...dati }),
  });
  const corpo = await risposta.json().catch(() => ({}));
  if (risposta.status === 401) segnaUscita();
  if (!risposta.ok) throw new ErroreAccount(corpo.errore ?? 'Qualcosa non ha funzionato: riprova fra poco.', risposta.status);
  return corpo as T;
}

function scrivi(chiave: string, valore: string | null) {
  try {
    if (valore === null) localStorage.removeItem(chiave);
    else localStorage.setItem(chiave, valore);
  } catch {
    /* navigazione privata */
  }
}

/** Dopo l'accesso: chi ha un account ha già dichiarato di essere un professionista */
export function segnaAccesso(nome: string) {
  scrivi(CHIAVE_NOME, nome);
  scrivi(CHIAVE_PRO, 'si');
}

export const segnaUscita = () => scrivi(CHIAVE_NOME, null);

export const escape = (t: unknown) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const linkDocumento = (tipo: 'fattura' | 'riepilogo' | 'preventivo', numero: string) =>
  `/api/account/documento?tipo=${tipo}&n=${encodeURIComponent(numero)}`;
