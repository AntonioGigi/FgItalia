/** Dati del token di Google: arriva direttamente da Google su HTTPS, quindi basta controllarne i campi */
export interface DatiGoogle {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export function controllaDatiGoogle(d: DatiGoogle, clientId: string, adesso = Date.now()): string | null {
  if (d.iss !== 'https://accounts.google.com' && d.iss !== 'accounts.google.com') return 'emittente';
  if (d.aud !== clientId) return 'destinatario';
  if (!d.exp || d.exp * 1000 < adesso) return 'scaduto';
  if (!d.sub || !d.email || d.email_verified !== true) return 'email';
  return null;
}
