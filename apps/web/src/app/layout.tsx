import './global.css';

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
      <body>{children}</body>
    </html>
  );
}
