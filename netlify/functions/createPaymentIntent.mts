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
    const { amount, type, project, email } = body;

    if (!amount || !type) {
      return new Response(JSON.stringify({ error: 'Amount and type are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (type === 'recurring') {
      // For recurring payments, create a Setup Intent
      // This will be used to save the payment method for future charges
      const setupIntent = await stripe.setupIntents.create({
        payment_method_types: ['card'],
        metadata: {
          amount: amount.toString(),
          type: 'recurring',
          project: project || '',
          email: email || '',
        },
      });

      return new Response(
        JSON.stringify({
          clientSecret: setupIntent.client_secret,
          type: 'setup',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else {
      // For one-time payments, create a Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency: 'usd',
        payment_method_types: ['card'],
        metadata: {
          type: 'one-time',
          project: project || '',
          email: email || '',
        },
        receipt_email: email || undefined,
      });

      return new Response(
        JSON.stringify({
          clientSecret: paymentIntent.client_secret,
          type: 'payment',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error: any) {
    console.error('Error creating payment intent:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to create payment intent'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
