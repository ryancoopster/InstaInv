import "server-only";
import { prisma } from "@/lib/prisma";
import { emailConfigured, sendEmail } from "@/lib/email/transport";

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

// NOTIF-3: re-read the exact rows a worker just claimed via its sentBatchId token,
// so the digest is built from owned rows rather than a stale pre-claim snapshot.
function loadClaimedRows(sentBatchId: string) {
  return prisma.pendingDecisionNotification.findMany({
    where: { sentBatchId },
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

// Batch-on-settle digest delivery: send ONE compiled digest per user whose
// OLDEST unsent decision has crossed the debounce window, flushing that user's
// entire burst of unsent decisions together (NOTIF-1). This is the intended
// contract, not a bug: the trigger query is per-row-matured (decidedAt <= cutoff)
// while loadUserRows flushes ALL of that user's unsent rows, so a fresh decision
// rides out with its older siblings once any one of them matures. The two queries
// are intentionally asymmetric.
//
// Each iteration claims its rows atomically with a unique sentBatchId token, then
// re-reads exactly the rows it claimed to build the digest — so a concurrent
// worker can never bundle the same decision into a second digest (NOTIF-3).
// Reverts the claim if the send genuinely fails so it retries next tick.
export async function compileAndSendDue(): Promise<{
  candidates: number;
  processed: number;
  sent: number;
  skipped: number;
}> {
  const settings = await getNotificationSettings();
  if (!settings.enabled) return { candidates: 0, processed: 0, sent: 0, skipped: 0 };

  // EMAIL-1: in production (or once the cron secret is configured) an unconfigured
  // email transport is a real misconfiguration, not dev convenience — surface it
  // and do NOT claim rows, so nothing is silently marked sent without delivery.
  const requireEmail = process.env.NODE_ENV === "production" || Boolean(process.env.NOTIFICATIONS_CRON_SECRET);
  if (requireEmail && !emailConfigured()) {
    console.error(
      "[notifications] email transport is not configured (set RESEND_API_KEY + EMAIL_FROM); skipping digest run without claiming rows",
    );
    return { candidates: 0, processed: 0, sent: 0, skipped: 0 };
  }

  const cutoff = new Date(Date.now() - settings.delayMinutes * 60_000);
  const due = await prisma.pendingDecisionNotification.findMany({
    where: { sentAt: null, decidedAt: { lte: cutoff } },
    select: { userId: true },
    distinct: ["userId"],
  });

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  for (const { userId } of due) {
    // NOTIF-2: load & validate the user BEFORE claiming. If inactive/missing,
    // skip WITHOUT setting sentAt so the rows survive for a later tick (e.g. once
    // the user is reactivated) and we avoid a wasted claim write.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, isActive: true },
    });
    if (!user || !user.isActive) continue;

    const candidateIds = (await loadUserRows(userId)).map((r) => r.id);
    if (candidateIds.length === 0) continue;

    // NOTIF-3: claim atomically with a per-iteration token...
    const batchId = crypto.randomUUID();
    const claim = await prisma.pendingDecisionNotification.updateMany({
      where: { id: { in: candidateIds }, sentAt: null },
      data: { sentAt: new Date(), sentBatchId: batchId },
    });
    if (claim.count === 0) continue;

    // ...then re-read EXACTLY the rows this worker claimed (never the pre-claim
    // snapshot) so a concurrent worker cannot duplicate a decision into a second
    // digest, and the failure-revert below only releases our own rows.
    const rows = await loadClaimedRows(batchId);
    if (rows.length === 0) continue;

    const { subject, html, text } = buildDigest(user.name, rows);
    const result = await sendEmail({ to: user.email, subject, html, text });
    if (!result.ok && !result.skipped) {
      // Real failure — release only the rows we claimed so the next tick retries.
      await prisma.pendingDecisionNotification.updateMany({
        where: { sentBatchId: batchId },
        data: { sentAt: null, sentBatchId: null },
      });
      console.error("[notifications] send failed", result.error);
      continue;
    }
    // NOTIF-6: count actual work, not due candidates.
    processed++;
    if (result.ok) sent++;
    else skipped++; // intentionally skipped (dev/unconfigured transport)
  }

  return { candidates: due.length, processed, sent, skipped };
}
