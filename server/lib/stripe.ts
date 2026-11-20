import Stripe from 'stripe';
import { variabile } from './ambiente';

let istanza: Stripe | undefined;

export function stripe(): Stripe {
  // sul worker Cloudflare le chiamate a Stripe passano da fetch
  istanza ??= new Stripe(variabile('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
  return istanza;
}
