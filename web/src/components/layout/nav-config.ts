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
  FileText,
  Library,
  Package,
  MessageCircle,
  UserPlus,
  UserCheck,
  Sparkles,
  ClipboardCheck,
  TrendingUp,
  Briefcase,
  UserSearch,
  CalendarOff,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  badge?: string;
  children?: {
    label: string;
    href: string;
    icon: LucideIcon;
    badge?: string;
  }[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Live Chat", href: "/chat", icon: MessageCircle },
    ],
  },
  {
    label: "Academics",
    items: [
      { label: "Trial Classes", href: "/leads", icon: Sparkles },
      {
        label: "Students",
        icon: Users,
        children: [
          { label: "All Students", href: "/students", icon: Users },
          { label: "Student Analytics", href: "/students/analytics", icon: TrendingUp },
          { label: "Admission", href: "/registrations", icon: UserPlus },
        ],
      },
      {
        label: "Teachers",
        icon: GraduationCap,
        children: [
          { label: "All Teachers", href: "/teachers", icon: GraduationCap },
          { label: "Teacher Analytics", href: "/teachers/analytics", icon: TrendingUp },
          { label: "Teacher Applications", href: "/teacher-registrations", icon: UserCheck },
        ],
      },
      { label: "Other Employees", href: "/employees", icon: Briefcase },
      { label: "Recruitment", href: "/recruitment", icon: UserSearch },
      {
        label: "Learning management",
        icon: GraduationCap,
        children: [
          { label: "Courses", href: "/courses", icon: BookOpen },
          { label: "Assignments", href: "/assignments", icon: ClipboardList },
          { label: "Assessments", href: "/assessments", icon: FileText },
          { label: "Knowledgebase", href: "/knowledgebase", icon: Library },
          { label: "Packages", href: "/packages", icon: Package },
        ],
      },
      {
        label: "Schedules",
        icon: CalendarDays,
        children: [
          { label: "Classes", href: "/classes", icon: CalendarDays },
          { label: "Meetings", href: "/meetings", icon: Users },
          { label: "Attendance", href: "/attendance", icon: ClipboardCheck },
          { label: "Leave Requests", href: "/leaves", icon: CalendarOff },
        ],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoice", href: "/invoices", icon: Receipt },
      { label: "Salary and Wages", href: "/payouts", icon: Wallet },
      { label: "Expenses", href: "/expenses", icon: FileText },
    ],
  },
];
