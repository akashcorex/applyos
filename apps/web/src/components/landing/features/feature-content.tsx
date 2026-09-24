'use client';
import React from 'react';

import { motion } from 'motion/react';

import FeatureIcon from '../icons/featureicon';

const FeatureContent = () => {
  return (
    <>
      <motion.div
        initial={{
          transform: 'translateY(8px)',
          opacity: 0,
        }}
        whileInView={{
          transform: 'translateY(0px)',
          opacity: 1,
        }}
        transition={{
          duration: 0.3,
          delay: 0.1,
          ease: [0.23, 1, 0.32, 1],
        }}
        viewport={{ once: true }}
        className="mb-2"
      >
        <FeatureIcon />
      </motion.div>
      <motion.h1
        initial={{
          transform: 'translateY(8px)',
          opacity: 0,
        }}
        whileInView={{
          transform: 'translateY(0px)',
          opacity: 1,
        }}
        transition={{
          duration: 0.4,
          delay: 0.1,
          ease: [0.23, 1, 0.32, 1],
        }}
        viewport={{ once: true }}
        className="mx-auto mb-2 max-w-3xl text-balance bg-gradient-to-br from-neutral-100 via-neutral-100 via-50% to-neutral-100/30 bg-clip-text py-2 text-center text-4xl font-medium leading-[1.1] tracking-tighter text-transparent md:text-5xl"
      >
        Built for students who want offers, not busywork
      </motion.h1>
      <motion.p
        initial={{
          transform: 'translateY(8px)',
          opacity: 0,
        }}
        whileInView={{
          transform: 'translateY(0px)',
          opacity: 1,
        }}
        transition={{
          duration: 0.3,
          delay: 0.2,
          ease: [0.23, 1, 0.32, 1],
        }}
        viewport={{ once: true }}
        className="mb-8 max-w-sm text-balance bg-gradient-to-br from-white/70 via-white/70 to-white/30 bg-clip-text text-center text-[0.8rem] text-transparent sm:max-w-[32rem] sm:text-[0.87rem] lg:text-[1rem]"
      >
        Discover roles, tailor applications, and follow up automatically so you
        can keep studying.
      </motion.p>
    </>
  );
};

export default FeatureContent;
