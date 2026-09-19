"use client";
import { cn } from "@/lib/utils";
import FrameworkCard from "./frameworkcard";

const FeatureFramework = () => {
  return (
    <div
      className={cn(
        "relative",
        "flex flex-col justify-between",
        "h-[20rem] space-y-4",
        "rounded-md border border-neutral-800/50 bg-neutral-950",
      )}
    >
      <FrameworkCard />
      <div className="px-4 pb-4">
        <div className="text-sm font-semibold text-white">
          Works with your stack
        </div>
        <div className="mt-2 text-xs text-neutral-400">
          Next.js, React, or a plain site. Upload a resume and ApplyOS starts
          discovering roles.
        </div>
      </div>
    </div>
  );
};

export default FeatureFramework;
