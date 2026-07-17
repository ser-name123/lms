import { redirect } from "next/navigation";

// "Leads" and the old "Trial Classes / evaluation" flow were merged into a
// single Trial Classes module (the richer Lead CRM at /leads). This route now
// redirects there so any old links keep working.
export default function EvaluationRedirect() {
  redirect("/leads");
}
