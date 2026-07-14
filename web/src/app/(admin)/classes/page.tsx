import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function ClassesPage() {
  return (
    <>
      <Topbar title="Classes" subtitle="1,236 sessions this week" />
      <div className="animate-fade-up p-4 sm:p-6">
        <ComingSoon section="Classes" />
      </div>
    </>
  );
}
