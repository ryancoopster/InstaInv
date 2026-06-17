"use client";

// Client-side fetch helper that speaks the { ok, data } envelope from lib/http.ts.

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: isForm ? undefined : body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok || (json && json.ok === false)) {
    const message = json?.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, json?.issues);
  }
  return (json?.data ?? json) as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body),
  del: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body),
};
