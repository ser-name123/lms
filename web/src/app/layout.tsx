import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alfurqan · Admin",
  description: "LMS admin console",
};

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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
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
