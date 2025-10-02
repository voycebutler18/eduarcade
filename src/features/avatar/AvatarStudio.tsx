import { useMemo, useState } from "react";
import { useInventory } from "../../state/inventory";

/**
 * AvatarStudio (MVP)
 * - Self-contained modal with a simple live 2D preview
 * - Options: body style, skin tone, hair, eyes, expression, outfit (cosmetic only)
 * - Hooks into inventory for outfits if owned; otherwise shows lock/buy
 * - No external assets; uses shapes/emoji for a fast first build
 *
 * Usage:
 *   <AvatarStudio open={isOpen} onClose={() => setOpen(false)} />
 */

type BodyStyle = "Slim" | "Standard" | "Athletic";
type SkinTone = "Light" | "Tan" | "Brown" | "Deep";
type Hair = "Short" | "Ponytail" | "Curly" | "Buzz";
type Eye = "Round" | "Sharp" | "Happy";
type Expression = "Neutral" | "Smile" | "Wow" | "Determined";

export type AvatarPreset = {
  body: BodyStyle;
  skin: SkinTone;
  hair: Hair;
  eyes: Eye;
  expr: Expression;
  outfitId?: string; // store item id for cosmetic outfit
};

const SKIN_HEX: Record<SkinTone, string> = {
  Light: "#f5d7bf",
  Tan: "#e7b894",
  Brown: "#b67b52",
  Deep: "#7a4a2a",
};

