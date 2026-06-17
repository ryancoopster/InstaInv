# InstaInv — Build Contract & Conventions

This file is the shared contract for everyone building features. Follow it exactly so
independently-built modules integrate without conflicts.

## Stack
- **Next.js 14 App Router**, TypeScript, React 18 (server components by default).
- **Prisma + PostgreSQL** (`prisma/schema.prisma` is the source of truth).
- **Tailwind** + a small shadcn-style component library in `src/components/ui`.
- Custom cookie/JWT auth (`src/lib/auth.ts`) + permission registry (`src/lib/permissions.ts`).
- Icons: `lucide-react`. Dark/light via `next-themes` (class strategy).

## App routing structure (route groups)
- `app/layout.tsx` — root layout: `<html>`, `<body>`, `ThemeProvider`, `Toaster`. Minimal. **(shell-owned, shared)**
- `app/(main)/layout.tsx` — the **authenticated desktop shell** (sidebar + topbar + permission provider).
  All shelled desktop feature routes live **under `app/(main)/`** (URLs are unchanged — route groups
  don't appear in the path, so `app/(main)/items/page.tsx` serves `/items`). **(shell-owned, shared)**
- `app/(main)/page.tsx` — dashboard (URL `/`). **(shell-owned)**
- `app/login/page.tsx` — standalone, outside the shell. **(auth module)**
- `app/m/...` — mobile, its own minimal layout, outside the desktop shell. **(mobile module)**
- `app/api/...` — route handlers (no layout). Each module owns its `api/<feature>` subtree.

## Golden rules to avoid merge conflicts
1. **Do not edit shared files** unless listed as yours below. Shared files:
   `prisma/schema.prisma`, `src/app/layout.tsx`, `src/app/(main)/layout.tsx`, `src/app/(main)/page.tsx`,
   `src/app/globals.css`, the app shell (`src/components/shell/*`), `src/components/ui/*`,
   everything in `src/lib/*`, `package.json`, and all config files. They already exist and link to your routes.
2. **Own your folder.** Each desktop feature lives under `src/app/(main)/<feature>` route folders,
   `src/app/api/<feature>` API folders, and `src/components/<feature>` component folders.
3. The shell sidebar already contains nav links to every feature route — don't add nav.

## Data & mutation pattern (do this consistently)
- **Reads for initial render:** server components import `prisma` from `@/lib/prisma` directly.
- **Mutations & client-driven reads:** `app/api/<resource>/route.ts` handlers returning the
  envelope below; client components call them via `api` from `@/lib/api`.
- **Response envelope** (`src/lib/http.ts`): success `{ ok: true, data }`, error `{ ok:false, error }`.
  Wrap handlers in `route(async (req) => { ... return ok(data) })`.
- **Validation:** `zod` schemas at the top of each route; throw on parse — `route()` maps ZodError → 422.

```ts
// app/api/items/route.ts
import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const POST = route(async (req: Request) => {
  await requirePermission("items.create");
  const body = z.object({ name: z.string().min(1) }).parse(await req.json());
  const item = await prisma.item.create({ data: { name: body.name } });
  return ok(item);
});
```

## Auth & permissions
- `getSessionUser()` → current `SessionUser | null` (server only).
- `requireUser()` / `requirePermission(key)` throw `AuthError` (handled by `route()`), so use them
  freely at the top of route handlers and server components.
- `can(key)` → boolean for conditional rendering on the server.
- In **client** components, read effective permissions passed down as props from a server parent,
  or from `usePermissions()` (see `src/components/shell/permission-context.tsx`, provided by shell).
- Permission keys live in `src/lib/permissions.ts` (`PermissionKey`). Never invent new keys without
  adding them there.

## UI component library (already built in `src/components/ui`)
Import from `@/components/ui/<name>`. Available primitives and their props:
- `Button` — props: `variant?: "default"|"secondary"|"outline"|"ghost"|"destructive"|"link"`, `size?: "sm"|"default"|"lg"|"icon"`, `asChild?`. 
- `Input`, `Textarea`, `Label`, `Checkbox`, `Switch` — standard form controls.
- `Select` (native-styled): `Select`, with `<option>` children, plus `SelectField` wrapper.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`.
- `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` (controlled via `open`/`onOpenChange`).
- `DropdownMenu` + items, `Tabs` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`), `Badge` (`variant`), `Avatar`.
- `Toaster` + `toast()` from `@/components/ui/toast` for notifications.
- `EmptyState`, `PageHeader` (`title`, `description`, `actions`), `Spinner`.
- Utility `cn()` from `@/lib/utils` to compose classes.

If a primitive you need is missing, build it locally inside your own component folder rather than
adding to `src/components/ui` (to avoid conflicts), or note it for integration.

