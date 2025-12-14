import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe with API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

// Initialize Supabase with service key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface CreatePaymentIntentRequest {
  type: 'plan_upgrade' | 'token_topup';
  plan?: 'pro_standard' | 'pro_premium';
  tokensAmount?: number;
}

// Pricing configuration
// NOTE: JPY is a zero-decimal currency, so amounts are in yen (not sen)
const PRICING = {
  pro_standard: {
    tokens: 5000,
    amount: 4980, // ¥4,980
    maxBalance: 10000,
  },
  pro_premium: {
    tokens: 30000,
    amount: 9800, // ¥9,800
    maxBalance: 60000,
  },
  token_topup: {
    // Base rate: 1,000 tokens for ¥1,000
    // Premium rate: 3,000 tokens for ¥1,000
    base_tokens_per_1000_yen: 1000,
    premium_tokens_per_1000_yen: 3000,
    amount: 1000, // ¥1,000 per top-up unit
  },
};

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unauthorized: Invalid auth header format' }),
    };
  }

  try {
    const token = authHeader.split(' ')[1];
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      console.error('Auth error:', authError);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid or expired token' }),
      };
    }

    // Parse request body
    let body: CreatePaymentIntentRequest;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    if (!body.type) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing type parameter' }),
      };
    }

    const userId = authData.user.id;

    // Fetch user record from database
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id, email, display_name, plan_tier, token_balance')
      .eq('id', userId)
      .single();

    if (userError || !userRecord) {
      console.error('User fetch error:', userError);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found in database' }),
      };
    }

    // Get or create Stripe customer
    let customerId = userRecord.stripe_customer_id;

    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email: authData.user.email || userRecord.email,
          name: userRecord.display_name || 'User',
          metadata: {
            userId,
            supabase_user_id: userId,
          },
        });
        customerId = customer.id;

        // Save Stripe customer ID to database
        const { error: updateError } = await supabase
          .from('users')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId);

        if (updateError) {
          console.error('Failed to save Stripe customer ID:', updateError);
        }
      } catch (stripeError: any) {
        console.error('Stripe customer creation error:', stripeError);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Failed to create payment customer' }),
        };
      }
    }

    let amount: number;
    let description: string;
    let tokensToGrant: number;
    const metadata: Record<string, string> = {
      userId,
      type: body.type,
    };

    if (body.type === 'plan_upgrade') {
      // Validate plan parameter
      if (!body.plan || !['pro_standard', 'pro_premium'].includes(body.plan)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid plan. Must be pro_standard or pro_premium' }),
        };
      }

      // Check if user is already on this plan or higher
      if (userRecord.plan_tier === body.plan) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'すでにこのプランに加入しています' }),
        };
      }

      if (userRecord.plan_tier === 'pro_premium' && body.plan === 'pro_standard') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'プレミアムプランからスタンダードへのダウングレードはできません' }),
        };
      }

      const pricing = PRICING[body.plan];
      amount = pricing.amount;
      tokensToGrant = pricing.tokens;
      description = body.plan === 'pro_standard'
        ? `CineGen JP - Pro Standard Upgrade (${tokensToGrant.toLocaleString()} tokens)`
        : `CineGen JP - Pro Premium Upgrade (${tokensToGrant.toLocaleString()} tokens)`;

      metadata.plan = body.plan;
      metadata.tokens = String(tokensToGrant);
      metadata.maxBalance = String(pricing.maxBalance);

    } else if (body.type === 'token_topup') {
      // Token top-up - only available for Pro users
      if (!userRecord.plan_tier || userRecord.plan_tier === 'free') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'トークン追加購入はProプラン加入者のみご利用いただけます。先にプランをアップグレードしてください。'
          }),
        };
      }

      // Calculate tokens based on plan tier
      const isPremium = userRecord.plan_tier === 'pro_premium';
      const tokensPerUnit = isPremium
        ? PRICING.token_topup.premium_tokens_per_1000_yen
        : PRICING.token_topup.base_tokens_per_1000_yen;

      // Allow custom token amounts (default to 1 unit)
      const units = body.tokensAmount ? Math.ceil(body.tokensAmount / tokensPerUnit) : 1;
      amount = PRICING.token_topup.amount * units;
      tokensToGrant = tokensPerUnit * units;

      // Check max balance limit
      const maxBalance = isPremium ? PRICING.pro_premium.maxBalance : PRICING.pro_standard.maxBalance;
      const currentBalance = userRecord.token_balance || 0;

      if (currentBalance >= maxBalance) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: `トークン残高が上限(${maxBalance.toLocaleString()})に達しています。消費後に追加購入してください。`
          }),
        };
      }

      description = `CineGen JP - Token Top-Up (${tokensToGrant.toLocaleString()} tokens)`;
      metadata.tokensAmount = String(tokensToGrant);
      metadata.planTier = userRecord.plan_tier;

    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid type. Must be plan_upgrade or token_topup' }),
      };
    }

    // Create PaymentIntent
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        customer: customerId,
        amount,
        currency: 'jpy',
        description,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      });
    } catch (stripeError: any) {
      console.error('PaymentIntent creation error:', stripeError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to create payment intent' }),
      };
    }

    // Log pending transaction
    const { error: logError } = await supabase.from('token_transactions').insert({
      user_id: userId,
      transaction_type: body.type,
      tokens_delta: 0, // Will be updated on success
      balance_before: userRecord.token_balance || 0,
      balance_after: userRecord.token_balance || 0, // Will be updated on success
      stripe_payment_intent_id: paymentIntent.id,
      description: `${description} (PENDING)`,
      metadata: {
        ...metadata,
        status: 'pending',
        created_at: new Date().toISOString(),
      },
    });

    if (logError) {
      console.error('Failed to log pending transaction:', logError);
      // Don't fail the request, just log the error
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        tokens: tokensToGrant,
      }),
    };

  } catch (error: any) {
    console.error('Unexpected error in create-payment-intent:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};
