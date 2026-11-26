// Versione Netlify della funzione server/funzioni/account-documento.mts (archivio su Netlify Blobs: server/lib/archivio-netlify.ts)
import funzione, { config } from '../funzioni/account-documento.mts';
import { preparaNetlify } from '../lib/archivio-netlify';

const f = funzione as unknown as (req: Request, context?: { ip?: string }) => Response | Promise<Response>;

export default (req: Request, context?: { ip?: string }) => {
  preparaNetlify();
  return f(req, { ip: context?.ip });
};

export { config };
