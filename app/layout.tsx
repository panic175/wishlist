import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n/provider";
import { isSupportedLanguage } from "@/lib/i18n/translations";
import { db, settings } from "@/lib/db";
import { eq } from "drizzle-orm";

async function getSettings() {
  try {
    const allSettings = await db.select().from(settings);
    const settingsObj = allSettings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    return {
      siteTitle: settingsObj.siteTitle || 'Wishlist',
      homepageSubtext: settingsObj.homepageSubtext || 'Browse and explore available wishlists',
      language: settingsObj.language || 'en',
      defaultCurrency: settingsObj.defaultCurrency || process.env.DEFAULT_CURRENCY || 'USD',
    };
  } catch (error) {
    return {
      siteTitle: 'Wishlist',
      homepageSubtext: 'Browse and explore available wishlists',
      language: 'en',
      defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: settings.siteTitle,
    description: "Self-hosted wishlist application for families",
    icons: {
      icon: '/icon.svg',
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteSettings = await getSettings();
  const lang = isSupportedLanguage(siteSettings.language) ? siteSettings.language : 'en';

  return (
    <html lang={lang}>
      <body className="font-sans antialiased bg-gray-50 dark:bg-gray-900">
        <AuthProvider>
          <ThemeProvider>
            <LanguageProvider>{children}</LanguageProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
