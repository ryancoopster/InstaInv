"use client";

import * as React from "react";
import { KeyRound, Lock, User, Mail } from "lucide-react";
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

export function ChangePasswordForm({
  forced,
  initialName,
  initialEmail,
}: {
  forced: boolean;
  initialName?: string;
  initialEmail?: string;
}) {
  // First-login account setup fields (only used/shown when forced).
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [email, setEmail] = React.useState(forced ? "" : initialEmail ?? "");

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (forced && (!first.trim() || !last.trim())) {
      setError("Please enter your first and last name.");
      return;
    }
    if (forced && !email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = { currentPassword: current, newPassword: next };
      if (forced) {
        body.name = `${first.trim()} ${last.trim()}`.trim();
        body.email = email.trim();
      }
      await api.post("/api/auth/change-password", body);
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
          {forced ? "Finish setting up your account" : "Change your password"}
        </CardTitle>
        <CardDescription>
          {forced
            ? "Enter your name and email, then choose a password to continue."
            : "Use at least 12 characters with upper- and lower-case letters and a number."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {forced && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <TextField id="first" label="First name" value={first} onChange={setFirst} icon={User} autoComplete="given-name" disabled={submitting} />
                <TextField id="last" label="Last name" value={last} onChange={setLast} icon={User} autoComplete="family-name" disabled={submitting} />
              </div>
              <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} icon={Mail} autoComplete="email" disabled={submitting} />
              <div className="h-px bg-border" />
            </>
          )}

          <PasswordField
            id="current"
            label={forced ? "Temporary password" : "Current password"}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            disabled={submitting}
          />
          <PasswordField id="next" label="New password" value={next} onChange={setNext} autoComplete="new-password" disabled={submitting} />
          <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={submitting} />

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
            {submitting ? "Saving…" : forced ? "Create my account" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  icon: Icon,
  type = "text",
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ComponentType<{ className?: string }>;
  type?: string;
  autoComplete: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={type}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function PasswordField({
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
