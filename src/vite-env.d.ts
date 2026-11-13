/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_REPO?: string;
  readonly VITE_DATA_BRANCH?: string;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
