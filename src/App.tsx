import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import { useRef, useState } from "react";
import { QuizGate, QuizGateResult } from "./features/quiz/QuizGate";
import ProfileBar from "./features/profile/ProfileBar";
import { useAge } from "./state/profile";
import StorePanel from "./features/store/StorePanel";

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
  const [tab, setTab] = useState<"play" | "build" | "avatar" | "store">("play");

  // Quiz Gate modal + result
  const [quizOpen, setQuizOpen] = useState(false);
  const [lastQuiz, setLastQuiz] = useState<QuizGateResult | null>(null);
  const cleared = lastQuiz?.passed ?? false;

  // Age (from profile bar)
  const age = useAge();

  // Mock queue state for MVP feel
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
    // fake 1.2s queue then land “in match”
    setTimeout(() => {
      setQueueing(false);
      alert(`✅ Joined mock lobby for age band ${age - 1}–${age + 1}. (Realtime next.)`);
    }, 1200);
  }

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">EduVerse Arena</div>
        <nav className="tabs">
          <button
            className={tab === "play" ? "tab active" : "tab"}
            onClick={() => setTab("play")}
          >
            Play
          </button>
          <button
            className={tab === "build" ? "tab active" : "tab"}
            onClick={() => setTab("build")}
          >
            Build Worlds
          </button>
          <button
            className={tab === "avatar" ? "tab active" : "tab"}
            onClick={() => setTab("avatar")}
          >
            Create-Your-Hero
          </button>
          <button
            className={tab === "store" ? "tab active" : "tab"}
            onClick={() => setTab("store")}
          >
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

        {/* Right-side panel */}
        <aside className="panel">
          {tab === "play" && (
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
          )}

          {tab === "build" && (
            <div>
              <h2>Build Worlds</h2>
              <p>
                Create obstacle courses, puzzles, and cooperative classrooms with safe templates.
              </p>
              <button className="primary">New Map</button>
            </div>
          )}

          {tab === "avatar" && (
            <div>
              <h2>Create-Your-Hero</h2>
              <p>Live 3D avatar editor (body, skin, hair, eyes, outfits, trails, win FX).</p>
              <button className="primary">Open Studio</button>
            </div>
          )}

          {tab === "store" && <StorePanel />}
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
    </div>
  );
}
