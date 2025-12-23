import { Handler, HandlerEvent } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

// Initialize Supabase with service key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Token pricing configuration (must match create-payment-intent.ts)
const PRICING = {
  pro_standard: {
    tokens: 15000,
    maxBalance: 30000,
  },
  pro_premium: {
    tokens: 30000,
    maxBalance: 60000,
  },
};

const MAX_TOKENS = {
  free: 100,
  pro_standard: 30000,
  pro_premium: 60000,
};

export const handler: Handler = async (event: HandlerEvent) => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const signature = event.headers['stripe-signature'];

  if (!signature) {
    console.error('Missing stripe-signature header');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing signature' }),
    };
  }

  let stripeEvent: Stripe.Event;

  // Verify webhook signature
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body || '',
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid signature' }),
    };
  }

  // Check for duplicate event (idempotency)
  const { data: existingEvent } = await supabase
    .from('stripe_events')
    .select('id, processed')
    .eq('stripe_event_id', stripeEvent.id)
    .single();

  if (existingEvent) {
    if (existingEvent.processed) {
      console.log(`Event ${stripeEvent.id} already processed, skipping`);
      return {
        statusCode: 200,
        body: JSON.stringify({ received: true, duplicate: true }),
      };
    }
    // Event exists but not processed - continue processing
  }

  try {
    // Log the event
    if (!existingEvent) {
      const eventObject = stripeEvent.data.object as any;
      await supabase.from('stripe_events').insert({
        stripe_event_id: stripeEvent.id,
        event_type: stripeEvent.type,
        event_data: stripeEvent.data,
        stripe_customer_id: eventObject.customer || null,
        stripe_payment_intent_id: eventObject.id || eventObject.payment_intent || null,
        processed: false,
      });
    }

    // Handle specific event types
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded': {
        await handlePaymentSucceeded(stripeEvent.data.object as Stripe.PaymentIntent);
        break;
      }

      case 'payment_intent.payment_failed': {
        await handlePaymentFailed(stripeEvent.data.object as Stripe.PaymentIntent);
        break;
      }

      case 'charge.refunded': {
        await handleRefund(stripeEvent.data.object as Stripe.Charge);
        break;
      }

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    // Mark event as processed
    await supabase
      .from('stripe_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('stripe_event_id', stripeEvent.id);

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };

  } catch (error: any) {
    console.error('Webhook processing error:', error);

    // Log the error
    await supabase
      .from('stripe_events')
      .update({
        error_message: error.message,
        retry_count: 1,
      })
      .eq('stripe_event_id', stripeEvent.id);

    // Return 500 so Stripe will retry
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Processing error' }),
    };
  }
};

