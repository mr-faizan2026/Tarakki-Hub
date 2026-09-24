import { Nav } from "@/components/site/Nav";
import { Hero } from "@/components/site/Hero";
import { PainSection } from "@/components/site/PainSection";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Features } from "@/components/site/Features";
import { SpotlightAutofill } from "@/components/site/SpotlightAutofill";
import { SpotlightImageGen } from "@/components/site/SpotlightImageGen";
import { SocialProof } from "@/components/site/SocialProof";
import { Pricing } from "@/components/site/Pricing";
import { FAQ } from "@/components/site/FAQ";
import { FinalCTA } from "@/components/site/FinalCTA";
import { Footer } from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <PainSection />
        <HowItWorks />
        <Features />
        <SpotlightAutofill />
        <SpotlightImageGen />
        <SocialProof />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
