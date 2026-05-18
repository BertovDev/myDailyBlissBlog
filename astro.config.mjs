import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

import tailwind from "@astrojs/tailwind";
import sanity from "@sanity/astro";
import react from "@astrojs/react";

const {
  PUBLIC_SANITY_PROJECT_ID,
  PUBLIC_SANITY_DATASET,
} = loadEnv(process.env.NODE_ENV ?? "", process.cwd(), "PUBLIC_");

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: PUBLIC_SANITY_PROJECT_ID,
      dataset: PUBLIC_SANITY_DATASET,
      useCdn: false,
      apiVersion: "2025-01-01",
      studioBasePath: "/studio",
      studioRouterHistory: "hash",
    }),
    react(),
    tailwind(),
  ],
  output: "static",
});
