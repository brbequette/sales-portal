"use client";

import { useState } from 'react';
import Link from 'next/link';
import { FiBriefcase, FiDollarSign, FiZap, FiAward, FiCheckCircle, FiSend, FiArrowRight, FiUsers, FiTrendingUp } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

export default function CareersPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    territory: '',
    experience: '',
    notes: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.name.split(' ')[0] || formData.name,
          lastName: formData.name.split(' ').slice(1).join(' ') || 'Applicant',
          email: formData.email,
          phone: formData.phone,
          company: `Career Application (${formData.territory || 'Territory'})`,
          message: `CAREER APPLICATION: Sales Rep position.\nTerritory: ${formData.territory}\nExperience: ${formData.experience}\nNotes: ${formData.notes}`
        })
      });

      if (res.ok) {
        setSubmitted(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-neutral-950 text-white min-h-screen relative overflow-hidden">
      <SparkCanvas />

      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full mb-6">
            <FiBriefcase className="text-amber-400" size={16} />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              JOIN OUR HIGH-GROWTH SALES FORCE
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-black uppercase tracking-tight mb-6 text-white leading-none">
            CAREERS AT TITAN DIAMOND
          </h1>
          <p className="text-neutral-300 text-sm sm:text-lg leading-relaxed max-w-2xl mx-auto">
            We are hiring top-performing <strong className="text-amber-400">Inside & Outside Diamond Tool Sales Representatives</strong> nationwide. Earn 50% net profit split with uncapped commission potential.
          </p>
        </div>
      </section>

      {/* Why Sell For Titan Diamond USA */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black uppercase text-white tracking-tight">WHY SALES REPS THRIVE HERE</h2>
          <p className="text-neutral-400 text-xs sm:text-sm">Built by sales professionals, for sales professionals.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-neutral-900/90 border border-amber-500/30 rounded-3xl p-8 shadow-xl">
            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6 text-amber-400">
              <FiDollarSign size={28} />
            </div>
            <h3 className="text-xl font-black uppercase text-white mb-2">50% Net Profit Split</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Industry-leading compensation plan with transparent VIG calculations, automated payouts, and zero earning caps. Top reps earn $150k+ per year.
            </p>
          </div>

          <div className="bg-neutral-900/90 border border-amber-500/30 rounded-3xl p-8 shadow-xl">
            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6 text-amber-400">
              <FiZap size={28} />
            </div>
            <h3 className="text-xl font-black uppercase text-white mb-2">Automated Tech Platform</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Equipped with our custom sales portal: Zoho Books sync, automated SMS campaigns, live AI phone assistant, and click-to-call dialing.
            </p>
          </div>

          <div className="bg-neutral-900/90 border border-amber-500/30 rounded-3xl p-8 shadow-xl">
            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6 text-amber-400">
              <FiTrendingUp size={28} />
            </div>
            <h3 className="text-xl font-black uppercase text-white mb-2">Exclusive Product Lines</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Sell famous signature lines (The Dragon, Zeus, Medusa, Barbarian, ZENESIS™) that contractors demand and reorder automatically month after month.
            </p>
          </div>
        </div>

        {/* Job Posting & Application Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Job Details */}
          <div className="bg-neutral-900/90 border border-white/10 rounded-3xl p-8 space-y-6">
            <div className="inline-block bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
              NOW HIRING • NATIONWIDE
            </div>
            <h2 className="text-2xl font-black uppercase text-white">DIAMOND TOOL SALES REPRESENTATIVE</h2>
            
            <div className="space-y-3 text-xs text-neutral-300">
              <div className="flex items-center gap-2"><FiCheckCircle className="text-amber-400" /> <span>Full-Time or Independent Commissioned Agent</span></div>
              <div className="flex items-center gap-2"><FiCheckCircle className="text-amber-400" /> <span>Territory: Exclusive Regional or Remote Inside Sales</span></div>
              <div className="flex items-center gap-2"><FiCheckCircle className="text-amber-400" /> <span>Target Clients: General Contractors, Concrete Cutters, Masons</span></div>
            </div>

            <div className="pt-4 border-t border-white/10 space-y-4 text-xs text-neutral-400 leading-relaxed">
              <h4 className="font-bold text-white uppercase text-sm">Key Responsibilities:</h4>
              <ul className="list-disc pl-5 space-y-2">
                <li>Prospect new commercial concrete cutting contractors and building material distributors.</li>
                <li>Conduct jobsite blade demonstrations and matrix bond recommendations.</li>
                <li>Manage account relationships, reorders, and custom blade specifications.</li>
                <li>Utilize Titan Sales Portal for CRM tracking, quotes, and automated payout tracking.</li>
              </ul>
            </div>
          </div>

          {/* Application Form */}
          <div className="bg-neutral-900/90 border border-amber-500/40 rounded-3xl p-8 shadow-2xl">
            <h3 className="text-xl font-black uppercase text-white mb-2">Apply in 60 Seconds</h3>
            <p className="text-xs text-neutral-400 mb-6">Submit your info to connect directly with our Sales Director.</p>

            {submitted ? (
              <div className="bg-amber-500/20 border border-amber-500 p-8 rounded-2xl text-center space-y-4">
                <FiCheckCircle className="w-12 h-12 text-amber-400 mx-auto animate-bounce" />
                <h4 className="text-xl font-black uppercase text-white">Application Received!</h4>
                <p className="text-xs text-neutral-300">Thank you for applying. Our hiring manager will review your submission and contact you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-mono font-bold text-neutral-400 block mb-1">FULL NAME *</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-mono font-bold text-neutral-400 block mb-1">EMAIL ADDRESS *</label>
                    <input 
                      type="email" 
                      required 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@example.com"
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono font-bold text-neutral-400 block mb-1">PHONE NUMBER *</label>
                    <input 
                      type="tel" 
                      required 
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(480) 470-2577"
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-mono font-bold text-neutral-400 block mb-1">PREFERRED TERRITORY / CITY</label>
                  <input 
                    type="text" 
                    value={formData.territory}
                    onChange={(e) => setFormData({ ...formData, territory: e.target.value })}
                    placeholder="e.g. Texas, Midwest, Southeast, Remote"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono font-bold text-neutral-400 block mb-1">SALES EXPERIENCE SUMMARY</label>
                  <textarea 
                    rows={3}
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    placeholder="Briefly describe your industrial tools, construction supply, or B2B sales background..."
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 px-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  {loading ? 'SUBMITTING...' : 'SUBMIT APPLICATION NOW'} <FiSend size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
