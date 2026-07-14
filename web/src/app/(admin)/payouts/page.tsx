import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function PayoutsPage() {
  return (
    <>
      <Topbar title="Payouts" subtitle="Teacher salaries and wages" />
      <div className="animate-fade-up p-4 sm:p-6">
        <ComingSoon section="Payouts" />
      </div>
    </>
  );
}
