import type { Metadata } from "next";
import { Kanit, IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Display face: Kanit — a geometric Thai/Latin face with real character,
// used sparingly for headings so the product doesn't default to a neutral
// system font. Body face: IBM Plex Sans Thai, for legible day-to-day forms
// and tables across the whole app.
const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["500", "600", "700"],
});

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "DSMS — ระบบจัดการร้านเครื่องดื่ม",
  description: "ระบบบริหารจัดการร้านเครื่องดื่มแบบครบวงจร: ต้นทุน, POS, สต็อก, และรายงาน",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${kanit.variable} ${plexThai.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
