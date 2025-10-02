// src/features/avatar/HeroRig3D.tsx
import * as THREE from "three";
import { GroupProps } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AvatarPreset } from "../../state/avatar";

/**
 * Pure-geometry rig (no R3F hooks), safe even if accidentally
 * rendered outside <Canvas>. You can re-add idle animation later.
 */
export default function HeroRig3D({
  preset,
  ...props
}: GroupProps & { preset: AvatarPreset | null }) {
  const root = useRef<THREE.Group>(null!);
  const gTorso = useRef<THREE.Group>(null!);
  const gHead = useRef<THREE.Group>(null!);

  // palette
  const skin = useMemo(() => skinHex(preset?.skin), [preset?.skin]);
  const hairColor = "#27334d";
  const top = useMemo(() => outfitTop(preset?.outfitId), [preset?.outfitId]);
  const bottom = useMemo(() => outfitBottom(preset?.outfitId), [preset?.outfitId]);
  const shoe = useMemo(() => outfitShoes(preset?.outfitId), [preset?.outfitId]);
  const bodyScale = useMemo(() => bodyScaleFor(preset?.body), [preset?.body]);

  return (
    <group ref={root} {...props} scale={bodyScale} castShadow receiveShadow>
      {/* Torso */}
      <group ref={gTorso} position={[0, 0.9, 0]}>
        <mesh castShadow receiveShadow>
          {(THREE as any).CapsuleGeometry ? (
            <capsuleGeometry args={[0.46, 0.64, 8, 16]} />
          ) : (
            <boxGeometry args={[0.92, 1.1, 0.5]} />
          )}
          <meshStandardMaterial color={"#1b2b4b"} roughness={0.7} metalness={0.05} />
        </mesh>
        {/* shirt shell */}
        <mesh position={[0, 0.01, 0]} scale={[1.015, 1.02, 1.02]} castShadow receiveShadow>
          {(THREE as any).CapsuleGeometry ? (
            <capsuleGeometry args={[0.47, 0.66, 8, 16]} />
          ) : (
            <boxGeometry args={[0.94, 1.12, 0.52]} />
          )}
          <meshStandardMaterial color={top} roughness={0.5} metalness={0.08} />
        </mesh>

        {/* neck */}
        <mesh position={[0, 0.64, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.14, 16]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>

        {/* Head */}
        <group ref={gHead} position={[0, 0.85, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.34, 32, 32]} />
            <meshStandardMaterial color={skin} roughness={0.85} />
          </mesh>

          {/* Hair / Face */}
          {buildHair(preset?.hair, hairColor)}
          {buildEyes(preset?.eyes)}
          {buildBrows(preset?.eyes)}
          {buildMouth(preset?.expr)}
        </group>
      </group>

      {/* Arms */}
      <group position={[-0.58, 0.95, 0]}>
        <Arm skin={skin} sleeve={top} mirror={false} />
      </group>
      <group position={[0.58, 0.95, 0]}>
        <Arm skin={skin} sleeve={top} mirror />
      </group>

      {/* Legs */}
      <group position={[-0.22, 0.46, 0]}>
        <Leg pants={bottom} skin={skin} shoes={shoe} />
      </group>
      <group position={[0.22, 0.46, 0]}>
        <Leg pants={bottom} skin={skin} shoes={shoe} />
      </group>

      {/* Astro win FX */}
      {preset?.outfitId === "outfit_astro" && (
        <mesh position={[0, 1.15, -0.28]} rotation={[0, 0, Math.PI / 10]} castShadow>
          <boxGeometry args={[1.0, 0.06, 0.06]} />
          <meshStandardMaterial color={"#8be9fd"} emissive={"#8be9fd"} emissiveIntensity={0.3} />
        </mesh>
      )}
    </group>
  );
}

/* ---------- parts ---------- */

function Arm({ skin, sleeve, mirror }: { skin: string; sleeve: string; mirror?: boolean }) {
  const side = mirror ? -1 : 1;
  return (
    <group rotation={[0, 0, side * 0.15]}>
      {/* upper arm */}
      <mesh position={[side * 0.08, -0.18, 0]} castShadow>
        {(THREE as any).CapsuleGeometry ? (
          <capsuleGeometry args={[0.11, 0.28, 8, 12]} />
        ) : (
          <cylinderGeometry args={[0.11, 0.11, 0.5, 12]} />
        )}
        <meshStandardMaterial color={skin} roughness={0.85} />
      </mesh>
      {/* sleeve */}
      <mesh position={[side * 0.08, -0.05, 0]} scale={[1.06, 0.6, 1.06]} castShadow>
        {(THREE as any).CapsuleGeometry ? (
          <capsuleGeometry args={[0.12, 0.18, 8, 12]} />
        ) : (
          <cylinderGeometry args={[0.12, 0.12, 0.3, 12]} />
        )}
        <meshStandardMaterial color={sleeve} roughness={0.55} />
      </mesh>
      {/* forearm */}
      <mesh position={[side * 0.12, -0.52, 0]} rotation={[0, 0, side * 0.08]} castShadow>
        {(THREE as any).CapsuleGeometry ? (
          <capsuleGeometry args={[0.105, 0.32, 8, 12]} />
        ) : (
          <cylinderGeometry args={[0.105, 0.105, 0.52, 12]} />
        )}
        <meshStandardMaterial color={skin} roughness={0.85} />
      </mesh>
      {/* hand */}
      <mesh position={[side * 0.22, -0.75, 0]} castShadow>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={skin} roughness={0.85} />
      </mesh>
    </group>
  );
}

function Leg({ pants, skin, shoes }: { pants: string; skin: string; shoes: string }) {
  return (
    <group>
      <mesh position={[0, -0.18, 0]} castShadow>
        {(THREE as any).CapsuleGeometry ? (
          <capsuleGeometry args={[0.13, 0.32, 8, 12]} />
        ) : (
          <cylinderGeometry args={[0.13, 0.13, 0.5, 12]} />
        )}
        <meshStandardMaterial color={pants} roughness={0.6} />
      </mesh>
      <mesh position={[0.02, -0.54, 0]} castShadow>
        {(THREE as any).CapsuleGeometry ? (
          <capsuleGeometry args={[0.12, 0.34, 8, 12]} />
        ) : (
          <cylinderGeometry args={[0.12, 0.12, 0.54, 12]} />
        )}
        <meshStandardMaterial color={pants} roughness={0.6} />
      </mesh>
      <mesh position={[0.05, -0.86, 0.09]} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.12, 0.42]} />
        <meshStandardMaterial color={shoes} roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0.18, -0.86, 0.2]} castShadow>
        <boxGeometry args={[0.12, 0.08, 0.18]} />
        <meshStandardMaterial color={"#eeeeee"} />
      </mesh>
    </group>
  );
}

