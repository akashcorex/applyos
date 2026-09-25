import Image from 'next/image';
import Link from 'next/link';

const columns = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/' },
      { label: 'Careers', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contact', href: 'mailto:support@applyos.in' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Help center', href: '#faq' },
      { label: 'Community', href: '#' },
      { label: 'API docs', href: '#' },
      { label: 'Status', href: '#' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
      { label: 'DPA', href: '#' },
      { label: 'Cookies', href: '#' },
    ],
  },
];

const socials = [
  {
    label: 'ApplyOS on X',
    href: 'https://x.com',
    path: 'M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.9L18.9 2Zm-1.1 18h1.7L7.1 3.9H5.3L17.8 20Z',
  },
  {
    label: 'ApplyOS on LinkedIn',
    href: 'https://linkedin.com',
    path: 'M20.4 20.4h-3.5v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6h.1c.5-.9 1.7-1.9 3.4-1.9 3.6 0 4.2 2.4 4.2 5.4v6.3ZM5.3 7.4a2 2 0 1 1 0-4.1 2 2 0 0 1 0 4.1ZM7.1 20.4H3.6V9h3.5v11.4Z',
  },
  {
    label: 'ApplyOS on GitHub',
    href: 'https://github.com',
    path: 'M12 2C6.5 2 2 6.5 2 12c0 4.4 2.9 8.2 6.8 9.5.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.4.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 22 12c0-5.5-4.5-10-10-10Z',
  },
];

const Footer = () => {
  return (
    <footer className="overflow-hidden border-t border-white/10 bg-black">
      <div className="mx-auto max-w-[80rem] px-6 pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div>
            <Link
              href="/"
              className="flex items-center"
              aria-label="ApplyOS home"
            >
              <Image
                src="/logo-white.png"
                alt="ApplyOS"
                width={120}
                height={32}
                className="h-8 w-auto object-contain"
              />
            </Link>
            <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-neutral-400">
              Your AI applies while you study.
            </p>
          </div>
          <nav
            className="grid grid-cols-2 gap-10 sm:grid-cols-4"
            aria-label="Footer"
          >
            {columns.map((column) => (
              <div key={column.heading}>
                <h3 className="mb-4 text-sm font-medium text-white">
                  {column.heading}
                </h3>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[15px] text-neutral-500 transition-colors duration-150 hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-16 flex items-center justify-between border-t border-dashed border-white/10 py-6">
          <p className="text-sm text-neutral-500">
            © {new Date().getFullYear()} ApplyOS. All rights reserved.
          </p>
          <div className="flex items-center gap-1">
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors duration-150 hover:bg-white/10 hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-[18px] w-[18px]"
                  aria-hidden="true"
                >
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="-mb-[0.24em] select-none text-center font-sans text-[23vw] font-bold leading-[0.8] tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.18)] [mask-image:linear-gradient(to_bottom,black_55%,transparent_98%)]"
      >
        ApplyOS
      </div>
    </footer>
  );
};

export default Footer;
