import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getSessionUser, can } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemSearch } from "@/components/mobile/item-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
};

export default async function MobileSearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!(await can("items.view"))) {
    return (
      <EmptyState
        icon={Search}
        title="No access to items"
        description="Your account can't view the item inventory."
      />
    );
  }

  return <ItemSearch initialQuery={searchParams.q ?? ""} />;
}
