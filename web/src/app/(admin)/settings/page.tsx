import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" subtitle="Roles, permissions and integrations" />
      <div className="animate-fade-up p-4 sm:p-6">
        <ComingSoon section="Settings" />
      </div>
    </>
  );
}
