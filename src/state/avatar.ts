import { create } from "zustand";

export type AvatarPreset = {
  body: "Slim" | "Standard" | "Athletic";
  skin: "Very Light" | "Light" | "Tan" | "Deep" | "Rich";
  hair: "Short" | "Ponytail" | "Curly" | "Buzz";
  eyes: "Round" | "Sharp" | "Happy";
  expr: "Neutral" | "Smile" | "Wow" | "Determined";
  outfitId?: "outfit_runner" | "outfit_astro";
};

const DEFAULT_PRESET: AvatarPreset = {
  body: "Standard",
  skin: "Light",
  hair: "Short",
  eyes: "Round",
  expr: "Neutral",
  outfitId: "outfit_runner",
};

const KEY = "eva_avatar_preset";

function load(): AvatarPreset {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AvatarPreset;
  } catch {}
  return DEFAULT_PRESET;
}

export const useAvatar = create<{
  preset: AvatarPreset;
  setPreset: (p: AvatarPreset) => void;
}>(() => ({
  preset: load(),
  setPreset: (p) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {}
    useAvatar.setState({ preset: p });
  },
}));
