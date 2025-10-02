// src/features/classroom/LessonDock.tsx
import React from "react";

export type LessonDockProps = {
  activeClassId: "HOMEROOM" | "MATH" | "ELA" | "SCI" | "SOC" | "LUNCH" | "ELECT" | null;
  onStartQuiz: () => void;
  onClose: () => void; // close dock (e.g., when you leave class or bell rings)
};

const SUBJECT_BY_CLASS: Record<Exclude<LessonDockProps["activeClassId"], null>, string> = {
  HOMEROOM: "Homeroom",
  MATH: "Math",
  ELA: "Reading/Writing",
  SCI: "Science",
  SOC: "Social Studies",
  LUNCH: "Advisory",
  ELECT: "Elective",
};

const OPENING_BY_CLASS: Record<Exclude<LessonDockProps["activeClassId"], null>, string> = {
  HOMEROOM:
    "Good morning! Settle in. Quick check-in, then we’ll review today’s goals across your subjects.",
  MATH:
    "Welcome to Math. Today we’ll warm up with number sense and a problem-solving mini challenge.",
  ELA:
    "Welcome to ELA. We’ll scan for main ideas and craft tight sentences with clear transitions.",
  SCI:
    "Welcome to Science. We’ll observe, hypothesize, and test ideas about energy and change.",
  SOC:
    "Welcome to Social Studies. We’ll compare sources and connect past events to present day.",
  LUNCH:
    "Enjoy advisory time. Reflect on progress and prep for your next class. No quiz required.",
  ELECT:
    "Welcome to your Elective. Let’s explore skills and create something you’re proud of.",
};

export default function LessonDock({ activeClassId, onStartQuiz, onClose }: LessonDockProps) {
  if (!activeClassId) return null;
  const subject = SUBJECT_BY_CLASS[activeClassId];
  const opener = OPENING_BY_CLASS[activeClassId];

  const quizEnabled = activeClassId !== "LUNCH"; // lunch/advisory has no quiz

  return (
    <div className="lesson-dock">
      <div className="ld-head">
        <div className="ld-title">👩🏽‍🏫 {subject} — AI Teacher</div>
        <button className="ld-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="ld-body">
        <p className="ld-opener">{opener}</p>
        <ul className="ld-points">
          <li>Short explainer aligned to this class period</li>
          <li>5-question skill check to unlock Free Build</li>
          <li>Free Build lasts until the bell rings</li>
        </ul>
        <div className="ld-actions">
          {quizEnabled ? (
            <button className="primary" onClick={onStartQuiz}>Start 5-Q Skill Check</button>
          ) : (
            <div className="ld-note">No quiz this period. Use this time to recharge and plan.</div>
          )}
        </div>
      </div>

      <style>{`
        .lesson-dock{
          border:1px solid rgba(255,255,255,.08);
          background:#0b1222; color:#e6edf7; border-radius:14px;
          box-shadow:0 18px 50px rgba(0,0,0,.45); overflow:hidden;
        }
        .ld-head{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.07); }
        .ld-title{ font-weight:600; }
        .ld-x{ background:transparent; border:none; color:#9fb0c7; font-size:18px; cursor:pointer; }
        .ld-body{ padding:12px; display:grid; gap:8px; }
        .ld-opener{ margin:0; color:#cbd5e1; }
        .ld-points{ margin:0; padding-left:18px; color:#a9b7d5; }
        .ld-actions{ margin-top:6px; }
        .primary{
          background:#2563eb; border:none; color:white; padding:10px 12px;
          border-radius:10px; cursor:pointer;
        }
        .ld-note{ font-size:14px; color:#9fb0c7; }
      `}</style>
    </div>
  );
}
