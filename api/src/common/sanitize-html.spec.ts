/*
 * The HTML sanitiser.
 *
 * Every attack payload below defeated the client-side regex pair this replaced,
 * which stripped only space-prefixed double-quoted on* handlers and <script>
 * blocks. Sanitising happens on WRITE, so a payload that gets past this is
 * stored and then served to every reader of that assignment or assessment.
 *
 * Previously `scripts/smoke-sanitize-html.ts`, run by hand with tsx. It needs
 * no server and no database, so it belongs in the suite that runs on every
 * change rather than in the live-DB smokes.
 */

import { sanitizeHtml, sanitizeFields } from './sanitize-html';

/** Nothing that survives may carry an event handler, a script or a live scheme. */
const isInert = (html: string) =>
  !/\son\w+\s*=/i.test(html) &&
  !/javascript\s*:/i.test(html) &&
  !/<\s*(script|iframe|object|embed|svg|math|style)\b/i.test(html);

describe('sanitizeHtml — attacks come out inert', () => {
  it.each([
    ['unquoted handler', '<img src=x onerror=alert(1)>'],
    ['single-quoted handler', "<img src=x onerror='alert(1)'>"],
    ['double-quoted handler', '<img src="x" onerror="alert(1)">'],
    ['no space before handler', '<img/src=x/onerror=alert(1)>'],
    ['svg onload', '<svg/onload=alert(1)>'],
    ['svg with body', '<svg><script>alert(1)</script></svg>'],
    ['body onload', '<body onload=alert(1)>'],
    ['iframe javascript src', '<iframe src="javascript:alert(1)"></iframe>'],
    ['anchor javascript href', '<a href="javascript:alert(1)">click</a>'],
    ['anchor entity-encoded scheme', '<a href="java&#115;cript:alert(1)">click</a>'],
    ['anchor tab-split scheme', '<a href="java\tscript:alert(1)">click</a>'],
    ['anchor data URI', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
    ['unclosed script tag', '<script>alert(1)'],
    ['uppercase script', '<SCRIPT>alert(1)</SCRIPT>'],
    ['nested broken script', '<scr<script>ipt>alert(1)</script>'],
    ['style expression', '<style>body{background:url("javascript:alert(1)")}</style>'],
    ['object data', '<object data="javascript:alert(1)"></object>'],
    ['form action', '<form action="javascript:alert(1)"><input></form>'],
    ['conditional comment', '<!--[if IE]><script>alert(1)</script><![endif]-->'],
    ['onfocus autofocus', '<input onfocus=alert(1) autofocus>'],
    ['details ontoggle', '<details open ontoggle=alert(1)>'],
    ['marquee onstart', '<marquee onstart=alert(1)>x</marquee>'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
    ['base href', '<base href="javascript:">'],
  ])('%s', (_name, payload) => {
    expect(isInert(sanitizeHtml(payload))).toBe(true);
  });
});

describe('sanitizeHtml — legitimate formatting survives', () => {
  // A sanitiser nobody can write in is a sanitiser somebody turns off.
  it.each([
    ['bold', '<b>bold</b>', /<b>bold<\/b>/],
    ['strong + em', '<p><strong>a</strong> <em>b</em></p>', /<strong>a<\/strong>/],
    ['heading', '<h3>Title</h3>', /<h3>Title<\/h3>/],
    ['unordered list', '<ul><li>one</li><li>two</li></ul>', /<li>one<\/li>/],
    ['ordered list', '<ol><li>one</li></ol>', /<ol><li>one<\/li><\/ol>/],
    ['pre block', '<pre>code()</pre>', /<pre>code\(\)<\/pre>/],
    ['line break', 'a<br>b', /a<br>b/],
    ['https link', '<a href="https://example.com">x</a>', /href="https:\/\/example\.com"/],
    ['mailto link', '<a href="mailto:a@b.com">x</a>', /href="mailto:a@b\.com"/],
    ['relative link', '<a href="/courses">x</a>', /href="\/courses"/],
    ['plain text', 'just text', /just text/],
  ])('%s', (_name, input, expected) => {
    expect(sanitizeHtml(input)).toMatch(expected as RegExp);
  });
});

describe('sanitizeHtml — behaviour', () => {
  it('keeps the text inside an element it drops', () => {
    // Dropping the tag must not silently delete a teacher's sentence with it.
    expect(sanitizeHtml('<marquee>hello</marquee>')).toMatch(/hello/);
  });

  it('adds rel="noopener noreferrer" to a target=_blank link', () => {
    expect(sanitizeHtml('<a href="https://x.com" target="_blank">x</a>')).toMatch(/rel="noopener noreferrer"/);
  });

  it('escapes a stray angle bracket instead of eating the rest of the line', () => {
    expect(sanitizeHtml('5 < 6')).toMatch(/&lt;/);
    expect(sanitizeHtml('5 < 6')).toMatch(/6/);
  });

  it('closes unbalanced markup', () => {
    expect(sanitizeHtml('<b>oops')).toMatch(/<\/b>$/);
  });

  it('treats null and undefined as empty', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml('')).toBe('');
  });

  /*
   * Idempotence matters because an edit re-sanitises text that was already
   * sanitised on create. If a second pass changed the output, every edit would
   * mangle the previous one a little more.
   */
  it('is stable when applied twice', () => {
    for (const input of ['<p>a<b>b</b></p>', '<a href="https://x.com">x</a>', '5 &lt; 6', '<ul><li>x</li></ul>']) {
      const once = sanitizeHtml(input);
      expect(sanitizeHtml(once)).toBe(once);
    }
  });

  /*
   * Regression: `escapeText` escaped every `&`, so each edit re-escaped the
   * previous edit's output. After four saves "AT&T" read as "AT&amp;amp;amp;T"
   * on the student's screen. Ten passes here because the corruption compounds.
   */
  it('does not double-escape an ampersand across repeated edits', () => {
    for (const input of ['AT&T', 'a & b', '5 < 6', 'Q&A: <b>read</b> §1', 'x &amp; y']) {
      let text = sanitizeHtml(input);
      const first = text;
      for (let i = 0; i < 10; i++) text = sanitizeHtml(text);
      expect(text).toBe(first);
      expect(text).not.toMatch(/&amp;amp;/);
    }
  });

  it('still escapes a bare ampersand the first time', () => {
    expect(sanitizeHtml('AT&T')).toBe('AT&amp;T');
    expect(sanitizeHtml('a & b')).toBe('a &amp; b');
  });

  it('still escapes markup after an entity, so the fix opened nothing', () => {
    const out = sanitizeHtml('&lt; <script>alert(1)</script> &amp; 5 < 6');
    expect(isInert(out)).toBe(true);
    expect(out).not.toMatch(/alert/);
    expect(out).toMatch(/&lt;/);
  });
});

describe('sanitizeFields', () => {
  it('sanitises only the named fields and leaves the rest alone', () => {
    const dto = {
      description: '<b>ok</b><script>alert(1)</script>',
      instructions: '<img src=x onerror=alert(1)>',
      title: '<b>not html</b>',
      maxMarks: 100,
    };
    const out = sanitizeFields({ ...dto }, ['description', 'instructions']);
    expect(isInert(out.description as string)).toBe(true);
    expect(out.description).toMatch(/<b>ok<\/b>/);
    expect(isInert(out.instructions as string)).toBe(true);
    expect(out.title).toBe('<b>not html</b>');
    expect(out.maxMarks).toBe(100);
  });

  it('leaves a field that was not supplied absent rather than blanking it', () => {
    // A PATCH that omits `instructions` must not wipe the stored value.
    const out = sanitizeFields({ description: '<b>x</b>' } as Record<string, unknown>, [
      'description',
      'instructions',
    ]);
    expect('instructions' in out).toBe(false);
  });
});
