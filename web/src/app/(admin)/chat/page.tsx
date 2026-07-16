"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, User } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchAdminChatThreads,
  fetchAdminThreadMessages,
  sendAdminChatMessage,
  resolveFileUrl,
} from "@/lib/api";

export default function AdminChat() {
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll threads
  const loadThreads = (isFirst = false) => {
    if (isFirst) setLoadingThreads(true);
    fetchAdminChatThreads()
      .then((res) => {
        setThreads(res);
      })
      .catch((err) => {
        console.error("Failed to load chat threads", err);
      })
      .finally(() => {
        if (isFirst) setLoadingThreads(false);
      });
  };

  // Poll messages for active thread
  const loadMessages = (studentId: string, isFirst = false) => {
    if (isFirst) setLoadingMessages(true);
    fetchAdminThreadMessages(studentId)
      .then((res) => {
        setMessages(res);
      })
      .catch((err) => {
        console.error("Failed to load thread messages", err);
      })
      .finally(() => {
        if (isFirst) setLoadingMessages(false);
      });
  };

  useEffect(() => {
    loadThreads(true);
    const timer = setInterval(() => loadThreads(false), 4000);
    return () => clearInterval(timer);
  }, []);

  // Poll active thread messages
  useEffect(() => {
    if (!selectedStudent) return;
    loadMessages(selectedStudent.id, true);

    const interval = setInterval(() => {
      loadMessages(selectedStudent.id, false);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedStudent]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !inputText.trim()) return;

    setSending(true);
    try {
      const sentMsg = await sendAdminChatMessage(selectedStudent.id, inputText.trim());
      setMessages((prev) => [...prev, sentMsg]);
      setInputText("");
      // Refresh threads to update preview snippet
      loadThreads(false);
    } catch (err) {
      console.error("Failed to send reply", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Topbar title="Live Chat" subtitle="Chat live and resolve student queries in real-time" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto h-[calc(100vh-6.5rem)] flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          
          {/* Left panel: active threads */}
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex flex-col overflow-hidden shadow-sm lg:col-span-1 h-full">
            <h3 className="font-extrabold text-sm text-ink mb-4 pb-2 border-b border-hairline">
              Active Support Threads
            </h3>

            {loadingThreads ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Loader2 className="size-6 animate-spin text-accent" />
                <p className="text-[10px] font-bold text-ink-3 mt-2">Loading threads...</p>
              </div>
            ) : threads.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {threads.map((t) => {
                  const active = selectedStudent?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedStudent(t)}
                      className={`w-full p-3 rounded-2xl flex items-start gap-3 border text-left transition duration-200 cursor-pointer ${
                        active
                          ? "border-accent/40 bg-accent-soft/10"
                          : "border-hairline hover:bg-surface-2/45 bg-surface"
                      }`}
                    >
                      {/* Avatar */}
                      <div className="size-10 rounded-xl overflow-hidden bg-accent-soft/25 text-accent flex items-center justify-center font-extrabold shrink-0 border border-hairline">
                        {t.avatarUrl ? (
                          <img
                            src={resolveFileUrl(t.avatarUrl)}
                            alt={t.firstName}
                            className="size-full object-cover"
                          />
                        ) : (
                          <span>
                            {t.firstName.substring(0, 1).toUpperCase()}
                            {t.lastName.substring(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Info preview */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="block font-bold text-xs text-ink truncate">
                            {t.firstName} {t.lastName}
                          </span>
                          {t.lastMessage && (
                            <span className="text-[8px] text-ink-3 font-semibold shrink-0">
                              {new Date(t.lastMessage.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                        <span className="block text-[8px] text-ink-3 font-bold uppercase tracking-wider">
                          Code: {t.studentCode}
                        </span>
                        {t.lastMessage && (
                          <p className="text-[10px] text-ink-2 truncate leading-normal">
                            {t.lastMessage.senderRole === "ADMIN" ? "You: " : ""}
                            {t.lastMessage.content}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3.5 py-10">
                <MessageCircle className="size-10 text-ink-3/45" />
                <h4 className="font-extrabold text-xs text-ink">No support rooms active</h4>
                <p className="text-[10px] text-ink-3 max-w-[200px] leading-relaxed">
                  Support rooms open automatically when a student types a support query in their panel.
                </p>
              </div>
            )}
          </Card>

          {/* Right panel: Active chat window */}
          <Card className="border border-hairline bg-surface rounded-3xl flex flex-col overflow-hidden shadow-sm lg:col-span-2 h-full">
            {selectedStudent ? (
              <div className="size-full flex flex-col overflow-hidden">
                {/* Header info */}
                <div className="border-b border-hairline p-4 flex items-center justify-between bg-surface-2/10">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl overflow-hidden bg-accent-soft/25 text-accent flex items-center justify-center font-extrabold shrink-0 border border-hairline">
                      {selectedStudent.avatarUrl ? (
                        <img
                          src={resolveFileUrl(selectedStudent.avatarUrl)}
                          alt={selectedStudent.firstName}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span>
                          {selectedStudent.firstName.substring(0, 1).toUpperCase()}
                          {selectedStudent.lastName.substring(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-ink leading-tight">
                        {selectedStudent.firstName} {selectedStudent.lastName}
                      </h4>
                      <span className="block text-[8px] text-ink-3 font-bold uppercase tracking-wider mt-0.5">
                        Student ID: {selectedStudent.studentCode}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Messages list */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gradient-to-b from-surface to-page/10"
                >
                  {loadingMessages ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="size-6 animate-spin text-accent" />
                    </div>
                  ) : messages.length > 0 ? (
                    messages.map((m) => {
                      const isStudent = m.senderRole === "STUDENT";
                      return (
                        <div
                          key={m.id}
                          className={`flex items-start gap-2.5 max-w-[85%] sm:max-w-[70%] ${
                            isStudent ? "mr-auto" : "ml-auto flex-row-reverse"
                          }`}
                        >
                          {/* Profile icon */}
                          <div className={`size-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            isStudent ? "bg-surface-2 text-ink-2 border border-hairline" : "bg-accent text-white"
                          }`}>
                            {isStudent ? "ST" : "AD"}
                          </div>

                          {/* Bubble text */}
                          <div className="space-y-1">
                            <div className={`rounded-2xl px-4 py-2.5 text-xs font-semibold leading-relaxed shadow-sm ${
                              isStudent
                                ? "bg-surface-2 text-ink border border-hairline/80 rounded-tl-none"
                                : "bg-accent text-white rounded-tr-none"
                            }`}>
                              {m.content}
                            </div>
                            <span className="block text-[8px] text-ink-3 font-bold text-right px-1">
                              {new Date(m.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-ink-3 text-center py-10">No messages in this chat.</p>
                  )}
                </div>

                {/* Input bar */}
                <form onSubmit={handleSend} className="border-t border-hairline p-3 flex gap-2 bg-surface-2/15">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`Reply to ${selectedStudent.firstName}...`}
                    className="flex-1 h-11 px-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                  />
                  <Button
                    type="submit"
                    disabled={sending || !inputText.trim()}
                    className="bg-accent hover:bg-accent-hover text-white rounded-xl h-11 px-5 flex items-center justify-center cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="size-4.5 animate-spin" /> : <Send className="size-4.5" />}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="size-full flex flex-col items-center justify-center text-center space-y-4 py-20">
                <MessageCircle className="size-14 text-ink-3/30" />
                <h4 className="font-extrabold text-sm text-ink">No chat thread selected</h4>
                <p className="text-xs text-ink-3 max-w-xs leading-relaxed">
                  Select a student chat session from the left-side panel list to review history and type live replies.
                </p>
              </div>
            )}
          </Card>

        </div>
      </main>
    </>
  );
}
