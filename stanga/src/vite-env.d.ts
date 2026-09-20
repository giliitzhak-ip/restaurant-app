/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** False in builds made with STANGA_NO_PWA=1, which ship no service worker. */
  readonly STANGA_PWA: boolean;
  /** Authoritative server URL, from STANGA_SERVER_URL. Empty = work it out. */
  readonly STANGA_SERVER_URL: string;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
