"use client";

import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiMail, FiPhone, FiMapPin, FiClock, FiSend, FiCheckCircle } from 'react-icons/fi';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      company: formData.get('company'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      message: formData.get('message'),
    };

    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSubmitted(true);
        toast.success('Your quote request has been sent to direct sales!');
        form.reset();
      } else {
        toast.error('Failed to send message. Please call us directly.');
      }
    } catch {
      toast.error('Failed to send message. Please call (800) 555-0199');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-block mb-3">
            DIRECT CONTRACTOR SALES & SUPPORT
          </span>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight mb-4">SPEAK WITH A DIAMOND TECH</h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed">
            Need custom blade specs, volume contractor pricing, or instant assistance with a jobsite order? Contact our USA direct team.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Contact Info Cards */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 flex items-start space-x-4">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-amber-400 shrink-0">
                <FiPhone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base mb-1 text-white">Direct Toll-Free Sales</h3>
                <a href="tel:18005550199" className="text-amber-400 font-bold hover:underline text-sm block">
                  (800) 555-0199
                </a>
                <span className="text-[11px] text-neutral-500">Same-Day Dispatch Desk</span>
              </div>
            </div>

            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 flex items-start space-x-4">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-amber-400 shrink-0">
                <FiMail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base mb-1 text-white">Email Inquiries</h3>
                <a href="mailto:sales@titandiamondusa.com" className="text-neutral-300 hover:text-white text-xs block truncate">
                  sales@titandiamondusa.com
                </a>
                <span className="text-[11px] text-neutral-500">Quotes & Custom Matrices</span>
              </div>
            </div>

            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 flex items-start space-x-4">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-amber-400 shrink-0">
                <FiMapPin className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base mb-1 text-white">National Distribution</h3>
                <p className="text-neutral-400 text-xs leading-relaxed">
                  Titan Diamond USA Headquarters<br />
                  National Warehouse & Fulfillment Center
                </p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 flex items-start space-x-4">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-amber-400 shrink-0">
                <FiClock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base mb-1 text-white">Sales Desk Hours</h3>
                <p className="text-neutral-400 text-xs">
                  Mon - Fri: 7:00 AM - 6:00 PM EST<br />
                  Sat: Emergency Order Line
                </p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-8 sm:p-10 relative shadow-2xl">
              {submitted ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-amber-400 mx-auto">
                    <FiCheckCircle size={36} />
                  </div>
                  <h2 className="text-2xl font-black text-white">QUOTE REQUEST RECEIVED</h2>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                    A Titan Diamond sales technician is reviewing your spec and will call or email you with direct contractor tier pricing.
                  </p>
                  <button 
                    onClick={() => setSubmitted(false)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl border border-white/10 transition-colors"
                  >
                    Send Another Inquiry
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-black uppercase tracking-tight mb-2 text-white">REQUEST A CONTRACTOR QUOTE</h2>
                  <p className="text-neutral-400 text-xs mb-8">
                    Fill out the form below to receive factory direct pricing, bulk tier discounts, or custom blade spec quotes.
                  </p>
                  
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2">Your Name *</label>
                        <input 
                          type="text" 
                          id="name" 
                          name="name"
                          required
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                          placeholder="e.g. John Miller"
                        />
                      </div>
                      <div>
                        <label htmlFor="company" className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2">Company / Contracting Firm</label>
                        <input 
                          type="text" 
                          id="company" 
                          name="company"
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                          placeholder="e.g. Apex Concrete Cutting LLC"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2">Email Address *</label>
                        <input 
                          type="email" 
                          id="email" 
                          name="email"
                          required
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                          placeholder="john@apexconcrete.com"
                        />
                      </div>
                      <div>
                        <label htmlFor="phone" className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2">Phone Number</label>
                        <input 
                          type="tel" 
                          id="phone" 
                          name="phone"
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                          placeholder="(555) 000-0000"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2">Blade Spec / Application Details</label>
                      <textarea 
                        id="message" 
                        name="message"
                        rows={4}
                        required
                        className="w-full bg-neutral-950 border border-white/10 rounded-xl p-4 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                        placeholder="Please specify blade diameters, material to cut (e.g. 5000 PSI hard concrete with rebar), saw horsepower, or quantity needed..."
                      ></textarea>
                    </div>

                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg hover:shadow-orange-500/25 flex items-center justify-center gap-2"
                    >
                      {loading ? 'Submitting Inquiry...' : <>Submit Quote Request <FiSend size={14} /></>}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
