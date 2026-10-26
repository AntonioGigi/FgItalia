import impostazioni from '../data/impostazioni.json';

export const sito = impostazioni;

export const anniAttivita = new Date().getFullYear() - sito.anno_fondazione;

export const indirizzoCompleto = `${sito.indirizzo}, ${sito.cap} ${sito.citta} (${sito.provincia})`;

/** Numero di telefono pulito per i link tel: e wa.me */
export function soloCifre(numero: string): string {
  return numero.replace(/[^\d+]/g, '');
}

export function linkWhatsApp(messaggio = ''): string | undefined {
  if (!sito.whatsapp) return undefined;
  let numero = soloCifre(sito.whatsapp).replace(/^\+/, '');
  if (!numero.startsWith('39') && numero.length <= 10) numero = `39${numero}`;
  const testo = messaggio ? `?text=${encodeURIComponent(messaggio)}` : '';
  return `https://wa.me/${numero}${testo}`;
}

export function linkMappa(): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sito.ragione_sociale} ${indirizzoCompleto}`)}`;
}

/** Restituisce l'handle Instagram (senza @) da un URL o da un nome utente */
export function handleInstagram(): string | undefined {
  if (!sito.instagram) return undefined;
  const m = sito.instagram.match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : sito.instagram).replace(/^@/, '');
}

export function urlInstagram(): string | undefined {
  const handle = handleInstagram();
  return handle ? `https://www.instagram.com/${handle}/` : undefined;
}

export function urlFacebook(): string | undefined {
  if (!sito.facebook) return undefined;
  return /^https?:\/\//.test(sito.facebook) ? sito.facebook : `https://www.facebook.com/${sito.facebook}`;
}

export const formatoData = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
