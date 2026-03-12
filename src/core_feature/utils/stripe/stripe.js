import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export const assertStripeConfigured = () => {
  if (!stripe) {
    throw {
      status: 500,
      message: "Stripe is not configured",
    };
  }
};

export const getStripePublishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY || null;
