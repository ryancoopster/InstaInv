import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
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
      console.error("[route error]", err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return fail(message, 500);
    }
  };
}
