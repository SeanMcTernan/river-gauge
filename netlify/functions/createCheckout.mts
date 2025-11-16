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
    const { priceId, customAmount, type, project } = body;

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Price ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine the site URL for redirects
    const siteUrl = process.env.URL || 'http://localhost:8888';
    const returnUrl = `${siteUrl}/contribute/success?session_id={CHECKOUT_SESSION_ID}`;

    // Create checkout session parameters with embedded mode
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      ui_mode: 'embedded',
      mode: type === 'recurring' ? 'subscription' : 'payment',
      return_url: returnUrl,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: project ? {
        project: project
      } : {},
    };

    // If custom amount is provided, add it to the line item
    if (customAmount && customAmount > 0) {
      sessionParams.line_items = [
        {
          price: priceId,
          quantity: 1,
          adjustable_quantity: {
            enabled: false,
          },
        },
      ];

      // For custom amounts, we need to use price_data instead
      sessionParams.line_items = [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: type === 'recurring' ? 'Annual Contribution' : 'One-Time Contribution',
              description: 'Support our river gauge monitoring network',
            },
            unit_amount: customAmount * 100, // Convert to cents
            recurring: type === 'recurring' ? { interval: 'year' } : undefined,
          },
          quantity: 1,
        },
      ];
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Return client_secret for embedded checkout
    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error creating checkout session:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to create checkout session'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
