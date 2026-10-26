import type { Config } from '@netlify/functions';
import type Stripe from 'stripe';
import { errore, json, variabile } from '../lib/ambiente';
import { emailAggiornamentoStato, emailConfermaCliente, emailNegozio, emailNuovoOrdineNegozio, inviaEmail } from '../lib/email';
import { leggiOrdine, numeroValido, salvaOrdine, type Indirizzo, type Ordine } from '../lib/ordini';
import { stripe } from '../lib/stripe';

/**
 * Riceve da Stripe la conferma dei pagamenti: registra l'ordine e invia le email
 * a FGItalia e al cliente. Va registrato in Stripe → Sviluppatori → Webhook
 * con l'indirizzo https://www.fgitalia.it/api/stripe-webhook
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return errore('Metodo non consentito', 405);

  let evento: Stripe.Event;
  try {
    evento = await stripe().webhooks.constructEventAsync(
      await req.text(),
      req.headers.get('stripe-signature') ?? '',
      variabile('STRIPE_WEBHOOK_SECRET'),
    );
  } catch (e) {
    console.warn('Webhook con firma non valida', e);
    return errore('Firma non valida', 400);
  }

  const sessione = evento.data.object as Stripe.Checkout.Session;
  const numero = sessione.client_reference_id ?? sessione.metadata?.numero;
  if (!numeroValido(numero)) return json({ ignorato: true });

  switch (evento.type) {
    case 'checkout.session.completed': {
      if (await leggiOrdine(numero)) return json({ giaRegistrato: true });
      const ordine = await costruisciOrdine(sessione, numero);
      await salvaOrdine(ordine);
      await notificaOrdine(ordine);
      break;
    }
    case 'checkout.session.async_payment_succeeded': {
      const ordine = await leggiOrdine(numero);
      if (!ordine || ordine.pagato) break;
      ordine.pagato = true;
      ordine.stato = 'ricevuto';
      ordine.storico.push({ stato: 'ricevuto', data: new Date().toISOString(), nota: 'Pagamento confermato' });
      await salvaOrdine(ordine);
      await notificaOrdine(ordine);
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const ordine = await leggiOrdine(numero);
      if (!ordine || ordine.stato === 'annullato') break;
      ordine.stato = 'annullato';
      ordine.storico.push({ stato: 'annullato', data: new Date().toISOString(), nota: 'Pagamento non riuscito' });
      await salvaOrdine(ordine);
      await notifica(() => inviaEmail(destinatario(ordine), emailAggiornamentoStato(ordine, 'Il pagamento non è andato a buon fine.')));
      break;
    }
  }
  return json({ ricevuto: true });
};

const destinatario = (o: Ordine) => ({ email: o.cliente.email, nome: o.cliente.nome });

/** Avvisa FGItalia del nuovo ordine e manda la conferma al cliente */
async function notificaOrdine(ordine: Ordine) {
  await notifica(() => inviaEmail({ email: emailNegozio() }, emailNuovoOrdineNegozio(ordine)));
  await notifica(() => inviaEmail(destinatario(ordine), emailConfermaCliente(ordine)));
}

/** Un'email non partita non deve far ripetere a Stripe la registrazione dell'ordine */
async function notifica(invio: () => Promise<void>) {
  try {
    await invio();
  } catch (e) {
    console.error('Email non inviata', e);
  }
}

function indirizzo(nome: string | null | undefined, a: Stripe.Address | null | undefined): Indirizzo {
  return {
    nome: nome ?? undefined,
    via: a?.line1 ?? undefined,
    via2: a?.line2 ?? undefined,
    cap: a?.postal_code ?? undefined,
    citta: a?.city ?? undefined,
    provincia: a?.state ?? undefined,
    paese: a?.country ?? undefined,
  };
}

async function costruisciOrdine(s: Stripe.Checkout.Session, numero: string): Promise<Ordine> {
  const cliente = s.customer_details;
  // dalle versioni 2025 dell'API l'indirizzo di spedizione è in collected_information
  const consegna =
    (s as unknown as { collected_information?: { shipping_details?: Stripe.Checkout.Session.CollectedInformation.ShippingDetails } })
      .collected_information?.shipping_details ??
    (s as unknown as { shipping_details?: { name?: string; address?: Stripe.Address } }).shipping_details;
  const campo = (chiave: string) => s.custom_fields?.find((c) => c.key === chiave)?.text?.value ?? undefined;
  const { data: articoli } = await stripe().checkout.sessions.listLineItems(s.id, {
    limit: 100,
    expand: ['data.price.product'],
  });
  const adesso = new Date().toISOString();
  const pagato = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
  const stato = pagato ? 'ricevuto' : 'in_attesa_pagamento';

  return {
    numero,
    token: s.metadata?.token ?? '',
    creato: adesso,
    stato,
    pagato,
    cliente: { nome: cliente?.name ?? '', email: cliente?.email ?? '', telefono: cliente?.phone ?? undefined },
    spedizione: indirizzo(consegna?.name, consegna?.address),
    fatturazione: {
      ...indirizzo(cliente?.name, cliente?.address),
      partitaIva: cliente?.tax_ids?.map((t) => t.value).join(', ') || undefined,
      codiceSdiPec: campo('sdi_pec'),
      codiceFiscale: campo('codice_fiscale'),
    },
    righe: articoli.map((a) => {
      const prodotto = a.price?.product;
      return {
        id: typeof prodotto === 'object' && prodotto && 'metadata' in prodotto ? prodotto.metadata?.id : undefined,
        titolo: a.description ?? '',
        quantita: a.quantity ?? 1,
        unitarioCent: a.price?.unit_amount ?? 0,
        totaleCent: a.amount_total,
      };
    }),
    totali: {
      prodottiCent: s.amount_subtotal ?? 0,
      spedizioneCent: s.shipping_cost?.amount_total ?? 0,
      totaleCent: s.amount_total ?? 0,
    },
    storico: [{ stato, data: adesso }],
    stripe: {
      sessione: s.id,
      pagamento: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id,
    },
  };
}

export const config: Config = { path: '/api/stripe-webhook' };
