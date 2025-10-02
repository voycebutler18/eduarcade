import * as THREE from "three";
import React from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Sky, ContactShadows } from "@react-three/drei";
import HeroRig3D from "./HeroRig3D";
import { useAvatar, AvatarPreset } from "../../state/avatar";
import { useInventory } from "../../state/inventory";

/* ------------ constants ------------ */
type ViewKey = "Full" | "Front" | "Left" | "Right" | "Back";

const SKINS: AvatarPreset["skin"][] = ["Very Light", "Light", "Tan", "Deep", "Rich"];
const BODIES: AvatarPreset["body"][] = ["Slim", "Standard", "Athletic"];
const HAIRS: AvatarPreset["hair"][] = ["Short", "Ponytail", "Curly", "Buzz"];
const EYES: AvatarPreset["eyes"][] = ["Round", "Sharp", "Happy"];
const EXPRS: AvatarPreset["expr"][] = ["Neutral", "Smile", "Wow", "Determined"];

const VIEW: Record<ViewKey, THREE.Vector3> = {
  Full:  new THREE.Vector3(3.4, 2.2, 3.4),
  Front: new THREE.Vector3(0.0, 1.25, 1.35),
  Left:  new THREE.VectorVector3(-1.35, 1.15, 0.0),
  Right: new THREE.Vector3( 1.35, 1.15, 0.0),
  Back:  new THREE.Vector3(0.0, 1.25, -1.35),
};

/* camera tweener (inside Canvas) */
function CameraRig({ to }: { to: THREE.Vector3 }) {
  const { camera } = useThree();
  const look = React.useMemo(() => new THREE.Vector3(0, 1.0, 0), []);
  useFrame(() => {
    camera.position.lerp(to, 0.12);
    const pcam = camera as THREE.PerspectiveCamera;
    pcam.fov = THREE.MathUtils.lerp(pcam.fov, to.equals(VIEW.Full) ? 55 : 40, 0.12);
    camera.lookAt(look);
    pcam.updateProjectionMatrix();
  });
  return null;
}

/* ------------ main ------------ */
type Props = { open: boolean; onClose: () => void };

