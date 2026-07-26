/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_P2LIST_HR_OPERATOR_TOKEN?: string;
  readonly VITE_P2LIST_APPROVER_TOKEN?: string;
  readonly VITE_P2LIST_SUPPORT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
