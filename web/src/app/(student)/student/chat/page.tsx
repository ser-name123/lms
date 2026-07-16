"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, User } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchStudentChatMessages, sendStudentChatMessage } from "@/lib/api";

export default function StudentChat() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll messages every 3 seconds
  const loadMessages = (isFirst = false) => {
    if (isFirst) setLoading(true);
    fetchStudentChatMessages()
      .then((res) => {
        setMessages(res);
      })
      .catch((err) => {
        console.error("Failed to load chat history", err);
      })
      .finally(() => {
        if (isFirst) setLoading(false);
      });
  };

  useEffect(() => {
    loadMessages(true);
    const timer = setInterval(() => loadMessages(false), 3000);
    return () => clearInterval(timer);
  }, []);

  // Auto scroll to bottom when messages load
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setSending(true);
    try {
      const sentMsg = await sendStudentChatMessage(inputText.trim());
      setMessages((prev) => [...prev, sentMsg]);
      setInputText("");
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title="Support Chat" subtitle="Live support channel" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Opening live support chat...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Support Chat" subtitle="Live helper chatroom with Al Furqan administration" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto h-[calc(100vh-6.5rem)] flex flex-col">
        <Card className="border border-hairline bg-surface rounded-3xl flex-1 flex flex-col overflow-hidden shadow-sm">
          
          {/* Header */}
          <div className="border-b border-hairline p-4 flex items-center gap-3 bg-surface-2/10">
            <div className="size-10 rounded-xl bg-accent-soft/20 text-accent flex items-center justify-center">
              <MessageCircle className="size-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-ink leading-tight">Al Furqan Support Room</h4>
              <p className="text-[10px] text-good font-bold flex items-center gap-1 mt-0.5 animate-pulse">
                <span className="size-1.5 rounded-full bg-good" />
                Active Help Desk
              </p>
            </div>
          </div>

          {/* Messages window */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gradient-to-b from-surface to-page/10"
          >
            {messages.length > 0 ? (
              messages.map((m) => {
                const isAdmin = m.senderRole === "ADMIN";
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2.5 max-w-[85%] sm:max-w-[70%] ${
                      isAdmin ? "mr-auto" : "ml-auto flex-row-reverse"
                    }`}
                  >
                    {/* Icon */}
                    <div className={`size-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                      isAdmin ? "bg-accent text-white" : "bg-surface-2 text-ink-2 border border-hairline"
                    }`}>
                      {isAdmin ? "AD" : <User className="size-3.5" />}
                    </div>

                    {/* Bubble content */}
                    <div className="space-y-1">
                      <div className={`rounded-2xl px-4 py-2.5 text-xs font-semibold leading-relaxed shadow-sm ${
                        isAdmin
                          ? "bg-surface-2 text-ink border border-hairline/80 rounded-tl-none"
                          : "bg-accent text-white rounded-tr-none"
                      }`}>
                        {m.content}
                      </div>
                      <span className="block text-[8px] text-ink-3 font-bold text-right px-1">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-10">
                <MessageCircle className="size-12 text-ink-3/30" />
                <h5 className="font-extrabold text-sm text-ink">No Messages Yet</h5>
                <p className="text-xs text-ink-3 max-w-xs mx-auto leading-relaxed">
                  Start the conversation by typing your message below. An administrator will reply to your chat live.
                </p>
              </div>
            )}
          </div>

          {/* Form input bar */}
          <form onSubmit={handleSend} className="border-t border-hairline p-3 flex gap-2 bg-surface-2/15">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your question or query here..."
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

        </Card>
      </main>
    </>
  );
}
