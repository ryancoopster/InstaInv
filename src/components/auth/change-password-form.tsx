"use client";

import * as React from "react";
import { KeyRound, Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword: current, newPassword: next });
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <KeyRound className="h-6 w-6" />
        </span>
        <CardTitle className="text-xl">
          {forced ? "Set a new password" : "Change your password"}
        </CardTitle>
        <CardDescription>
          {forced
            ? "For security, you must choose your own password before continuing."
            : "Use at least 12 characters with upper- and lower-case letters and a number."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            id="current"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            disabled={submitting}
          />
          <Field
            id="next"
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            disabled={submitting}
          />
          <Field
            id="confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            disabled={submitting}
          />

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            <Lock className="h-4 w-4" />
            {submitting ? "Saving…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="password"
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="pl-9"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
