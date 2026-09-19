'use client';

import Link from 'next/link';
import { CiHeart } from 'react-icons/ci';

const Footer = () => {
  return (
    <div className="block border-t border-white/[0.1] px-3 py-12 sm:px-8">
      <div className="mx-auto flex max-w-[80rem] flex-col items-start justify-between px-4 text-sm text-neutral-400 sm:flex-row">
        <div>
          <div className="mb-2 flex">
            <Link href="/" className="flex items-center">
              <img
                src="/logo-white.png"
                alt="ApplyOS"
                className="h-8 w-auto object-contain"
              />
            </Link>
          </div>
          <p className="ml-3 text-sm text-neutral-400">
            © {new Date().getFullYear()} ApplyOS. All rights reserved.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-3 items-start gap-10 md:mt-0">
          <div className="mt-4 flex flex-col justify-center space-y-4">
            <Link href="#features">
              <p className="text-neutral-300/60 hover:text-neutral-300/80">
                Features
              </p>
            </Link>
            <Link href="#faq">
              <p className="text-neutral-300/60 hover:text-neutral-300/80">FAQ</p>
            </Link>
          </div>
          <div className="mt-4 flex flex-col justify-center space-y-4">
            <Link href="/login">
              <p className="text-neutral-300/60 hover:text-neutral-300/80">
                Sign In
              </p>
            </Link>
            <Link href="/signup">
              <p className="text-neutral-300/60 hover:text-neutral-300/80">
                Create Account
              </p>
            </Link>
          </div>
          <div className="mt-4 flex flex-col justify-center space-y-4">
            <Link href="/dashboard">
              <p className="text-neutral-300/60 hover:text-neutral-300/80">
                Dashboard
              </p>
            </Link>
          </div>
        </div>
      </div>
      <p className="-mb-6 mt-12 w-full text-center text-sm text-neutral-300">
        Made with{' '}
        <CiHeart className="inline-block h-5 w-5 pb-0.5 align-middle text-neutral-300" />{' '}
        for students who ship
      </p>
    </div>
  );
};

export default Footer;
