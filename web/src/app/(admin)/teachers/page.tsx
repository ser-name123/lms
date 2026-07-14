import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function TeachersPage() {
  return (
    <>
      <Topbar title="Teachers" subtitle="24 active instructors" />
      <div className="animate-fade-up p-4 sm:p-6">
        <ComingSoon section="Teachers" />
      </div>
    </>
  );
}
