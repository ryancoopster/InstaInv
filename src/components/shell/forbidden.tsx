import { ShieldAlert } from "lucide-react";

// Friendly server-rendered "you can't see this" page. Used by the (main) layout
// to enforce per-route permissions without leaking data.
export function Forbidden({ permission }: { permission?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-full bg-destructive/10 p-4 text-destructive">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h1 className="mt-4 text-xl font-semibold">Access denied</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        You don&apos;t have permission to view this page
        {permission ? ` (requires “${permission}”)` : ""}. If you think this is a mistake, ask an
        administrator to adjust your role or permissions.
      </p>
    </div>
  );
}
