'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { Menu, X } from '@applyso/ui/icons';

import { navItems } from '@/constants';
import { cn } from '@/lib/utils';

const Navbar = () => {
  const [menuState, setMenuState] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header>
      <nav
        data-state={menuState && 'active'}
        className="group fixed z-50 w-full px-2"
      >
        <div
          className={cn(
            'mx-auto mt-2 max-w-[95rem] border border-neutral-800/5 px-6 transition-[max-width,padding,border-color,background-color,border-radius] duration-200 ease-out-strong lg:px-12',
            isScrolled &&
              'max-w-7xl rounded-2xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur-lg lg:px-5',
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-1 lg:gap-0">
            <div className="flex w-full justify-between lg:w-auto">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/logo-white.png"
                  alt="ApplyOS"
                  width={72}
                  height={24}
                  className="mt-1 h-6 w-auto object-contain"
                />
              </Link>

              <button
                type="button"
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState ? 'Close Menu' : 'Open Menu'}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 text-white lg:hidden"
              >
                <Menu className="m-auto size-6 transition-[transform,opacity] duration-150 ease-out-strong group-data-[state=active]:scale-95 group-data-[state=active]:opacity-0" />
                <X className="absolute inset-0 m-auto size-6 scale-95 opacity-0 transition-[transform,opacity] duration-150 ease-out-strong group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100" />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {navItems.map((item) => (
                  <li key={item.name + item.href}>
                    <Link
                      href={item.href}
                      className="text-neutral-300 transition-colors hover:text-white"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-none shadow-zinc-300/20 group-data-[state=active]:block md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none lg:group-data-[state=active]:flex">
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {navItems.map((item) => (
                    <li key={item.name + item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMenuState(false)}
                        className="text-neutral-300 hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col items-center space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                <Link href="/signup">
                  <button
                    type="button"
                    className="pressable flex h-fit min-h-[33.6px] min-w-20 items-center justify-center rounded-xl border bg-neutral-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[inset_0px_1.2px_0px_#ffffff] hover:bg-neutral-300"
                  >
                    Sign Up
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
