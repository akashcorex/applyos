import './global.css';

import { Analytics } from '@vercel/analytics/next';
import { Toaster } from '@org/ui';

export const metadata = {
  title: 'ApplySo',
  description: 'AI-powered job outreach automation',
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
