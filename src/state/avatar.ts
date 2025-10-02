import { create } from "zustand";

export type AvatarPreset = {
  skin: "Very Light" | "Light" | "Tan" | "Deep" | "Rich";
  body: "Slim" | "Standard" | "Athletic";
  hair: "Short" | "Ponytail" | "Curly" | "Buzz";
  eyes: "Round" | "Sharp" | "Happy";
  expr: "Neutral" | "Smile" | "Wow" | "Determined";
  outfitId?: "outfit_runner" | "outfit_astro";
};

type AvatarState = {
  preset: AvatarPreset | null;
  setPreset: (p: AvatarPreset) => void;
};

export const useAvatar = create<AvatarState>((set) => ({
  preset: {
    skin: "Light",
    body: "Standard",
    hair: "Short",
    eyes: "Round",
    expr: "Neutral",
    outfitId: "outfit_runner",
  },
  setPreset: (p) => set({ preset: p }),
}));
