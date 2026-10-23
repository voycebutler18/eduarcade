import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function mendlyxBrand(): Plugin {
  const rebrand = (value: string) => value
    .replace(/RentPilot AI/g, "Mendlyx")
    .replace(/RentPilot/g, "Mendlyx");

  return {
    name: "mendlyx-sitewide-brand",
    enforce: "pre",
    transform(code, id) {
      if (!/\.(?:[cm]?[jt]sx?|json)$/.test(id) || id.includes("node_modules")) return null;
      const next = rebrand(code);
      return next === code ? null : { code: next, map: null };
    },
    transformIndexHtml(html) {
      return rebrand(html);
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [mendlyxBrand(), react()],
  server: {
    port: 5173,
    strictPort: false
  },
  preview: {
    port: 4173,
    strictPort: false
  },
  build: {
    sourcemap: true,
    target: "es2020",
    outDir: "dist"
  }
});
