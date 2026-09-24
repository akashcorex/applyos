'use client';

import React from 'react';

import { motion } from 'motion/react';

import FeatureContent from './feature-content';
import FeatureFramework from './featureframework';
import FeatureInsights from './featureinsights';
import FeatureOnboard from './featureonboard';
import FeatureVaultlock from './featurevaultlock';

const FeaturesBlock = () => {
  return (
    <div
      id="features"
      className="mx-auto flex min-h-screen max-w-7xl scroll-mt-24 flex-col items-center gap-4 px-2 py-12 lg:pb-24 lg:pt-36"
    >
      <FeatureContent />
      <motion.div
        initial={{
          opacity: 0,
          transform: 'translateY(8px)',
        }}
        whileInView={{
          opacity: 1,
          transform: 'translateY(0px)',
        }}
        transition={{
          duration: 0.3,
          delay: 0.2,
          ease: [0.23, 1, 0.32, 1],
        }}
        viewport={{ once: true }}
        className="grid w-full grid-cols-1 gap-4 md:grid-cols-3"
      >
        <div className="col-span-1 md:col-span-2">
          <FeatureFramework />
        </div>
        <div className="col-span-1 md:col-span-1">
          <FeatureOnboard />
        </div>
      </motion.div>
      <motion.div
        initial={{
          opacity: 0,
          transform: 'translateY(8px)',
        }}
        whileInView={{
          opacity: 1,
          transform: 'translateY(0px)',
        }}
        transition={{
          duration: 0.3,
          delay: 0.2,
          ease: [0.23, 1, 0.32, 1],
        }}
        viewport={{ once: true }}
        className="grid w-full grid-cols-1 gap-4 md:grid-cols-3"
      >
        <div className="col-span-1 md:col-span-1">
          <FeatureVaultlock />
        </div>
        <div className="col-span-1 md:col-span-2">
          <FeatureInsights />
        </div>
      </motion.div>
    </div>
  );
};

export default FeaturesBlock;
