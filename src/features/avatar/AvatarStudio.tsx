// src/features/avatar/AvatarStudio.tsx
import React, { useState } from "react";
import { useAvatar, AvatarPreset } from "../../state/avatar";
import { useInventory } from "../../state/inventory";

type Props = { open: boolean; onClose: () => void };

const SKINS: AvatarPreset["skin"][] = ["Very Light", "Light", "Tan", "Deep", "Rich"];
const BODIES: AvatarPreset["body"][] = ["Slim", "Standard", "Athletic"];
const HAIRS: AvatarPreset["hair"][] = ["Short", "Ponytail", "Curly", "Buzz"];
const EYES: AvatarPreset["eyes"][] = ["Round", "Sharp", "Happy"];
const EXPRS: AvatarPreset["expr"][] = ["Neutral", "Smile", "Wow", "Determined"];

export default function AvatarStudio({ open, onClose }: Props) {
  if (!open) return null;

  const { preset, setPreset } = useAvatar();
  const inv = useInventory();

  const [draft, setDraft] = useState<AvatarPreset>({ ...preset });

  function choose<K extends keyof AvatarPreset>(key: K, val: AvatarPreset[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function save() {
    setPreset(draft);
    onClose();
  }

  const ownRunner = inv.isOwned?.("outfit_runner") ?? true; // assume owned if API absent
  const ownAstro  = inv.isOwned?.("outfit_astro")  ?? false;

  return (
    <div className="studio-overlay" role="dialog" aria-modal="true">
      <div className="studio">
        <div className="title">Create-Your-Hero</div>

        <div className="content">
          {/* LEFT: temporary non-3D preview box (we add Canvas in step 2) */}
          <div className="preview-plain">
            <div className="placeholder">
              3D preview disabled for step 1<br/> (no R3F hooks here)
            </div>
          </div>

          {/* RIGHT: controls */}
          <div className="panel">
            <Section title="Body">
              <PillRow options={BODIES} value={draft.body} onSelect={(v) => choose("body", v)} />
            </Section>

            <Section title="Skin tone">
              <div className="swatches">
                {SKINS.map((s) => (
                  <button
                    key={s}
                    className={"swatch" + (draft.skin === s ? " active" : "")}
                    onClick={() => choose("skin", s)}
                    style={{ background: skinHex(s) }}
                    title={s}
                  />
                ))}
              </div>
            </Section>

            <Section title="Hair">
              <PillRow options={HAIRS} value={draft.hair} onSelect={(v) => choose("hair", v)} />
            </Section>

            <Section title="Eyes">
              <PillRow options={EYES} value={draft.eyes} onSelect={(v) => choose("eyes", v)} />
            </Section>

            <Section title="Expression">
              <PillRow options={EXPRS} value={draft.expr} onSelect={(v) => choose("expr", v)} />
            </Section>

            <Section title="Outfit (cosmetic)">
              <div className="outfits">
                <OutfitCard
                  title="Runner Set"
                  owned={ownRunner}
                  active={draft.outfitId === "outfit_runner"}
                  onClick={() => ownRunner ? choose("outfitId", "outfit_runner") : alert("Locked")}
                  swatch="#1f3e76"
                />
                <OutfitCard
                  title="Astro Set"
                  owned={ownAstro}
                  active={draft.outfitId === "outfit_astro"}
                  onClick={() => ownAstro ? choose("outfitId", "outfit_astro") : alert("Buy it in Store")}
                  swatch="#2a9dad"
                />
              </div>
            </Section>

            <div className="actions">
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>

        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

/* ---------- UI bits ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

function PillRow<T extends string>({
  options, value, onSelect,
}: { options: readonly T[]; value: T | undefined; onSelect: (v: T) => void }) {
  return (
    <div className="row">
      {options.map((opt) => (
        <button
          key={opt}
          className={"pill" + (value === opt ? " active" : "")}
          onClick={() => onSelect(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function OutfitCard({
  title, owned, active, onClick, swatch,
}: { title: string; owned: boolean; active: boolean; onClick: () => void; swatch: string }) {
  return (
    <button className={"outfit" + (active ? " active" : "")} onClick={onClick}>
      <div className="chip" style={{ background: swatch }} />
      <div className="label">
        <div className="name">{title}</div>
        <div className="muted">{owned ? "Owned" : "Locked"}</div>
      </div>
    </button>
  );
}

/* ---------- helpers ---------- */

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

/* ---------- styles ---------- */

const STYLES = `
.studio-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
.studio{position:relative;width:min(1100px,95vw);background:#0b1324;border:1px solid rgba(255,255,255,.1);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);padding:14px;display:flex;flex-direction:column;gap:12px}
.title{font-size:20px;font-weight:800}
.content{display:grid;grid-template-columns:1.2fr 1fr;gap:12px}
.preview-plain{height:460px;background:#0e162a;border-radius:12px;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#8aa3c0}
.panel{display:flex;flex-direction:column;gap:14px}
.section{display:flex;flex-direction:column;gap:8px}
.section-title{font-weight:700}
.row{display:flex;gap:8px;flex-wrap:wrap}
.pill{background:transparent;border:1px solid rgba(255,255,255,.12);color:#e6edf7;border-radius:999px;padding:8px 12px;cursor:pointer}
.pill.active{background:#1e293b;border-color:#3b82f6}
.swatches{display:flex;gap:8px}
.swatch{width:26px;height:26px;border-radius:999px;border:2px solid rgba(255,255,255,.25);cursor:pointer}
.swatch.active{outline:2px solid #3b82f6}
.outfits{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.outfit{display:flex;gap:10px;align-items:center;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;cursor:pointer;text-align:left}
.outfit.active{border-color:#3b82f6;background:rgba(59,130,246,.08)}
.chip{width:36px;height:36px;border-radius:8px}
.label .name{font-weight:700}
.muted{color:#9fb0c7;font-size:12px}
.actions{display:flex;gap:8px;justify-content:flex-end}
.primary{background:#2563eb;color:white;border:none;border-radius:10px;padding:8px 14px;cursor:pointer}
.ghost{background:transparent;border:1px solid rgba(255,255,255,.2);color:#e6edf7;border-radius:10px;padding:8px 14px;cursor:pointer}
.close{position:absolute;top:6px;right:10px;border:none;background:transparent;color:#9fb0c7;font-size:20px;cursor:pointer}
@media (max-width: 900px){
  .content{grid-template-columns:1fr;gap:10px}
  .preview-plain{height:380px}
}
`;
