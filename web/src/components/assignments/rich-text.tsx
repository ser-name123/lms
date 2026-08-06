"use client";

import { useEffect, useRef, useState } from "react";
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

/*
 * Renders staff-authored HTML.
 *
 * The API sanitises this on write (src/common/sanitize-html.ts), so anything
 * stored from now on is already safe. This is the second layer, for rows that
 * predate that and for any future writer that forgets: it parses the string
 * with the browser's own parser and rebuilds it from an ALLOWLIST, rather than
 * trying to pattern-match danger out.
 *
 * The version this replaces stripped only `<script>` blocks and space-prefixed
 * DOUBLE-QUOTED `on*=` handlers, so `<img src=x onerror=alert(1)>`,
 * `<svg/onload=…>`, `<a href="javascript:…">` and `<iframe>` all sailed through
 * — a teacher could run script in a student's or an admin's browser.
 */
const ALLOWED_TAGS = new Set([
  "P", "BR", "DIV", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE",
  "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI",
  "BLOCKQUOTE", "PRE", "CODE", "A",
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
]);
const ALLOWED_ATTRS: Record<string, string[]> = { A: ["href", "title", "target", "rel"] };
const SAFE_URL = /^(?:https?:\/\/|mailto:|tel:|\/|#)/i;

function scrub(node: Element) {
  for (const child of Array.from(node.children)) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Keep the text, drop the element — a disallowed wrapper should not eat
      // the paragraph inside it.
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    const allowed = ALLOWED_ATTRS[child.tagName] ?? [];
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowed.includes(name)) {
        child.removeAttribute(attr.name); // every on* handler lands here
        continue;
      }
      if (name === "href") {
        // The parser has already decoded entities, so this sees what the
        // browser would actually navigate to.
        const href = attr.value.replace(/[\u0000-\u0020]/g, "").trim();
        if (!SAFE_URL.test(href)) child.removeAttribute(attr.name);
      }
    }
    if (child.tagName === "A" && child.getAttribute("target") === "_blank") {
      child.setAttribute("rel", "noopener noreferrer");
    }
    scrub(child);
  }
}

function sanitize(html: string): string {
  if (typeof window === "undefined") return ""; // SSR: render nothing rather than raw HTML
  // A detached <template> parses without fetching images or running anything.
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("script,style,iframe,object,embed,svg,math,noscript,link,meta,base,form")
    .forEach((el) => el.remove());
  const holder = document.createElement("div");
  holder.appendChild(tpl.content.cloneNode(true));
  scrub(holder);
  return holder.innerHTML;
}

export function RichHtml({ html, className }: { html: string | null | undefined; className?: string }) {
  const [safe, setSafe] = useState("");
  // Sanitising needs the DOM parser, so it runs after mount. Until then nothing
  // is rendered — never the unsanitised string.
  useEffect(() => setSafe(html ? sanitize(html) : ""), [html]);
  if (!html) return null;
  return <div className={`rich-body text-sm text-ink [&_h3]:text-base [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-accent [&_a]:underline [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: safe }} />;
}
