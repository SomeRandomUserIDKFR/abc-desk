import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/abc-desk/
  base: "/abc-desk/",
  server: {
    watch: {
      ignored: ["**/.tools/**"],
    },
  },
});
