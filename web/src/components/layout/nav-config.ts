import {
  Bell,
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
  Megaphone,
  LayoutGrid,
  UserPlus,
  UserCheck,
  Sparkles,
  ClipboardCheck,
  TrendingUp,
  Briefcase,
  UserSearch,
  CalendarOff,
  BadgePercent,
  Undo2,
  SlidersHorizontal,
  PiggyBank,
  Radio,
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
      // The signed-in user's own inbox. Everything that *sends* lives under
      // Communication — these sat side by side with near-identical bell icons
      // and read as three versions of one feature.
      { label: "My Notifications", href: "/notifications", icon: Bell },
      { label: "Dashboard Widgets", href: "/dashboard-widgets", icon: LayoutGrid },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Announcements", href: "/announcements", icon: Megaphone },
      { label: "Notification Centre", href: "/notification-management", icon: Radio },
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
          { label: "Progress Tracking", href: "/students/progress", icon: TrendingUp },
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
      { label: "Finance Dashboard", href: "/finance", icon: PiggyBank },
      {
        label: "Billing",
        icon: Receipt,
        children: [
          { label: "Fee Plans", href: "/finance/fee-plans", icon: Package },
          { label: "Invoices", href: "/finance/invoices", icon: Receipt },
          { label: "Discounts", href: "/finance/discounts", icon: BadgePercent },
          { label: "Scholarships", href: "/finance/scholarships", icon: GraduationCap },
          { label: "Refunds", href: "/finance/refunds", icon: Undo2 },
        ],
      },
      {
        label: "Payroll",
        icon: Wallet,
        children: [
          { label: "Salary and Wages", href: "/payouts", icon: Wallet },
          { label: "Payroll Config", href: "/finance/payroll", icon: SlidersHorizontal },
        ],
      },
      { label: "Expenses", href: "/expenses", icon: FileText },
      { label: "Legacy Invoices", href: "/invoices", icon: Receipt },
      { label: "Reports", href: "/finance/reports", icon: FileText },
    ],
  },
];
