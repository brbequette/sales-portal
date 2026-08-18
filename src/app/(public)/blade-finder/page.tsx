import Link from 'next/link';
import { Metadata } from 'next';
import { BladeFinderClient } from './BladeFinderClient';

export const metadata: Metadata = {
  title: 'Interactive Diamond Blade Selector | Titan Diamond USA',
  description: 'Select your material, equipment type, and saw horsepower to instantly find the recommended Titan Diamond blade matrix for your jobsite.',
};

export default function BladeFinderPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-block mb-3">
            JOBSITE SPEC SELECTOR
          </span>
          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white mb-4">
            INTERACTIVE DIAMOND BLADE FINDER
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Answer 3 quick questions about your material, saw equipment, and cut depth to find the exact Titan Diamond blade spec for maximum speed and blade life.
          </p>
        </div>

        <BladeFinderClient />
      </div>
    </div>
  );
}
