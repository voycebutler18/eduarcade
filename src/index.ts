import express from "express";
import cors from "cors";
import { z } from "zod";
import OpenAI from "openai";

const app = express();
app.use(express.json());

// CORS (lock down later; "*" okay for MVP)
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: ALLOW_ORIGIN }));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Kid-safe hint proxy
const HintInput = z.object({
  grade: z.union([z.literal("K"), z.number().int().min(1).max(12)]),
  subject: z.enum(["Math", "Reading/Writing", "Science", "Social Studies", "Languages", "Test Prep"]),
  question: z.string().min(3).max(300),
  // optional: lastWrong or attempt text to adjust scaffolding
  attempt: z.string().max(300).optional()
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

    // Guardrails: short, scaffolded, no final answer on first hint
    const system = [
      "You are a kid-safe learning coach for K–12.",
      "Never give the full final answer in the FIRST hint.",
      "Use one short sentence followed by a nudge or strategy.",
      "Keep it age-appropriate, positive, and concrete.",
      "If asked for harmful or inappropriate content, refuse politely."
    ].join(" ");

    const user = [
      `Grade: ${grade}`,
      `Subject: ${subject}`,
      `Question: ${question}`,
      attempt ? `Student attempt: ${attempt}` : null
    ]
      .filter(Boolean)
      .join("\n");

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_tokens: 120
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || "Try breaking the problem into smaller steps.";
    return res.json({ ok: true, hint: text });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "AI service failed" });
  }
});

// Start (Render uses PORT)
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`EduVerse API listening on :${PORT}`);
});