export default function AvatarStudio({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<AvatarPreset>;
  onSave?: (preset: AvatarPreset) => void;
}) {
  const inv = useInventory();
  const [body, setBody] = useState<BodyStyle>(initial?.body ?? "Standard");
  const [skin, setSkin] = useState<SkinTone>(initial?.skin ?? "Tan");
  const [hair, setHair] = useState<Hair>(initial?.hair ?? "Short");
  const [eyes, setEyes] = useState<Eye>(initial?.eyes ?? "Round");
  const [expr, setExpr] = useState<Expression>(initial?.expr ?? "Smile");
  const [outfitId, setOutfitId] = useState<string | undefined>(initial?.outfitId);

  const outfit = useMemo(
    () => (outfitId ? inv.catalog.find((i) => i.id === outfitId) : undefined),
    [outfitId, inv.catalog]
  );
  const ownsOutfit = outfit ? inv.isOwned(outfit.id) : true;

  if (!open) return null;

  function handleSave() {
    const preset: AvatarPreset = { body, skin, hair, eyes, expr, outfitId };
    onSave?.(preset);
    onClose();
  }

  function buyOutfit(id: string) {
    const res = inv.buy(id);
    if (!res.ok) {
      alert(res.reason ?? "Could not buy.");
      return;
    }
    setOutfitId(id);
  }

  return (
    <div className="eva-modal">
      <div className="eva-sheet">
        <div className="eva-head">
          <h3>Create-Your-Hero</h3>
          <button className="eva-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="eva-body grid">
          {/* Live Preview */}
          <div className="preview">
            <AvatarPreview body={body} skin={skin} hair={hair} eyes={eyes} expr={expr} outfitEmoji={outfit?.emoji} />
            <div className="muted small" style={{ marginTop: 8 }}>
              Live preview updates as you click styles.
            </div>
          </div>

          {/* Controls */}
          <div className="controls">
            <Field label="Body">
              <Row>
                <Chip selected={body === "Slim"} onClick={() => setBody("Slim")}>Slim</Chip>
                <Chip selected={body === "Standard"} onClick={() => setBody("Standard")}>Standard</Chip>
                <Chip selected={body === "Athletic"} onClick={() => setBody("Athletic")}>Athletic</Chip>
              </Row>
            </Field>

            <Field label="Skin tone">
              <Row>
                {(["Light","Tan","Brown","Deep"] as SkinTone[]).map((t) => (
                  <Swatch key={t} color={SKIN_HEX[t]} selected={skin === t} onClick={() => setSkin(t)} title={t} />
                ))}
              </Row>
            </Field>

            <Field label="Hair">
              <Row>
                <Chip selected={hair === "Short"} onClick={() => setHair("Short")}>Short</Chip>
                <Chip selected={hair === "Ponytail"} onClick={() => setHair("Ponytail")}>Ponytail</Chip>
                <Chip selected={hair === "Curly"} onClick={() => setHair("Curly")}>Curly</Chip>
                <Chip selected={hair === "Buzz"} onClick={() => setHair("Buzz")}>Buzz</Chip>
              </Row>
            </Field>

            <Field label="Eyes">
              <Row>
                <Chip selected={eyes === "Round"} onClick={() => setEyes("Round")}>Round</Chip>
                <Chip selected={eyes === "Sharp"} onClick={() => setEyes("Sharp")}>Sharp</Chip>
                <Chip selected={eyes === "Happy"} onClick={() => setEyes("Happy")}>Happy</Chip>
              </Row>
            </Field>

            <Field label="Expression">
              <Row>
                <Chip selected={expr === "Neutral"} onClick={() => setExpr("Neutral")}>Neutral</Chip>
                <Chip selected={expr === "Smile"} onClick={() => setExpr("Smile")}>Smile</Chip>
                <Chip selected={expr === "Wow"} onClick={() => setExpr("Wow")}>Wow</Chip>
                <Chip selected={expr === "Determined"} onClick={() => setExpr("Determined")}>Determined</Chip>
              </Row>
            </Field>

            <Field label="Outfit (cosmetic)">
              <div className="outfits">
                {inv.catalog
                  .filter((i) => i.slot === "outfit")
                  .map((i) => {
                    const owned = inv.isOwned(i.id);
                    const active = outfitId === i.id;
                    return (
                      <button
                        key={i.id}
                        className={`outCard ${active ? "active" : ""}`}
                        onClick={() => setOutfitId(i.id)}
                        title={i.name}
                      >
                        <div className="big">{i.emoji ?? "🧥"}</div>
                        <div className="nm">{i.name}</div>
                        <div className="sub">{owned ? "Owned" : `${i.price}c`}</div>
                      </button>
                    );
                  })}
              </div>

              {!ownsOutfit && outfit && (
                <div className="buyrow">
                  <button className="primary" onClick={() => buyOutfit(outfit.id)}>
                    Buy {outfit.name} ({outfit.price}c)
                  </button>
                </div>
              )}
            </Field>

            <div className="actrow">
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>

        <style>{`
          .eva-modal{ position:fixed; inset:0; display:grid; place-items:center; background:rgba(2,6,23,.6); backdrop-filter: blur(6px); z-index:50; padding:16px; }
          .eva-sheet{ width:100%; max-width:900px; background:#0f172a; color:#e6edf7; border:1px solid rgba(255,255,255,.08); border-radius:14px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.5); }
          .eva-head{ display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.06); background:linear-gradient(180deg, rgba(96,165,250,.08), transparent); }
          .eva-x{ background:transparent; color:#9fb0c7; border:none; font-size:18px; cursor:pointer; }
          .eva-body.grid{ display:grid; grid-template-columns: 1fr 1.2fr; gap:12px; padding:14px; }
          .preview{ background:#121a2c; border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:10px; display:grid; place-items:center; min-height:280px; }
          .controls{ display:flex; flex-direction:column; gap:10px; }

          .field{ display:flex; flex-direction:column; gap:6px; }
          .label{ font-size:12px; color:#9fb0c7; }
          .row{ display:flex; flex-wrap:wrap; gap:8px; }
          .chip{ background:#111a2d; border:1px solid rgba(255,255,255,.12); color:#e6edf7; border-radius:999px; padding:6px 10px; cursor:pointer; }
          .chip.sel{ border-color:rgba(96,165,250,.45); box-shadow:0 0 0 2px rgba(96,165,250,.15) inset; }

          .sw{ width:28px; height:28px; border-radius:6px; border:2px solid rgba(255,255,255,.15); cursor:pointer; }
          .sw.sel{ outline:2px solid rgba(96,165,250,.5); }

          .outfits{ display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:8px; }
          .outCard{ background:#111a2d; border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:8px; cursor:pointer; text-align:left; }
          .outCard.active{ border-color:rgba(96,165,250,.45); }
          .outCard .big{ font-size:24px; }
          .outCard .nm{ font-weight:700; margin-top:2px; }
          .outCard .sub{ font-size:12px; color:#9fb0c7; }

          .buyrow{ display:flex; justify-content:flex-end; margin-top:6px; }
          .actrow{ display:grid; grid-template-columns: auto auto; gap:8px; justify-content:end; }
          .ghost{ background:transparent; border:1px solid rgba(255,255,255,.12); color:#e6edf7; border-radius:10px; padding:8px 12px; cursor:pointer; }
          @media (max-width: 980px){ .eva-body.grid{ grid-template-columns: 1fr; } }
        `}</style>
      </div>
    </div>
  );
}

