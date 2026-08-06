/*
 * Server-side HTML sanitisation for staff-authored rich text.
 *
 * Assignment instructions and descriptions are written by a teacher and
 * rendered into a student's and an admin's browser. That is a stored-XSS path:
 * a compromised or malicious teacher account could run script in the browser of
 * someone with more privilege than they have. The client used to be the only
 * defence and it was a pair of regexes that missed unquoted handlers
 * (`<img src=x onerror=alert(1)>`), slash-separated ones (`<svg/onload=…>`),
 * `javascript:` URLs and `<iframe>` entirely.
 *
 * This is an ALLOWLIST, which is the only shape of HTML sanitiser that fails
 * safe: anything not explicitly permitted is dropped rather than pattern-matched
 * and hopefully removed. It runs on WRITE, so what is stored is already clean
 * and every reader — this app, an export, a future email — gets the safe copy.
 * The client sanitises again on render as defence in depth for rows written
 * before this existed.
 *
 * Deliberately dependency-free: the formatting surface is small and fixed (the
 * in-house editor emits exactly these tags), so a hand-written allowlist is
 * auditable in one screen. If the editor ever grows to arbitrary pasted HTML,
 * swap this for a maintained library rather than extending the list.
 */

/** Tags the in-house rich-text editor can produce, and nothing else. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

/** Attributes kept, per tag. Everything else — including every on* — is dropped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
};

/** URL schemes an href may use. `javascript:` and `data:` are the attack ones. */
const SAFE_URL = /^(?:https?:\/\/|mailto:|tel:|\/|#)/i;

/*
 * An ampersand that is NOT already the start of a character reference.
 *
 * Escaping every `&` unconditionally makes this function non-idempotent, and
 * assignments/assessments sanitise on update as well as on create — so a
 * description was re-escaped on every edit and `AT&T` grew an `amp;` each time
 * until it rendered as literal `AT&amp;amp;T` to the class. Leaving an existing
 * entity alone is safe: an entity in text content renders as its character,
 * it is never re-parsed as markup.
 */
const BARE_AMPERSAND = /&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]{0,31};)/g;

function escapeText(s: string): string {
  return s
    .replace(BARE_AMPERSAND, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeAttrs(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return '';

  const out: string[] = [];
  // name="value" | name='value' | name=value | name
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!allowed.has(name)) continue;
    const value = m[2] ?? m[3] ?? m[4] ?? '';

    if (name === 'href') {
      // A scheme check on the DECODED value: `java&#115;cript:` and
      // `\tjavascript:` both reach the browser as javascript:.
      const decoded = value
        .replace(/&#(\d+);?/g, (_, d: string) => String.fromCharCode(Number(d)))
        .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
        // Control characters and whitespace inside the scheme: browsers ignore
        // them, so a tab inside "java<TAB>script:" still runs as javascript:.
        .replace(/[\u0000-\u0020]/g, '')
        .trim();
      if (!SAFE_URL.test(decoded)) continue;
    }
    if (name === 'target' && value !== '_blank') continue;

    out.push(`${name}="${escapeText(value).replace(/"/g, '&quot;')}"`);
  }

  // A link opening in a new tab without noopener hands the opener to the target.
  if (tag === 'a' && out.some((a) => a.startsWith('target='))) {
    if (!out.some((a) => a.startsWith('rel='))) out.push('rel="noopener noreferrer"');
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

/** Tags that carry no closing tag. */
const VOID_TAGS = new Set(['br']);

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';

  /*
   * Strip whole elements whose CONTENT is dangerous even when the tags are
   * dropped: leaving the body of a <script> or <style> behind as text would
   * dump code into the page. Comments go too — `<!--[if]>` conditional comments
   * have been an injection vector.
   */
  let html = String(input)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|noscript|template|iframe|object|embed|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // …and the unclosed forms of the same, which a browser still honours.
    .replace(/<\s*(script|style|noscript|template|iframe|object|embed|svg|math)\b[^>]*>/gi, '');

  const open: string[] = [];
  let out = '';
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += escapeText(html.slice(i));
      break;
    }
    out += escapeText(html.slice(i, lt));

    const gt = html.indexOf('>', lt);
    if (gt === -1) {
      // A stray "<" with no ">" is text, not a tag.
      out += escapeText(html.slice(lt));
      break;
    }

    const inner = html.slice(lt + 1, gt);
    const closing = inner.startsWith('/');
    const body = closing ? inner.slice(1) : inner;
    const nameMatch = body.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    const tag = nameMatch?.[1]?.toLowerCase();

    if (!tag || !ALLOWED_TAGS.has(tag)) {
      // Unknown or disallowed element: drop the tag, keep nothing of it. Its
      // text content is still walked, so "<b>hi</b>" inside a dropped wrapper
      // survives as formatted text.
      i = gt + 1;
      continue;
    }

    if (closing) {
      const idx = open.lastIndexOf(tag);
      if (idx !== -1) {
        // Close anything left open inside it, so the output stays balanced.
        for (let k = open.length - 1; k >= idx; k--) out += `</${open[k]}>`;
        open.length = idx;
      }
    } else if (VOID_TAGS.has(tag)) {
      out += `<${tag}>`;
    } else {
      out += `<${tag}${sanitizeAttrs(tag, body.slice(tag.length))}>`;
      open.push(tag);
    }
    i = gt + 1;
  }

  for (let k = open.length - 1; k >= 0; k--) out += `</${open[k]}>`;
  return out;
}

/** Sanitise the named fields of a DTO in place, when present. */
export function sanitizeFields<T extends Record<string, any>>(dto: T, fields: (keyof T)[]): T {
  for (const f of fields) {
    if (typeof dto[f] === 'string') (dto as any)[f] = sanitizeHtml(dto[f] as string);
  }
  return dto;
}
