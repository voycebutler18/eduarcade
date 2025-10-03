// src/App.tsx
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Sky, ContactShadows } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

import { QuizGate, QuizGateResult } from "./features/quiz/QuizGate";
import ProfileBar from "./features/profile/ProfileBar";
import { useAge, useUsername } from "./state/profile";
import StorePanel from "./features/store/StorePanel";
import AvatarStudio from "./features/avatar/AvatarStudio";
import BuildWorlds from "./features/build/BuildWorlds";
import ChatPanel from "./features/chat/ChatPanel";
import DailySpin from "./features/rewards/DailySpin";
import QuestsPanel from "./features/quests/QuestsPanel";
import ProgressCard from "./features/progress/ProgressCard";
import HeroRig3D from "./features/avatar/HeroRig3D";
import { useAvatar } from "./state/avatar";

import { useSchedule, startBellLoop, stopBellLoop } from "./state/schedule";
import ClassroomPortal from "./features/classroom/ClassroomPortal";

// World + player
import OutdoorWorld3D, { type Collider } from "./features/campus/OutdoorWorld3D";
import GlideController from "./features/player/GlideController";
import FollowCam from "./features/player/FollowCam";

// Controls & helpers
import Thumbstick from "./features/controls/Thumbstick";
import EnsureCanvasFocus from "./features/controls/EnsureCanvasFocus";
import SprintModifier from "./features/controls/SprintModifier";
import MobileJumpButton from "./features/controls/MobileJumpButton";

let Campus3D: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Campus3D = require("./features/campus/Campus3D").default;
} catch {
  Campus3D = function CampusPlaceholder() {
    return null;
  };
}

/* ---------------- Tabs ---------------- */
type Tab = "play" | "build" | "avatar" | "store";
const TAB_HASH: Record<Tab, `#/${Tab}`> = {
  play: "#/play",
  build: "#/build",
  avatar: "#/avatar",
  store: "#/store",
};
const hashToTab = (h: string): Tab => {
  const v = h.replace(/^#\//, "") as Tab;
  return (["play", "build", "avatar", "store"] as Tab[]).includes(v) ? v : "play";
};

/* tiny on-screen schedule HUD */
function ScheduleHUD() {
  const { periods, activePeriodId, nextBellTs, canBuild } = useSchedule();
  const active = periods.find((p) => p.id === activePeriodId);
  const building = canBuild();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  let timeLeft = "--:--";
  if (nextBellTs) {
    const ms = Math.max(0, nextBellTs - now);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    timeLeft = `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="pointer-events-none fixed left-4 top-4 z-50 grid gap-1 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide opacity-80">Current Period</div>
      <div className="text-lg font-semibold leading-none">{active?.label ?? "—"}</div>
      <div className="text-xs opacity-80">Next bell in: {timeLeft}</div>
      <div
        className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs ${
          building ? "bg-emerald-500/80" : "bg-rose-500/80"
        }`}
      >
        {building ? "Free Build Unlocked" : "Complete 5 Questions to Build"}
      </div>
    </div>
  );
}

