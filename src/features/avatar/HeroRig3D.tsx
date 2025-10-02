import * as THREE from "three";
import { GroupProps, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AvatarPreset } from "../../state/avatar";  // ← changed path

/**
 * HeroRig3D
 * - Fully procedural (no external models/textures) → safe from copyright
 * - Smooth capsule limbs, rounded torso, separate shirt/pants/shoes meshes
 * - Live colors from the avatar preset (skin, outfit, expression, hair)
 * - Lightweight idle animation (breath + micro sway)
 *
 * NOTES
 * - This is stylized—not photoreal—but more natural proportions than a cube avatar.
 * - Clothes are simple overlays you can recolor or swap by preset/outfitId.
 */

type V3 = [number, number, number];

export default function HeroRig3D({
  preset,
  ...props
}: GroupProps & { preset: AvatarPreset | null }) {
  const root = useRef<THREE.Group>(null!);
  const rTorso = useRef<THREE.Group>(null!);
  const rHead = useRef<THREE.Group>(null!);
  const rLA = useRef<THREE.Group>(null!); // left arm
  const rRA = useRef<THREE.Group>(null!); // right arm
  const rLL = useRef<THREE.Group>(null!); // left leg
  const rRL = useRef<THREE.Group>(null!); // right leg

  // ------- appearance from preset -------
  const skin = useMemo(() => skinHex(preset?.skin), [preset?.skin]);
  const hair = useMemo(() => hairHex(), []);
  const shirt = useMemo(() => outfitTop(preset?.outfitId), [preset?.outfitId]);
  const pants = useMemo(() => outfitBottom(preset?.outfitId), [preset?.outfitId]);
  const shoes = useMemo(() => outfitShoes(preset?.outfitId), [preset?.outfitId]);
  const bodyScale = useMemo(() => bodyScaleFor(preset?.body), [preset?.body]);
  const mouthShape = useMemo(() => mouthFor(preset?.expr), [preset?.expr]);
  const eye = "#0b0f16";

  // ------- idle animation -------
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!root.current) return;
    const sway = Math.sin(t * 1.5) * 0.03;
    const breathe = Math.sin(t * 2.2) * 0.01;
    root.current.rotation.y = sway;
    rTorso.current.position.y = 0.05 + breathe;
    rLA.current.rotation.z = 0.25 + Math.sin(t * 1.9) * 0.06;
    rRA.current.rotation.z = -0.25 + Math.sin(t * 1.9 + Math.PI) * 0.06;
    rLL.current.rotation.x = Math.sin(t * 1.5 + Math.PI / 6) * 0.04;
    rRL.current.rotation.x = Math.sin(t * 1.5 - Math.PI / 6) * 0.04;
  });

  return (
    <group ref={root} {...props} scale={bodyScale}>
      {/* -------- torso block (with rounded chest) -------- */}
      <group ref={rTorso} position={[0, 0.85, 0]}>
        {/* base torso */}
        <mesh castShadow receiveShadow>
          {/* Rounded chest via capsule; slim waist via scaled sphere */}
          {/* chest */}
          {(THREE as any).CapsuleGeometry
            ? <capsuleGeometry args={[0.45, 0.6, 8, 16]} />
            : <boxGeometry args={[0.9, 1.1, 0.5]} />}
          <meshStandardMaterial color={"#21314f"} roughness={0.7} metalness={0.05} />
        </mesh>

        {/* shirt overlay */}
        <mesh position={[0, 0.02, 0]} scale={[1.02, 1.02, 1.02]}>
          {(THREE as any).CapsuleGeometry
            ? <capsuleGeometry args={[0.46, 0.62, 8, 16]} />
            : <boxGeometry args={[0.92, 1.12, 0.52]} />}
          <meshStandardMaterial color={shirt} roughness={0.55} metalness={0.08} />
        </mesh>
      </group>

      {/* neck */}
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.15, 12]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>

      {/* head */}
      <group ref={rHead} position={[0, 1.62, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.34, 32, 32]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>

        {/* hair by style */}
        {hairStyle(preset?.hair, hair)}

        {/* eyes */}
        <mesh position={[-0.12, 0.03, 0.3]}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshStandardMaterial color={eye} />
        </mesh>
        <mesh position={[0.12, 0.03, 0.3]}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshStandardMaterial color={eye} />
        </mesh>

        {/* brows */}
        {brows(preset?.eyes)}

        {/* mouth */}
        <mesh position={[0, -0.06, 0.31]} rotation={[0, 0, mouthShape.rotate]}>
          <boxGeometry args={[mouthShape.w, mouthShape.h, 0.03]} />
          <meshStandardMaterial color={eye} />
        </mesh>
      </group>

      {/* -------- arms -------- */}
      <group ref={rLA} position={[-0.55, 0.98, 0]}>
        <Limb color={skin} sleeve={shirt} />
      </group>
      <group ref={rRA} position={[0.55, 0.98, 0]}>
        <Limb color={skin} sleeve={shirt} mirror />
      </group>

      {/* -------- legs -------- */}
      <group ref={rLL} position={[-0.22, 0.46, 0]}>
        <Leg pants={pants} skin={skin} shoes={shoes} />
      </group>
      <group ref={rRL} position={[0.22, 0.46, 0]}>
        <Leg pants={pants} skin={skin} shoes={shoes} />
      </group>

      {/* trail/fx if outfit has it */}
      {preset?.outfitId === "outfit_astro" && (
        <mesh position={[0, 1.15, -0.28]} rotation={[0, 0, Math.PI / 10]}>
          <boxGeometry args={[1.0, 0.06, 0.06]} />
          <meshStandardMaterial color={"#8be9fd"} emissive={"#8be9fd"} emissiveIntensity={0.3} />
        </mesh>
      )}
    </group>
  );
}

