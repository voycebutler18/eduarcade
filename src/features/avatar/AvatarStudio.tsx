import { useEffect, useMemo, useState } from "react";
import { useAvatar, AvatarPreset } from "../../state/avatar";

/**
 * Modal avatar editor.
 * - Edits a local copy, shows live preview on the left (2D)
 * - Save writes to the global avatar store so the 3D hero updates instantly
 * - All labels are original/generic (no copyrighted assets)
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

  // keep draft aligned if the current preset changes from elsewhere
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
    <div className="modalRoot" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalHead">
          <h2>Create-Your-Hero</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modalBody">
          {/* 2D preview — simple, stylized and original */}
          <div className="preview">
            <Preview2D preset={draft} />
          </div>

          {/* controls */}
          <div className="controls">
            <Section title="Body">
              <Row options={["Slim","Standard","Athletic"] as const} value={draft.body} onPick={(v)=>choose("body", v)} />
            </Section>

            <Section title="Skin tone">
              <div className="swatches">
                {(["Very Light","Light","Tan","Deep","Rich"] as const).map((s)=>(
                  <button key={s} className={"sw "+(draft.skin===s?"on":"")}
                    style={{ background: skinHex(s) }} onClick={()=>choose("skin",s)} aria-label={s}/>
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
              <div className="outfits">
                <OutfitCard
                  title="Runner Set" price="Owned" active={draft.outfitId==="outfit_runner"}
                  onClick={()=>choose("outfitId","outfit_runner")} swatch="#1f3e76" />
                <OutfitCard
                  title="Astro Set" price="420c" active={draft.outfitId==="outfit_astro"}
                  onClick={()=>choose("outfitId","outfit_astro")} swatch="#2a9dad" />
              </div>
            </Section>

            <div className="actions">
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
}

/* ---------- tiny components ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="label">{title}</div>
      {children}
    </div>
  );
}

function Row<T extends string>({
  options, value, onPick,
}: { options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="row">
      {options.map((o) => (
        <button key={o} className={"chip " + (o === value ? "on" : "")} onClick={() => onPick(o)}>
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
    <button className={"card "+(active?"on":"")} onClick={onClick}>
      <div className="icon" style={{ background: swatch }} />
      <div className="ctext">
        <div className="ctitle">{title}</div>
        <div className="cprice">{price}</div>
      </div>
    </button>
  );
}

/* ---------- 2D preview (simple and original) ---------- */

function Preview2D({ preset }: { preset: AvatarPreset }) {
  const skin = skinHex(preset.skin);
  const hair = "#2a3453";
  const shirt = preset.outfitId === "outfit_astro" ? "#1e2a44" : "#1f3e76";
  const eye = "#0b0f16";

  return (
    <svg width="100%" height="100%" viewBox="0 0 240 260">
      {/* torso & shirt */}
      <rect x="90" y="120" width="60" height="70" rx="12" fill={shirt} stroke="rgba(255,255,255,.15)"/>
      {/* legs */}
      <rect x="102" y="192" width="16" height="32" rx="4" fill="#1e2a44"/>
      <rect x="122" y="192" width="16" height="32" rx="4" fill="#1e2a44"/>
      {/* neck */}
      <rect x="118" y="112" width="12" height="12" rx="4" fill={skin}/>
      {/* head */}
      <circle cx="124" cy="96" r="22" fill={skin}/>
      {/* hair styles */}
      {preset.hair === "Short" && <rect x="98" y="72" width="52" height="18" rx="9" fill={hair}/>}
      {preset.hair === "Ponytail" && (
        <>
          <rect x="98" y="72" width="52" height="18" rx="9" fill={hair}/>
          <rect x="146" y="88" width="10" height="22" rx="5" fill={hair}/>
        </>
      )}
      {preset.hair === "Curly" && (
        <>
          <circle cx="110" cy="80" r="10" fill={hair}/><circle cx="124" cy="78" r="10" fill={hair}/><circle cx="138" cy="80" r="10" fill={hair}/>
        </>
      )}
      {preset.hair === "Buzz" && (
        <path d="M106 76 h36 a4 4 0 0 1 4 4 v6 h-44 v-6 a4 4 0 0 1 4-4 z" fill={hair}/>
      )}
      {/* eyes */}
      <circle cx="116" cy="98" r="3.2" fill={eye}/><circle cx="132" cy="98" r="3.2" fill={eye}/>
      {/* mouth */}
      {preset.expr === "Smile" && <path d="M116 108 q8 8 16 0" stroke={eye} strokeWidth="3" fill="none"/>}
      {preset.expr === "Neutral" && <rect x="118" y="106" width="12" height="2.5" rx="1" fill={eye}/>}
      {preset.expr === "Wow" && <circle cx="124" cy="108" r="5" fill={eye}/>}
      {preset.expr === "Determined" && <rect x="118" y="106" width="12" height="2.5" rx="1" transform="rotate(10 124 107)" fill={eye}/>}
    </svg>
  );
}

/* ---------- styles ---------- */

const styles = `
.modalRoot{ position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.4); z-index:50; }
.modalCard{ width:min(1040px, 96vw); background:#0e1628; border:1px solid rgba(255,255,255,.08); border-radius:16px; box-shadow:0 20px 80px rgba(0,0,0,.35); }
.modalHead{ display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.06); }
.modalBody{ display:grid; grid-template-columns: 420px 1fr; gap:18px; padding:16px; }
.preview{ background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:10px; height:420px; }
.controls{ display:flex; flex-direction:column; gap:14px; }
.section{ display:flex; flex-direction:column; gap:8px; }
.label{ font-weight:700; opacity:.9; }
.row{ display:flex; flex-wrap:wrap; gap:8px; }
.chip{ background:transparent; border:1px solid rgba(255,255,255,.12); color:#e6edf7; border-radius:999px; padding:8px 12px; cursor:pointer; }
.chip.on{ border-color:rgba(96,165,250,.6); box-shadow:0 0 0 2px rgba(96,165,250,.2) inset; }
.swatches{ display:flex; gap:8px; }
.sw{ width:34px; height:26px; border-radius:8px; border:1px solid rgba(255,255,255,.2); cursor:pointer; }
.sw.on{ outline:2px solid rgba(96,165,250,.6); }
.outfits{ display:flex; gap:10px; }
.card{ display:flex; gap:10px; background:transparent; border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:10px; cursor:pointer; }
.card.on{ border-color:rgba(96,165,250,.6); box-shadow:0 0 0 2px rgba(96,165,250,.15) inset; }
.icon{ width:44px; height:44px; border-radius:10px; border:1px solid rgba(255,255,255,.18); }
.ctext{ display:flex; flex-direction:column; }
.ctitle{ font-weight:700; }
.cprice{ color:#9fb0c7; font-size:12px; }
.actions{ display:flex; justify-content:flex-end; gap:10px; }
.primary{ background:linear-gradient(90deg, #60a5fa, #22d3ee); color:#09121e; font-weight:700; border:none; padding:10px 14px; border-radius:10px; cursor:pointer; box-shadow:0 6px 18px rgba(34,211,238,.25); }
.ghost{ background:transparent; border:1px solid rgba(255,255,255,.12); color:#e6edf7; border-radius:10px; padding:10px 14px; cursor:pointer; }
.x{ background:transparent; border:0; color:#9fb0c7; font-size:24px; cursor:pointer; }
`;

function skinHex(s: AvatarPreset["skin"]) {
  switch (s) {
    case "Very Light": return "#f6d7c3";
    case "Light": return "#e9bda1";
    case "Tan": return "#c88c60";
    case "Deep": return "#7d4a22";
    case "Rich": return "#5a3a20";
  }
}
