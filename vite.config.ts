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

function mendlyxWorkspaceSplitting(): Plugin {
  const screens = [
    "PortfolioManager",
    "MoneyChaserHub",
    "MaintenanceManager",
    "InboxManager",
    "AIActivity",
    "VendorManager",
    "TenantPortal",
    "MaintenanceTeamPortal",
    "PaymentsManager",
    "AdminDashboard",
    "PublicRentPayment",
    "ComplianceCenter",
    "DocumentVault",
    "NovaAssistant",
    "LocalIntelligence",
    "LandlordOverview"
  ];

  return {
    name: "mendlyx-workspace-code-splitting",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]src[\\/]App\.tsx$/.test(id)) return null;
      let next = code.replace(
        'import { FormEvent, useEffect, useMemo, useState } from "react";',
        'import { FormEvent, lazy, useEffect, useMemo, useState } from "react";'
      );
      for (const name of screens) {
        const eager = `import { ${name} } from "./components/${name}";`;
        const lazyImport = `const ${name}=lazy(()=>import("./components/${name}").then(m=>({default:m.${name}})));`;
        next = next.replace(eager, lazyImport);
      }
      return next === code ? null : { code: next, map: null };
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [mendlyxWorkspaceSplitting(), mendlyxBrand(), react()],
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
