/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for approach B. Unset in dev (same-origin via Vite proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
