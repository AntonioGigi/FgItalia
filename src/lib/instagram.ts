export interface PostInstagram {
  id: string;
  didascalia: string;
  immagine: string;
  link: string;
  video: boolean;
}

interface MediaApi {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
}

let cache: Promise<PostInstagram[]> | undefined;

/**
 * Legge gli ultimi post del profilo Instagram durante la build del sito.
 * Serve la variabile d'ambiente INSTAGRAM_TOKEN; senza token (o in caso di errore)
 * restituisce un elenco vuoto e la home mostra solo il link al profilo.
 */
export function ultimiPostInstagram(quanti = 8): Promise<PostInstagram[]> {
  cache ??= carica(quanti);
  return cache;
}

async function carica(quanti: number): Promise<PostInstagram[]> {
  const token = import.meta.env.INSTAGRAM_TOKEN;
  if (!token) return [];
  const campi = 'id,caption,media_type,media_url,thumbnail_url,permalink';
  const url = `https://graph.instagram.com/me/media?fields=${campi}&limit=${quanti}&access_token=${encodeURIComponent(token)}`;
  try {
    const risposta = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!risposta.ok) {
      console.warn(`[instagram] risposta ${risposta.status}: i post non verranno mostrati`);
      return [];
    }
    const { data } = (await risposta.json()) as { data: MediaApi[] };
    return data
      .map((m) => ({
        id: m.id,
        didascalia: m.caption ?? '',
        immagine: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) ?? '',
        link: m.permalink,
        video: m.media_type === 'VIDEO',
      }))
      .filter((p) => p.immagine);
  } catch (errore) {
    console.warn('[instagram] impossibile leggere i post:', errore);
    return [];
  }
}
