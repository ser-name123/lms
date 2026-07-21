import type { Role } from "@/store/auth";

/**
 * Where each role's dashboard lives.
 *
 * ADMIN, SUPERVISOR and ACADEMIC_COACH share /dashboard — that page renders
 * the Super Admin, Admin or Coach console depending on the signed-in role.
 */
export function dashboardPathFor(role: Role): string {
  switch (role) {
    case "STUDENT":
      return "/student/dashboard";
    case "TEACHER":
      return "/teacher/dashboard";
    default:
      return "/dashboard";
  }
}
