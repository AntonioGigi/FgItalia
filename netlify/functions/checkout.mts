import type { Config } from '@netlify/functions';
import { calcolaTotali } from '../../src/lib/negozio';
import { errore, json, urlSito } from '../lib/ambiente';
import { leggiCatalogo } from '../lib/catalogo';
import { nuovoNumeroOrdine, nuovoToken } from '../lib/ordini';
import { stripe } from '../lib/stripe';

/**
 * Crea la pagina di pagamento sicura di Stripe (carta, PayPal, Apple Pay, Google Pay…)
 * a partire dal carrello. Prezzi e disponibilità vengono ricalcolati qui dal catalogo
 * pubblicato: il browser invia solo codici prodotto e quantità.
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return errore('Metodo non consentito', 405);

  let corpo: { carrello?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return errore('Richiesta non valida');
  }

  const catalogo = await leggiCatalogo();
  if (!catalogo.negozioAttivo) return errore('Il pagamento online non è attivo: ordina su WhatsApp o con il modulo contatti.', 503);

  const totali = calcolaTotali(Array.isArray(corpo.carrello) ? corpo.carrello : [], catalogo);
  if (totali.righe.length === 0) return errore('Il carrello è vuoto o i prodotti non sono più disponibili.');

  const sito = urlSito();
  const numero = nuovoNumeroOrdine();
  const token = nuovoToken();

  try {
    const sessione = await stripe().checkout.sessions.create({
      mode: 'payment',
      locale: 'it',
      client_reference_id: numero,
      metadata: { numero, token },
      payment_intent_data: { description: `Ordine ${numero}`, metadata: { numero } },
      line_items: totali.righe.map((r) => ({
        quantity: r.quantita,
        price_data: {
          currency: 'eur',
          unit_amount: r.unitarioCent,
          product_data: {
            name: r.titolo,
            metadata: { id: r.id },
            ...(r.immagine && { images: [`${sito}${r.immagine}`] }),
          },
        },
      })),
      shipping_address_collection: { allowed_countries: ['IT'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: totali.spedizioneCent ? 'Spedizione con corriere' : 'Spedizione gratuita',
            fixed_amount: { amount: totali.spedizioneCent, currency: 'eur' },
          },
        },
      ],
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      customer_creation: 'always',
      tax_id_collection: { enabled: true },
      custom_fields: [
        {
          key: 'sdi_pec',
          label: { type: 'custom', custom: 'Codice SDI o PEC per la fattura' },
          type: 'text',
          optional: true,
        },
        {
          key: 'codice_fiscale',
          label: { type: 'custom', custom: 'Codice fiscale' },
          type: 'text',
          optional: true,
        },
      ],
      success_url: `${sito}/ordine/?n=${numero}&t=${token}&pagato=1`,
      cancel_url: `${sito}/carrello/`,
    });
    return json({ url: sessione.url });
  } catch (e) {
    console.error('Creazione pagamento non riuscita', e);
    return errore('Non è stato possibile avviare il pagamento. Riprova o ordina su WhatsApp.', 502);
  }
};

export const config: Config = { path: '/api/checkout' };
