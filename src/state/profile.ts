import { create } from "zustand";

/**
 * Client-only profile state (MVP)
 * - Stores username, birthday, optional gender
 * - Computes age from birthday
 * - Enforces age-band check: allowed ages are [age-1, age, age+1]
 * - Starts player with 1,000 Coins and basic wallet helpers
 *
 * NOTE: We'll replace this with Supabase-backed profile later.
 */

export type Gender = "Male" | "Female" | "Non-binary" | "Prefer not to say" | "Other";

export type Profile = {
  username: string;
  birthday: string; // ISO "YYYY-MM-DD"
  gender?: Gender;
};

type Wallet = {
  coins: number;
};

type ProfileState = {
  profile: Profile | null;
  wallet: Wallet;

  // Derived
  age: number | null;

  // Actions
  setProfile: (p: Profile) => void;
  updateProfile: (p: Partial<Profile>) => void;

  // Wallet
  grantCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;

  // Age helpers
  computeAge: (isoDate: string) => number | null;
  isAgeAllowed: (targetAge: number) => boolean; // age-band: your age ± 1
};

export const useProfile = create<ProfileState>((set, get) => ({
  profile: null,
  wallet: { coins: 1000 }, // everyone starts with 1,000 Coins
  age: null,

  setProfile: (p) => {
    const age = get().computeAge(p.birthday);
    set({ profile: p, age });
  },

  updateProfile: (partial) => {
    const cur = get().profile ?? { username: "", birthday: "" };
    const next = { ...cur, ...partial };
    const age = next.birthday ? get().computeAge(next.birthday) : get().age;
    set({ profile: next, age: age ?? null });
  },

  grantCoins: (amount) => {
    if (amount <= 0) return;
    set((s) => ({ wallet: { coins: s.wallet.coins + amount } }));
  },

  spendCoins: (amount) => {
    if (amount <= 0) return true;
    const { coins } = get().wallet;
    if (coins < amount) return false;
    set({ wallet: { coins: coins - amount } });
    return true;
  },

  computeAge: (isoDate) => {
    if (!isoDate) return null;
    const dob = new Date(isoDate);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age < 0 || age > 120 ? null : age;
  },

  isAgeAllowed: (targetAge: number) => {
    const age = get().age;
    if (age == null || isNaN(targetAge)) return false;
    return targetAge >= age - 1 && targetAge <= age + 1;
  },
}));

/**
 * Convenience selector hooks (optional, nice for components)
 */
export const useAge = () => useProfile((s) => s.age);
export const useCoins = () => useProfile((s) => s.wallet.coins);
export const useUsername = () => useProfile((s) => s.profile?.username ?? "");