/* ---------------- parts ---------------- */

function Limb({ color, sleeve, mirror = false }: { color: string; sleeve: string; mirror?: boolean }) {
  const side = mirror ? -1 : 1;

  return (
    <group rotation={[0, 0, side * 0.15]}>
      {/* upper arm (with short sleeve overlay) */}
      <mesh position={[side * 0.08, -0.18, 0]} castShadow>
        {(THREE as any).CapsuleGeometry
          ? <capsuleGeometry args={[0.11, 0.28, 8, 12]} />
          : <cylinderGeometry args={[0.11, 0.11, 0.5, 12]} />}
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[side * 0.08, -0.05, 0]} scale={[1.06, 0.6, 1.06]}>
        {(THREE as any).CapsuleGeometry
          ? <capsuleGeometry args={[0.12, 0.18, 8, 12]} />
          : <cylinderGeometry args={[0.12, 0.12, 0.3, 12]} />}
        <meshStandardMaterial color={sleeve} roughness={0.55} />
      </mesh>

      {/* forearm */}
      <mesh position={[side * 0.12, -0.52, 0]} rotation={[0, 0, side * 0.08]} castShadow>
        {(THREE as any).CapsuleGeometry
          ? <capsuleGeometry args={[0.105, 0.32, 8, 12]} />
          : <cylinderGeometry args={[0.105, 0.105, 0.52, 12]} />}
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* hand */}
      <mesh position={[side * 0.22, -0.75, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Leg({ pants, skin, shoes }: { pants: string; skin: string; shoes: string }) {
  return (
    <group>
      {/* thigh */}
      <mesh position={[0, -0.18, 0]} castShadow>
        {(THREE as any).CapsuleGeometry
          ? <capsuleGeometry args={[0.13, 0.32, 8, 12]} />
          : <cylinderGeometry args={[0.13, 0.13, 0.5, 12]} />}
        <meshStandardMaterial color={pants} roughness={0.6} />
      </mesh>

      {/* calf */}
      <mesh position={[0.02, -0.54, 0]} castShadow>
        {(THREE as any).CapsuleGeometry
          ? <capsuleGeometry args={[0.12, 0.34, 8, 12]} />
          : <cylinderGeometry args={[0.12, 0.12, 0.54, 12]} />}
        <meshStandardMaterial color={pants} roughness={0.6} />
      </mesh>

      {/* ankle/foot */}
      <mesh position={[0.05, -0.86, 0.09]}>
        <boxGeometry args={[0.32, 0.12, 0.42]} />
        <meshStandardMaterial color={shoes} roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0.18, -0.86, 0.2]}>
        <boxGeometry args={[0.12, 0.08, 0.18]} />
        <meshStandardMaterial color={"#eeeeee"} />
      </mesh>
    </group>
  );
}

/* ---------------- visual helpers ---------------- */

function hairStyle(style: AvatarPreset["hair"] | undefined, color: string) {
  const y = 0.16;
  switch (style) {
    case "Buzz":
      return (
        <mesh position={[0, y - 0.02, 0]}>
          <sphereGeometry args={[0.34, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
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
          <mesh position={[0.23, y - 0.06, -0.1]} rotation={[0, 0, -0.6]}>
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
  const y = 0.10;
  const z = 0.31;
  const base = { w: 0.12, h: 0.015 };
  const tilt = style === "Sharp" ? 0.35 : style === "Happy" ? -0.2 : 0;
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

function bodyScaleFor(body: AvatarPreset["body"] | undefined): number {
  switch (body) {
    case "Slim":
      return 0.98;
    case "Athletic":
      return 1.08;
    case "Standard":
    default:
      return 1.02;
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
function outfitTop(id?: AvatarPreset["outfitId"]) {
  switch (id) {
    case "outfit_astro":
      return "#1e2a44";
    case "outfit_runner":
    default:
      return "#1f3e76";
  }
}
function outfitBottom(id?: AvatarPreset["outfitId"]) {
  switch (id) {
    case "outfit_astro":
      return "#2a3b5e";
    case "outfit_runner":
    default:
      return "#1e345f";
  }
}
function outfitShoes(id?: AvatarPreset["outfitId"]) {
  switch (id) {
    case "outfit_astro":
      return "#2a9dad";
    case "outfit_runner":
    default:
      return "#0ea5e9";
  }
}
