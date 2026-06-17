// ---------------------------------------------------------------------------
// Local Brother print-agent integration — STUB / FUTURE WORK.
// ---------------------------------------------------------------------------
//
// Direct, silent printing to a Brother P-touch / QL printer is NOT possible
// from a sandboxed browser: the browser has no access to USB/serial devices or
// to the OS print spooler in a way that can target raw label media reliably.
//
// What InstaInv does today (fully implemented):
//   1. The server renders the label to an exact-size PDF (see render.ts).
//   2. The client opens that PDF in a new tab and the user prints it with the
//      browser's print dialog (choose the Brother driver + correct media).
//
// For TRUE one-click direct printing, a small **local print agent** must run on
// the user's machine and expose a localhost HTTP endpoint this app can POST to.
// Two common backends:
//
//   • Windows: Brother **b-PAC SDK** (COM automation). The agent receives the
//     rendered PDF/PNG (or the element model) and drives b-PAC to print to the
//     named printer + media. b-PAC handles tape sizing and cutting.
//
//   • macOS / Linux: **CUPS raw printing** — `lp -d <queue> -o raw <file>` or
//     ESC/P raster sent to the QL/PT queue. The agent translates the rendered
//     PNG into the printer's raster format (e.g. via `brother_ql`).
//
// Suggested contract for the future agent (localhost, e.g. http://127.0.0.1:9101):
//   POST /print
//     { printer: string, media: string, copies: number, pdfBase64: string }
//   -> 200 { jobId } | 4xx { error }
//
// The client would detect the agent (GET /health) and, if present, offer a
// "Print directly" button in addition to "Open PDF". Until then this module is
// intentionally inert.

export interface PrintAgentJob {
  printer: string;
  media: string;
  copies: number;
  /** base64-encoded rendered PDF */
  pdfBase64: string;
}

export const PRINT_AGENT_DEFAULT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL || "http://127.0.0.1:9101";

/**
 * Probe for a locally-running print agent. Returns false today (no agent ships
 * with InstaInv yet). Wire this up when the agent exists.
 */
export async function detectPrintAgent(_baseUrl: string = PRINT_AGENT_DEFAULT_URL): Promise<boolean> {
  // TODO: when the local agent ships, do:
  //   const res = await fetch(`${_baseUrl}/health`, { signal: AbortSignal.timeout(500) });
  //   return res.ok;
  return false;
}

/**
 * Send a job to the local agent. Throws today — direct printing isn't available
 * until the companion agent is installed. Kept as the integration seam.
 */
export async function sendToPrintAgent(_job: PrintAgentJob, _baseUrl: string = PRINT_AGENT_DEFAULT_URL): Promise<{ jobId: string }> {
  // TODO: implement once the agent contract above is finalised:
  //   const res = await fetch(`${_baseUrl}/print`, { method: "POST", body: JSON.stringify(_job) });
  //   if (!res.ok) throw new Error(await res.text());
  //   return res.json();
  throw new Error(
    "No local print agent is configured. Use 'Open PDF' and print via the browser dialog. " +
      "See src/lib/labels/print-agent.ts to add b-PAC (Windows) or CUPS raw (macOS/Linux) support.",
  );
}
