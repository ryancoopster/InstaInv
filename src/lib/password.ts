import { z } from "zod";

// Single source of truth for the password policy. Used by every path that sets a
// password (admin create, admin reset, self-service change) so the rules can't
// drift between routes.

// A small blocklist of obvious / project-specific guesses. Not a full breach
// corpus — pair with rate limiting (see src/lib/rate-limit.ts) for real defense.
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "admin1234",
  "administrator",
  "iloveyou",
  "letmein1",
  "welcome1",
  "changeme",
  "instainv",
  "instainv1",
  "instainv123",
]);

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200, "Password is too long")
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p), {
    message: "Include upper- and lower-case letters and a number",
  })
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), {
    message: "That password is too common — choose something less guessable",
  });
