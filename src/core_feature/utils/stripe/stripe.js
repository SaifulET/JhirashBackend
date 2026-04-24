import Stripe from "stripe";

const DEFAULT_STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;
const DEFAULT_STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || null;
const MAASAD_RIDER_EMAIL = "maasad11914@gmail.com";
const MAASAD_STRIPE_SECRET_KEY_OVERRIDE =
  process.env.MAASAD_STRIPE_SECRET_KEY_OVERRIDE || null;
const MAASAD_STRIPE_PUBLISHABLE_KEY_OVERRIDE =
  process.env.MAASAD_STRIPE_PUBLISHABLE_KEY_OVERRIDE || null;
const STRIPE_SECRET_KEY_OVERRIDES_BY_EMAIL = new Map(
  [
    MAASAD_STRIPE_SECRET_KEY_OVERRIDE || MAASAD_STRIPE_PUBLISHABLE_KEY_OVERRIDE
      ? [
          MAASAD_RIDER_EMAIL,
          {
            secretKey: MAASAD_STRIPE_SECRET_KEY_OVERRIDE || undefined,
            publishableKey: MAASAD_STRIPE_PUBLISHABLE_KEY_OVERRIDE || undefined,
          },
        ]
      : null,
  ].filter(Boolean)
);
const stripeClientsBySecretKey = new Map();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getStripeConfigForEmail = (email) => ({
  secretKey: DEFAULT_STRIPE_SECRET_KEY,
  publishableKey: DEFAULT_STRIPE_PUBLISHABLE_KEY,
  ...(STRIPE_SECRET_KEY_OVERRIDES_BY_EMAIL.get(normalizeEmail(email)) || {}),
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

export const stripe = getOrCreateStripeClient(DEFAULT_STRIPE_SECRET_KEY);

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
