import { AuthGate } from "@/components/auth-gate";
import { AdminShell } from "@/components/layout/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AdminShell>{children}</AdminShell>
    </AuthGate>
  );
}
