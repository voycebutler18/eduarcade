// src/state/wallet.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type WalletState = {
  coins: number;
  grant: (n: number) => void;
  canAfford: (n: number) => boolean;
  spend: (n: number) => boolean; // returns true if success
  reset: () => void;
};

export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
      coins: 1000, // everyone starts with 1,000 coins
      grant: (n) => set((s) => ({ coins: s.coins + n })),
      canAfford: (n) => get().coins >= n,
      spend: (n) => {
        if (get().coins < n) return false;
        set((s) => ({ coins: s.coins - n }));
        return true;
      },
      reset: () => set({ coins: 1000 }),
    }),
    { name: "eva-wallet" }
  )
);
