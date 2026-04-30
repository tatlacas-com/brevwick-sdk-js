/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_BREVWICK_PROJECT_KEY: string;
  readonly VITE_BREVWICK_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
