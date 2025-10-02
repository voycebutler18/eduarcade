// src/features/avatar/AvatarStudio.tsx
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import HeroRig3D from "./HeroRig3D";
import { useAvatar, AvatarPreset } from "../../state/avatar";

/**
 * 3D Avatar Studio
 * - Left: live 3D preview using the same HeroRig3D
 * - Right: controls for body/skin/hair/eyes/expression/outfit
 * - Save writes to zustand store -> App scene updates instantly
 * - Fixes: front-facing default view, better framing, quick view buttons
 */

export type AvatarStudioProps = {
  open: boolean;
  onClose: () => void;
  initial?: AvatarPreset;
  onSave?: (preset: AvatarPreset) => void;
};

export default function AvatarStudio({ open, onClose, initial, onSave }: AvatarStudioProps) {
  const { preset: current, setPreset } = useAvatar();
  const [draft, setDraft] = useState<AvatarPreset>(initial ?? current);

  useEffect(() => {
    if (!open) return;
    setDraft(initial ?? current);
  }, [open, initial, current]);

  if (!open) return null;

  function choose<K extends keyof AvatarPreset>(key: K, value: AvatarPreset[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function save() {
    setPreset(draft);
    onSave?.(draft);
    onClose();
  }

  return (
    <div className="eva-modalRoot" role="dialog" aria-modal="true">
      <div className="eva-modalCard">
        <div className="eva-modalHead">
          <h2>Create-Your-Hero</h2>
          <button className="eva-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="eva-modalBody">
          {/* 3D preview */}
          <Preview3D preset={draft} />

          {/* Controls */}
          <div className="eva-controls">
            <Section title="Body">
              <Row options={["Slim","Standard","Athletic"] as const} value={draft.body} onPick={(v)=>choose("body", v)} />
            </Section>

            <Section title="Skin tone">
              <div className="eva-swatches">
                {(["Very Light","Light","Tan","Deep","Rich"] as const).map((s)=>(
                  <button
                    key={s}
                    className={"eva-sw "+(draft.skin===s?"on":"")}
                    style={{ background: skinHex(s) }}
                    onClick={()=>choose("skin",s)}
                    aria-label={s}
                  />
                ))}
              </div>
            </Section>

            <Section title="Hair">
              <Row options={["Short","Ponytail","Curly","Buzz"] as const} value={draft.hair} onPick={(v)=>choose("hair", v)} />
            </Section>

            <Section title="Eyes">
              <Row options={["Round","Sharp","Happy"] as const} value={draft.eyes} onPick={(v)=>choose("eyes", v)} />
            </Section>

            <Section title="Expression">
              <Row options={["Neutral","Smile","Wow","Determined"] as const} value={draft.expr} onPick={(v)=>choose("expr", v)} />
            </Section>

            <Section title="Outfit (cosmetic)">
              <div className="eva-outfits">
                <OutfitCard
                  title="Runner Set" price="Owned" active={draft.outfitId==="outfit_runner"}
                  onClick={()=>choose("outfitId","outfit_runner")} swatch="#1f3e76" />
                <OutfitCard
                  title="Astro Set" price="420c" active={draft.outfitId==="outfit_astro"}
                  onClick={()=>choose("outfitId","outfit_astro")} swatch="#2a9dad" />
              </div>
            </Section>

            <div className="eva-actions">
              <button className="eva-ghost" onClick={onClose}>Cancel</button>
              <button className="eva-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
}

/* ---------- 3D Preview with better framing + quick views ---------- */

function Preview3D({ preset }: { preset: AvatarPreset }) {
  const controls = useRef<any>(null);
  const target = new THREE.Vector3(0, 1.0, 0);     // look at upper chest
  const fitDistance = 3.0;                          // keeps whole body in frame
  const front = () => setView(0, 1.05, fitDistance);
  const left = () => setView(-Math.PI / 2, 1.05, fitDistance);
  const right = () => setView(Math.PI / 2, 1.05, fitDistance);
  const back = () => setView(Math.PI, 1.05, fitDistance);
  const fit = () => setView(controls.current?.getAzimuthalAngle?.() ?? 0, 1.05, fitDistance);

  function setView(azimuth: number, polar: number, radius: number) {
    if (!controls.current) return;
    const c = controls.current;
    const cam = c.object as THREE.PerspectiveCamera;

    // move camera to spherical around target
    const s = new THREE.Spherical(radius, polar, azimuth);
    const pos = new THREE.Vector3().setFromSpherical(s).add(target);
    cam.position.copy(pos);
    c.target.copy(target);
    c.update();
  }

  // set a good default on mount
  useEffect(() => {
    // Front view
    setTimeout(() => front(), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="eva-preview3d">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 1.8, 3], fov: 50 }} // front-facing default
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[4, 6, 5]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        {/* ground & contact shadow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.0001, 0]}>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color={"#ccd6e0"} roughness={0.95} />
        </mesh>
        <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={8} blur={2.1} far={6} />

        {/* live draft preset */}
        <group position={[0, 0, 0]}>
          <HeroRig3D preset={preset} />
        </group>

        <OrbitControls
          ref={controls}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          // keep camera above the ground and not too high
          minPolarAngle={0.7}   // ~40°
          maxPolarAngle={1.45}  // ~83°
          minDistance={2.0}
          maxDistance={4.0}
        />
      </Canvas>

      {/* Quick views */}
      <div className="eva-quick">
        <button onClick={front}>Front</button>
        <button onClick={left}>Left</button>
        <button onClick={right}>Right</button>
        <button onClick={back}>Back</button>
        <button onClick={fit}>Fit</button>
      </div>
    </div>
  );
}

/* ---------- tiny UI helpers ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="eva-section">
      <div className="eva-label">{title}</div>
      {children}
    </div>
  );
}

function Row<T extends string>({
  options, value, onPick,
}: { options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="eva-row">
      {options.map((o) => (
        <button key={o} className={"eva-chip " + (o === value ? "on" : "")} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function OutfitCard({
  title, price, active, onClick, swatch,
}: { title: string; price: string; active?: boolean; onClick: ()=>void; swatch: string }) {
  return (
    <button className={"eva-card "+(active?"on":"")} onClick={onClick}>
      <div className="eva-icon" style={{ background: swatch }} />
      <div className="eva-ctext">
        <div className="eva-ctitle">{title}</div>
        <div className="eva-cprice">{price}</div>
      </div>
    </button>
  );
}

/* ---------- styles (scoped) ---------- */

const styles = `
.eva-modalRoot{ position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.4); z-index:50; }
.eva-modalCard{ width:min(1100px, 96vw); background:#0e1628; border:1px solid rgba(255,255,255,.08); border-radius:16px; box-shadow:0 20px 80px rgba(0,0,0,.35); }
.eva-modalHead{ display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.06); }
.eva-modalBody{ display:grid; grid-template-columns: 520px 1fr; gap:18px; padding:16px; }
.eva-preview3d{ height:520px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:12px; overflow:hidden; position:relative; }
.eva-quick{ position:absolute; left:10px; bottom:10px; display:flex; gap:6px; }
.eva-quick button{ background:rgba(255,255,255,.08); color:#e6edf7; border:1px solid rgba(255,255,255,.15); border-radius:8px; padding:6px 10px; cursor:pointer; }
.eva-quick button:hover{ background:rgba(255,255,255,.14); }
.eva-controls{ display:flex; flex-direction:column; gap:14px; }
.eva-section{ display:flex; flex-direction:column; gap:8px; }
.eva-label{ font-weight:700; opacity:.9; }
.eva-row{ display:flex; flex-wrap:wrap; gap:8px; }
.eva-chip{ background:transparent; border:1px solid rgba(255,255,255,.12); color:#e6edf7; border-radius:999px; padding:8px 12px; cursor:pointer; }
.eva-chip.on{ border-color:rgba(96,165,250,.6); box-shadow:0 0 0 2px rgba(96,165,250,.2) inset; }
.eva-swatches{ display:flex; gap:8px; }
.eva-sw{ width:36px; height:26px; border-radius:8px; border:1px solid rgba(255,255,255,.2); cursor:pointer; }
.eva-sw.on{ outline:2px solid rgba(96,165,250,.6); }
.eva-outfits{ display:flex; gap:10px; }
.eva-card{ display:flex; gap:10px; background:transparent; border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:10px; cursor:pointer; }
.eva-card.on{ border-color:rgba(96,165,250,.6); box-shadow:0 0 0 2px rgba(96,165,250,.15) inset; }
.eva-icon{ width:44px; height:44px; border-radius:10px; border:1px solid rgba(255,255,255,.18); }
.eva-ctext{ display:flex; flex-direction:column; }
.eva-ctitle{ font-weight:700; }
.eva-cprice{ color:#9fb0c7; font-size:12px; }
.eva-actions{ display:flex; justify-content:flex-end; gap:10px; }
.eva-primary{ background:linear-gradient(90deg, #60a5fa, #22d3ee); color:#09121e; font-weight:700; border:none; padding:10px 14px; border-radius:10px; cursor:pointer; box-shadow:0 6px 18px rgba(34,211,238,.25); }
.eva-ghost{ background:transparent; border:1px solid rgba(255,255,255,.12); color:#e6edf7; border-radius:10px; padding:10px 14px; cursor:pointer; }
.eva-x{ background:transparent; border:0; color:#9fb0c7; font-size:24px; cursor:pointer; }
`;

/* ---------- helpers ---------- */

function skinHex(s: AvatarPreset["skin"]) {
  switch (s) {
    case "Very Light": return "#f6d7c3";
    case "Light": return "#e9bda1";
    case "Tan": return "#c88c60";
    case "Deep": return "#7d4a22";
    case "Rich": return "#5a3a20";
  }
}
