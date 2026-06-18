"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLDivElement>;
}

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

function useDropdownContext(component: string): DropdownContextValue {
  const ctx = React.useContext(DropdownContext);
  if (!ctx) throw new Error(`${component} must be used within <DropdownMenu>`);
  return ctx;
}

export interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownMenu({ children, open, onOpenChange }: DropdownMenuProps) {
  const isControlled = open !== undefined;
  const [internal, setInternal] = React.useState(false);
  const isOpen = isControlled ? open : internal;
  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternal(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        contentRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, setOpen]);

  return (
    <DropdownContext.Provider value={{ open: isOpen, setOpen, triggerRef, contentRef }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownContext.Provider>
  );
}

export interface DropdownMenuTriggerProps {
  children: React.ReactElement;
  asChild?: boolean;
}

export function DropdownMenuTrigger({ children }: DropdownMenuTriggerProps) {
  const { open, setOpen, triggerRef } = useDropdownContext("DropdownMenuTrigger");
  return React.cloneElement(children as React.ReactElement<any>, {
    ref: triggerRef,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    onClick: (e: React.MouseEvent) => {
      (children.props as any).onClick?.(e);
      setOpen(!open);
    },
  });
}

export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end" | "center";
  sideOffset?: number;
}

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  children,
  ...props
}: DropdownMenuContentProps) {
  const { open, contentRef, triggerRef } = useDropdownContext("DropdownMenuContent");
  // Portaled + fixed-positioned so it's never clipped by an overflow/scroll
  // ancestor (e.g. a scrolling table). Position is measured from the trigger.
  const [pos, setPos] = React.useState<{ top: number; left?: number; right?: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function update() {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      const top = t.bottom + sideOffset;
      if (align === "start") setPos({ top, left: t.left });
      else if (align === "center") setPos({ top, left: t.left + t.width / 2 });
      else setPos({ top, right: Math.max(8, window.innerWidth - t.right) });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, sideOffset, triggerRef]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={contentRef}
      role="menu"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        right: pos.right,
        transform: align === "center" ? "translateX(-50%)" : undefined,
      }}
      className={cn(
        "z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg",
        "animate-in fade-in-0 zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface DropdownMenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean;
  destructive?: boolean;
}

export const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, inset, destructive, onClick, ...props }, ref) => {
    const { setOpen } = useDropdownContext("DropdownMenuItem");
    return (
      <button
        ref={ref}
        role="menuitem"
        type="button"
        onClick={(e) => {
          onClick?.(e);
          setOpen(false);
        }}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
          "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:size-4 [&_svg]:shrink-0",
          inset && "pl-8",
          destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
          className,
        )}
        {...props}
      />
    );
  },
);
DropdownMenuItem.displayName = "DropdownMenuItem";

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}

export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
      {...props}
    />
  );
}
