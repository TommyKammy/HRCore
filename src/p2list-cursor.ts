import {
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  assertP2ListLocalSecret,
  P2ListReadModelError,
  type P2ListDirection,
  type P2ListResource,
} from "./p2list-read-model-types.js";
import {
  p2ListCursorContract,
  p2ListCursorVersion,
} from "./p2list-contract.js";

export interface P2ListCursorState {
  resource: P2ListResource;
  sort: string;
  direction: P2ListDirection;
  lastSortValue: string | null;
  lastSortValueIsNull: boolean;
  lastStableId: string;
  filterFingerprint: string;
  authorizationContextFingerprint: string;
  datasetFingerprint: string;
  resolvedAsOf?: string;
}

interface StoredCursorState extends P2ListCursorState {
  expiresAt: string;
}

interface P2ListCursorWireClaims {
  version: string;
  stateId: string;
  expiresAt: string;
}

export interface P2ListCursorManagerOptions {
  secret: string;
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
}

export class P2ListCursorManager {
  readonly #secret: string;
  readonly #now: () => Date;
  readonly #randomBytes: (size: number) => Buffer;
  readonly #states = new Map<string, StoredCursorState>();

  constructor(options: P2ListCursorManagerOptions) {
    assertP2ListLocalSecret(options.secret);
    this.#secret = options.secret;
    this.#now = options.now ?? (() => new Date());
    this.#randomBytes = options.randomBytes ?? nodeRandomBytes;
  }

  issue(state: P2ListCursorState): string {
    validateCursorState(state);
    this.deleteExpired();
    const stateId = this.#createStateId();
    const expiresAt = new Date(
      this.#now().getTime() +
        p2ListCursorContract.serverSideStateTtlSeconds * 1_000,
    ).toISOString();
    this.#states.set(stateId, { ...state, expiresAt });
    const claims: P2ListCursorWireClaims = {
      version: p2ListCursorVersion,
      stateId,
      expiresAt,
    };
    const encodedClaims = Buffer.from(JSON.stringify(claims)).toString(
      "base64url",
    );
    const signature = createHmac("sha256", this.#secret)
      .update(encodedClaims)
      .digest("base64url");
    const token = `${encodedClaims}.${signature}`;
    if (token.length > p2ListCursorContract.maximumWireLength) {
      this.#states.delete(stateId);
      throw cursorInvalid();
    }
    return token;
  }

  read(token: string): Readonly<P2ListCursorState> {
    this.deleteExpired();
    if (
      typeof token !== "string" ||
      token.length === 0 ||
      token.length > p2ListCursorContract.maximumWireLength ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)
    ) {
      throw cursorInvalid();
    }
    const [encodedClaims, suppliedSignature] = token.split(".");
    if (!encodedClaims || !suppliedSignature) {
      throw cursorInvalid();
    }
    const expectedSignature = createHmac("sha256", this.#secret)
      .update(encodedClaims)
      .digest();
    const suppliedSignatureBytes = decodeSignature(suppliedSignature);
    if (
      suppliedSignatureBytes.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignatureBytes, expectedSignature)
    ) {
      throw cursorInvalid();
    }

    const claims = parseWireClaims(encodedClaims);
    if (claims.version !== p2ListCursorVersion) {
      throw new P2ListReadModelError(
        "cursor_version_unsupported",
        "The cursor version is unsupported.",
      );
    }
    const expiresAt = Date.parse(claims.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.#now().getTime()) {
      this.#states.delete(claims.stateId);
      throw cursorInvalid();
    }
    const state = this.#states.get(claims.stateId);
    if (!state || state.expiresAt !== claims.expiresAt) {
      throw cursorInvalid();
    }
    const { expiresAt: _expiresAt, ...publicState } = state;
    return publicState;
  }

  deleteExpired(): void {
    const now = this.#now().getTime();
    for (const [stateId, state] of this.#states) {
      if (Date.parse(state.expiresAt) <= now) {
        this.#states.delete(stateId);
      }
    }
  }

  #createStateId(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bytes = this.#randomBytes(16);
      if (!Buffer.isBuffer(bytes) || bytes.length < 16) {
        throw cursorInvalid();
      }
      const stateId = bytes.subarray(0, 16).toString("base64url");
      if (!this.#states.has(stateId)) {
        return stateId;
      }
    }
    throw cursorInvalid();
  }
}

function validateCursorState(state: P2ListCursorState): void {
  if (
    (state.resource !== "employee" && state.resource !== "lifecycleRequest") ||
    (state.direction !== "asc" && state.direction !== "desc") ||
    !state.sort ||
    !state.lastStableId ||
    !state.filterFingerprint ||
    !state.authorizationContextFingerprint ||
    !state.datasetFingerprint ||
    state.lastSortValueIsNull ||
    state.lastSortValue === null
  ) {
    throw cursorInvalid();
  }
  if (
    state.resource === "employee" &&
    (!state.resolvedAsOf || !/^\d{4}-\d{2}-\d{2}$/u.test(state.resolvedAsOf))
  ) {
    throw cursorInvalid();
  }
  if (
    state.resource === "lifecycleRequest" &&
    state.resolvedAsOf !== undefined
  ) {
    throw cursorInvalid();
  }
}

function parseWireClaims(encodedClaims: string): P2ListCursorWireClaims {
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(encodedClaims, "base64url").toString("utf8"),
    );
  } catch {
    throw cursorInvalid();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw cursorInvalid();
  }
  const claims = value as Record<string, unknown>;
  if (
    Object.keys(claims).length !== 3 ||
    typeof claims.version !== "string" ||
    typeof claims.stateId !== "string" ||
    !/^[A-Za-z0-9_-]{22}$/u.test(claims.stateId) ||
    typeof claims.expiresAt !== "string"
  ) {
    throw cursorInvalid();
  }
  return {
    version: claims.version,
    stateId: claims.stateId,
    expiresAt: claims.expiresAt,
  };
}

function decodeSignature(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw cursorInvalid();
  }
}

function cursorInvalid(): P2ListReadModelError {
  return new P2ListReadModelError(
    "cursor_invalid",
    "The cursor is invalid or expired.",
  );
}
