import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/layout/QueryProvider";
import { I18nProvider } from "@/lib/i18n";
import { cookies } from "next/headers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "eVersum — Vehicle Compliance & Tracking",
  description: "UNECE R155/R156 Vehicle Software Compliance Management",
};

async function getI18nProps() {
  const cookieStore = await cookies();
  // DEFAULT_LOCALE (runtime env) določi jezik, dokler uporabnik ne izbere drugega
  const fallback = process.env.DEFAULT_LOCALE === "en" ? "en" : "sl";
  const raw = cookieStore.get("NEXT_LOCALE")?.value ?? fallback;
  const locale = ["sl", "en"].includes(raw) ? raw : "sl";
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await getI18nProps();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <I18nProvider locale={locale} messages={messages}>
          <QueryProvider>{children}</QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
