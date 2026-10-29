import Image from 'next/image';
import Link from 'next/link';

const columns = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
      { label: 'What we don\u2019t do', href: '#limits' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    heading: 'Support',
    links: [{ label: 'Contact', href: 'mailto:support@applyos.in' }],
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
            className="grid grid-cols-2 gap-10 sm:w-1/2 sm:grid-cols-2 lg:w-2/3"
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
