// src/features/classroom/ClassroomPortal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSchedule } from "../../state/schedule";

export type ClassroomPortalProps = {
  classId: string;                 // e.g., "MATH", "ELA", "SCI", "SOC", "HOMEROOM", "LUNCH", "ELECT"
  label: string;                   // UI label: "Math", "ELA", etc.
  onStartLesson?: (classId: string) => void; // fires only if classId matches the active period
  onEndLesson?: (classId: string) => void;   // fires on leave or bell change while in class
};

/**
 * ClassroomPortal is a lightweight door/room controller:
 * - Shows current period + match/mismatch state
 * - Enter: marks isInClass=true; if this room matches the active period, auto-start lesson
 * - Leave: marks isInClass=false; stops lesson
 * - Auto-stops lesson on bell change
 */
export default function ClassroomPortal({
  classId,
  label,
  onStartLesson,
  onEndLesson,
}: ClassroomPortalProps) {
  const {
    periods,
    activePeriodId,
    getActivePeriod,
    enterClass,
    leaveClass,
    isInClass,
    nextBellTs,
  } = useSchedule();

  const active = useMemo(() => getActivePeriod(new Date()), [periods, activePeriodId, getActivePeriod]);
  const isCorrectRoom = active?.classId === classId;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // When entering the correct room during an active period, auto-start lesson
  const [lessonOn, setLessonOn] = useState(false);

  function handleEnter() {
    enterClass(classId);
    if (isCorrectRoom) {
      setLessonOn(true);
      onStartLesson?.(classId);
    } else {
      // Entered a room, but it's not the scheduled one; lesson should NOT start.
      setLessonOn(false);
    }
  }

  function handleLeave() {
    leaveClass();
    if (lessonOn) onEndLesson?.(classId);
    setLessonOn(false);
  }

  // Auto-stop the lesson at the bell while in class
  useEffect(() => {
    if (!nextBellTs) return;
    const id = setInterval(() => {
      if (Date.now() >= nextBellTs && lessonOn) {
        // Bell rang; end current lesson if in class
        if (isInClass) {
          onEndLesson?.(classId);
        }
        setLessonOn(false);
      }
    }, 250);
    return () => clearInterval(id);
  }, [nextBellTs, lessonOn, isInClass, onEndLesson, classId]);

  // Countdown label
  let timeLeft = "--:--";
  if (nextBellTs) {
    const ms = Math.max(0, nextBellTs - now);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    timeLeft = `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="room-card">
      <div className="room-head">
        <div className="room-title">🏫 {label}</div>
        <div className="room-sub">
          {active ? (
            <>
              <span className="pill">{active.label}</span>
              {isCorrectRoom ? (
                <span className="ok">On schedule</span>
              ) : (
                <span className="warn">Not this period</span>
              )}
            </>
          ) : (
            <span className="pill">No active period</span>
          )}
        </div>
      </div>

      <div className="room-body">
        {!isInClass && (
          <button className="primary w100" onClick={handleEnter}>
            Enter {label}
          </button>
        )}

        {isInClass && !lessonOn && (
          <div className="note">
            You’re inside <b>{label}</b>. This isn’t the scheduled class right now, so the AI teacher won’t start.
          </div>
        )}

        {isInClass && lessonOn && (
          <LessonPanel
            classLabel={label}
            timeLeft={timeLeft}
            onLeave={handleLeave}
          />
        )}
      </div>

      <style>{`
        .room-card{
          border:1px solid rgba(255,255,255,.08);
          background:#0b1222;
          border-radius:14px;
          padding:12px;
          color:#e6edf7;
        }
        .room-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .room-title{ font-weight:600; }
        .room-sub{ display:flex; align-items:center; gap:8px; font-size:12px; color:#9fb0c7; }
        .pill{ background:rgba(148,163,184,.15); padding:2px 8px; border-radius:999px; }
        .ok{ color:#86efac; }
        .warn{ color:#fca5a5; }
        .room-body{ margin-top:10px; display:grid; gap:10px; }
        .primary{
          background:#2563eb; border:none; color:white; padding:10px 12px;
          border-radius:10px; cursor:pointer;
        }
        .w100{ width:100%; }
        .note{
          font-size:13px; color:#c9d7ee; background:#0f172a; border:1px solid rgba(255,255,255,.08);
          padding:10px 12px; border-radius:10px;
        }
      `}</style>
    </div>
  );
}

/** Minimal in-room lesson panel (placeholder for your AI teacher) */
function LessonPanel({
  classLabel,
  timeLeft,
  onLeave,
}: {
  classLabel: string;
  timeLeft: string;
  onLeave: () => void;
}) {
  return (
    <div className="lesson">
      <div className="lesson-row">
        <span className="badge">AI Teacher</span>
        <span className="muted">Bell in {timeLeft}</span>
      </div>
      <div className="lesson-box">
        <p className="intro">
          “Welcome to <b>{classLabel}</b>. Please take your seat. Let’s start today’s lesson.”
        </p>
        <ul className="bullets">
          <li>Explains topic aligned to the current period</li>
          <li>Asks quick checks → routes to your 5-Q gate</li>
          <li>When you reach 5/5 this period, you’re free to build until the bell</li>
        </ul>
        <div className="actions">
          <button className="ghost" onClick={onLeave}>Leave classroom</button>
        </div>
      </div>

      <style>{`
        .lesson{ display:grid; gap:8px; }
        .lesson-row{ display:flex; align-items:center; justify-content:space-between; }
        .badge{ background:#22c55e1a; color:#86efac; border:1px solid #22c55e55; padding:2px 8px; border-radius:999px; font-size:12px; }
        .muted{ color:#9fb0c7; font-size:12px; }
        .lesson-box{
          background:#0f172a; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:12px;
        }
        .intro{ margin:0 0 6px 0; }
        .bullets{ margin:0; padding-left:18px; color:#cbd5e1; }
        .actions{ margin-top:10px; }
        .ghost{
          background:transparent; border:1px solid rgba(255,255,255,.12);
          color:#e6edf7; border-radius:10px; padding:8px 12px; cursor:pointer;
        }
      `}</style>
    </div>
  );
}
