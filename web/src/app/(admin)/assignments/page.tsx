import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function AssignmentsPage() {
  return (
    <>
      <Topbar title="Assignments" subtitle="Submissions and evaluations" />
      <div className="animate-fade-up p-4 sm:p-6">
        <ComingSoon section="Assignments" />
      </div>
    </>
  );
}
