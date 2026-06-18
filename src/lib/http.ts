import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "@/lib/auth";

// Standard JSON envelope used by every /api route handler.
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

// Wrap a route handler so thrown AuthError / ZodError become clean responses.
export function route<Args extends any[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(
          err.code === "UNAUTHENTICATED" ? "Not signed in" : "You do not have permission",
          err.code === "UNAUTHENTICATED" ? 401 : 403,
          { permission: err.permission },
        );
      }
      if (err instanceof ZodError) {
        return fail("Validation failed", 422, { issues: err.flatten() });
      }
      // DM-4 / F3: a unique-constraint violation (e.g. a TOCTOU race past the
      // findFirst pre-check, or a route with no pre-check at all) raises P2002.
      // Translate it into a clean 409 instead of leaking it as an opaque 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = err.meta?.target;
        const field = Array.isArray(target) ? target.join(", ") : typeof target === "string" ? target : null;
        return fail(
          field ? `A record with that ${field} already exists` : "A record with that value already exists",
          409,
        );
      }
      // Log full detail server-side, but never leak internal/Prisma error text to
      // the client in production.
      console.error("[route error]", err);
      const message =
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err instanceof Error
            ? err.message
            : "Unexpected error";
      return fail(message, 500);
    }
  };
}
