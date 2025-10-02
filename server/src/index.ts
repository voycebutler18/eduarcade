import express from "express";
import cors from "cors";
import { z } from "zod";
import OpenAI from "openai";

const app = express();
app.use(express.json());

// CORS: allow one or multiple origins via env (comma-separated)
const raw = process.env.CORS_ORIGIN || "*";
const origins = raw.split(",").map(s => s.trim());
app.use(cors({ origin: origins.length === 1 ? origins[0] : origins }));

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Kid-safe hint proxy
const HintInput = z.object({
  grade: z.union([z.literal("K"), z.number().int().min(1).max(12)]),
  subject: z.enum(["Math", "Reading/Writing", "Science", "Social Studies", "Languages", "Test Prep"]),
  question: z.string().min(3).max(300),
  attempt: z.string().max(300).optional(),
});

app.post("/api/hint", async (req, res) => {
  const parsed = HintInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Bad input" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ ok: false, error: "OPENAI_API_KEY not set" });

  try {
    const openai = new OpenAI({ apiKey });
    const { grade, subject, question, attempt } = parsed.data;

    const system =
      "You are a kid-safe learning coach for K–12. Never give the full final answer in the FIRST hint. Keep it short, positive, concrete, and age-appropriate.";
    const user = [
      `Grade: ${grade}`,
      `Subject: ${subject}`,
      `Question: ${question}`,
      attempt ? `Student attempt: ${attempt}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 120,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });

    const hint = r.choices?.[0]?.message?.content?.trim() || "Try breaking the problem into smaller steps.";
    res.json({ ok: true, hint });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "AI service failed" });
  }
});

// Start (Render injects PORT)
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`EduVerse API listening on :${PORT}`));
