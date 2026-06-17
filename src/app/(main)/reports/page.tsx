import { redirect } from "next/navigation";
import { FileBarChart } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportView } from "@/components/reports/ReportView";
import {
  computeReorderReport,
  reorderSupplierOptions,
} from "@/components/reports/lib/report";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reorder report • InstaInv",
};

export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Guard the read.
  if (!hasPermission(user, "reports.view")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reorder report"
          description="Items that need restocking, grouped by supplier."
        />
        <EmptyState
          icon={FileBarChart}
          title="You do not have access"
          description="You need the View reports permission to see reorder reports. Ask an administrator to grant it."
        />
      </div>
    );
  }

  const canExport = hasPermission(user, "reports.export");

  const [initialReport, supplierOptions] = await Promise.all([
    computeReorderReport(),
    reorderSupplierOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reorder report"
        description="Items below their desired levels and approved buy-list requests, grouped by supplier."
      />
      <ReportView
        initialReport={initialReport}
        supplierOptions={supplierOptions}
        canExport={canExport}
      />
    </div>
  );
}
