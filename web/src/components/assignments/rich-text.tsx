"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Code, Heading } from "lucide-react";

/** Minimal dependency-free rich-text editor (contentEditable + execCommand).
 *  Stores HTML. Authored by staff; render with <RichHtml/>. */
export function RichText({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };
  const link = () => { const url = window.prompt("Link URL"); if (url) exec("createLink", url); };

  const Btn = ({ cmd, arg, icon: Icon, title }: { cmd: string; arg?: string; icon: React.ElementType; title: string }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); cmd === "createLink" ? link() : exec(cmd, arg); }} className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2"><Icon className="size-3.5" /></button>
  );

  return (
    <div className="rounded-xl border border-hairline bg-surface focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-hairline p-1">
        <Btn cmd="bold" icon={Bold} title="Bold" /><Btn cmd="italic" icon={Italic} title="Italic" /><Btn cmd="underline" icon={Underline} title="Underline" />
        <span className="mx-1 h-4 w-px bg-hairline" />
        <Btn cmd="formatBlock" arg="<h3>" icon={Heading} title="Heading" /><Btn cmd="insertUnorderedList" icon={List} title="Bullet list" /><Btn cmd="insertOrderedList" icon={ListOrdered} title="Numbered list" />
        <span className="mx-1 h-4 w-px bg-hairline" />
        <Btn cmd="createLink" icon={Link2} title="Link" /><Btn cmd="formatBlock" arg="<pre>" icon={Code} title="Code block" />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        data-placeholder={placeholder}
        className="rich-body min-h-24 px-3 py-2 text-sm text-ink focus:outline-none [&_h3]:text-base [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-accent [&_a]:underline [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs empty:before:text-ink-3 empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

/** Renders staff-authored HTML (scripts stripped as a basic guard). */
export function RichHtml({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return null;
  const safe = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on\w+="[^"]*"/gi, "");
  return <div className={`rich-body text-sm text-ink [&_h3]:text-base [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-accent [&_a]:underline [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: safe }} />;
}
