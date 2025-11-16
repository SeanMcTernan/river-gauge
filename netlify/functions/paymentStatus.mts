import type { Context } from '@netlify/functions';
import Stripe from 'stripe';

export default async (req: Request, context: Context) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
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

    // Get intent ID and type from query parameters
    const url = new URL(req.url);
    const intentId = url.searchParams.get('intent_id');
    const intentType = url.searchParams.get('type');

    if (!intentId || !intentType) {
      return new Response(JSON.stringify({ error: 'Intent ID and type are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let status, amount, email, project;

    if (intentType === 'setup') {
      // Retrieve setup intent for recurring payments
      const setupIntent = await stripe.setupIntents.retrieve(intentId);
      status = setupIntent.status;
      email = setupIntent.metadata?.email;
      project = setupIntent.metadata?.project;
      amount = setupIntent.metadata?.amount;
    } else {
      // Retrieve payment intent for one-time payments
      const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
      status = paymentIntent.status;
      amount = paymentIntent.amount / 100; // Convert from cents
      email = paymentIntent.receipt_email || paymentIntent.metadata?.email;
      project = paymentIntent.metadata?.project;
    }

    return new Response(
      JSON.stringify({
        status,
        customer_email: email,
        project,
        amount,
        type: intentType,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error retrieving payment status:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to retrieve payment status'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
