import './global.css';

import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Toaster } from '@org/ui';

const siteUrl =
  process.env.NEXT_PUBLIC_WEB_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

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
    url: '/',
    siteName: 'ApplyOS',
    title,
    description,
    images: [
      {
        url: '/og.jpg',
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
    images: [
      {
        url: '/og.jpg',
        width: 1200,
        height: 630,
        alt: 'ApplyOS — octopus applying to jobs with resumes on the beach',
      },
    ],
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
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
