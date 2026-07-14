import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function InvoicesPage() {
  return (
    <>
      <Topbar title="Invoices" subtitle="12 awaiting payment" />
      <div className="animate-fade-up p-4 sm:p-6">
        <ComingSoon section="Invoices" />
      </div>
    </>
  );
}
