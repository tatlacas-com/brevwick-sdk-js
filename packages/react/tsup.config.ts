import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  // Rollup-driven treeshaking strips the `"use client"` directive that
  // Next.js App Router needs. esbuild handles the bundle size fine without
  // it — we rely on @radix-ui's tree-shakable exports for dead-code removal.
  treeshake: false,
  splitting: false,
  external: ['react', 'react-dom', '@tatlacas/brevwick-sdk'],
  target: 'es2020',
  define: {
    __BREVWICK_REACT_VERSION__: JSON.stringify(pkg.version),
  },
  // Every public export uses hooks/context/effects; marking the bundle
  // `"use client"` lets Next.js App Router servers import it from Server
  // Components without hitting the createContext-is-not-a-function wall.
  banner: { js: '"use client";' },
});
