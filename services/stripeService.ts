import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20',
  typescript: true,
});

export const stripeService = {
  async createOrGetCustomer(
    userId: string,
    email: string,
    name: string
  ): Promise<string> {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
        },
      });
      return customer.id;
    } catch (error: any) {
      console.error('Error creating Stripe customer:', error);
      throw error;
    }
  },

  async createPaymentIntent(
    customerId: string,
    amount: number,
    description: string,
    metadata: Record<string, string>
  ): Promise<Stripe.PaymentIntent> {
    try {
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
      return paymentIntent;
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  },

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error: any) {
      console.error('Error retrieving payment intent:', error);
      throw error;
    }
  },

  async refundPayment(chargeId: string, reason: string): Promise<Stripe.Refund> {
    try {
      const refund = await stripe.refunds.create({
        charge: chargeId,
        reason: reason as Stripe.RefundCreateParams.Reason,
      });
      return refund;
    } catch (error: any) {
      console.error('Error creating refund:', error);
      throw error;
    }
  },

  constructWebhookEvent(
    body: string,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    try {
      return stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error: any) {
      console.error('Error verifying webhook signature:', error);
      throw error;
    }
  },
};
