'use client';

import { DataSanitizationPipeline } from './data-sanitization-pipeline';
import { SystemEventStream } from './system-event-stream';

export function PipelineShowcase() {
  return (
    <section className="w-full bg-black py-20 text-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Header from reference */}
        <div className="mb-10 text-right">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
            Built for Data That Scales
          </h2>
          <p className="mt-3 text-sm text-neutral-400 sm:text-base">
            Flowcore orchestrates data, AI execution, and event pipelines —
            observable, deterministic.
          </p>
        </div>

        {/* Stacked Showcase Cards */}
        <div className="flex flex-col gap-6">
          <DataSanitizationPipeline />
          <SystemEventStream />
        </div>
      </div>
    </section>
  );
}

export default PipelineShowcase;
