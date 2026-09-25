'use client';

import CtaSection from './CtaSection';
import FAQ from './FAQ';
import FeaturesBlock from './features/features-block';
import Footer from './footer';
import HeroSection from './HeroSection';
import Navbar from './navbar-shrink';
import PricingSection from './PricingSection';
import TestimonialsSection from './TestimonialsSection';

export function LandingPage() {
  return (
    <div className="bg-black">
      <Navbar />
      <HeroSection />
      <FeaturesBlock />
      <TestimonialsSection />
      <PricingSection />
      <FAQ />
      <CtaSection />
      <Footer />
    </div>
  );
}

export default LandingPage;
