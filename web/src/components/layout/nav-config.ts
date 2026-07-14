import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Academics",
    items: [
      { label: "Students", href: "/students", icon: Users },
      { label: "Teachers", href: "/teachers", icon: GraduationCap },
      { label: "Courses", href: "/courses", icon: BookOpen },
      { label: "Classes", href: "/classes", icon: CalendarDays },
      { label: "Assignments", href: "/assignments", icon: ClipboardList },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", href: "/invoices", icon: Receipt },
      { label: "Payouts", href: "/payouts", icon: Wallet },
    ],
  },
];
