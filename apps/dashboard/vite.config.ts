import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

function readAllowedHosts(): true | string[] {
  const raw = process.env.OPENBIKA_DASHBOARD_ALLOWED_HOSTS?.trim();
  if (!raw || raw.toLowerCase() === "true") {
    return true;
  }
  return raw
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

const config = defineConfig(({ mode }) => {
  const isTest = mode === "test" || process.env.VITEST === "true";
  const allowedHosts = readAllowedHosts();

  return {
    preview: {
      allowedHosts,
    },
    resolve: { tsconfigPaths: true },
    server: {
      allowedHosts,
    },
    plugins: [
      devtools(),
      !isTest && cloudflare({ viteEnvironment: { name: "ssr" } }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});

export default config;
