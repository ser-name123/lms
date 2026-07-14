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
  const websiteName = settings?.websiteName || "Edumin LMS";
  const favicon = settings?.favicon || "/favicon.ico";

  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <title>{websiteName}</title>
        <link rel="icon" href={favicon} />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {settings?.googleTags && (
          <div dangerouslySetInnerHTML={{ __html: settings.googleTags }} />
        )}
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