## Styling tokens (CSS vars from globals.css)
Use semantic Tailwind colors: `bg-background text-foreground`, `bg-card`, `bg-muted`,
`text-muted-foreground`, `border-border`, `bg-primary text-primary-foreground`,
`bg-destructive`, `bg-success`, `bg-warning`. Radius via `rounded-lg/md/sm`. Never hard-code hex.

## Sorting convention
Every list supports **manual drag order** (persisted `sortOrder`) and an optional **definable sort**
(by a column, overriding manual at view time). Use `@dnd-kit/sortable` for drag, and `applySort()`
from `@/lib/utils` for the view override. Provide a `PATCH /api/<resource>/reorder` taking
`{ ids: string[] }` to persist new `sortOrder` by index.

## Routes each module owns
(Desktop pages go under `app/(main)/`. API + standalone routes have no group.)
- **auth/admin**: `app/login`, `app/api/auth/*`, `app/(main)/admin/users`, `app/(main)/admin/roles`, `app/api/users/*`, `app/api/roles/*`. Components in `src/components/admin`, `src/components/auth`.
- **items/categories/suppliers**: `app/(main)/items`, `app/(main)/categories`, `app/(main)/suppliers`, `app/api/items/*`, `app/api/categories/*`, `app/api/custom-fields/*`, `app/api/suppliers/*`, `app/api/uploads/*`. Components in `src/components/items`. **Owns the shared `POST /api/uploads` endpoint** — other modules call it, don't recreate it.
- **boxes/drawers/bins (incl. graphical view)**: `app/(main)/boxes`, `app/(main)/boxes/[boxId]`, `app/(main)/boxes/[boxId]/drawers/[drawerId]`, `app/api/boxes/*`, `app/api/drawers/*`, `app/api/bins/*`. Components in `src/components/boxes`.
- **orders/requests**: `app/(main)/orders`, `app/(main)/requests`, `app/api/orders/*`, `app/api/requests/*`. Components in `src/components/orders`.
- **reports**: `app/(main)/reports`, `app/api/reports/reorder`, `app/api/reports/export` (pdf+xlsx). Components in `src/components/reports`.
- **labels (designer + print)**: `app/(main)/labels`, `app/(main)/labels/[id]`, `app/api/labels/*`, `app/api/labels/render`, `src/lib/labels/*` (this module may own `src/lib/labels/`). Components in `src/components/labels`.
- **mobile inventory**: `app/m`, `app/m/...` (own minimal layout). Components in `src/components/mobile`.
- **ocr / checklist**: `app/(main)/scan`, `app/api/ocr/*`, `app/api/checklist/*`. Components in `src/components/scan`.
- **dashboard**: `app/(main)/page.tsx` (shell-owned).

## Label content model (`LabelTemplate.content` JSON)
```ts
{
  dpi: number,                 // raster DPI for PNG export (e.g. 300)
  background: string,          // hex
  elements: Array<{
    id: string,
    type: "text"|"qrcode"|"barcode"|"image"|"rect"|"line",
    x: number, y: number, w: number, h: number,   // millimetres on the tape
    rotation?: number,
    // text:
    text?: string,             // supports {{binding}} tokens, see below
    fontSize?: number, fontFamily?: string, bold?: boolean, italic?: boolean,
    align?: "left"|"center"|"right", color?: string,
    // barcode/qrcode:
    binding?: string, symbology?: string,  // e.g. "code128"
    // image:
    src?: string,
    // rect/line:
    stroke?: string, fill?: string, strokeWidth?: number
  }>
}
```
**Binding tokens** resolved at render against the target entity:
`{{item.name}}`, `{{item.partNumber}}`, `{{item.custom.<key>}}`, `{{item.url}}` (public item URL),
`{{drawer.name}}`, `{{drawer.label}}`, `{{drawer.summary}}`, `{{box.name}}`, `{{bin.name}}`.
Rendering happens in `src/lib/labels/render.ts` (SVG → PNG/PDF) owned by the labels module.

## Brother P-touch printing
Direct printing is **not** possible from a sandboxed browser. Approach:
1. Render the label to exact-size **PNG/PDF** (server) — works everywhere.
2. Browser print dialog for PDF.
3. Document an optional local "print agent" (b-PAC on Windows / CUPS raw) for true direct printing.
Build (1) and (2) fully; scaffold (3) with clear TODOs.

## Conventions
- Server components are the default; add `"use client"` only when you need interactivity.
- Money is `Decimal` in DB → serialize to string in API → parse with `Number()` in UI (`formatCurrency`).
- Keep files focused; co-locate feature components under the feature's component folder.
- Don't run `npm install` or migrations from a feature agent — integration handles that.
