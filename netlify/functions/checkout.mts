import type { Config } from '@netlify/functions';
import { calcolaTotali } from '../../src/lib/negozio';
import { errore, json, urlSito } from '../lib/ambiente';
import { leggiCatalogo } from '../lib/catalogo';
import { clienteDaRichiesta, salvaCliente, type Cliente } from '../lib/clienti';
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

  const catalogo = await leggiCatalogo(new URL(req.url).origin);
  if (!catalogo.negozioAttivo) return errore('Il pagamento online non è attivo: ordina su WhatsApp o con il modulo contatti.', 503);

  const totali = calcolaTotali(Array.isArray(corpo.carrello) ? corpo.carrello : [], catalogo);
  if (totali.righe.length === 0) return errore('Il carrello è vuoto o i prodotti non sono più disponibili.');

  const sito = urlSito();
  const numero = nuovoNumeroOrdine();
  const token = nuovoToken();
  // cliente collegato all'area clienti: email e dati di fatturazione già compilati
  const cliente = await clienteDaRichiesta(req);
  const f = cliente?.fatturazione;
  const predefinito = (valore: string | undefined) => (valore ? { default_value: valore.slice(0, 255) } : {});
  const clienteStripe = cliente ? await preparaClienteStripe(cliente) : undefined;

  try {
    const sessione = await stripe().checkout.sessions.create({
      mode: 'payment',
      locale: 'it',
      client_reference_id: numero,
      metadata: { numero, token, ...(cliente && { cliente: cliente.id }) },
      ...(clienteStripe
        ? { customer: clienteStripe, customer_update: { name: 'auto', address: 'auto', shipping: 'auto' } }
        : cliente
          ? { customer_email: cliente.email, customer_creation: 'always' }
          : { customer_creation: 'always' }),
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
      tax_id_collection: { enabled: true },
      custom_fields: [
        {
          key: 'sdi_pec',
          label: { type: 'custom', custom: 'Codice SDI o PEC per la fattura' },
          type: 'text',
          text: predefinito(f?.codiceSdi ?? f?.pec),
          optional: true,
        },
        {
          key: 'codice_fiscale',
          label: { type: 'custom', custom: 'Codice fiscale' },
          type: 'text',
          text: predefinito(f?.codiceFiscale),
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

const indirizzoStripe = (i: { via?: string; via2?: string; cap?: string; citta?: string; provincia?: string }) =>
  i.via && i.citta ? { line1: i.via, line2: i.via2, postal_code: i.cap, city: i.citta, state: i.provincia, country: 'IT' } : undefined;

/**
 * Collega l'account a un cliente Stripe con nome, indirizzi e partita IVA del profilo,
 * così la pagina di pagamento arriva già compilata. Se Stripe non risponde si va avanti senza.
 */
async function preparaClienteStripe(c: Cliente): Promise<string | undefined> {
  const f = c.fatturazione;
  const s = c.spedizione;
  const dati = {
    email: c.email,
    name: f.ragioneSociale || c.nome,
    ...(c.telefono && { phone: c.telefono }),
    ...(indirizzoStripe(f) && { address: indirizzoStripe(f) }),
    ...(indirizzoStripe(s) && { shipping: { name: s.nome || c.nome, address: indirizzoStripe(s)!, ...(c.telefono && { phone: c.telefono }) } }),
    metadata: { account: c.id },
  };
  try {
    if (c.stripe) {
      await stripe().customers.update(c.stripe, dati);
      return c.stripe;
    }
    const nuovo = await stripe().customers.create(dati);
    if (f.partitaIva) {
      await stripe()
        .customers.createTaxId(nuovo.id, { type: 'eu_vat', value: f.partitaIva.startsWith('IT') ? f.partitaIva : `IT${f.partitaIva}` })
        .catch((e) => console.warn('Partita IVA non registrata su Stripe', e));
    }
    c.stripe = nuovo.id;
    await salvaCliente(c);
    return nuovo.id;
  } catch (e) {
    console.error('Cliente Stripe non preparato', e);
    return undefined;
  }
}

export const config: Config = { path: '/api/checkout' };