/**
 * Handle successful payment - upgrade plan and/or add tokens
 */
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const userId = paymentIntent.metadata?.userId;
  const type = paymentIntent.metadata?.type || (paymentIntent.metadata?.plan ? 'plan_upgrade' : 'token_topup');

  if (!userId) {
    throw new Error('No userId in payment intent metadata');
  }

  // Fetch current user data
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('token_balance, plan_tier')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new Error(`User not found: ${userId}`);
  }

  const balanceBefore = user.token_balance || 0;
  let tokensToAdd = 0;
  let newPlanTier: string | undefined;

  if (type === 'plan_upgrade') {
    const plan = paymentIntent.metadata?.plan as keyof typeof PRICING;

    if (!plan || !PRICING[plan]) {
      throw new Error(`Invalid plan in metadata: ${plan}`);
    }

    tokensToAdd = parseInt(paymentIntent.metadata?.tokens || String(PRICING[plan].tokens));
    newPlanTier = plan;

  } else if (type === 'token_topup') {
    tokensToAdd = parseInt(paymentIntent.metadata?.tokensAmount || '1000');
  }

  // Calculate max balance based on plan
  const effectivePlan = newPlanTier || user.plan_tier || 'free';
  const maxBalance = MAX_TOKENS[effectivePlan as keyof typeof MAX_TOKENS] || MAX_TOKENS.free;

  // Calculate final balance (capped at max)
  const rawNewBalance = balanceBefore + tokensToAdd;
  const finalBalance = Math.min(rawNewBalance, maxBalance);

  // Prepare update data
  const updateData: Record<string, any> = {
    token_balance: finalBalance,
  };

  if (type === 'plan_upgrade' && newPlanTier) {
    updateData.plan_tier = newPlanTier;
    updateData.plan_upgraded_at = new Date().toISOString();
  }

  // Update user record
  const { error: updateError } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId);

  if (updateError) {
    throw new Error(`Failed to update user: ${updateError.message}`);
  }

  // Get the charge ID from the PaymentIntent
  // In newer Stripe API, use latest_charge instead of charges.data[0]
  let chargeId: string | null = null;
  if (paymentIntent.latest_charge) {
    chargeId = typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge.id;
  }

  // Update the pending transaction record
  const { error: txError } = await supabase
    .from('token_transactions')
    .update({
      tokens_delta: tokensToAdd,
      balance_before: balanceBefore,
      balance_after: finalBalance,
      stripe_charge_id: chargeId,
      description: `${paymentIntent.description} (COMPLETED)`,
      metadata: {
        ...paymentIntent.metadata,
        status: 'completed',
        completed_at: new Date().toISOString(),
        capped: rawNewBalance > maxBalance,
      },
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (txError) {
    console.error('Failed to update transaction log:', txError);
    // Don't throw - payment was successful
  }

  console.log(
    `✅ Payment succeeded for user ${userId}: +${tokensToAdd} tokens (${balanceBefore} → ${finalBalance})` +
    (newPlanTier ? ` [Plan: ${newPlanTier}]` : '')
  );
}

/**
 * Handle failed payment - update transaction log
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const userId = paymentIntent.metadata?.userId;

  if (!userId) {
    console.warn('Payment failed without userId in metadata');
    return;
  }

  const errorMessage = paymentIntent.last_payment_error?.message || 'Payment failed';
  const errorCode = paymentIntent.last_payment_error?.code || 'unknown';

  // Update the pending transaction record
  const { error } = await supabase
    .from('token_transactions')
    .update({
      description: `${paymentIntent.description} (FAILED: ${errorMessage})`,
      metadata: {
        ...paymentIntent.metadata,
        status: 'failed',
        error_code: errorCode,
        error_message: errorMessage,
        failed_at: new Date().toISOString(),
      },
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (error) {
    console.error('Failed to log failed payment:', error);
  }

  console.log(`❌ Payment failed for user ${userId}: ${errorMessage}`);
}

/**
 * Handle refund - DEDUCT tokens from user (they're returning the purchase)
 */
async function handleRefund(charge: Stripe.Charge) {
  // Get userId from charge metadata or payment intent
  let userId = charge.metadata?.userId;

  if (!userId && charge.payment_intent) {
    // Try to get userId from the original payment intent
    try {
      const pi = await stripe.paymentIntents.retrieve(
        typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id
      );
      userId = pi.metadata?.userId;
    } catch (e) {
      console.error('Failed to retrieve payment intent for refund:', e);
    }
  }

  if (!userId) {
    console.warn('Refund processed without userId - cannot deduct tokens');
    return;
  }

  const refundedAmount = charge.amount_refunded || 0;

  if (refundedAmount === 0) {
    console.log('Refund amount is 0, skipping token deduction');
    return;
  }

  // Fetch user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('token_balance, plan_tier')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    console.error('User not found for refund:', userId);
    return;
  }

  // Calculate tokens to deduct based on refund amount
  // For JPY: amount is already in yen
  // Standard rate: ¥1,000 = 1,000 tokens
  // We estimate based on the refund amount
  const tokensToDeduct = Math.floor(refundedAmount / 1); // 1 yen ≈ 1 token approximately

  const balanceBefore = user.token_balance || 0;
  const balanceAfter = Math.max(0, balanceBefore - tokensToDeduct);

  // Update user balance
  const { error: updateError } = await supabase
    .from('users')
    .update({ token_balance: balanceAfter })
    .eq('id', userId);

  if (updateError) {
    console.error('Failed to update balance for refund:', updateError);
    return;
  }

  // Log the refund transaction
  const { error: logError } = await supabase
    .from('token_transactions')
    .insert({
      user_id: userId,
      transaction_type: 'refund',
      tokens_delta: -tokensToDeduct, // Negative because tokens are being removed
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      stripe_charge_id: charge.id,
      description: `Refund processed: ${tokensToDeduct.toLocaleString()} tokens deducted`,
      metadata: {
        refunded_amount: refundedAmount,
        charge_id: charge.id,
        processed_at: new Date().toISOString(),
      },
    });

  if (logError) {
    console.error('Failed to log refund transaction:', logError);
  }

  console.log(
    `🔄 Refund processed for user ${userId}: -${tokensToDeduct} tokens (${balanceBefore} → ${balanceAfter})`
  );
}
