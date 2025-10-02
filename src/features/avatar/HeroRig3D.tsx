// src/features/avatar/HeroRig3D.tsx
import * as THREE from "three";
import { GroupProps, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AvatarPreset } from "../../state/avatar";

/**
 * HeroRig3D (procedural, original)
 * - Head/neck parented to torso (no floating)
 * - Capsule limbs + rounded torso
 * - Subtle idle motion
 * - Improved hair styles that match labels: Short, Ponytail, Curly, Buzz
 */

export default function HeroRig3D({
  preset,
  ...props
}: GroupProps & { preset: AvatarPreset | null }) {
  const root = useRef<THREE.Group>(null!);
  const gTorso = useRef<THREE.Group>(null!);
  const gHead = useRef<THREE.Group>(null!);
  const gLA = useRef<THREE.Group>(null!);
  const gRA = useRef<THREE.Group>(null!);
  const gLL = useRef<THREE.Group>(null!);
  const gRL = useRef<THREE.Group>(null!);

  // appearance from preset
  const skin = useMemo(() => skinHex(preset?.skin), [preset?.skin]);
  const hairColor = "#27334d"; // single MVP shade; swap later for palette
  const shirt = useMemo(() => outfitTop(preset?.outfitId), [preset?.outfitId]);
  const pants = useMemo(() => outfitBottom(preset?.outfitId), [preset?.outfitId]);
  const shoes = useMemo(() => outfitShoes(preset?.outfitId), [preset?.outfitId]);
  const bodyScale = useMemo(() => bodyScaleFor(preset?.body), [preset?.body]);
  const mouthShape = useMemo(() => mouthFor(preset?.expr), [preset?.expr]);

  // idle
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    root.current.rotation.y = Math.sin(t * 1.4) * 0.05;
    gTorso.current.position.y = 0.9 + Math.sin(t * 2.1) * 0.012;
    gLA.current.rotation.z = 0.18 + Math.sin(t * 2.0) * 0.06;
    gRA.current.rotation.z = -0.18 + Math.sin(t * 2.0 + Math.PI) * 0.06;
    gLL.current.rotation.x = Math.sin(t * 1.6 + Math.PI / 8) * 0.04;
    gRL.current.rotation.x = Math.sin(t * 1.6 - Math.PI / 8) * 0.04;
  });

  return (
    <group ref={root} {...props} scale={bodyScale} castShadow receiveShadow>
      {/* ---- Torso group (head/neck are children so they stay attached) ---- */}
      <group ref={gTorso} position={[0, 0.9, 0]}>
        {/* base torso */}
        <mesh castShadow receiveShadow>
          {(THREE as any).CapsuleGeometry ? (
            <capsuleGeometry args={[0.46, 0.64, 8, 16]} />
          ) : (
            <boxGeometry args={[0.92, 1.1, 0.5]} />
          )}
          <meshStandardMaterial color={"#1b2b4b"} roughness={0.7} metalness={0.05} />
        </mesh>

        {/* shirt overlay */}
        <mesh position={[0, 0.01, 0]} scale={[1.015, 1.02, 1.02]} castShadow receiveShadow>
          {(THREE as any).CapsuleGeometry ? (
            <capsuleGeometry args={[0.47, 0.66, 8, 16]} />
          ) : (
            <boxGeometry args={[0.94, 1.12, 0.52]} />
          )}
          <meshStandardMaterial color={shirt} roughness={0.5} metalness={0.08} />
        </mesh>

        {/* neck */}
        <mesh position={[0, 0.64, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.14, 16]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>

        {/* head */}
        <group ref={gHead} position={[0, 0.85, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.34, 32, 32]} />
            <meshStandardMaterial color={skin} roughness={0.85} />
          </mesh>

          {/* HAIR — improved, clearly distinguishable */}
          {hairStyle(preset?.hair, hairColor)}

          {/* eyes */}
          <mesh position={[-0.12, 0.02, 0.29]} castShadow>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshStandardMaterial color={"#0b0f16"} />
          </mesh>
          <mesh position={[0.12, 0.02, 0.29]} castShadow>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshStandardMaterial color={"#0b0f16"} />
          </mesh>

          {/* brows */}
          {brows(preset?.eyes)}

          {/* mouth */}
          <mesh position={[0, -0.07, 0.3]} rotation={[0, 0, mouthShape.rotate]} castShadow>
            <boxGeometry args={[mouthShape.w, mouthShape.h, 0.03]} />
            <meshStandardMaterial color={"#0b0f16"} />
          </mesh>
        </group>
      </group>

      {/* ---- Arms ---- */}
      <group ref={gLA} position={[-0.58, 0.95, 0]}>
        <Arm skin={skin} sleeve={shirt} mirror={false} />
      </group>
      <group ref={gRA} position={[0.58, 0.95, 0]}>
        <Arm skin={skin} sleeve={shirt} mirror />
      </group>

      {/* ---- Legs ---- */}
      <group ref={gLL} position={[-0.22, 0.46, 0]}>
        <Leg pants={pants} skin={skin} shoes={shoes} />
      </group>
      <group ref={gRL} position={[0.22, 0.46, 0]}>
        <Leg pants={pants} skin={skin} shoes={shoes} />
      </group>

      {/* Simple win FX for Astro */}
      {preset?.outfitId === "outfit_astro" && (
        <mesh position={[0, 1.15, -0.28]} rotation={[0, 0, Math.PI / 10]} castShadow>
          <boxGeometry args={[1.0, 0.06, 0.06]} />
          <meshStandardMaterial color={"#8be9fd"} emissive={"#8be9fd"} emissiveIntensity={0.3} />
        </mesh>
      )}
    </group>
  );
}

