import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function CoursesPage() {
  return (
    <>
      <Topbar title="Courses" subtitle="6 courses across 4 levels" />
      <div className="animate-fade-up p-4 sm:p-6">
        <ComingSoon section="Courses" />
      </div>
    </>
  );
}
