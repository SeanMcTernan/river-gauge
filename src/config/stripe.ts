// Stripe Price IDs configuration
export const STRIPE_PRICES = {
  recurring20: 'price_1SNiQf2H5VxIdeMuJNgcQqYy',
  recurring50: 'price_1SNiRs2H5VxIdeMuTvyJSmAJ',
  recurring100: 'price_1SNiTB2H5VxIdeMuxKlKCA3u',
  recurringCustom: 'price_1SNiVp2H5VxIdeMubB98tNXG',
  oneTime: 'price_1SNiWZ2H5VxIdeMuhz3jovuA',
} as const;

export interface PaymentOption {
  id: string;
  name: string;
  amount: number | 'custom';
  priceId: string;
  type: 'recurring' | 'one-time';
  description: string;
  popular?: boolean;
}

export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'recurring-20',
    name: 'Supporter',
    amount: 20,
    priceId: STRIPE_PRICES.recurring20,
    type: 'recurring',
    description: 'Annual contribution',
  },
  {
    id: 'recurring-50',
    name: 'Contributor',
    amount: 50,
    priceId: STRIPE_PRICES.recurring50,
    type: 'recurring',
    description: 'Annual contribution',
    popular: true,
  },
  {
    id: 'recurring-100',
    name: 'Champion',
    amount: 100,
    priceId: STRIPE_PRICES.recurring100,
    type: 'recurring',
    description: 'Annual contribution',
  },
  {
    id: 'recurring-custom',
    name: 'Custom Annual',
    amount: 'custom',
    priceId: STRIPE_PRICES.recurringCustom,
    type: 'recurring',
    description: 'Choose your amount',
  },
  {
    id: 'one-time',
    name: 'One-Time',
    amount: 'custom',
    priceId: STRIPE_PRICES.oneTime,
    type: 'one-time',
    description: 'Single contribution',
  },
];
