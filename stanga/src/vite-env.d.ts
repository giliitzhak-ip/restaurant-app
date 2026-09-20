/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** False in builds made with STANGA_NO_PWA=1, which ship no service worker. */
  readonly STANGA_PWA: boolean;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
