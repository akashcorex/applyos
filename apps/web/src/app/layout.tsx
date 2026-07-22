import './global.css';

export const metadata = {
  title: 'Outreach Autometer — Early Access',
  description: 'AI-powered job outreach automation. Get early access.',
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
