// server/index.ts
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Stripe from "stripe";
import { z } from "zod";
import OpenAI from "openai";

const app = express();

/* ---------------- CORS ---------------- */
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(
  cors({
    origin: ALLOW_ORIGIN,
    credentials: true,
  })
);

/* ---------------- Stripe ENV & Setup ---------------- */
const {
  STRIPE_SECRET_KEY,      // sk_live_... or sk_test_...
  STRIPE_WEBHOOK_SECRET,  // whsec_...
  PRICE_COINS_1K,         // price_... for 1,000 coins
  PRICE_COINS_5K,         // price_... for 5,000 coins
  PRICE_COINS_12K,        // price_... for 12,000 coins
  CLIENT_BASE_URL,        // e.g. https://your-client.onrender.com
} = process.env;

// Only init Stripe if key is present (lets you run without Stripe in dev)
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

/**
 * Important: Stripe webhooks must see the *raw* request body
 * BEFORE any JSON parser. So we mount the webhook route first with bodyParser.raw,
 * then mount express.json() for all other routes.
 */
app.post(
  "/webhooks/stripe",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      if (!stripe) return res.status(503).send("Stripe not configured");
      if (!STRIPE_WEBHOOK_SECRET) return res.status(400).send("Missing STRIPE_WEBHOOK_SECRET");

      const sig = req.headers["stripe-signature"];
      if (!sig) return res.status(400).send("Missing signature header");

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
      } catch (err: any) {
        console.error("❌ Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });

        const userId = session.client_reference_id || "anon";

        for (const item of lineItems.data) {
          const priceId = (item.price?.id || "").trim();

          const coins =
            priceId === PRICE_COINS_1K ? 1000 :
            priceId === PRICE_COINS_5K ? 5000 :
            priceId === PRICE_COINS_12K ? 12000 :
            0;

          if (coins > 0) {
            // TODO: persist this in your DB (by userId)
            // e.g. await db.wallet.grantCoins({ userId, coins, source: "stripe", sessionId: session.id });
            console.log(`💰 Grant ${coins} coins to user=${userId} (session=${session.id})`);
          } else {
            console.warn(`Unknown price: ${priceId}`);
          }
        }
      } else {
        // Optionally handle more events
        // console.log(`Unhandled Stripe event: ${event.type}`);
      }

      res.json({ received: true });
    } catch (e) {
      console.error("Webhook handler error:", e);
      res.status(500).send("Server error");
    }
  }
);

/* ---------------- JSON parser for the rest ---------------- */
app.use(express.json());

/* ---------------- Health ---------------- */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* ---------------- Kid-safe hint proxy (OpenAI) ---------------- */
const HintInput = z.object({
  grade: z.union([z.literal("K"), z.number().int().min(1).max(12)]),
  subject: z.enum(["Math", "Reading/Writing", "Science", "Social Studies", "Languages", "Test Prep"]),
  question: z.string().min(3).max(300),
  attempt: z.string().max(300).optional(),
});

app.post("/api/hint", async (req, res) => {
  const parsed = HintInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Bad input", details: parsed.error.flatten() });
  }
  const { grade, subject, question, attempt } = parsed.data;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: "OPENAI_API_KEY not set on server" });
  }

  try {
    const openai = new OpenAI({ apiKey });

    const system = [
      "You are a kid-safe learning coach for K–12.",
      "Never give the full final answer in the FIRST hint.",
      "Use one short sentence followed by a nudge or strategy.",
      "Keep it age-appropriate, positive, and concrete.",
      "If asked for harmful or inappropriate content, refuse politely.",
    ].join(" ");

    const user = [
      `Grade: ${grade}`,
      `Subject: ${subject}`,
      `Question: ${question}`,
      attempt ? `Student attempt: ${attempt}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 120,
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || "Try breaking the problem into smaller steps.";
    return res.json({ ok: true, hint: text });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "AI service failed" });
  }
});

/* ---------------- Stripe Checkout endpoint ---------------- */
/**
 * POST /api/checkout
 * Body: { sku: "COINS_1K" | "COINS_5K" | "COINS_12K", userId?: string }
 * Returns: { url } — redirect the browser to this URL
 */
app.post("/api/checkout", async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
    if (!CLIENT_BASE_URL) return res.status(500).json({ error: "Missing CLIENT_BASE_URL" });

    const { sku, userId } = req.body as { sku?: string; userId?: string };

    const priceId =
      sku === "COINS_1K"  ? PRICE_COINS_1K  :
      sku === "COINS_5K"  ? PRICE_COINS_5K  :
      sku === "COINS_12K" ? PRICE_COINS_12K :
      null;

    if (!priceId) return res.status(400).json({ error: "Invalid SKU" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: userId || "anon",
      success_url: `${CLIENT_BASE_URL}/#/store?status=success`,
      cancel_url: `${CLIENT_BASE_URL}/#/store?status=cancel`,
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error("Checkout error:", e);
    return res.status(500).json({ error: "Checkout failed" });
  }
});

/* ---------------- Start (Render uses PORT) ---------------- */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`EduVerse API listening on :${PORT}`);
});
