// Single, validated source of the session-signing secret.
//
// Fails CLOSED: the app refuses to sign/verify sessions unless AUTH_SECRET is a
// strong, unique value. This replaces the old `process.env.AUTH_SECRET || "dev
// fallback"` pattern that silently degraded to a publicly-known key when the env
// var was missing (full auth-bypass risk). Imported by both src/lib/auth.ts and
// src/middleware.ts so there is exactly one key in the system.
//
// NB: no `server-only` import and no Buffer use here — this module is also pulled
// into the Edge middleware bundle, which lacks Node's Buffer.

const FORBIDDEN_SECRETS = new Set([
  "dev-only-insecure-secret-change-me-32chars!",
  "change-me-to-a-long-random-string-at-least-32-chars",
]);

function loadSecretKey(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  const bytes = raw ? new TextEncoder().encode(raw) : new Uint8Array();
  if (bytes.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a random value of at least 32 bytes. Generate one with: openssl rand -base64 48",
    );
  }
  if (raw && FORBIDDEN_SECRETS.has(raw)) {
    throw new Error(
      "AUTH_SECRET is set to a known placeholder value. Replace it with a unique random secret (openssl rand -base64 48).",
    );
  }
  return bytes;
}

// Evaluated once at module load — a misconfigured deploy fails fast on boot
// rather than running with a guessable key.
export const SECRET_KEY: Uint8Array = loadSecretKey();