/* ---------------- Small UI atoms ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="row">{children}</div>;
}

function Chip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`chip ${selected ? "sel" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Swatch({
  color,
  selected,
  onClick,
  title,
}: {
  color: string;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      className={`sw ${selected ? "sel" : ""}`}
      onClick={onClick}
      title={title}
      style={{ background: color }}
    />
  );
}

/* ---------------- Preview (2D vector) ---------------- */

function AvatarPreview({
  body,
  skin,
  hair,
  eyes,
  expr,
  outfitEmoji,
}: {
  body: BodyStyle;
  skin: SkinTone;
  hair: Hair;
  eyes: Eye;
  expr: Expression;
  outfitEmoji?: string;
}) {
  // Just a simple SVG render so changes are instant and cross-platform.
  const skinFill = SKIN_HEX[skin];

  const hairShape = useMemo(() => {
    switch (hair) {
      case "Short":
        return "M30,22 Q50,6 70,22 L70,40 L30,40 Z";
      case "Ponytail":
        return "M30,22 Q50,6 70,22 L70,40 L30,40 Z M72,36 q12,8 10,20";
      case "Curly":
        return "M30,22 q6,-10 12,0 q6,-12 12,0 q6,-14 12,0 q6,-10 12,0 L78,40 L30,40 Z";
      case "Buzz":
        return "M32,24 Q50,14 68,24 L68,30 L32,30 Z";
    }
  }, [hair]);

  const eyeStr = useMemo(() => {
    switch (eyes) {
      case "Round":
        return { left: "•", right: "•" };
      case "Sharp":
        return { left: "◦", right: "◦" };
      case "Happy":
        return { left: "˘", right: "˘" };
    }
  }, [eyes]);

  const mouth = useMemo(() => {
    switch (expr) {
      case "Neutral":
        return "M45,64 h10";
      case "Smile":
        return "M42,64 q8,8 16,0";
      case "Wow":
        return "M50,62 a4,4 0 1,0 0.01,0";
      case "Determined":
        return "M42,64 q8,-4 16,0";
    }
  }, [expr]);

  const outfitBadge = outfitEmoji ?? "👕";

  // Body width varies a bit by style
  const bodyW = body === "Slim" ? 28 : body === "Athletic" ? 38 : 34;

  return (
    <svg viewBox="0 0 100 120" width="100%" height="260">
      {/* torso */}
      <rect x={50 - bodyW / 2} y={70} width={bodyW} height="36" rx="6" fill="#1a2744" stroke="rgba(255,255,255,.1)" />
      {/* outfit badge */}
      <text x="50" y="88" textAnchor="middle" fontSize="16">{outfitBadge}</text>
      {/* neck */}
      <rect x="46" y="54" width="8" height="12" rx="3" fill={skinFill} />
      {/* head */}
      <circle cx="50" cy="40" r="16" fill={skinFill} stroke="rgba(255,255,255,.1)" />
      {/* hair */}
      <path d={hairShape} fill="#22293f" />
      {/* eyes */}
      <text x="44" y="44" textAnchor="middle" fontSize="10">{eyeStr.left}</text>
      <text x="56" y="44" textAnchor="middle" fontSize="10">{eyeStr.right}</text>
      {/* mouth */}
      <path d={mouth} stroke="#e6edf7" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* legs */}
      <rect x="46" y="106" width="6" height="10" rx="2" fill="#1a2744" />
      <rect x="52" y="106" width="6" height="10" rx="2" fill="#1a2744" />
    </svg>
  );
}
