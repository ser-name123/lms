import { Geist } from "next/font/google";

import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

async function getSystemSettings() {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
    const res = await fetch(`${apiBase}/settings`, { next: { revalidate: 10 } });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Fail silently in development/ssr before database initialization
  }
  return null;
}

/**
 * Build a SAFE analytics script from the admin's `googleTags` setting.
 *
 * The setting used to be injected verbatim with dangerouslySetInnerHTML, which
 * let anyone who could write settings (and, if their session were stolen, an
 * attacker) run arbitrary JS on every page — stored XSS. Instead we extract only
 * the Google measurement / container IDs (G-, GTM-, UA-, AW-) from whatever the
 * admin pasted and emit Google's own loader. IDs are validated to [A-Z0-9-] so
 * nothing but a real ID is ever interpolated — no arbitrary HTML can get in.
 * A pasted full GTM/GA snippet still "works": we recover its ID and load it.
 */
function analyticsScript(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const ids = Array.from(
    new Set(
      (raw.match(/\b(?:G|GTM|UA|AW)-[A-Z0-9]+(?:-[A-Z0-9]+)?\b/gi) ?? []).map((s) =>
        s.toUpperCase(),
      ),
    ),
  ).filter((id) => /^(?:G|GTM|UA|AW)-[A-Z0-9-]+$/.test(id)); // paranoia guard

  if (ids.length === 0) return "";

  const gtagIds = ids.filter((id) => !id.startsWith("GTM-"));
  const gtmIds = ids.filter((id) => id.startsWith("GTM-"));

  let out = "";
  if (gtagIds.length > 0) {
    out += `var _ga=document.createElement('script');_ga.async=true;_ga.src='https://www.googletagmanager.com/gtag/js?id=${gtagIds[0]}';document.head.appendChild(_ga);`;
    out += `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());`;
    for (const id of gtagIds) out += `gtag('config','${id}');`;
  }
  for (const id of gtmIds) {
    out += `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
  }
  return out;
}

/* Runs before paint so a dark-mode reload never flashes the light surface.
   Reads the same key zustand/persist writes. */
const themeInit = `
try {
  var s = JSON.parse(localStorage.getItem('lms-ui') || '{}');
  if (s?.state?.theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
} catch (e) {}
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSystemSettings();
  const websiteName = settings?.websiteName || "AL FURQAN";
  const favicon = settings?.favicon || "/favicon.ico";

  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <title>{websiteName}</title>
        <link rel="icon" href={favicon} />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {(() => {
          const analytics = analyticsScript(settings?.googleTags);
          return analytics ? (
            <script dangerouslySetInnerHTML={{ __html: analytics }} />
          ) : null;
        })()}
      </head>
      {/* Extensions inject attributes onto <body> before React hydrates, which
          reads as a server/client mismatch. Only the body's own attributes are
          suppressed — mismatches inside the tree still surface. */}
      <body className="min-h-full" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
