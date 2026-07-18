"use client";

import { Topbar } from "@/components/layout/topbar";
import { WidgetManager } from "@/components/admin/widget-manager";

export default function DashboardWidgetsPage() {
  return (
    <>
      <Topbar
        title="Dashboard Widgets"
        subtitle="Control which widgets each role's dashboard may show"
      />
      <div className="p-4 sm:p-6">
        <WidgetManager />
      </div>
    </>
  );
}