export default function AvatarStudio({ open, onClose }: Props) {
  const { preset, setPreset } = useAvatar((s) => ({ preset: s.preset, setPreset: s.setPreset }));
  const { isOwned } = useInventory((s) => ({ isOwned: s.isOwned }));

  const [work, setWork] = React.useState<AvatarPreset>(() =>
    preset ?? {
      skin: "Light",
      body: "Standard",
      hair: "Short",
      eyes: "Round",
      expr: "Neutral",
      outfitId: "outfit_runner",
    }
  );
  React.useEffect(() => { if (open) setWork(preset ?? work); /* eslint-disable-next-line */ }, [open]);

  const [view, setView] = React.useState<ViewKey>("Front");

  function save() {
    const okOutfit =
      !work.outfitId ? true :
      work.outfitId === "outfit_runner" || isOwned(work.outfitId);
    setPreset({ ...work, outfitId: okOutfit ? work.outfitId : undefined });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="studio-overlay">
      <div className="studio">
        <div className="studio-title">Create-Your-Hero</div>

        <div className="studio-main">
          {/* Viewer */}
          <div className="viewer">
            <Canvas
              shadows
              camera={{ position: VIEW[view].toArray(), fov: 40 }}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
            >
              <ambientLight intensity={0.55} />
              <directionalLight position={[5,8,5]} intensity={1.25} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
              <Sky sunPosition={[100,20,100]} />
              <mesh rotation={[-Math.PI/2,0,0]} receiveShadow>
                <planeGeometry args={[40,40]} />
                <meshStandardMaterial color="#cfd7df" roughness={0.95} />
              </mesh>
              <ContactShadows position={[0,0.01,0]} opacity={0.45} scale={12} blur={2.4} far={8} />

              <group position={[0,0,0]}>
                <HeroRig3D preset={work} />
              </group>

              <CameraRig to={VIEW[view]} />
            </Canvas>

            <div className="viewbar">
              {(["Full","Front","Left","Right","Back"] as ViewKey[]).map(k => (
                <button key={k} className={view===k?"pill active":"pill"} onClick={()=>setView(k)}>{k}</button>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="controls">
            <Section title="Body">
              <PillRow options={BODIES} value={work.body} onSelect={v=>setWork({...work, body:v})}/>
            </Section>

            <Section title="Skin tone">
              <div className="swatches">
                {SKINS.map(s=>(
                  <button key={s}
                          className={work.skin===s?"swatch active":"swatch"}
                          style={{background:skinHex(s)}}
                          onClick={()=>setWork({...work, skin:s})}
                          aria-label={s}/>
                ))}
              </div>
            </Section>

            <Section title="Hair">
              <PillRow options={HAIRS} value={work.hair} onSelect={v=>setWork({...work, hair:v})}/>
            </Section>

            <Section title="Eyes">
              <PillRow options={EYES} value={work.eyes} onSelect={v=>setWork({...work, eyes:v})}/>
            </Section>

            <Section title="Expression">
              <PillRow options={EXPRS} value={work.expr} onSelect={v=>setWork({...work, expr:v})}/>
            </Section>

            <Section title="Outfit (cosmetic)">
              <div className="outfits">
                <OutfitCard title="Runner Set"
                            owned={true}
                            active={work.outfitId==="outfit_runner"}
                            onClick={()=>setWork({...work, outfitId:"outfit_runner"})}
                            swatch="#1e3a8a"/>
                <OutfitCard title="Astro Set"
                            owned={false}
                            active={work.outfitId==="outfit_astro"}
                            onClick={()=>setWork({...work, outfitId:"outfit_astro"})}
                            swatch="#21a6b6"/>
              </div>
            </Section>

            <div className="actions">
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>

        <button className="close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

/* UI bits */
function Section({ title, children }: { title:string; children:React.ReactNode }) {
  return <div className="section"><div className="section-title">{title}</div>{children}</div>;
}
function PillRow<T extends string>({ options, value, onSelect }:{
  options: readonly T[]; value: T|undefined; onSelect:(v:T)=>void;
}){
  return <div className="pills">
    {options.map(o=><button key={o} className={value===o?"pill active":"pill"} onClick={()=>onSelect(o)}>{o}</button>)}
  </div>;
}
function OutfitCard({ title, owned, active, onClick, swatch }:{
  title:string; owned:boolean; active:boolean; onClick:()=>void; swatch:string;
}){
  return (
    <button className={active?"outfit active":"outfit"} onClick={onClick} disabled={!owned}>
      <span className="dot" style={{background:swatch}}/>
      <div className="oflex">
        <div className="oname">{title}</div>
        <div className="oown">{owned ? (active ? "Equipped" : "Owned") : "Locked"}</div>
      </div>
    </button>
  );
}

/* helpers */
function skinHex(s?: AvatarPreset["skin"]) {
  switch (s) {
    case "Very Light": return "#f6d7c3";
    case "Light":      return "#e9bda1";
    case "Tan":        return "#c88c60";
    case "Deep":       return "#7d4a22";
    case "Rich":       return "#5a3a20";
    default:           return "#e9bda1";
  }
}

/* styles */
const STYLES = `
.studio-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
.studio{position:relative;width:min(1200px,96vw);background:#0b1324;border:1px solid rgba(255,255,255,.1);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);padding:14px;display:flex;flex-direction:column;gap:12px}
.studio-title{font-size:22px;font-weight:800}
.studio-main{display:grid;grid-template-columns: 1.1fr 0.9fr;gap:14px}
.viewer{position:relative;aspect-ratio:16/12;background:#0c1426;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.06)}
.viewbar{position:absolute;left:12px;bottom:12px;display:flex;gap:8px}
.controls{display:flex;flex-direction:column;gap:12px;max-height:72vh;overflow:auto;padding-right:6px}
.section{background:#0c1426;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px}
.section-title{font-weight:800;margin-bottom:8px}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{background:transparent;border:1px solid rgba(255,255,255,.16);color:#e6edf7;border-radius:999px;padding:8px 12px;cursor:pointer}
.pill.active{background:#1941b6;border-color:#4f73ff}
.swatches{display:flex;gap:8px}
.swatch{width:28px;height:28px;border-radius:999px;border:2px solid transparent}
.swatch.active{border-color:#4f73ff}
.outfits{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.outfit{display:flex;gap:10px;align-items:center;justify-content:flex-start;background:#0b1324;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px;cursor:pointer}
.outfit.active{outline:2px solid #4f73ff}
.outfit:disabled{opacity:.55;cursor:not-allowed}
.dot{width:34px;height:34px;border-radius:8px}
.oflex{display:flex;flex-direction:column;gap:2px}
.oname{font-weight:800}
.oown{font-size:12px;color:#9fb0c7}
.actions{display:flex;justify-content:flex-end;gap:8px}
.primary{background:#2563eb;border:none;color:#fff;border-radius:10px;padding:10px 14px;cursor:pointer}
.ghost{background:transparent;border:1px solid rgba(255,255,255,.2);color:#e6edf7;border-radius:10px;padding:10px 14px;cursor:pointer}
.close{position:absolute;right:10px;top:8px;background:transparent;color:#9fb0c7;border:none;font-size:18px;cursor:pointer}
@media (max-width: 980px){ .studio-main{grid-template-columns: 1fr} }
`;
