import Stripe from 'stripe';
import { variabile } from './ambiente';

let istanza: Stripe | undefined;

export function stripe(): Stripe {
  istanza ??= new Stripe(variabile('STRIPE_SECRET_KEY'));
  return istanza;
}
