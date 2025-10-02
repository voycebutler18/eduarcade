import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

import { QuizGate, QuizGateResult } from "./features/quiz/QuizGate";
import ProfileBar from "./features/profile/ProfileBar";
import { useAge, useUsername } from "./state/profile";
import StorePanel from "./features/store/StorePanel";
import AvatarStudio, { AvatarPreset } from "./features/avatar/AvatarStudio";
import BuildWorlds from "./features/build/BuildWorlds";
import ChatPanel from "./features/chat/ChatPanel";
import DailySpin from "./features/rewards/DailySpin";
import QuestsPanel from "./features/quests/QuestsPanel";
import ProgressCard from "./features/progress/ProgressCard";

/** ---------------- Hash “routes” (deep-linkable tabs) ---------------- */
type Tab = "play" | "build" | "avatar" | "store";
const TAB_HASH: Record<Tab, `#/${Tab}`> = {
  play: "#/play",
  build: "#/build",
  avatar: "#/avatar",
  store: "#/store",
};
function hashToTab(hash: string): Tab {
  const v = hash.replace(/^#\//, "") as Tab;
  return (["play", "build", "avatar", "store"] as Tab[]).includes(v) ? v : "play";
}

/** ---------------- Small demo mesh ---------------- */
function SpinningBlock() {
  const ref = useRef<THREE.Mesh>(null!);
  return (
    <mesh
      ref={ref}
      rotation={[0.4, 0.6, 0]}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "default")}
    >
      <boxGeometry args={[1.4, 1.4, 1.4]} />
      <meshStandardMaterial metalness={0.2} roughness={0.4} />
    </mesh>
  );
}

export default function App() {
  /** ---------------- Routing (tabs) ---------------- */
  const [tab, setTab] = useState<Tab>(() => hashToTab(window.location.hash || "#/play"));
  useEffect(() => {
    const onHash = () => setTab(hashToTab(window.location.hash || "#/play"));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  function go(next: Tab) {
    const h = TAB_HASH[next];
    if (window.location.hash !== h) window.location.hash = h;
    setTab(next);
  }

  /** ---------------- Quiz gate state ---------------- */
  const [quizOpen, setQuizOpen] = useState(false);
  const [lastQuiz, setLastQuiz] = useState<QuizGateResult | null>(null);
  const cleared = lastQuiz?.passed ?? false;

  /** ---------------- Profile data ---------------- */
  const age = useAge();
  const username = useUsername();

  /** ---------------- Mock queue state (MVP) ---------------- */
  const [queueing, setQueueing] = useState(false);
  function mockQueue() {
    if (age == null) {
      alert("Set your birthday in the Profile bar to enable age-band matchmaking.");
      return;
    }
    if (!cleared) {
      setQuizOpen(true);
      return;
    }
    setQueueing(true);
    setTimeout(() => {
      setQueueing(false);
      alert(`✅ Joined mock lobby for age band ${age - 1}–${age + 1}. (Realtime next.)`);
    }, 1200);
  }

  /** ---------------- Avatar Studio modal ---------------- */
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarPreset, setAvatarPreset] = useState<AvatarPreset | null>(null);

  /** ---------------- School Mode (tight chat / no voice) ---------------- */
  const [schoolMode, setSchoolMode] = useState(false);

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">EduVerse Arena</div>
        <nav className="tabs">
          <button className={tab === "play" ? "tab active" : "tab"} onClick={() => go("play")}>
            Play
          </button>
          <button className={tab === "build" ? "tab active" : "tab"} onClick={() => go("build")}>
            Build Worlds
          </button>
          <button className={tab === "avatar" ? "tab active" : "tab"} onClick={() => go("avatar")}>
            Create-Your-Hero
          </button>
          <button className={tab === "store" ? "tab active" : "tab"} onClick={() => go("store")}>
            Store
          </button>
        </nav>
      </header>

      {/* Profile bar (username, birthday/age, gender, coins) */}
      <div style={{ padding: "10px 14px" }}>
        <ProfileBar />
      </div>

      {/* 3D stage */}
      <section className="stage">
        <Canvas camera={{ position: [3, 3, 3], fov: 55 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} />
          <Sky sunPosition={[100, 20, 100]} />
          <SpinningBlock />
          <OrbitControls enablePan={false} />
        </Canvas>

        {/* Right-side panel (routes) */}
        <aside className="panel">
          {/* ---- PLAY ---- */}
          {tab === "play" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <h2>Party Playlists</h2>
                <ul className="list">
                  <li>🏁 Party Runs (Obby sprints)</li>
                  <li>🧩 Team Trials (Co-op puzzles)</li>
                </ul>

                <button className="primary" onClick={mockQueue}>
                  {queueing ? "Queueing…" : cleared ? "Queue (Cleared)" : "Queue (5-Q Skill Check)"}
                </button>

                <p className="muted small" style={{ marginTop: 8 }}>
                  {cleared
                    ? `Cleared in ${lastQuiz?.subject} • ${
                        lastQuiz?.grade === "K" ? "K" : "G" + lastQuiz?.grade
                      } (${lastQuiz?.correctCount}/5)`
                    : "Pass 3/5 to queue. Hints give a nudge—no full answers on first hint."}
                </p>
              </div>

              {/* Quests (Daily/Weekly) */}
              <QuestsPanel />

              {/* School Mode toggle */}
              <label className="muted small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={schoolMode}
                  onChange={(e) => setSchoolMode(e.target.checked)}
                />
                Enable School Mode (tight chat, no voice)
              </label>

              {/* Room Chat */}
              <ChatPanel username={username || "Player"} schoolMode={schoolMode} />

              {/* Printable Progress */}
              <div>
                <h3 style={{ margin: "8px 0 6px" }}>Printable Progress</h3>
                <ProgressCard />
              </div>
            </div>
          )}

          {/* ---- BUILD ---- */}
          {tab === "build" && <BuildWorlds />}

          {/* ---- AVATAR ---- */}
          {tab === "avatar" && (
            <div>
              <h2>Create-Your-Hero</h2>
              <p>Live 3D avatar editor (body, skin, hair, eyes, outfits, trails, win FX).</p>
              <button className="primary" onClick={() => setAvatarOpen(true)}>
                Open Studio
              </button>

              {avatarPreset && (
                <div className="muted small" style={{ marginTop: 8 }}>
                  Saved preset: {avatarPreset.body} body • {avatarPreset.skin} skin • {avatarPreset.hair} hair •{" "}
                  {avatarPreset.eyes} eyes • {avatarPreset.expr}
                  {avatarPreset.outfitId ? ` • outfit=${avatarPreset.outfitId}` : ""}
                </div>
              )}
            </div>
          )}

          {/* ---- STORE ---- */}
          {tab === "store" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <DailySpin />
              <StorePanel />
            </div>
          )}
        </aside>
      </section>

      {/* Footer */}
      <footer className="footer">
        <span>Prototype • Vite + React + R3F</span>
      </footer>

      {/* Quiz modal */}
      <QuizGate
        open={quizOpen}
        onClose={(res) => {
          if (!res) {
            setQuizOpen(false);
            return;
          }
          setLastQuiz(res);
          setQuizOpen(false);
        }}
      />

      {/* Avatar Studio modal */}
      <AvatarStudio
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        initial={avatarPreset ?? undefined}
        onSave={(preset) => setAvatarPreset(preset)}
      />
    </div>
  );
}
