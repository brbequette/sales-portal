import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Diamond Tool Technical Information | Titan Diamond USA',
  description: 'Field reference for blade speed, approximate cutting depth, equipment fit, wet and dry use, and diamond-tool troubleshooting.',
};

const SPEEDS = [
  ['4"', '1"', '3/4"', '9,075', '15,000'], ['4-1/2"', '1-1/4"', '1"', '8,065', '13,300'],
  ['5"', '1-1/2"', '1-1/4"', '7,255', '12,000'], ['6"', '-', '1-3/4"', '6,045', '10,185'],
  ['7"', '2-1/2"', '2-1/4"', '5,185', '8,730'], ['8"', '3"', '2-3/4"', '4,535', '7,640'],
  ['9"', '-', '3-1/4"', '4,030', '6,790'], ['10"', '3-3/4"', '3-3/4"', '3,630', '6,115'],
  ['12"', '3-5/8" flat saw', '-', '3,025', '5,095'], ['14"', '4-5/8" flat / 5" masonry', '-', '2,595', '4,365'],
  ['16"', '5-5/8" flat / 6" masonry', '-', '2,270', '3,820'], ['18"', '6-5/8" flat / 7" masonry', '-', '2,015', '3,395'],
  ['20"', '7-5/8" flat / 8" masonry', '-', '1,815', '3,055'], ['24"', '9-5/8" flat', '-', '1,510', '2,550'],
  ['30"', '11-3/4" flat', '-', '1,120', '2,040'], ['36"', '14-3/4" flat', '-', '1,010', '1,700'],
  ['42"', '17-3/4" flat', '-', '865', '1,455'], ['48"', '19-3/4" flat', '-', '755', '1,275'],
];

const CHECKS = [
  ['Blade will not cut', 'Confirm the bond matches the material. A bond that is too hard may glaze; dress only as permitted by the blade manufacturer and verify saw power and rotation.'],
  ['Short blade life', 'Check for an overly soft bond, abrasive material, insufficient water, side pressure, worn bearings, and a misaligned saw.'],
  ['Segment loss', 'Stop immediately. Inspect for overheating, impact, undercutting, loose flanges, improper mounting, and material pinching the blade.'],
  ['Excessive vibration', 'Stop the saw. Inspect arbor fit, flange condition, blade flatness, bearings, directional mounting, and maximum rated RPM.'],
];

export default function TechnicalInformationPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="border-b border-orange-500/20 bg-gradient-to-br from-neutral-900 via-black to-neutral-950 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-400">Titan contractor field reference</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black uppercase leading-none sm:text-6xl">Run the right tool at the right speed.</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-neutral-400 sm:text-base">Use this reference to narrow the application. The saw manual, blade label, ANSI requirements, and jobsite safety plan always control.</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-14">
        <section className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 sm:p-7">
          <h2 className="text-lg font-black uppercase text-red-300">Critical speed warning</h2>
          <p className="mt-2 text-sm leading-6 text-red-100/80">Never operate a blade above the lower of the blade's marked maximum RPM or the saw manufacturer's limit. Overspeed, damaged components, incorrect mounting, or missing guards can cause blade failure and severe injury.</p>
        </section>

        <section aria-labelledby="speed-table">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-widest text-orange-400">Cutting depth and speed</p><h2 id="speed-table" className="mt-1 text-2xl font-black uppercase">Blade diameter reference</h2></div>
            <p className="max-w-xl text-xs leading-5 text-neutral-500">Depths are approximate and vary with flange diameter, saw geometry, blade diameter, and machine setup. A dash means this condensed reference does not specify that application.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-[720px] w-full text-left text-xs">
              <thead className="bg-orange-500 text-black"><tr>{['Blade size', 'Typical high-speed / flat-saw depth', 'Typical tile depth', 'Recommended RPM', 'Maximum RPM'].map(label => <th key={label} className="px-4 py-3 font-black uppercase">{label}</th>)}</tr></thead>
              <tbody>{SPEEDS.map((row, index) => <tr key={row[0]} className={index % 2 ? 'bg-white/[0.03]' : 'bg-black'}>{row.map((value, columnIndex) => <td key={`${row[0]}-${columnIndex}`} className="border-t border-white/10 px-4 py-3 text-neutral-300">{value}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>

        <section>
          <p className="text-xs font-black uppercase tracking-widest text-orange-400">Fast diagnosis</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Troubleshooting by symptom</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">{CHECKS.map(([title, detail]) => <article key={title} className="rounded-2xl border border-white/10 bg-neutral-900 p-5"><h3 className="font-black uppercase text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-neutral-400">{detail}</p></article>)}</div>
        </section>

        <section className="grid gap-4 rounded-3xl border border-orange-500/30 bg-orange-500/10 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
          <div><h2 className="text-xl font-black uppercase">Need an application match?</h2><p className="mt-2 text-sm text-neutral-400">Bring the saw, material, aggregate, depth, wet/dry requirement, and daily footage target.</p></div>
          <div className="flex flex-wrap gap-3"><Link href="/blade-finder" className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase text-black hover:bg-orange-400">Use blade finder</Link><a href="tel:14804702577" className="rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase hover:bg-white/5">Call product tech</a></div>
        </section>
      </div>
    </main>
  );
}
