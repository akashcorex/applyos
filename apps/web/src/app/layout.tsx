import './global.css';

import Script from 'next/script';

import { Analytics } from '@vercel/analytics/next';

import { Toaster } from '@applyso/ui';

import { AnalyticsProvider } from '@/components/analytics/AnalyticsProvider';
import { ThemeProvider } from '@/components/theme-provider';

import type { Metadata } from 'next';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';

function resolveSiteUrl(): string {
  const fallback = 'https://www.applyos.in';
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_WEB_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined) ??
    (process.env.NODE_ENV === 'production'
      ? fallback
      : 'http://localhost:3000');

  try {
    const url = new URL(raw);
    // Guard against misconfigured env pointing at the API
    if (
      url.hostname.startsWith('api.') ||
      url.hostname === 'api.applyso.so' ||
      url.hostname === 'api.applyos.in'
    ) {
      return fallback;
    }
    return url.origin;
  } catch {
    return fallback;
  }
}

const siteUrl = resolveSiteUrl();
const ogImageUrl = new URL('/og.jpg', siteUrl).toString();

const title = 'ApplyOS — Your AI applies while you study';
const description =
  'Be first to every opportunity that matters. ApplyOS finds high-growth roles, tailors your applications, and reaches out automatically.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s · ApplyOS',
  },
  description,
  applicationName: 'ApplyOS',
  keywords: [
    'ApplyOS',
    'AI job applications',
    'auto apply',
    'job outreach',
    'early access',
  ],
  authors: [{ name: 'ApplyOS' }],
  creator: 'ApplyOS',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'ApplyOS',
    title,
    description,
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'ApplyOS — octopus applying to jobs with resumes on the beach',
        type: 'image/jpeg',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [ogImageUrl],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('applyos-theme');
                var isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) || stored === null;
                if (!isDark && stored === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                } else {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                }
              } catch (e) {}
            `,
          }}
        />
        {GA_MEASUREMENT_ID ? (
          <>
            <Script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        ) : null}
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider defaultTheme="dark" storageKey="applyos-theme">
          <AnalyticsProvider>
            {children}
            <Toaster />
            <Analytics />
          </AnalyticsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
