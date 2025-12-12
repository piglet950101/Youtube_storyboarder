import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripeInstance: Stripe | null = null;

export const getStripe = async (): Promise<Stripe> => {
  if (stripeInstance) {
    return stripeInstance;
  }

  const publicKey = process.env.VITE_STRIPE_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('VITE_STRIPE_PUBLIC_KEY is not configured');
  }

  stripeInstance = await loadStripe(publicKey);

  if (!stripeInstance) {
    throw new Error('Failed to initialize Stripe');
  }

  return stripeInstance;
};

export interface CreatePaymentIntentPayload {
  plan?: 'pro_standard' | 'pro_premium';
  tokensAmount?: number;
}

export const createPaymentIntent = async (
  type: 'plan_upgrade' | 'token_topup',
  sessionToken: string,
  payload: CreatePaymentIntentPayload
): Promise<{ clientSecret: string; paymentIntentId: string }> => {
  const apiUrl = process.env.VITE_API_URL;
  if (!apiUrl) {
    throw new Error('VITE_API_URL is not configured');
  }

  const response = await fetch(`${apiUrl}/billing/create-payment-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ type, ...payload }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error ||
        error.message ||
        `Payment intent creation failed: ${response.statusText}`
    );
  }

  const data = await response.json();
  return data;
};

export const confirmPaymentWithCard = async (
  stripe: Stripe,
  clientSecret: string,
  email: string,
  name: string
): Promise<any> => {
  const confirmResult = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: {
        token: 'tok_visa', // Would be replaced with actual card element
      },
      billing_details: {
        email,
        name,
      },
    },
  });

  return confirmResult;
};

export const handlePaymentIntentResult = (
  paymentIntent: any
): { success: boolean; message?: string } => {
  if (paymentIntent.status === 'succeeded') {
    return {
      success: true,
      message: 'Payment successful!',
    };
  } else if (paymentIntent.status === 'requires_action') {
    return {
      success: false,
      message: 'Payment requires additional action',
    };
  } else if (paymentIntent.status === 'requires_payment_method') {
    return {
      success: false,
      message: 'Payment failed. Please try again.',
    };
  } else {
    return {
      success: false,
      message: `Payment status: ${paymentIntent.status}`,
    };
  }
};
