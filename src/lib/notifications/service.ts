import "server-only";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/transport";

const DEFAULT_DELAY_MIN = 5;

export interface NotificationSettings {
  enabled: boolean;
  delayMinutes: number;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "notifications" } });
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const delay = Number(v.delayMinutes);
  return {
    enabled: v.enabled !== false,
    delayMinutes: Number.isFinite(delay) && delay > 0 ? delay : DEFAULT_DELAY_MIN,
  };
}

export async function saveNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const cur = await getNotificationSettings();
  const next = { ...cur, ...patch };
  await prisma.setting.upsert({
    where: { key: "notifications" },
    create: { key: "notifications", value: next as object },
    update: { value: next as object },
  });
  return next;
}

// Enqueue an approve/deny notification. Fire-and-forget; never throws.
export async function enqueueDecision(
  userId: string,
  orderRequestId: string,
  decision: "APPROVED" | "REJECTED",
): Promise<void> {
  try {
    await prisma.pendingDecisionNotification.create({ data: { userId, orderRequestId, decision } });
  } catch (err) {
    console.error("[notifications] enqueue failed", err);
  }
}

type RowWithRequest = Awaited<ReturnType<typeof loadUserRows>>[number];

function loadUserRows(userId: string) {
  return prisma.pendingDecisionNotification.findMany({
    where: { userId, sentAt: null },
    include: { orderRequest: { include: { item: { select: { name: true, partNumber: true } } } } },
    orderBy: { decidedAt: "asc" },
  });
}

function reqLabel(r: RowWithRequest): string {
  const or = r.orderRequest;
  const name = or.item?.name ?? or.freeName ?? "Item";
  const pn = or.item?.partNumber ?? or.freePartNumber;
  return `${name}${pn ? ` (${pn})` : ""} ×${or.quantity}`;
}

function buildDigest(name: string, rows: RowWithRequest[]) {
  const approved = rows.filter((r) => r.decision === "APPROVED");
  const rejected = rows.filter((r) => r.decision === "REJECTED");
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const link = base ? `${base}/requests` : "";

  const section = (title: string, list: RowWithRequest[]) =>
    list.length
      ? `<p style="margin:12px 0 4px;font-weight:600">${title}</p><ul>${list
          .map((r) => `<li>${escapeHtml(reqLabel(r))}</li>`)
          .join("")}</ul>`
      : "";

  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">
    <p>Hi ${escapeHtml(name)},</p>
    <p>Here's an update on your order request${rows.length === 1 ? "" : "s"}:</p>
    ${section(`Approved (${approved.length})`, approved)}
    ${section(`Denied (${rejected.length})`, rejected)}
    ${link ? `<p style="margin-top:16px"><a href="${link}">View your requests</a></p>` : ""}
  </div>`;

  const textLines = [
    `Hi ${name},`,
    "",
    "Update on your order requests:",
    ...(approved.length ? ["", `Approved (${approved.length}):`, ...approved.map((r) => ` - ${reqLabel(r)}`)] : []),
    ...(rejected.length ? ["", `Denied (${rejected.length}):`, ...rejected.map((r) => ` - ${reqLabel(r)}`)] : []),
    ...(link ? ["", `View: ${link}`] : []),
  ];

  const subject =
    rows.length === 1
      ? `Your order request was ${rows[0].decision === "APPROVED" ? "approved" : "denied"}`
      : `${approved.length} approved, ${rejected.length} denied — order request update`;

  return { subject, html, text: textLines.join("\n") };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// Send one compiled digest per user whose oldest unsent decision has crossed the
// debounce window. Claims rows (sets sentAt) before sending to avoid double-send;
// reverts the claim if the send genuinely fails so it retries next tick.
export async function compileAndSendDue(): Promise<{ users: number; sent: number }> {
  const settings = await getNotificationSettings();
  if (!settings.enabled) return { users: 0, sent: 0 };

  const cutoff = new Date(Date.now() - settings.delayMinutes * 60_000);
  const due = await prisma.pendingDecisionNotification.findMany({
    where: { sentAt: null, decidedAt: { lte: cutoff } },
    select: { userId: true },
    distinct: ["userId"],
  });

  let sent = 0;
  for (const { userId } of due) {
    const rows = await loadUserRows(userId);
    if (rows.length === 0) continue;
    const ids = rows.map((r) => r.id);

    // Claim atomically.
    const claim = await prisma.pendingDecisionNotification.updateMany({
      where: { id: { in: ids }, sentAt: null },
      data: { sentAt: new Date() },
    });
    if (claim.count === 0) continue;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, isActive: true },
    });
    if (!user || !user.isActive) continue; // claimed (won't retry) but don't email

    const { subject, html, text } = buildDigest(user.name, rows);
    const result = await sendEmail({ to: user.email, subject, html, text });
    if (!result.ok && !result.skipped) {
      // Real failure — release the claim so the next tick retries.
      await prisma.pendingDecisionNotification.updateMany({
        where: { id: { in: ids } },
        data: { sentAt: null },
      });
      console.error("[notifications] send failed", result.error);
      continue;
    }
    sent++;
  }

  return { users: due.length, sent };
}
