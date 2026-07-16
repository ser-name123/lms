"use client";

import { useState } from "react";
import {
  HelpCircle,
  Mail,
  Phone,
  MessageSquare,
  Clock,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  LifeBuoy,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("TECHNICAL");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) {
      Swal.fire("Validation Error", "Please fill in both subject and query details.", "warning");
      return;
    }

    setSubmitting(true);
    // Simulate sending support query
    setTimeout(() => {
      setSubmitting(false);
      Swal.fire({
        title: "Support Ticket Raised!",
        text: "Your query has been sent to Al Furqan administrative support staff.",
        icon: "success",
        confirmButtonColor: "#386FA4",
      });
      setSubject("");
      setMessage("");
      setCategory("TECHNICAL");
    }, 1500);
  };

  return (
    <>
      <Topbar title="Support Center" subtitle="Contact administration and resolve platform issues" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Help Desk Overview Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <LifeBuoy className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Live Help Roster</span>
              <h4 className="text-base font-black text-ink leading-none mt-1">24/7 Monitoring</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
              <Clock className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Average SLA Response</span>
              <h4 className="text-base font-black text-ink leading-none mt-1">&lt; 2 Hours SLA</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
              <AlertCircle className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Escalation Channel</span>
              <h4 className="text-base font-black text-ink leading-none mt-1">Direct to Admin</h4>
            </div>
          </Card>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Submit Support Request Form */}
          <Card className="border border-hairline bg-surface rounded-3xl p-6 shadow-sm lg:col-span-2 space-y-5">
            <div className="border-b border-hairline pb-4">
              <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
                <MessageSquare className="size-4.5 text-accent" />
                Raise a Support Query
              </h3>
              <p className="text-[10px] text-ink-3 font-semibold mt-0.5">
                Have a technical problem, schedule clash, or payment query? Fill this form.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Query Subject *</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Schedule calendar not syncing"
                    className="h-10 w-full px-3.5 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-ink-2">Issue Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-10 w-full px-3.5 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  >
                    <option value="TECHNICAL">Platform Bug / Technical</option>
                    <option value="BILLING">Billing & Salary Disputes</option>
                    <option value="CURRICULUM">Curriculum / Class Materials</option>
                    <option value="OTHER">Other Query</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-2">Query Description & details *</label>
                <textarea
                  rows={6}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or help request in detail..."
                  className="w-full p-4 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

              <div className="pt-3 border-t border-hairline flex justify-end">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-accent hover:bg-accent-hover text-white text-xs font-extrabold h-10 px-6 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Submit Support Ticket
                </Button>
              </div>

            </form>
          </Card>

          {/* Contact Methods Cards */}
          <div className="space-y-6">
            <Card className="border border-hairline bg-surface rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="font-extrabold text-xs text-ink uppercase tracking-wider">Direct Contacts</h4>
              
              <div className="space-y-4.5">
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
                    <Mail className="size-4.5" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Administrative Support</span>
                    <a href="mailto:support@alfurqan.com" className="text-xs text-ink-2 font-bold hover:underline">
                      support@alfurqan.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
                    <Phone className="size-4.5" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Helpline Contact</span>
                    <p className="text-xs text-ink-2 font-bold">
                      +1 (555) 019-9000
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
                    <FileText className="size-4.5" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Documentation Resources</span>
                    <a href="/knowledgebase" className="text-xs text-accent font-extrabold hover:underline">
                      Browse Knowledgebase
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          </div>

        </div>

      </main>
    </>
  );
}
