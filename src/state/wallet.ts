// src/state/wallet.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Public SKUs used by the client. Server maps these to Stripe Price IDs via env. */
export type CoinSkuId = "COINS_1K" | "COINS_5K" | "COINS_12K";

export const COIN_SKUS: Record<CoinSkuId, { label: string; coins: number; priceUsd: number }> = {
  COINS_1K:  { label: "1,000 Coins",  coins: 1000,  priceUsd: 1.99 },
  COINS_5K:  { label: "5,000 Coins",  coins: 5000,  priceUsd: 5.99 },
  COINS_12K: { label: "12,000 Coins", coins: 12000, priceUsd: 12.99 },
};

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

type WalletState = {
  coins: number;

  // Basic ops (local-first)
  grant: (n: number) => void;           // add coins locally
  canAfford: (n: number) => boolean;
  spend: (n: number) => boolean;        // returns true if success
  reset: () => void;
  format: (n?: number) => string;

  // Local SKU grant (kept for dev; prod should grant via server webhook)
  grantSku: (sku: CoinSkuId) => void;

  // --- Optional server sync helpers (safe no-ops if API_BASE not set) ---
  /** Hard-set balance from server (used by sync) */
  setBalance: (balance: number) => void;

  /** Pull latest balance from server for a given userId */
  syncFromServer: (userId: string) => Promise<void>;

  /** Push a spend event to server (optional; no-op if API not present) */
  spendServerSide?: (userId: string, amount: number) => Promise<void>;
};

export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
      coins: 1000, // everyone starts with 1,000 coins

      // -------- Local ops --------
      grant: (n) => set((s) => ({ coins: Math.max(0, s.coins + n) })),
      canAfford: (n) => get().coins >= n,
      spend: (n) => {
        if (get().coins < n) return false;
        set((s) => ({ coins: s.coins - n }));
        return true;
      },
      reset: () => set({ coins: 1000 }),
      format: (n) => {
        const v = typeof n === "number" ? n : get().coins;
        return v.toLocaleString();
      },

      grantSku: (sku) => {
        const def = COIN_SKUS[sku];
        if (!def) return;
        set((s) => ({ coins: s.coins + def.coins }));
      },

      // -------- Server sync helpers --------
      setBalance: (balance: number) => set({ coins: Math.max(0, Math.floor(balance)) }),

      syncFromServer: async (userId: string) => {
        if (!API_BASE) return; // no API configured on static site
        try {
          const resp = await fetch(`${API_BASE}/api/wallet/balance?userId=${encodeURIComponent(userId)}`, {
            method: "GET",
            headers: { "Accept": "application/json" },
          });
          const data = await resp.json();
          if (resp.ok && typeof data?.balance === "number") {
            set({ coins: Math.max(0, Math.floor(data.balance)) });
          } else {
            // Keep local if server not ready or returns error
            console.warn("[wallet] Failed to sync balance:", data?.error || resp.status);
          }
        } catch (e) {
          console.warn("[wallet] Sync error:", e);
        }
      },

      // Optional: if you add a server endpoint to record spends centrally.
      spendServerSide: async (userId: string, amount: number) => {
        if (!API_BASE) return;
        try {
          await fetch(`${API_BASE}/api/wallet/spend`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, amount }),
          });
          // We assume local spend already happened; server can validate separately.
        } catch (e) {
          console.warn("[wallet] spendServerSide error:", e);
        }
      },
    }),
    { name: "eva-wallet" }
  )
);