/* ---------------- parts ---------------- */

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
      {/* thigh */}
      <mesh position={[0, -0.18, 0]} castShadow>
        {(THREE as any).CapsuleGeometry ? (
          <capsuleGeometry args={[0.13, 0.32, 8, 12]} />
        ) : (
          <cylinderGeometry args={[0.13, 0.13, 0.5, 12]} />
        )}
        <meshStandardMaterial color={pants} roughness={0.6} />
      </mesh>
      {/* calf */}
      <mesh position={[0.02, -0.54, 0]} castShadow>
        {(THREE as any).CapsuleGeometry ? (
          <capsuleGeometry args={[0.12, 0.34, 8, 12]} />
        ) : (
          <cylinderGeometry args={[0.12, 0.12, 0.54, 12]} />
        )}
        <meshStandardMaterial color={pants} roughness={0.6} />
      </mesh>
      {/* foot */}
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

/* ---------------- helpers ---------------- */

/**
 * Hair: produce very clear silhouettes.
 * Head radius is ~0.34, head center at y ~ 0.
 */
function hairStyle(style: AvatarPreset["hair"] | undefined, color: string) {
  const R = 0.34;
  const yTop = 0.12; // crown shift

  switch (style) {
    /** CLOSE-CUT CAP that reads as "short hair" */
    case "Short":
      return (
        <group>
          {/* cap ring (sides) */}
          <mesh position={[0, yTop + 0.02, 0]} castShadow>
            <cylinderGeometry args={[R + 0.02, R - 0.02, 0.18, 32]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          {/* top disk */}
          <mesh position={[0, yTop + 0.12, 0]} castShadow>
            <sphereGeometry args={[R + 0.015, 32, 16, 0, Math.PI * 2, 0, Math.PI / 4]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </group>
      );

    /** PONYTAIL: a headband + tube of hair behind */
    case "Ponytail":
      return (
        <group>
          {/* headband */}
          <mesh position={[0, yTop + 0.04, 0]} castShadow>
            <torusGeometry args={[R + 0.02, 0.03, 16, 48]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
          {/* crown hair */}
          <mesh position={[0, yTop + 0.05, 0]} castShadow>
            <sphereGeometry args={[R + 0.02, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          {/* ponytail tube */}
          <mesh position={[0, yTop - 0.03, -0.22]} rotation={[0.35, 0, 0]} castShadow>
            {(THREE as any).CapsuleGeometry ? (
              <capsuleGeometry args={[0.09, 0.45, 8, 12]} />
            ) : (
              <cylinderGeometry args={[0.09, 0.09, 0.6, 16]} />
            )}
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </group>
      );

    /** CURLY: clusters of balls around the crown */
    case "Curly":
      return (
        <group position={[0, yTop + 0.02, 0]}>
          {[
            [-0.20, 0.06, 0.00], [0, 0.08, 0.00], [0.20, 0.06, 0.00],
            [-0.16, 0.03, 0.14], [0.0, 0.04, 0.16], [0.16, 0.03, 0.14],
            [-0.16, 0.03, -0.14], [0.0, 0.02, -0.16], [0.16, 0.03, -0.14],
          ].map((p, i) => (
            <mesh key={i} position={p as any} castShadow>
              <sphereGeometry args={[0.14, 18, 18]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          ))}
        </group>
      );

    /** BUZZ: very thin cap hugging the scalp */
    case "Buzz":
      return (
        <mesh position={[0, yTop + 0.01, 0]} castShadow>
          {/* thin hemisphere slice (thetaLength small) */}
          <sphereGeometry args={[R + 0.005, 32, 16, 0, Math.PI * 2, 0, Math.PI / 4.5]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      );

    default:
      // fallback to Short
      return (
        <group>
          <mesh position={[0, yTop + 0.02, 0]} castShadow>
            <cylinderGeometry args={[R + 0.02, R - 0.02, 0.18, 32]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, yTop + 0.12, 0]} castShadow>
            <sphereGeometry args={[R + 0.015, 32, 16, 0, Math.PI * 2, 0, Math.PI / 4]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </group>
      );
  }
}

function brows(style: AvatarPreset["eyes"] | undefined) {
  const y = 0.1;
  const z = 0.29;
  const tilt = style === "Sharp" ? 0.35 : style === "Happy" ? -0.2 : 0;
  return (
    <group>
      <mesh position={[-0.12, y, z]} rotation={[0, 0, tilt]} castShadow>
        <boxGeometry args={[0.12, 0.015, 0.02]} />
        <meshStandardMaterial color={"#0b0f16"} />
      </mesh>
      <mesh position={[0.12, y, z]} rotation={[0, 0, -tilt]} castShadow>
        <boxGeometry args={[0.12, 0.015, 0.02]} />
        <meshStandardMaterial color={"#0b0f16"} />
      </mesh>
    </group>
  );
}

function mouthFor(expr: AvatarPreset["expr"] | undefined) {
  switch (expr) {
    case "Smile": return { w: 0.20, h: 0.02, rotate: -0.15 };
    case "Wow": return { w: 0.08, h: 0.08, rotate: 0 };
    case "Determined": return { w: 0.16, h: 0.02, rotate: 0.2 };
    case "Neutral":
    default: return { w: 0.16, h: 0.02, rotate: 0 };
  }
}

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
