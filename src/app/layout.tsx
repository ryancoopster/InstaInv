import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { Toaster } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: {
    default: "InstaInv",
    template: "%s · InstaInv",
  },
  description:
    "InstaInv — work-box & case inventory management with drawers, bins, reorder reports, label designer, and role-based access.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SEC-5: the middleware sets a per-request nonce on the CSP (script-src drops
  // 'unsafe-inline'). next-themes injects a pre-hydration inline script, so it must
  // carry the same nonce or strict-dynamic blocks it (theme flash + CSP violation).
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
