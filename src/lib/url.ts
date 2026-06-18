import { z } from "zod";

// A user-supplied web link that is later rendered into an <a href>. Requires
// http(s) so dangerous schemes (javascript:, data:, vbscript:) can never be
// stored — the root fix for the link-based stored-XSS finding. Empty string is
// allowed and treated as "no link" by callers.
export const webUrlSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
    message: "Enter a valid http(s) URL",
  });
