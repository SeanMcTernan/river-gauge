import type { Context } from '@netlify/functions';
import Stripe from 'stripe';

export default async (req: Request, context: Context) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Initialize Stripe
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20.acacia',
    });

    // Parse request body
    const body = await req.json();
    const { setupIntentId, amount, project, email } = body;

    if (!setupIntentId || !amount) {
      return new Response(JSON.stringify({ error: 'Setup Intent ID and amount are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Retrieve the setup intent to get the payment method
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = setupIntent.payment_method;

    if (!paymentMethodId) {
      throw new Error('No payment method found');
    }

    // Create or retrieve customer
    let customerId;
    if (email) {
      // Check if customer exists
      const customers = await stripe.customers.list({
        email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email,
          payment_method: paymentMethodId as string,
          invoice_settings: {
            default_payment_method: paymentMethodId as string,
          },
          metadata: {
            project: project || '',
          },
        });
        customerId = customer.id;
      }
    } else {
      // Create customer without email
      const customer = await stripe.customers.create({
        payment_method: paymentMethodId as string,
        invoice_settings: {
          default_payment_method: paymentMethodId as string,
        },
      });
      customerId = customer.id;
    }

    // Create price for the custom amount (one-time price for annual subscription)
    const price = await stripe.prices.create({
      unit_amount: amount * 100, // Convert to cents
      currency: 'usd',
      recurring: {
        interval: 'year',
      },
      product_data: {
        name: project ? `${project} Gauge - Annual Contribution` : 'River Gauge - Annual Contribution',
      },
    });

    // Create subscription with automatic payment
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      metadata: {
        project: project || '',
      },
      // Use default payment behavior to automatically charge the customer
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    return new Response(
      JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error creating subscription:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to create subscription'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
