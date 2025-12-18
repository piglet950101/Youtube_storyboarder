import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripeInstance: Stripe | null = null;

export const getStripe = async (): Promise<Stripe> => {
  if (stripeInstance) {
    return stripeInstance;
  }

  const publicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
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

export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  tokens: number;
}

export const createPaymentIntent = async (
  type: 'plan_upgrade' | 'token_topup',
  sessionToken: string,
  payload: CreatePaymentIntentPayload
): Promise<CreatePaymentIntentResponse> => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) {
    throw new Error('VITE_API_URL is not configured');
  }

  const response = await fetch(`${apiUrl}/create-payment-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ type, ...payload }),
  });

  if (!response.ok) {
    let errorMessage = `Payment intent creation failed (${response.status} ${response.statusText})`;

    if (response.status === 404) {
      errorMessage = 'Netlify Functions not found. Make sure to run: netlify dev';
    } else {
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        }
      } catch (parseError) {
        console.error('[Stripe] Parse error:', parseError);
      }
    }

    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data as CreatePaymentIntentResponse;
};

export const handlePaymentIntentResult = (
  paymentIntent: { status: string }
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

export interface CancelPlanResponse {
  success: boolean;
  previousPlan: string;
  newPlan: string;
  previousTokens: number;
  newTokens: number;
  tokensLost: number;
  message: string;
}

export const cancelPlan = async (
  targetPlan: 'free' | 'pro_standard',
  sessionToken: string
): Promise<CancelPlanResponse> => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) {
    throw new Error('VITE_API_URL is not configured');
  }

  const response = await fetch(`${apiUrl}/cancel-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ targetPlan }),
  });

  if (!response.ok) {
    let errorMessage = `Plan cancellation failed (${response.status})`;
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // ignore parse errors
    }
    throw new Error(errorMessage);
  }

  return await response.json();
};