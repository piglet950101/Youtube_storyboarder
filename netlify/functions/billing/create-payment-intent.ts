import { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface CreatePaymentIntentRequest {
  type: 'plan_upgrade' | 'token_topup';
  plan?: 'pro_standard' | 'pro_premium';
  tokensAmount?: number;
}

const PRICING = {
  pro_standard: {
    tokens: 5000,
    amount: 498000,
    maxBalance: 10000,
  },
  pro_premium: {
    tokens: 30000,
    amount: 980000,
    maxBalance: 60000,
  },
  token_topup: {
    tokens: 1000,
    amount: 100000,
  },
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized: No auth header' }),
    };
  }

  try {
    const token = authHeader.split(' ')[1];
    const { data, error: authError } = await supabase.auth.getUser(token);

    if (authError || !data.user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid token' }),
      };
    }

    const body: CreatePaymentIntentRequest = JSON.parse(event.body || '{}');

    if (!body.type) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing type parameter' }),
      };
    }

    const userId = data.user.id;

    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id, email, display_name')
      .eq('id', userId)
      .single();

    if (userError || !userRecord) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    let customerId = userRecord.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: data.user.email,
        name: userRecord.display_name || 'User',
        metadata: {
          userId,
        },
      });
      customerId = customer.id;

      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    let amount: number;
    let description: string;
    let metadata: Record<string, string> = { userId };

    if (body.type === 'plan_upgrade') {
      if (!body.plan || !['pro_standard', 'pro_premium'].includes(body.plan)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid plan' }),
        };
      }

      const pricing =
        PRICING[body.plan as keyof typeof PRICING];
      amount = pricing.amount;
      description = body.plan === 'pro_standard'
        ? 'Pro Standard Upgrade - 5,000 tokens'
        : 'Pro Premium Upgrade - 30,000 tokens';
      metadata.plan = body.plan;
    } else if (body.type === 'token_topup') {
      amount = PRICING.token_topup.amount;
      const tokenAmount = body.tokensAmount || PRICING.token_topup.tokens;
      description = `Token Top-Up - ${tokenAmount} tokens`;
      metadata.tokensAmount = String(tokenAmount);
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid type' }),
      };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      customer: customerId,
      amount,
      currency: 'jpy',
      description,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    await supabase.from('token_transactions').insert({
      user_id: userId,
      transaction_type: body.type,
      tokens_delta: 0,
      balance_before: 0,
      balance_after: 0,
      stripe_payment_intent_id: paymentIntent.id,
      description: `${description} (pending)`,
      metadata,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
    };
  } catch (error: any) {
    console.error('Error creating payment intent:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};
