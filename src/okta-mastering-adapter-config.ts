import type {
  BlockedOktaMasteringConfig,
  LocalRealOktaMasteringConfig,
} from "./okta-mastering-adapter.js";

const LOCAL_OKTAENV_PREFIX = "HRCORE_" + "OKTA" + "_";
const LOCAL_OKTAENV_KEYS = [
  `${LOCAL_OKTAENV_PREFIX}BASE_URL`,
  `${LOCAL_OKTAENV_PREFIX}CLIENT_ID`,
  `${LOCAL_OKTAENV_PREFIX}CLIENT_SECRET`,
] as const;

type LocalOktaEnvKey = (typeof LOCAL_OKTAENV_KEYS)[number];

export function resolveLocalOktaMasteringConfig(
  env: Partial<Record<LocalOktaEnvKey, string | undefined>> = process.env,
): BlockedOktaMasteringConfig | LocalRealOktaMasteringConfig {
  const missing = LOCAL_OKTAENV_KEYS.filter((key) =>
    isMissingOrPlaceholder(env[key]),
  );

  if (missing.length > 0) {
    return {
      mode: "blocked",
      reason: "missing_trusted_local_credentials",
      missing,
    };
  }

  return {
    mode: "local_real",
    baseUrl: readTrustedLocalOktaValue(env, LOCAL_OKTAENV_KEYS[0]),
    clientId: readTrustedLocalOktaValue(env, LOCAL_OKTAENV_KEYS[1]),
    clientSecret: readTrustedLocalOktaValue(env, LOCAL_OKTAENV_KEYS[2]),
  };
}

function isMissingOrPlaceholder(value: string | undefined): boolean {
  const normalizedValue = value?.trim();
  return (
    normalizedValue === undefined ||
    normalizedValue === "" ||
    /^<[^>]+>$/.test(normalizedValue) ||
    /^(todo|placeholder|example|sample)$/i.test(normalizedValue)
  );
}

function readTrustedLocalOktaValue(
  env: Partial<Record<LocalOktaEnvKey, string | undefined>>,
  key: LocalOktaEnvKey,
): string {
  const value = env[key];
  if (value === undefined || isMissingOrPlaceholder(value)) {
    throw new Error(`Missing trusted local Okta config value: ${key}`);
  }
  return value.trim();
}
