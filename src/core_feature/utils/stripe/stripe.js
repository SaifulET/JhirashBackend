import Stripe from "stripe";

const MAASAD_RIDER_EMAIL = "maasad11914@gmail.com";
const stripeClientsBySecretKey = new Map();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getStripeOverridesByEmail = () => {
  const secretKey = process.env.MAASAD_STRIPE_SECRET_KEY_OVERRIDE || null;
  const publishableKey = process.env.MAASAD_STRIPE_PUBLISHABLE_KEY_OVERRIDE || null;

  return new Map(
    [
      secretKey || publishableKey
        ? [
            MAASAD_RIDER_EMAIL,
            {
              secretKey: secretKey || undefined,
              publishableKey: publishableKey || undefined,
            },
          ]
        : null,
    ].filter(Boolean)
  );
};

const getStripeConfigForEmail = (email) => ({
  secretKey: process.env.STRIPE_SECRET_KEY || null,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  ...(getStripeOverridesByEmail().get(normalizeEmail(email)) || {}),
});

const getOrCreateStripeClient = (secretKey) => {
  if (!secretKey) {
    return null;
  }

  if (!stripeClientsBySecretKey.has(secretKey)) {
    stripeClientsBySecretKey.set(secretKey, new Stripe(secretKey));
  }

  return stripeClientsBySecretKey.get(secretKey);
};

export const stripe = new Proxy(
  {},
  {
    get(_target, prop) {
      const stripeClient = getStripeClientForEmail(null);

      if (!stripeClient) {
        throw {
          status: 500,
          message: "Stripe is not configured",
        };
      }

      return stripeClient[prop];
    },
  }
);

export const getStripeClientForEmail = (email) => {
  const { secretKey } = getStripeConfigForEmail(email);
  return getOrCreateStripeClient(secretKey);
};

export const assertStripeConfiguredForEmail = (email) => {
  const stripeClient = getStripeClientForEmail(email);

  if (!stripeClient) {
    throw {
      status: 500,
      message: "Stripe is not configured",
    };
  }

  return stripeClient;
};

export const assertStripeConfigured = () => {
  return assertStripeConfiguredForEmail(null);
};

export const getStripePublishableKey = (email = null) =>
  getStripeConfigForEmail(email).publishableKey || null;
