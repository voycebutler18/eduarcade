// src/state/wallet.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CoinSkuId = "COINS_1K" | "COINS_5K" | "COINS_12K";

export const COIN_SKUS: Record<CoinSkuId, { label: string; coins: number; priceUsd: number }> = {
  COINS_1K:  { label: "1,000 Coins", coins: 1000, priceUsd: 1.99 },
  COINS_5K:  { label: "5,000 Coins", coins: 5000, priceUsd: 5.99 },
  COINS_12K: { label: "12,000 Coins", coins: 12000, priceUsd: 12.99 },
};

type WalletState = {
  coins: number;

  // Basic ops
  grant: (n: number) => void;           // add coins
  canAfford: (n: number) => boolean;
  spend: (n: number) => boolean;        // returns true if success
  reset: () => void;

  // Convenience
  format: (n?: number) => string;

  // SKUs (client-side crediting; replace with Stripe webhook in prod)
  grantSku: (sku: CoinSkuId) => void;
};

export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
      coins: 1000, // everyone starts with 1,000 coins

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
    }),
    { name: "eva-wallet" }
  )
);
