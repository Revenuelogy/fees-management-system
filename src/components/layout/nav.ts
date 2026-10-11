import type { AppRole } from "@/lib/types";

export type NavItem = { href: string; label: string; icon: string; roles?: AppRole[] };
export type NavGroup = { label: string; items: NavItem[] };

const WRITERS: AppRole[] = ["admin", "accountant"];

export const NAV: NavGroup[] = [
  {
    label: "Analysis",
    items: [
      { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/monthly", label: "Monthly", icon: "CalendarDays" },
      { href: "/installments", label: "Installments", icon: "Layers" },
      { href: "/classes", label: "Classes", icon: "School" },
    ],
  },
  {
    label: "Fees",
    items: [
      { href: "/collect", label: "Collect fee", icon: "IndianRupee", roles: WRITERS },
      { href: "/payments", label: "Payments & receipts", icon: "Receipt" },
      { href: "/pending", label: "Pending fees", icon: "AlertCircle" },
      { href: "/students", label: "Students", icon: "Users" },
      { href: "/reports/summary", label: "Owner summary", icon: "FileText" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/setup", label: "Setup checklist", icon: "ListChecks", roles: WRITERS },
      { href: "/setup/sessions", label: "Sessions & installments", icon: "CalendarRange", roles: WRITERS },
      { href: "/setup/classes", label: "Classes & fee heads", icon: "GraduationCap", roles: WRITERS },
      { href: "/setup/fee-structure", label: "Fee structure", icon: "Coins", roles: WRITERS },
      { href: "/setup/promote", label: "Promote students", icon: "ArrowRight", roles: WRITERS },
      { href: "/setup/import", label: "Import data", icon: "Upload", roles: WRITERS },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings", label: "School settings", icon: "Settings", roles: ["admin"] },
      { href: "/settings/staff", label: "Staff & roles", icon: "ShieldCheck", roles: ["admin"] },
      { href: "/admin/reconciliation", label: "Reconciliation", icon: "Scale", roles: ["admin", "accountant", "principal"] },
    ],
  },
];
