const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { log, error } = require("./logger");

const MOD = "Subscription";
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "subscribers.json");

let stripe;

function initStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === "your_stripe_secret_key") {
    log(MOD, "STRIPE_SECRET_KEY not set, subscription disabled");
    return false;
  }
  stripe = require("stripe")(key);
  log(MOD, "Stripe initialized");
  return true;
}

function isEnabled() {
  return !!stripe;
}

// --- User storage (async) ---

async function ensureDataDir() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}

async function loadSubscribers() {
  await ensureDataDir();
  try {
    const data = await fsp.readFile(USERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    if (e.code === "ENOENT") return {};
    error(MOD, "Failed to load subscribers:", e.message);
    return {};
  }
}

async function saveSubscribers(data) {
  await ensureDataDir();
  try {
    const tmpFile = USERS_FILE + ".tmp";
    await fsp.writeFile(tmpFile, JSON.stringify(data, null, 2));
    await fsp.rename(tmpFile, USERS_FILE);
  } catch (e) {
    error(MOD, "Failed to save subscribers:", e.message);
  }
}

async function getSubscriber(platform, userId) {
  const subs = await loadSubscribers();
  const key = `${platform}:${userId}`;
  return subs[key] || null;
}

async function setSubscriber(platform, userId, data) {
  const subs = await loadSubscribers();
  const key = `${platform}:${userId}`;
  subs[key] = { ...data, platform, userId, updatedAt: Date.now() };
  await saveSubscribers(subs);
}

async function isSubscribed(platform, userId) {
  const sub = await getSubscriber(platform, userId);
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (sub.expiresAt && sub.expiresAt < Date.now()) return false;
  return true;
}

async function getSubscriberCount() {
  const subs = await loadSubscribers();
  return Object.values(subs).filter(
    (s) => s.status === "active" && (!s.expiresAt || s.expiresAt > Date.now()),
  ).length;
}

// --- Stripe Checkout ---

async function createCheckoutSession(platform, userId, username) {
  if (!stripe) throw new Error("Stripe not initialized");

  const priceAmount = parseInt(process.env.SUBSCRIPTION_PRICE || "5", 10) * 100;
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "BTC Signal Bot #BTCto70k",
            description: "BTC シグナル配信 (Discord + Telegram)",
          },
          unit_amount: priceAmount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: {
      platform,
      userId: String(userId),
      username: username || "",
    },
    success_url: `${baseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/subscribe/cancel`,
  });

  log(MOD, `Checkout session created for ${platform}:${userId}`);
  return session.url;
}

// --- Stripe Webhook ---

async function handleWebhook(rawBody, signature) {
  if (!stripe) throw new Error("Stripe not initialized");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  if (webhookSecret) {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } else {
    event = JSON.parse(rawBody);
    log(MOD, "WARNING: No webhook secret, skipping signature verification");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const { platform, userId, username } = session.metadata || {};
      if (platform && userId) {
        await setSubscriber(platform, userId, {
          status: "active",
          username,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          subscribedAt: Date.now(),
          expiresAt: null,
        });
        log(MOD, `Subscription activated: ${platform}:${userId}`);
      }
      break;
    }

    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const subs = await loadSubscribers();

      for (const [key, sub] of Object.entries(subs)) {
        if (sub.stripeSubscriptionId === subscription.id) {
          if (subscription.status === "active") {
            sub.status = "active";
            sub.expiresAt = null;
          } else {
            sub.status = "cancelled";
            sub.expiresAt =
              subscription.current_period_end * 1000 || Date.now();
          }
          sub.updatedAt = Date.now();
          log(MOD, `Subscription ${subscription.status}: ${key}`);
          break;
        }
      }

      await saveSubscribers(subs);
      break;
    }

    default:
      log(MOD, `Unhandled event: ${event.type}`);
  }

  return { received: true };
}

module.exports = {
  initStripe,
  isEnabled,
  isSubscribed,
  getSubscriber,
  getSubscriberCount,
  createCheckoutSession,
  handleWebhook,
};
