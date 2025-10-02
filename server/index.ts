// server/index.ts
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Stripe from "stripe";
import { z } from "zod";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/* ---------------- CORS ---------------- */
const app = express();
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(
  cors({
    origin: ALLOW_ORIGIN,
    credentials: true,
  })
);

/* ---------------- ENV: Stripe & Supabase ---------------- */
const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  PRICE_COINS_1K,
  PRICE_COINS_5K,
  PRICE_COINS_12K,
  CLIENT_BASE_URL,

  SUPABASE_URL,         // same project URL as client
  SUPABASE_SERVICE_KEY, // service-role key (secret; server only)
} = process.env;

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false },
        global: { headers: { "X-Client-Info": "eduverse-server" } },
      })
    : null;

/* ---------------- Helpers: Wallet persistence ---------------- */
/**
 * Supabase SQL (run once):
 *
 * create table if not exists wallets (
 *   user_id text primary key,
 *   balance int not null default 1000,
 *   updated_at timestamptz not null default now()
 * );
 *
 * create table if not exists purchases (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id text not null,
 *   amount int not null,
 *   kind text not null,      -- 'stripe_grant' | 'spend'
 *   session_id text null,
 *   created_at timestamptz not null default now()
 * );
 */

async function getBalance(userId: string): Promise<number> {
  if (!supabaseAdmin) return 1000; // fallback if no DB configured
  const { data, error } = await supabaseAdmin
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[wallet] getBalance error:", error);
    return 1000;
  }
  return data?.balance ?? 1000;
}

async function setBalance(userId: string, balance: number): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from("wallets")
    .upsert({ user_id: userId, balance, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("[wallet] setBalance error:", error);
}

async function grantCoins(userId: string, coins: number, meta?: { kind?: string; sessionId?: string }) {
  if (!supabaseAdmin) {
    console.log(`💰 (no DB) Grant ${coins} coins to ${userId}`);
    return;
  }
  const current = await getBalance(userId);
  const next = Math.max(0, current + coins);
  await setBalance(userId, next);

  const { error: logErr } = await supabaseAdmin.from("purchases").insert({
    user_id: userId,
    amount: coins,
    kind: meta?.kind ?? "stripe_grant",
    session_id: meta?.sessionId ?? null,
  });
  if (logErr) console.error("[wallet] grant log error:", logErr);

  console.log(`💰 Grant ${coins} coins → ${userId}. ${current} → ${next}`);
}

async function spendCoins(userId: string, amount: number): Promise<boolean> {
  if (!supabaseAdmin) {
    console.log(`🪙 (no DB) Spend ${amount} coins by ${userId} (not persisted)`);
    return true;
  }
  const current = await getBalance(userId);
  if (current < amount) return false;
  const next = current - amount;
  await setBalance(userId, next);

  const { error: logErr } = await supabaseAdmin.from("purchases").insert({
    user_id: userId,
    amount: -amount,
    kind: "spend",
  });
  if (logErr) console.error("[wallet] spend log error:", logErr);

  return true;
}

/* ---------------- Stripe Webhook (raw body FIRST) ---------------- */
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

        // Who to credit
        const userId = (session.client_reference_id || "anon").trim();

        // Determine coins per line item
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
        for (const item of lineItems.data) {
          const priceId = (item.price?.id || "").trim();

          // Option A: env mapping (simple)
          let coins =
            priceId === PRICE_COINS_1K ? 1000 :
            priceId === PRICE_COINS_5K ? 5000 :
            priceId === PRICE_COINS_12K ? 12000 :
            0;

          // Option B: Price metadata (if you set metadata.coins in Stripe)
          if (!coins && item.price?.metadata?.coins) {
            const parsed = Number(item.price.metadata.coins);
            if (Number.isFinite(parsed) && parsed > 0) coins = parsed;
          }

          if (coins > 0) {
            await grantCoins(userId, coins, { kind: "stripe_grant", sessionId: session.id });
          } else {
            console.warn(`Unknown price in webhook: ${priceId}`);
          }
        }
      }

      res.json({ received: true });
    } catch (e) {
      console.error("Webhook handler error:", e);
      res.status(500).send("Server error");
    }
  }
);

/* ---------------- JSON parser for everything else ---------------- */
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
  if (!apiKey) return res.status(503).json({ ok: false, error: "OPENAI_API_KEY not set on server" });

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

/* ---------------- Checkout endpoint ---------------- */
/**
 * POST /api/checkout
 * Body: { sku: "COINS_1K" | "COINS_5K" | "COINS_12K", userId?: string }
 * Returns: { url }
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
      client_reference_id: (userId || "anon").trim(),
      success_url: `${CLIENT_BASE_URL}/#/store?status=success`,
      cancel_url: `${CLIENT_BASE_URL}/#/store?status=cancel`,
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error("Checkout error:", e);
    return res.status(500).json({ error: "Checkout failed" });
  }
});

/* ---------------- Wallet API (client sync) ---------------- */
/** GET /api/wallet/balance?userId=abc -> { balance: number } */
app.get("/api/wallet/balance", async (req, res) => {
  const userId = String(req.query.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  try {
    const balance = await getBalance(userId);
    return res.json({ balance });
  } catch (e) {
    console.error("[wallet] balance error:", e);
    return res.status(500).json({ error: "Failed to fetch balance" });
  }
});

/** POST /api/wallet/spend { userId, amount } -> { ok } */
app.post("/api/wallet/spend", async (req, res) => {
  const body = (req.body || {}) as { userId?: string; amount?: number };
  const userId = String(body.userId || "").trim();
  const amount = Number(body.amount);
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Missing or invalid { userId, amount }" });
  }
  try {
    const ok = await spendCoins(userId, amount);
    if (!ok) return res.status(402).json({ error: "Insufficient balance" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[wallet] spend error:", e);
    return res.status(500).json({ error: "Failed to spend" });
  }
});

/* ---------------- Start (Render uses PORT) ---------------- */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`EduVerse API listening on :${PORT}`);
});
