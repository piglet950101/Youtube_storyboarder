import { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const PRICING = {
  pro_standard: 5000,
  pro_premium: 30000,
  token_topup: 1000,
};

const MAX_TOKENS = {
  pro_standard: 10000,
  pro_premium: 60000,
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const signature = event.headers['stripe-signature'];
  let stripeEvent: Stripe.Event;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body || '',
      signature || '',
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  try {
    await supabase.from('stripe_events').insert({
      stripe_event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      event_data: stripeEvent.data,
      stripe_customer_id: (stripeEvent.data.object as any).customer,
      processed: false,
    });

    switch (stripeEvent.type) {
      case 'payment_intent.succeeded': {
        await handlePaymentSucceeded(
          stripeEvent.data.object as Stripe.PaymentIntent
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        await handlePaymentFailed(
          stripeEvent.data.object as Stripe.PaymentIntent
        );
        break;
      }
      case 'charge.refunded': {
        await handleRefund(stripeEvent.data.object as Stripe.Charge);
        break;
      }
      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    await supabase
      .from('stripe_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('stripe_event_id', stripeEvent.id);

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (error: any) {
    console.error('Webhook processing error:', error);

    await supabase
      .from('stripe_events')
      .update({
        error_message: error.message,
        retry_count: 1,
      })
      .eq('stripe_event_id', stripeEvent.id);

    return { statusCode: 500, body: 'Processing error' };
  }
};

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const userId = paymentIntent.metadata?.userId;
  const type = paymentIntent.metadata?.plan ? 'plan_upgrade' : 'token_topup';

  if (!userId) {
    throw new Error('No userId in payment intent metadata');
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('token_balance, plan_tier')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new Error('User not found');
  }

  let tokensToAdd = 0;
  let newPlanTier: string | undefined;
  const balanceBefore = user.token_balance || 0;

  if (type === 'plan_upgrade') {
    const plan = paymentIntent.metadata?.plan as keyof typeof PRICING;
    tokensToAdd = PRICING[plan] || 0;
    newPlanTier = plan;
  } else {
    tokensToAdd = parseInt(paymentIntent.metadata?.tokensAmount || '1000');
  }

  const maxBalance =
    newPlanTier === 'pro_premium'
      ? MAX_TOKENS.pro_premium
      : newPlanTier === 'pro_standard'
        ? MAX_TOKENS.pro_standard
        : user.plan_tier === 'pro_premium'
          ? MAX_TOKENS.pro_premium
          : user.plan_tier === 'pro_standard'
            ? MAX_TOKENS.pro_standard
            : 100;

  const balanceAfter = balanceBefore + tokensToAdd;
  const finalBalance = Math.min(balanceAfter, maxBalance);

  const updateData: Record<string, any> = {
    token_balance: finalBalance,
  };

  if (type === 'plan_upgrade') {
    updateData.plan_tier = newPlanTier;
    updateData.plan_upgraded_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId);

  if (updateError) {
    throw new Error(`Failed to update user: ${updateError.message}`);
  }

  const chargeId = paymentIntent.charges.data[0]?.id;

  const { error: txError } = await supabase
    .from('token_transactions')
    .update({
      tokens_delta: tokensToAdd,
      balance_before: balanceBefore,
      balance_after: finalBalance,
      stripe_charge_id: chargeId,
      description: `${paymentIntent.description} (COMPLETED)`,
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (txError) {
    console.error('Failed to update transaction log:', txError);
  }

  console.log(
    `Payment succeeded for user ${userId}: +${tokensToAdd} tokens (${balanceBefore} → ${finalBalance})`
  );
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const userId = paymentIntent.metadata?.userId;

  if (!userId) {
    return;
  }

  const errorMessage =
    paymentIntent.last_payment_error?.message || 'Payment failed';

  const { error } = await supabase
    .from('token_transactions')
    .update({
      description: `${paymentIntent.description} - ${errorMessage} (FAILED)`,
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (error) {
    console.error('Failed to log failed payment:', error);
  }

  console.log(`Payment failed for user ${userId}: ${errorMessage}`);
}

async function handleRefund(charge: Stripe.Charge) {
  if (!charge.amount_refunded || !charge.metadata?.userId) {
    return;
  }

  const userId = charge.metadata.userId;
  const refundAmount = charge.amount_refunded;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('token_balance')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    console.error('User not found for refund:', userId);
    return;
  }

  const tokensToRefund = Math.floor(refundAmount / 100000) * 1000;
  const newBalance = (user.token_balance || 0) + tokensToRefund;

  const { error: updateError } = await supabase
    .from('users')
    .update({ token_balance: newBalance })
    .eq('id', userId);

  if (updateError) {
    console.error('Failed to update balance for refund:', updateError);
    return;
  }

  const { error: logError } = await supabase
    .from('token_transactions')
    .insert({
      user_id: userId,
      transaction_type: 'refund',
      tokens_delta: tokensToRefund,
      balance_before: user.token_balance || 0,
      balance_after: newBalance,
      stripe_charge_id: charge.id,
      description: `Refund processed: ${tokensToRefund} tokens returned`,
    });

  if (logError) {
    console.error('Failed to log refund transaction:', logError);
  }

  console.log(
    `Refund processed for user ${userId}: +${tokensToRefund} tokens`
  );
}
