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
  splitting: false,
  external: [
    'react',
    'react-native',
    'react-native-view-shot',
    '@tatlacas/brevwick-sdk',
  ],
  target: 'es2020',
  define: {
    __BREVWICK_REACT_NATIVE_VERSION__: JSON.stringify(pkg.version),
  },
});
