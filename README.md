# InstaInv

Inventory management for work boxes / cases — drawers, bins, parts, reorder reports, a
P-touch-style label designer, role-based access, a phone view for taking counts, and OCR of
printed count-sheets.

> Prototype status: this is a broad, working first build meant for you to click through and
> react to. Most features are fully implemented; a few advanced ones are scaffolded with clear
> notes (see **Known limitations** at the bottom).

---

## Features

- **Inventory items** — name, description, part number, SKU/barcode, purchase cost, unit,
  current/desired/min quantity, supplier + product link, and a photo.
- **Categories with custom fields** — define per-category attributes (e.g. Hardware → thread
  size, length, material, coating). Field types: text, number, boolean, select, multiselect,
  date, URL. Fields can be flagged to show on labels.
- **Suppliers / vendors** — with website, contact info, and account number.
- **Boxes → Drawers → Bins** — model your physical cases. A **graphical front view** lays drawers
  out on a grid you can drag/resize; click a drawer to see its contents as a **list** or a
  **virtual drawer** with parts bins you can drag items between.
- **Reorder reports** — current vs. desired quantity → a buy list grouped by supplier, exportable
  to **PDF** and **Excel**.
- **Ordering workflow** — users request items; admins approve/reject, then mark ordered/received.
  Approved requests + stock shortfalls + admin bulk-entries combine into one buy list per vendor.
- **Label designer** — a P-touch-Editor-style canvas (text, QR, barcode, image, shapes; drag,
  resize, rotate, snap, layers, data bindings like `{{item.partNumber}}`). Renders to exact-size
  **PDF** for printing. Brother direct-print is scaffolded (see notes).
- **Desktop UI + Mobile view** — the full app for management, and a stripped-down phone view
  (`/m`) for fast inventory taking with big +/- steppers and item search ("where is this part?").
- **Printable checklists + OCR** — generate a per-box PDF count sheet, then upload a photo of the
  filled-in sheet to OCR the handwritten counts and update quantities (with a review step).
- **Auto summaries** — each box and drawer gets an automatic "what's in here" description.
- **Roles & permissions** — admins define user types (tiers) with a permission matrix, assign
  users to them, and override individual permissions per user (Inherit / Allow / Deny).
- **Manual drag-ordering everywhere** + optional column sort that overrides it.
- **Dark / light mode.**

## Tech stack

| Concern        | Choice |
| -------------- | ------ |
| Framework      | Next.js 14 (App Router), React 18, TypeScript |
| Database       | PostgreSQL + Prisma ORM |
| Styling        | Tailwind CSS + a small in-repo component library (dark/light) |
| Auth           | Cookie/JWT sessions (`jose` + `bcryptjs`) + a permission registry |
| Files          | Local disk uploads (pluggable to S3) |
| PDF / Excel    | `pdf-lib` / `exceljs` |
| Labels         | SVG designer + `qrcode` / `bwip-js` + `pdf-lib` render |
| OCR            | `tesseract.js` |
| Packaging      | Docker + docker-compose |

**Why this stack:** one codebase serves the desktop UI, the phone view, and the API, which keeps
everything coherent and makes it cheap to move from your laptop to AWS. Postgres + Prisma gives a
clean, typed data model. It runs locally with Docker today and lifts to **AWS ECS/Fargate or EC2 +
RDS Postgres + S3** with only environment changes.

---

## Quick start

### Option A — Docker (recommended; one command)

Requires Docker Desktop.

```bash
cp .env.example .env        # then edit AUTH_SECRET (any 32+ char random string)
docker compose up --build
```

This starts Postgres + the app, runs migrations, seeds demo data, and serves
**http://localhost:3000**.

### Option B — Local Node (Postgres in Docker, app on host)

Requires Node 20+ and a reachable Postgres (the compose file's `db` service works).

```bash
npm install
cp .env.example .env        # set AUTH_SECRET; DATABASE_URL points at your Postgres
docker compose up -d db     # or use your own Postgres
npx prisma migrate dev --name init   # create the schema
npm run seed                # demo data + default admin
npm run dev                 # http://localhost:3000
```

### Default login

```
admin@instainv.local  /  admin1234        (Administrator — full access)
tech@instainv.local   /  tech1234         (Inventory Taker — limited)
```

Change these via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before seeding, or in the app.

---

## Project structure

```
prisma/schema.prisma     Data model (single source of truth)
prisma/seed.ts           Built-in roles, demo data, default label templates
src/lib/                 prisma, auth, permissions, http helpers, storage, summaries, audit
src/components/ui/        Design-system primitives (button, dialog, table, toast, …)
src/components/shell/     Sidebar, topbar, theme, permission context, dashboard charts
src/app/(main)/          Authenticated desktop app (dashboard + every feature page)
src/app/m/               Mobile inventory view
src/app/login/           Login
src/app/api/             Route handlers (REST-ish, { ok, data } envelope)
CONTRACT.md              Conventions used to build the app coherently
```

## Key concepts

- **Permissions.** Every permission key lives in `src/lib/permissions.ts`. A user's effective
  permission = per-user override (if set) → else their role's `isAdmin`/matrix value. Admins manage
  roles at `/admin/roles` and users at `/admin/users`.
- **Sorting.** Lists persist a manual `sortOrder` (drag handle) and also support a column sort that
  overrides the manual order at view time.
- **Labels.** Templates store an element model (`LabelTemplate.content`) with `{{bindings}}` that
  resolve against the target item/drawer/box/bin at render time. See `CONTRACT.md` → "Label content
  model" and `src/lib/labels/`.

## Deploying to AWS (outline)

1. **Database:** RDS/Aurora PostgreSQL → set `DATABASE_URL`.
2. **App:** build the Docker image and run on ECS Fargate (or EC2). Run `prisma migrate deploy` on
   release (the container entrypoint already does this).
3. **Uploads:** set `STORAGE_DRIVER=s3` and the `S3_*` vars, then implement the S3 branch in
   `src/lib/storage.ts` (a clearly-marked TODO). Put the app behind an ALB; serve `/uploads` from S3
   + CloudFront in production.
4. **Secrets:** `AUTH_SECRET` and DB creds via SSM/Secrets Manager.

---

## Known limitations / next steps

These are intentionally scaffolded or simplified in this first pass:

- **Brother P-touch direct printing** is a documented stub (`src/lib/labels/print-agent.ts`). Today
  labels render to exact-size PDF and print via the browser dialog. True silent printing needs a
  small local print agent (b-PAC on Windows / CUPS-raw on macOS/Linux) — the integration contract is
  written out in that file.
- **OCR** uses `tesseract.js`, which downloads its engine + language data on first use and is
  best-effort on handwriting — there's always a human review step. Needs network on the server.
- **S3 storage** is wired as a config switch but the upload branch is a TODO (local disk works now).
- **Label PDF fonts** use the standard Helvetica set (Latin/WinAnsi); exotic glyphs are
  transliterated. Embedding a Unicode font is a future enhancement.
- **Public QR target** (`/i/<id>` encoded in item QR codes) doesn't have a public landing page yet.
- Server-side enforcement of "required" custom fields, multi-select on the label canvas, and a few
  inline editors are noted as follow-ups in the code.

See `CONTRACT.md` for the full conventions and the per-module notes from the build.
