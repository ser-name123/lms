"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  Trophy,
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchStudentAssignments, submitStudentAssignment } from "@/lib/api";

export default function StudentAssignments() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit Modal state
  const [submittingAssignment, setSubmittingAssignment] = useState<any | null>(null);
  const [submitContent, setSubmitContent] = useState("");
  const [submitFileUrl, setSubmitFileUrl] = useState("");
  const [submittingBusy, setSubmittingBusy] = useState(false);

  const loadAssignments = () => {
    setLoading(true);
    fetchStudentAssignments()
      .then((res) => {
        setAssignments(res);
      })
      .catch((err) => {
        console.error("Failed to load student assignments", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAssignments();
  }, []);

  const handleOpenSubmit = (asg: any) => {
    setSubmittingAssignment(asg);
    setSubmitContent("");
    setSubmitFileUrl("");
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitContent.trim()) {
      Swal.fire({
        title: "Content Required",
        text: "Please enter your submission text or answers before submitting.",
        icon: "warning",
        confirmButtonColor: "#386FA4",
      });
      return;
    }

    setSubmittingBusy(true);
    try {
      await submitStudentAssignment(
        submittingAssignment.id,
        submitContent,
        submitFileUrl || undefined
      );

      Swal.fire({
        title: "Submitted!",
        text: "Your homework solution has been submitted successfully to your teacher.",
        icon: "success",
        confirmButtonColor: "#10b981",
      });

      setSubmittingAssignment(null);
      loadAssignments();
    } catch (err) {
      Swal.fire({
        title: "Error",
        text: "Failed to submit assignment. Please try again.",
        icon: "error",
        confirmButtonColor: "#f85a6b",
      });
    } finally {
      setSubmittingBusy(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title="Homework & Grades" subtitle="Check your coursework" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading assignments list...</p>
          </div>
        </div>
      </>
    );
  }

  const pending = assignments.filter((a) => a.status === "PENDING" || a.status === "ASSIGNED");
  const completed = assignments.filter((a) => a.status !== "PENDING" && a.status !== "ASSIGNED");

  return (
    <>
      <Topbar title="Homework & Grades" subtitle="Manage tasks, review homework, and check evaluations" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Pending Submissions */}
          <div className="lg:col-span-7 space-y-5">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
                <Clock className="size-4.5 text-warning-ink" />
                Pending Submissions
              </h3>
              <Badge tone="accent" className="font-black text-[10px] px-2">{pending.length} Due</Badge>
            </div>

            {pending.length > 0 ? (
              <div className="space-y-4">
                {pending.map((asg) => {
                  const due = asg.dueDate ? new Date(asg.dueDate) : null;
                  return (
                    <Card key={asg.id} className="border border-hairline bg-surface rounded-3xl p-5 hover:shadow-md transition">
                      <div className="flex flex-col justify-between h-full space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="font-bold text-xs text-ink">{asg.title}</h4>
                            {due && (
                              <span className="text-[10px] font-extrabold text-rose-500 flex items-center gap-0.5 whitespace-nowrap">
                                <Clock className="size-3" />
                                Due: {due.toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-ink-3 leading-relaxed">
                            {asg.description || "No homework outline provided. Complete exercises as directed by your teacher."}
                          </p>
                          <p className="text-[10px] text-ink-3 font-bold flex items-center gap-1">
                            <BookOpen className="size-3.5" />
                            Course: {asg.courseTitle} ({asg.courseCode})
                          </p>
                        </div>
                        <div className="pt-2">
                          <Button
                            onClick={() => handleOpenSubmit(asg)}
                            className="bg-accent hover:bg-accent-hover text-white text-[11px] font-bold h-8.5 px-4 rounded-xl flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="size-3.5" />
                            Submit Homework
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="border border-hairline/80 rounded-3xl bg-surface py-12 text-center shadow-sm text-ink-3">
                <CheckCircle2 className="size-8 text-good/60 mx-auto mb-2" />
                <p className="font-bold text-xs">No pending homework!</p>
                <p className="text-[11px]">All your active tasks have been submitted successfully.</p>
              </div>
            )}
          </div>

          {/* Right Column: Submission History & Grades */}
          <div className="lg:col-span-5 space-y-5">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
                <Trophy className="size-4.5 text-good" />
                Submission & Grading History
              </h3>
              <Badge tone="good" className="font-black text-[10px] px-2">{completed.length} Completed</Badge>
            </div>

            {completed.length > 0 ? (
              <div className="space-y-4">
                {completed.map((asg) => {
                  const sub = asg.submission || {};
                  const isGraded = asg.status === "EVALUATED" || sub.grade !== null;

                  return (
                    <Card key={asg.id} className="border border-hairline bg-surface rounded-3xl p-5 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-bold text-xs text-ink">{asg.title}</h4>
                          {isGraded ? (
                            <Badge tone="good" className="font-black text-[10px] tracking-wider uppercase px-2 py-0.5">
                              Graded
                            </Badge>
                          ) : (
                            <Badge tone="accent" className="font-black text-[10px] tracking-wider uppercase px-2 py-0.5">
                              Submitted
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-ink-3 font-semibold">
                          Course: <span className="text-ink-2 font-bold">{asg.courseTitle}</span>
                        </p>
                      </div>

                      {/* Grades capsule indicator */}
                      {isGraded && (
                        <div className="flex items-center gap-3 bg-good-soft/8 border border-good/10 rounded-2xl p-3">
                          <div className="size-10 bg-good/10 text-good rounded-xl flex items-center justify-center font-black text-sm">
                            {sub.grade || 0}
                          </div>
                          <div>
                            <span className="block text-[9px] text-ink-3 font-extrabold uppercase tracking-wider">Evaluation Grade</span>
                            <span className="block text-xs font-extrabold text-good mt-0.5">Syllabus Criteria Satisfied</span>
                          </div>
                        </div>
                      )}

                      {/* Feedback comments */}
                      {sub.feedback && (
                        <div className="bg-surface-2 border border-hairline rounded-2xl p-3 space-y-1.5">
                          <span className="text-[9px] text-ink-3 font-extrabold uppercase tracking-wider flex items-center gap-1">
                            <MessageSquare className="size-3.5" />
                            Instructor's Feedback Note:
                          </span>
                          <p className="text-[11px] text-ink-2 font-medium italic leading-relaxed">
                            "{sub.feedback}"
                          </p>
                        </div>
                      )}

                      {/* Submission details */}
                      <div className="text-[10px] text-ink-3 font-bold border-t border-hairline/80 pt-3 flex justify-between items-center">
                        <span>Submitted on: {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : "—"}</span>
                        {sub.fileUrl && (
                          <a href={sub.fileUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-0.5">
                            <FileText className="size-3" />
                            View Attached File
                          </a>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="border border-hairline/80 rounded-3xl bg-surface py-12 text-center shadow-sm text-ink-3">
                <Trophy className="size-8 text-ink-3/40 mx-auto mb-2" />
                <p className="font-bold text-xs">No grades history yet.</p>
                <p className="text-[11px]">Submit homework tasks to receive grading scores.</p>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Submission Modal Dialog */}
      {submittingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in select-none">
          <div className="bg-surface border border-hairline w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-hairline px-6 py-4 flex items-center justify-between bg-surface-2/30">
              <div>
                <h3 className="font-extrabold text-ink text-sm">Submit Homework Solution</h3>
                <p className="text-[10px] text-ink-3 font-semibold mt-0.5">{submittingAssignment.title}</p>
              </div>
              <button
                onClick={() => setSubmittingAssignment(null)}
                className="size-8 rounded-full hover:bg-surface-3 transition-colors grid place-items-center text-ink-3 hover:text-ink cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-2 mb-1.5 uppercase tracking-wider">Solution Text / Answers</label>
                <textarea
                  required
                  rows={6}
                  value={submitContent}
                  onChange={(e) => setSubmitContent(e.target.value)}
                  placeholder="Type your notes, solution code, or answers here..."
                  className="w-full rounded-xl border border-hairline bg-surface p-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-2 mb-1.5 uppercase tracking-wider">Attachments Link (Optional)</label>
                <input
                  type="url"
                  value={submitFileUrl}
                  onChange={(e) => setSubmitFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="h-10 w-full rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-[10px] text-ink-3 leading-none mt-1.5 block">
                  You can paste a Google Drive, Dropbox, or GitHub link to attach documents.
                </span>
              </div>

              <div className="flex justify-end gap-2 border-t border-hairline pt-4 bg-surface">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSubmittingAssignment(null)}
                  className="h-9 px-4 text-xs font-bold text-ink-2 border border-hairline hover:bg-surface-2 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingBusy}
                  className="h-9 px-5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
                >
                  {submittingBusy && <Loader2 className="size-4 animate-spin mr-1" />}
                  Submit Work
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