/* ---------- face & hair ---------- */

const Z_FRONT = 0.305;
const E_EM = "#0d1117";

function buildHair(style: AvatarPreset["hair"] | undefined, color: string) {
  const r = 0.34;
  const y = 0.12;

  switch (style) {
    case "Short":
      return (
        <>
          <mesh position={[0, y, 0]} castShadow>
            <sphereGeometry args={[r, 32, 32, 0, Math.PI * 2, Math.PI * 0.65, Math.PI * 0.4]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
          <mesh position={[0, y - 0.02, 0]} castShadow>
            <cylinderGeometry args={[r * 0.86, r * 0.86, 0.06, 32]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
        </>
      );
    case "Ponytail":
      return (
        <>
          <mesh position={[0, y + 0.02, 0]} castShadow>
            <sphereGeometry args={[r, 32, 32, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.55]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
          <mesh position={[0, y - 0.03, -0.32]} rotation={[0.5, 0, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 0.6, 16]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
          <mesh position={[0, y - 0.27, -0.55]} castShadow>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
        </>
      );
    case "Curly":
      return (
        <group position={[0, y + 0.02, 0]}>
          {[-0.18, -0.06, 0.06, 0.18].map((x, i) => (
            <mesh key={"c" + i} position={[x, 0.06, -0.02]} castShadow>
              <sphereGeometry args={[0.14, 16, 16]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          ))}
          {[-0.12, 0.12].map((x, i) => (
            <mesh key={"c2" + i} position={[x, -0.02, 0.12]} castShadow>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          ))}
        </group>
      );
    case "Buzz":
      return (
        <mesh position={[0, y + 0.01, 0]} castShadow>
          <sphereGeometry args={[r, 32, 32, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.35]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      );
    default:
      return null;
  }
}

function buildEyes(kind: AvatarPreset["eyes"] | undefined) {
  const white = "#f2f6ff";
  const black = "#0b0f16";
  const lx = -0.12, rx = 0.12, y = 0.02, z = Z_FRONT;

  switch (kind) {
    case "Round":
      return (
        <group>
          <mesh position={[lx, y, z]}><sphereGeometry args={[0.052, 20, 20]} /><meshStandardMaterial color={white} roughness={1} /></mesh>
          <mesh position={[rx, y, z]}><sphereGeometry args={[0.052, 20, 20]} /><meshStandardMaterial color={white} roughness={1} /></mesh>
          <mesh position={[lx, y, z + 0.002]}><sphereGeometry args={[0.026, 20, 20]} /><meshStandardMaterial color={black} emissive={E_EM} emissiveIntensity={0.4} /></mesh>
          <mesh position={[rx, y, z + 0.002]}><sphereGeometry args={[0.026, 20, 20]} /><meshStandardMaterial color={black} emissive={E_EM} emissiveIntensity={0.4} /></mesh>
        </group>
      );
    case "Sharp":
      return (
        <group>
          {[lx, rx].map((x, i) => (
            <mesh key={i} position={[x, y + 0.004, z]} rotation={[0, 0, i === 0 ? 0.15 : -0.15]}>
              <sphereGeometry args={[0.06, 20, 20]} />
              <meshStandardMaterial color={white} roughness={1} />
            </mesh>
          ))}
          {[lx, rx].map((x, i) => (
            <mesh key={"p" + i} position={[x, y, z + 0.003]}>
              <sphereGeometry args={[0.022, 20, 20]} />
              <meshStandardMaterial color={black} emissive={E_EM} emissiveIntensity={0.4} />
            </mesh>
          ))}
        </group>
      );
    case "Happy":
      return (
        <group>
          <mesh position={[lx, y + 0.015, z + 0.002]} rotation={[0, 0, Math.PI * 0.95]}>
            <torusGeometry args={[0.055, 0.012, 8, 24, Math.PI * 0.8]} />
            <meshStandardMaterial color={black} emissive={E_EM} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[rx, y + 0.015, z + 0.002]} rotation={[0, 0, Math.PI * 0.05]}>
            <torusGeometry args={[0.055, 0.012, 8, 24, Math.PI * 0.8]} />
            <meshStandardMaterial color={black} emissive={E_EM} emissiveIntensity={0.35} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

function buildBrows(kind: AvatarPreset["eyes"] | undefined) {
  const z = Z_FRONT - 0.002;
  let tilt = 0, arch = 0;
  if (kind === "Sharp") tilt = 0.35;
  if (kind === "Happy") arch = -0.18;
  return (
    <group>
      <mesh position={[-0.12, 0.1, z]} rotation={[0, 0, tilt || arch]} castShadow>
        <boxGeometry args={[0.12, 0.015, 0.02]} />
        <meshStandardMaterial color={"#0b0f16"} emissive={"#0d1117"} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0.12, 0.1, z]} rotation={[0, 0, -(tilt || arch)]} castShadow>
        <boxGeometry args={[0.12, 0.015, 0.02]} />
        <meshStandardMaterial color={"#0b0f16"} emissive={"#0d1117"} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function buildMouth(expr: AvatarPreset["expr"] | undefined) {
  const black = "#0b0f16";
  switch (expr) {
    case "Smile":
      return (
        <mesh position={[0, -0.065, Z_FRONT + 0.002]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.12, 0.015, 8, 24, Math.PI * 0.85]} />
          <meshStandardMaterial color={black} emissive={"#0d1117"} emissiveIntensity={0.35} />
        </mesh>
      );
    case "Wow":
      return (
        <mesh position={[0, -0.065, Z_FRONT + 0.002]}>
          <torusGeometry args={[0.05, 0.025, 8, 24, Math.PI * 2]} />
          <meshStandardMaterial color={black} emissive={"#0d1117"} emissiveIntensity={0.35} />
        </mesh>
      );
    case "Determined":
      return (
        <mesh position={[0, -0.065, Z_FRONT + 0.002]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.18, 0.02, 0.02]} />
          <meshStandardMaterial color={black} emissive={"#0d1117"} emissiveIntensity={0.35} />
        </mesh>
      );
    case "Neutral":
    default:
      return (
        <mesh position={[0, -0.065, Z_FRONT + 0.002]}>
          <boxGeometry args={[0.16, 0.02, 0.02]} />
          <meshStandardMaterial color={black} emissive={"#0d1117"} emissiveIntensity={0.35} />
        </mesh>
      );
  }
}

/* ---------- helpers ---------- */

function bodyScaleFor(body: AvatarPreset["body"] | undefined): number {
  switch (body) {
    case "Slim": return 0.98;
    case "Athletic": return 1.08;
    case "Standard":
    default: return 1.02;
  }
}
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
function outfitTop(id?: AvatarPreset["outfitId"])     { return id === "outfit_astro" ? "#1e2a44" : "#21407a"; }
function outfitBottom(id?: AvatarPreset["outfitId"])  { return id === "outfit_astro" ? "#2a3b5e" : "#1b335f"; }
function outfitShoes(id?: AvatarPreset["outfitId"])   { return id === "outfit_astro" ? "#2a9dad" : "#0ea5e9"; }
