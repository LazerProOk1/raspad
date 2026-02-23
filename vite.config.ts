import { defineConfig } from "vite";

const isDevModule = (id: string): boolean =>
  id.includes("/src/dev/") || id.includes("\\src\\dev\\");

export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    rollupOptions: mode === "production"
      ? {
          treeshake: {
            moduleSideEffects: (id: string): boolean => !isDevModule(id)
          }
        }
      : undefined
  },
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    globals: true
  }
}));
