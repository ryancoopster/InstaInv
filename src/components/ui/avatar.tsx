"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function initialsFromName(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string | null;
  alt?: string;
  name?: string | null;
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, src, alt, name, ...props }, ref) => {
    const [errored, setErrored] = React.useState(false);
    const showImage = src && !errored;
    return (
      <span
        ref={ref}
        className={cn(
          "relative flex h-9 w-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium text-muted-foreground",
          className,
        )}
        {...props}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt ?? name ?? "avatar"}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        ) : (
          <span aria-hidden>{initialsFromName(name ?? alt)}</span>
        )}
      </span>
    );
  },
);
Avatar.displayName = "Avatar";
