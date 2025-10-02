import { create } from "zustand";
import { useProfile } from "./profile";

/**
 * Cosmetic-only economy (MVP)
 * - Items: trails, nameplates, outfits, win effects
 * - Everyone starts with 1,000 Coins (in profile store)
 * - Buying deducts coins immediately; no pay-to-win effects
 */

export type ItemSlot = "trail" | "nameplate" | "outfit" | "winfx";

export type StoreItem = {
  id: string;
  name: string;
  slot: ItemSlot;
  price: number; // coins
  rarity: "Common" | "Rare" | "Epic";
  emoji?: string; // quick visual for MVP
  limited?: boolean; // for rotations later
};

type InventoryState = {
  // Static catalog for MVP (can rotate later via cron/server)
  catalog: StoreItem[];
  owned: Record<string, boolean>;
  equipped: Partial<Record<ItemSlot, string>>;

  // actions
  buy: (id: string) => { ok: boolean; reason?: string };
  equip: (id: string) => void;
  isOwned: (id: string) => boolean;
};

const BASE_CATALOG: StoreItem[] = [
  { id: "trail_sparkle", name: "Sparkle Trail", slot: "trail", price: 120, rarity: "Common", emoji: "✨" },
  { id: "trail_jet", name: "Jet Stream", slot: "trail", price: 220, rarity: "Rare", emoji: "💨" },
  { id: "nameplate_wave", name: "Wave Nameplate", slot: "nameplate", price: 90, rarity: "Common", emoji: "🌊" },
  { id: "nameplate_star", name: "Star Nameplate", slot: "nameplate", price: 140, rarity: "Rare", emoji: "⭐" },
  { id: "outfit_runner", name: "Runner Set", slot: "outfit", price: 260, rarity: "Common", emoji: "🏃" },
  { id: "outfit_astro", name: "Astro Set", slot: "outfit", price: 420, rarity: "Epic", emoji: "👩‍🚀" },
  { id: "winfx_confetti", name: "Confetti Win FX", slot: "winfx", price: 180, rarity: "Common", emoji: "🎉" },
  { id: "winfx_lasers", name: "Laser Show Win FX", slot: "winfx", price: 360, rarity: "Rare", emoji: "🔦" }
];

export const useInventory = create<InventoryState>((set, get) => ({
  catalog: BASE_CATALOG,
  owned: {},
  equipped: {},

  buy: (id) => {
    const item = get().catalog.find((i) => i.id === id);
    if (!item) return { ok: false, reason: "Item not found." };

    // Already owned?
    if (get().owned[id]) return { ok: false, reason: "Already owned." };

    // Spend coins via profile store
    const spent = useProfile.getState().spendCoins(item.price);
    if (!spent) return { ok: false, reason: "Not enough Coins." };

    // Grant item
    set((s) => ({ owned: { ...s.owned, [id]: true } }));

    // Auto-equip on purchase for convenience
    set((s) => ({ equipped: { ...s.equipped, [item.slot]: id } }));

    return { ok: true };
  },

  equip: (id) => {
    const item = get().catalog.find((i) => i.id === id);
    if (!item) return;
    if (!get().owned[id]) return;
    set((s) => ({ equipped: { ...s.equipped, [item.slot]: id } }));
  },

  isOwned: (id) => !!get().owned[id],
}));
