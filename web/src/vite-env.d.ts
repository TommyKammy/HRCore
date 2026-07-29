/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_P2LIST_HR_OPERATOR_TOKEN?: string;
  readonly VITE_P2LIST_APPROVER_TOKEN?: string;
  readonly VITE_P2LIST_SUPPORT_TOKEN?: string;
  readonly VITE_P2LIST_UAT_RESPONSE_DROP_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
