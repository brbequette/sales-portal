"use client";

import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiMail, FiPhone, FiMapPin, FiClock } from 'react-icons/fi';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate API request
    setTimeout(() => {
      setLoading(false);
      toast.success('Your message has been sent successfully!');
      (e.target as HTMLFormElement).reset();
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">Contact Us</h1>
          <p className="text-neutral-400 max-w-2xl mx-auto text-lg">
            Have questions about our products or need a quote? Reach out to our team.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Contact Info Cards */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 flex items-start space-x-4">
              <div className="bg-neutral-800 p-3 rounded-xl text-amber-500">
                <FiPhone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">Phone</h3>
                <p className="text-neutral-400">+1 (800) XXX-XXXX</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 flex items-start space-x-4">
              <div className="bg-neutral-800 p-3 rounded-xl text-amber-500">
                <FiMail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">Email</h3>
                <p className="text-neutral-400">sales@titandiamondusa.com</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 flex items-start space-x-4">
              <div className="bg-neutral-800 p-3 rounded-xl text-amber-500">
                <FiMapPin className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">Address</h3>
                <p className="text-neutral-400">123 Diamond Way<br/>Los Angeles, CA 90001</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-white/5 rounded-2xl p-6 flex items-start space-x-4">
              <div className="bg-neutral-800 p-3 rounded-xl text-amber-500">
                <FiClock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">Business Hours</h3>
                <p className="text-neutral-400">Mon - Fri: 8:00 AM - 5:00 PM PST<br/>Sat - Sun: Closed</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="bg-neutral-900 border border-white/5 rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-6">Send us a message</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-neutral-300 mb-2">Name</label>
                    <input 
                      type="text" 
                      id="name" 
                      required
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-neutral-300 mb-2">Company</label>
                    <input 
                      type="text" 
                      id="company" 
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                      placeholder="Your company"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-2">Email</label>
                    <input 
                      type="email" 
                      id="email" 
                      required
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                      placeholder="you@company.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-neutral-300 mb-2">Phone</label>
                    <input 
                      type="tel" 
                      id="phone" 
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                      placeholder="(555) 000-0000"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-neutral-300 mb-2">Message</label>
                  <textarea 
                    id="message" 
                    required
                    rows={5}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                    placeholder="How can we help you?"
                  ></textarea>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-4 px-8 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Map Placeholder */}
        <div className="mt-12 bg-neutral-900 border border-white/5 rounded-2xl h-96 flex items-center justify-center text-center p-6">
          <div>
            <FiMapPin className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-400 mb-2">Map Placeholder</h3>
            <p className="text-neutral-500">123 Diamond Way, Los Angeles, CA 90001</p>
          </div>
        </div>
      </div>
    </div>
  );
}