/* Build tab guard */
function BuildGuard({ children }: { children: React.ReactNode }) {
  const { canBuild } = useSchedule();
  const unlocked = canBuild();
  if (unlocked) return <>{children}</>;
  return (
    <div
      style={{
        position: "relative",
        border: "1px solid rgba(255,255,255,.08)",
        background: "#0b1222",
        color: "#e6edf7",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Build Locked</div>
      <p style={{ margin: 0, color: "#9fb0c7", fontSize: 14 }}>
        Get a perfect <b>5/5</b> in your current class to unlock free build until the next bell. You can also wait for
        the bell to change periods.
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => hashToTab(window.location.hash || "#/play"));
  useEffect(() => {
    const onHash = () => setTab(hashToTab(window.location.hash || "#/play"));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (t: Tab) => {
    const h = TAB_HASH[t];
    if (location.hash !== h) location.hash = h;
    setTab(t);
  };

  // start/stop bell loop
  useEffect(() => {
    startBellLoop(1000);
    return () => stopBellLoop();
  }, []);

  const [quizOpen, setQuizOpen] = useState(false);
  const [lastQuiz, setLastQuiz] = useState<QuizGateResult | null>(null);
  const cleared = lastQuiz?.passed ?? false;

  const age = useAge();
  const username = useUsername();

  const [queueing, setQueueing] = useState(false);
  function mockQueue() {
    if (age == null) return alert("Set your birthday in the Profile bar to enable age-band matchmaking.");
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

  const [studioOpen, setStudioOpen] = useState(false);
  const { preset } = useAvatar();
  const [schoolMode, setSchoolMode] = useState(false);

  // scene switching (Play)
  const [scene, setScene] = useState<"outdoor" | "campus">("outdoor");
  const [outdoorColliders, setOutdoorColliders] = useState<Collider[]>([]);

  // refs for thumbstick + player + movement state
  const playerRef = useRef<THREE.Object3D | null>(null);
  const stickDirRef = useRef<{ x: number; z: number } | null>(null);
  const manualYawRef = useRef<number | null>(null);   // freeze facing when set
  const lastAngleRef = useRef<number | null>(null);   // remember last stick angle
  const speedRef = useRef<number>(6);                 // for SprintModifier
  const jumpRef = useRef<boolean>(false);             // edge (press)
  const jumpHeldRef = useRef<boolean>(false);         // held state (for variable height)

  const [showStick] = useState(true);

  function enterSchool() { setScene("campus"); }
  function enterPlot(_plotId: string) { go("build"); }
  function handleStartLesson(_classId: string) {}
  function handleEndLesson(_classId: string) {}

  // Play scene (Outdoor vs Campus)
  function PlayScene() {
    if (scene === "outdoor") {
      return (
        <>
          <OutdoorWorld3D
            onEnterSchool={enterSchool}
            onEnterPlot={enterPlot}
            myPlotId="P1"
            onReadyColliders={setOutdoorColliders}
          />

          {/* Player + avatar with GlideController */}
          <GlideController
            key="player-main"
            start={{ x: 0, z: 8 }}
            accel={18}
            damping={2.2}
            maxSpeed={8}
            inputDirRef={stickDirRef}
            manualYawRef={manualYawRef}
            nodeRef={playerRef}
          >
            {/* Raise the rig so feet aren't inside ground */}
            <group position={[0, 0.4, 0]} scale={0.95}>
              <HeroRig3D preset={preset} moveAmount={0} />
            </group>
          </GlideController>

          {/* Follow camera */}
          <FollowCam targetRef={playerRef} offset={[0, 4.5, 8]} lerp={0.12} />
        </>
      );
    }
    return <Campus3D onEnter={(cid: string) => console.log("enter class", cid)} />;
  }

  // Backdrop for non-Play tabs (keeps your avatar preview)
  function NonPlayBackdrop() {
    return (
      <>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color={"#cfd7df"} roughness={0.95} metalness={0} />
        </mesh>
        <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={12} blur={2.4} far={8} />
        <group position={[0, 0, 0]}>
          <HeroRig3D preset={preset} />
        </group>
      </>
    );
  }

  return (
    <div className="app">
      <ScheduleHUD />

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

      <div style={{ padding: "10px 14px" }}>
        <ProfileBar />
      </div>

      <section className="stage">
        <Canvas
          shadows
          camera={{ position: [3.5, 3.0, 3.5], fov: 55 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          {/* lighting */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <Sky sunPosition={[100, 20, 100]} />

          {tab === "play" ? <PlayScene /> : <NonPlayBackdrop />}

          {/* Ensure the canvas grabs keyboard focus */}
          <EnsureCanvasFocus />
        </Canvas>

        {/* Thumbstick overlay (with facing freeze on release) */}
        {tab === "play" && (
          <div style={{ position: "fixed", left: 0, bottom: 0, zIndex: 60 }}>
            <Thumbstick
              onChange={(dir) => {
                if (dir) {
                  // moving: let input control yaw and remember the last angle
                  manualYawRef.current = null;
                  stickDirRef.current = dir;
                  lastAngleRef.current = Math.atan2(dir.x, dir.z);
                } else {
                  // released: stop movement and freeze yaw to last angle
                  stickDirRef.current = { x: 0, z: 0 };
                  if (lastAngleRef.current != null) {
                    manualYawRef.current = lastAngleRef.current;
                  }
                }
              }}
            />
          </div>
        )}

        {/* Sprint & mobile jump controls only matter during Play */}
        {tab === "play" && (
          <>
            {/* Shift to sprint: writes into speedRef.current */}
            <SprintModifier speedRef={speedRef} baseSpeed={6} sprintSpeed={10} />
            {/* Big touch jump button (sets jumpRef/jumpHeldRef) */}
            <MobileJumpButton jumpRef={jumpRef} jumpHeldRef={jumpHeldRef} />
          </>
        )}

        <aside className="panel">
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
                  {cleared ? `Cleared • ${lastQuiz?.subject} (${lastQuiz?.correctCount}/5)` : "Pass 5/5 to queue."}
                </p>
              </div>

              <QuestsPanel />

              {/* School campus shortcuts (UI) */}
              <div style={{ marginTop: 6 }}>
                <h3 style={{ margin: "6px 0 8px" }}>School Campus</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <ClassroomPortal classId="HOMEROOM" label="Homeroom" onStartLesson={handleStartLesson} onEndLesson={handleEndLesson} />
                  <ClassroomPortal classId="MATH" label="Math" onStartLesson={handleStartLesson} onEndLesson={handleEndLesson} />
                  <ClassroomPortal classId="ELA" label="ELA / Reading" onStartLesson={handleStartLesson} onEndLesson={handleEndLesson} />
                  <ClassroomPortal classId="SCI" label="Science" onStartLesson={handleStartLesson} onEndLesson={handleEndLesson} />
                  <ClassroomPortal classId="SOC" label="Social Studies" onStartLesson={handleStartLesson} onEndLesson={handleEndLesson} />
                  <ClassroomPortal classId="LUNCH" label="Lunch" onStartLesson={handleStartLesson} onEndLesson={handleEndLesson} />
                  <ClassroomPortal classId="ELECT" label="Elective" onStartLesson={handleStartLesson} onEndLesson={handleEndLesson} />
                </div>
              </div>

              <label className="muted small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={schoolMode} onChange={(e) => setSchoolMode(e.target.checked)} />
                Enable School Mode (tight chat, no voice)
              </label>

              <ChatPanel username={username || "Player"} schoolMode={schoolMode} />

              <div>
                <h3 style={{ margin: "8px 0 6px" }}>Printable Progress</h3>
                <ProgressCard />
              </div>
            </div>
          )}

          {tab === "build" && (
            <BuildGuard>
              <BuildWorlds />
            </BuildGuard>
          )}

          {tab === "avatar" && (
            <div>
              <h2>Create-Your-Hero</h2>
              <p>Live 3D avatar editor (body, skin, hair, eyes, outfits, trails, win FX).</p>
              <button className="primary" onClick={() => setStudioOpen(true)}>
                Open Studio
              </button>
            </div>
          )}

          {tab === "store" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <DailySpin />
              <StorePanel />
            </div>
          )}
        </aside>
      </section>

      <footer className="footer">
        <span>Prototype • Vite + React + R3F</span>
      </footer>

      <QuizGate
        open={studioOpen ? false : quizOpen}
        onClose={(res) => {
          if (!res) {
            setQuizOpen(false);
            return;
          }
          setLastQuiz(res);
          setQuizOpen(false);
        }}
      />

      <AvatarStudio open={studioOpen} onClose={() => setStudioOpen(false)} />
    </div>
  );
}
