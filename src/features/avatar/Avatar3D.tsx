import * as THREE from "three";
import { GroupProps } from "@react-three/fiber";
import { useMemo } from "react";
import { AvatarPreset } from "./AvatarStudio";

/**
 * Simple stylized 3D avatar built from primitives.
 * Reads the saved preset and renders body, head, hair, eyes, mouth, and shirt color.
 * This is lightweight on purpose so it runs everywhere.
 */

export default function Avatar3D({
  preset,
  ...props
}: GroupProps & { preset: AvatarPreset | null }) {
  const skin = useMemo(() => skinHex(preset?.skin), [preset?.skin]);
  const hair = useMemo(() => hairHex(), []);
  const shirt = useMemo(() => outfitHex(preset?.outfitId), [preset?.outfitId]);
  const scale = useMemo(() => bodyScale(preset?.body), [preset?.body]);
  const mouthShape = useMemo(() => mouthFor(preset?.expr), [preset?.expr]);
  const eye = "#111418";

  return (
    <group {...props} scale={scale}>
      {/* Torso */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.9, 1.0, 0.45]} />
        <meshStandardMaterial color={shirt} roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.18, 0.1, 0]}>
        <boxGeometry args={[0.22, 0.5, 0.36]} />
        <meshStandardMaterial color={"#1e2a44"} />
      </mesh>
      <mesh position={[0.18, 0.1, 0]}>
        <boxGeometry args={[0.22, 0.5, 0.36]} />
        <meshStandardMaterial color={"#1e2a44"} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.33, 32, 32]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.12, 16]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>

      {/* Hair (style) */}
      {hairStyle(preset?.hair, hair)}

      {/* Eyes */}
      <mesh position={[-0.12, 1.50, 0.29]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshStandardMaterial color={eye} />
      </mesh>
      <mesh position={[0.12, 1.50, 0.29]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshStandardMaterial color={eye} />
      </mesh>

      {/* Brows (depend on eyes style a tiny bit) */}
      {brows(preset?.eyes)}

      {/* Mouth */}
      <mesh position={[0, 1.37, 0.31]} rotation={[0, 0, mouthShape.rotate]}>
        <boxGeometry args={[mouthShape.w, mouthShape.h, 0.03]} />
        <meshStandardMaterial color={eye} />
      </mesh>

      {/* Shoulder “trail” hint if outfit has win fx */}
      {preset?.outfitId === "outfit_astro" ? (
        <mesh position={[0, 1.0, -0.26]} rotation={[0, 0, Math.PI / 12]}>
          <boxGeometry args={[0.9, 0.06, 0.06]} />
          <meshStandardMaterial color={"#8be9fd"} emissive={"#8be9fd"} emissiveIntensity={0.25} />
        </mesh>
      ) : null}
    </group>
  );
}

/* ---------- helpers ---------- */

function hairStyle(style: AvatarPreset["hair"] | undefined, color: string) {
  // All hair meshes sit slightly behind the eyebrow line
  const y = 1.62;
  switch (style) {
    case "Buzz":
      return (
        <mesh position={[0, y - 0.05, 0]}>
          <sphereGeometry args={[0.335, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      );
    case "Curly":
      return (
        <group position={[0, y + 0.02, 0]}>
          {[-0.18, 0, 0.18].map((x, i) => (
            <mesh key={i} position={[x, 0.03, -0.02]}>
              <sphereGeometry args={[0.18, 16, 16]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          ))}
        </group>
      );
    case "Ponytail":
      return (
        <group>
          <mesh position={[0, y + 0.02, -0.01]}>
            <cylinderGeometry args={[0.36, 0.33, 0.15, 24]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0.23, y - 0.02, -0.1]} rotation={[0, 0, -0.6]}>
            <cylinderGeometry args={[0.05, 0.07, 0.45, 12]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </group>
      );
    case "Short":
    default:
      return (
        <mesh position={[0, y, 0]}>
          <cylinderGeometry args={[0.38, 0.34, 0.18, 24]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      );
  }
}

function brows(style: AvatarPreset["eyes"] | undefined) {
  const y = 1.57;
  const z = 0.31;
  const base = { w: 0.12, h: 0.015 };
  const tilt =
    style === "Sharp" ? 0.35 : style === "Happy" ? -0.2 : 0;
  return (
    <group>
      <mesh position={[-0.12, y, z]} rotation={[0, 0, tilt]}>
        <boxGeometry args={[base.w, base.h, 0.02]} />
        <meshStandardMaterial color={"#111418"} />
      </mesh>
      <mesh position={[0.12, y, z]} rotation={[0, 0, -tilt]}>
        <boxGeometry args={[base.w, base.h, 0.02]} />
        <meshStandardMaterial color={"#111418"} />
      </mesh>
    </group>
  );
}

function mouthFor(expr: AvatarPreset["expr"] | undefined) {
  switch (expr) {
    case "Smile":
      return { w: 0.20, h: 0.02, rotate: -0.15 };
    case "Wow":
      return { w: 0.08, h: 0.08, rotate: 0 };
    case "Determined":
      return { w: 0.16, h: 0.02, rotate: 0.2 };
    case "Neutral":
    default:
      return { w: 0.16, h: 0.02, rotate: 0 };
  }
}

function bodyScale(body: AvatarPreset["body"] | undefined): number {
  switch (body) {
    case "Slim":
      return 0.95;
    case "Athletic":
      return 1.08;
    case "Standard":
    default:
      return 1.0;
  }
}

function skinHex(s?: AvatarPreset["skin"]) {
  switch (s) {
    case "Very Light":
      return "#f6d7c3";
    case "Light":
      return "#e9bda1";
    case "Tan":
      return "#c88c60";
    case "Deep":
      return "#7d4a22";
    case "Rich":
      return "#5a3a20";
    default:
      return "#e9bda1";
  }
}
function hairHex() {
  return "#27334d";
}
function outfitHex(id?: AvatarPreset["outfitId"]) {
  switch (id) {
    case "outfit_astro":
      return "#1e2a44";
    case "outfit_runner":
    default:
      return "#203763";
  }
}
