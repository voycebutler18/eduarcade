// src/features/player/StepOffset.ts
import type { Collider } from "../campus/OutdoorWorld3D";

/**
 * StepOffset
 * Utility to allow "stepping" up small ledges instead of stopping dead.
 * Call this after your PlayerController resolves XZ movement.
 *
 * Example:
 * const so = new StepOffset({ stepHeight: 0.5 });
 * y.current = so.resolveHeight(pos.current.x, pos.current.z, y.current, colliders);
 */
export class StepOffset {
  stepHeight: number;

  constructor({ stepHeight = 0.5 }: { stepHeight?: number } = {}) {
    this.stepHeight = stepHeight;
  }

  /**
   * Given the player’s current horizontal position and vertical Y,
   * check colliders and "lift" up by stepHeight if within threshold.
   */
  resolveHeight(
    x: number,
    z: number,
    currentY: number,
    colliders: Collider[]
  ): number {
    let targetY = 0;

    for (const c of colliders) {
      if (c.kind !== "box") continue;
      // crude: treat all box colliders as potential floors
      const halfW = c.w / 2;
      const halfD = c.d / 2;
      const inside =
        x >= c.x - halfW &&
        x <= c.x + halfW &&
        z >= c.z - halfD &&
        z <= c.z + halfD;
      if (!inside) continue;

      // collider top
      const topY = (c as any).y ?? 0; // allow y property if you added it
      if (currentY >= topY - 0.05 && currentY <= topY + this.stepHeight) {
        targetY = Math.max(targetY, topY);
      }
    }

    return targetY > currentY ? targetY : currentY;
  }
}
