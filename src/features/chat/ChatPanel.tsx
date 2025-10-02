import { useEffect, useMemo, useRef, useState } from "react";

/**
 * ChatPanel (MVP)
 * - Room chat with basic filtering (bad-words list + URL & PII guardrails)
 * - Push-to-talk UI stub (no mic capture yet; just UX + state machine)
 * - Slow-mode: 1 message / 3s per user (client-side)
 * - Max 50 messages in buffer; newest at bottom; autoscroll
 * - School Mode toggle (tightens filters and disables mic)
 *
 * Notes:
 * - Realtime networking will be added later via Supabase Realtime channels.
 * - The filter is intentionally conservative for MVP and can be tuned.
 */

type ChatMsg = {
  id: string;
  ts: number;
  user: string;
  text: string;
  system?: boolean;
};

const BAD_WORDS = [
  // keep short & generic for MVP (we'll move to a policy list later)
  "badword",
  "dumb",
  "stupid",
  "idiot",
  "hate",
];

const URL_REGEX = /(https?:\/\/|www\.)\S+/i;
const EMAIL_REGEX = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_REGEX = /(\+\d{1,2}\s?)?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/;

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function sanitize(text: string, schoolMode: boolean) {
  let out = text;

  // Block URLs/PII in School Mode, otherwise mask
  const blocker = (pattern: RegExp, replacement: string) => {
    if (schoolMode) {
      if (pattern.test(out)) {
        out = out.replace(pattern, "[blocked]");
      }
    } else {
      out = out.replace(pattern, replacement);
    }
  };

  blocker(URL_REGEX, "[link]");
  blocker(EMAIL_REGEX, "[email]");
  blocker(PHONE_REGEX, "[phone]");

  // Simple bad word mask
  for (const w of BAD_WORDS) {
    const rx = new RegExp(`\\b${escapeRegExp(w)}\\b`, "ig");
    out = out.replace(rx, maskWord);
  }

  // Collapse excessive whitespace
  out = out.replace(/\s{3,}/g, "  ");

  // Trim
  out = out.trim();

  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskWord(match: string) {
  if (match.length <= 2) return "*".repeat(match.length);
  return match[0] + "*".repeat(match.length - 2) + match[match.length - 1];
}

export default function ChatPanel({
  username = "Player",
  schoolMode = false,
}: {
  username?: string;
  schoolMode?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      id: generateId(),
      ts: Date.now(),
      user: "System",
      text: schoolMode
        ? "School Mode: chat is tightened and push-to-talk is disabled."
        : "Welcome! Be kind. No personal info or links.",
      system: true,
    },
  ]);
  const [input, setInput] = useState("");
  const [lastSentAt, setLastSentAt] = useState(0);

  // Mic (push-to-talk) stub
  const [micHeld, setMicHeld] = useState(false);

  const canSend = useMemo(() => {
    const now = Date.now();
    return now - lastSentAt >= 3000 && input.trim().length > 0;
  }, [lastSentAt, input]);

  const logRef = useRef<HTMLDivElement | null>(null);

  // autoscroll
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send() {
    const txt = input.trim();
    if (!txt) return;

    // slow-mode
    const now = Date.now();
    if (now - lastSentAt < 3000) {
      toast("Slow mode: please wait a moment.");
      return;
    }

    // sanitize
    const safe = sanitize(txt, schoolMode);
    if (!safe) {
      toast("Message blocked by filter.");
      return;
    }

    // push message
    const msg: ChatMsg = { id: generateId(), ts: now, user: username, text: safe };
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.slice(Math.max(0, next.length - 50)); // cap 50
    });
    setLastSentAt(now);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      send();
    }
  }

  // Push-to-talk handlers (UI only)
  function micDown() {
    if (schoolMode) {
      toast("Voice disabled in School Mode.");
      return;
    }
    setMicHeld(true);
  }
  function micUp() {
    setMicHeld(false);
    // In a real build, we'd stop recording and submit a short transcript.
    // For MVP UX, we just add a placeholder system note.
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        ts: Date.now(),
        user: "System",
        text: `${username} used push-to-talk (voice transcript coming soon).`,
        system: true,
      },
    ]);
  }

  return (
    <div className="chat">
      <div className="head">
        <div>
          <h3 style={{ margin: 0 }}>Room Chat</h3>
          <div className="muted small">
            {schoolMode
              ? "School Mode: tight filters, no links/PII, voice disabled."
              : "Filters on. Be kind. No links/PII."}
          </div>
        </div>
        <div className="micWrap">
          <button
            className={`mic ${micHeld ? "held" : ""}`}
            onMouseDown={micDown}
            onMouseUp={micUp}
            onMouseLeave={() => micHeld && micUp()}
            disabled={schoolMode}
            aria-pressed={micHeld}
            aria-label="Push to talk"
            title={schoolMode ? "Disabled in School Mode" : "Hold to speak"}
          >
            {micHeld ? "● Recording…" : "🎙 Push-to-Talk"}
          </button>
        </div>
      </div>

      <div className="log" ref={logRef} aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.system ? "sys" : ""}`}>
            {!m.system && <span className="u">{m.user}:</span>} <span>{m.text}</span>
          </div>
        ))}
      </div>

      <div className="inputRow">
        <input
          className="inp"
          placeholder="Type message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={240}
        />
        <button className="primary" onClick={send} disabled={!canSend}>
          Send
        </button>
      </div>

      <style>{`
        .chat{ display:flex; flex-direction:column; gap:10px; }
        .head{
          display:grid; grid-template-columns:1fr auto; align-items:end; gap:10px;
          background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
          border-radius:12px; padding:10px;
        }
        .micWrap{}
        .mic{
          background:#111a2d; color:#e6edf7; border:1px solid rgba(255,255,255,.12);
          border-radius:999px; padding:8px 12px; cursor:pointer; min-width:150px;
        }
        .mic.held{
          border-color:rgba(96,165,250,.45);
          box-shadow:0 0 0 2px rgba(96,165,250,.15) inset;
        }
        .log{
          height:260px; overflow:auto; padding:10px;
          background:#0f172a; border:1px solid rgba(255,255,255,.08);
          border-radius:12px;
        }
        .msg{ padding:6px 8px; }
        .msg.sys{ color:#9fb0c7; font-size:12px; }
        .u{ font-weight:700; margin-right:6px; color:#cde3ff; }
        .inputRow{ display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; }
        .inp{
          background:#121a2c; color:#e6edf7; border-radius:10px;
          border:1px solid rgba(255,255,255,.08); padding:10px 12px; min-height:38px;
        }
        .primary{
          background:linear-gradient(90deg, #60a5fa, #22d3ee); color:#09121e; font-weight:700;
          border:none; padding:10px 14px; border-radius:10px; cursor:pointer; box-shadow:0 6px 18px rgba(34,211,238,.25);
        }
        .muted{ color:#9fb0c7; }
        .small{ font-size:12px; }
      `}</style>
    </div>
  );
}

/* ---------------- mini toast ---------------- */
function toast(msg: string) {
  // super-minimal inline toast
  const div = document.createElement("div");
  div.textContent = msg;
  Object.assign(div.style, {
    position: "fixed",
    bottom: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#111a2d",
    color: "#e6edf7",
    border: "1px solid rgba(255,255,255,.12)",
    padding: "8px 12px",
    borderRadius: "10px",
    zIndex: "100",
  });
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1600);
}
