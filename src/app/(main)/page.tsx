import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { buildDashboardData } from "@/components/dashboard/build-data";
import { normalizeConfig } from "@/components/dashboard/types";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [user, data] = await Promise.all([getSessionUser(), buildDashboardData()]);
  const config = normalizeConfig(user?.dashboardConfig);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="A snapshot of your inventory, stock levels and ordering pipeline. Customize the layout to fit how you work."
      />
      <DashboardGrid initialConfig={config} data={data} />
    </div>
  );
}
