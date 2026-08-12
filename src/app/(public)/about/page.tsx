"use client";

import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero Section */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-neutral-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent"></div>
        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight mb-6">About Titan Diamond USA</h1>
          <p className="mt-4 max-w-2xl text-xl text-neutral-300 mx-auto">
            Providing premium diamond tools and accessories for professionals.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-6">Our Story</h2>
            <p className="text-neutral-400 mb-4 leading-relaxed">
              Founded with a commitment to excellence, Titan Diamond USA has grown to become a leading supplier of premium diamond tools. Our mission is to provide industry professionals with the highest quality equipment that delivers exceptional performance, durability, and value.
            </p>
            <p className="text-neutral-400 leading-relaxed">
              We stand by our core values of integrity, innovation, and unwavering customer support. Every product we offer is tested to meet rigorous standards, ensuring you get the best tools for your most demanding projects.
            </p>
          </div>
          <div className="bg-neutral-900 border border-white/5 rounded-3xl h-80 flex items-center justify-center">
            <span className="text-neutral-600 font-medium">Image Placeholder</span>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-neutral-900/50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Why Choose Us</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-neutral-900 border border-white/5 p-8 rounded-2xl hover:border-amber-500/30 transition-colors">
              <h3 className="text-xl font-bold text-amber-500 mb-4">Premium Quality</h3>
              <p className="text-neutral-400">Our diamond tools are manufactured using top-tier materials and advanced engineering processes.</p>
            </div>
            <div className="bg-neutral-900 border border-white/5 p-8 rounded-2xl hover:border-amber-500/30 transition-colors">
              <h3 className="text-xl font-bold text-amber-500 mb-4">Expert Service</h3>
              <p className="text-neutral-400">Our knowledgeable team provides expert advice and ongoing support for all your project needs.</p>
            </div>
            <div className="bg-neutral-900 border border-white/5 p-8 rounded-2xl hover:border-amber-500/30 transition-colors">
              <h3 className="text-xl font-bold text-amber-500 mb-4">Competitive Pricing</h3>
              <p className="text-neutral-400">We offer competitive pricing structures without compromising on the quality of our tools.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold mb-12 text-center">Our Leadership</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-neutral-900 border border-white/5 rounded-2xl overflow-hidden group">
              <div className="h-64 bg-neutral-800 flex items-center justify-center">
                <span className="text-neutral-600">Photo</span>
              </div>
              <div className="p-6">
                <h4 className="font-bold text-lg">Team Member {i}</h4>
                <p className="text-neutral-500 text-sm">Position</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 text-center bg-gradient-to-t from-amber-500/10 to-transparent">
        <h2 className="text-3xl font-bold mb-6">Ready to get started?</h2>
        <p className="text-neutral-400 mb-8 max-w-2xl mx-auto">
          Contact our team today to discuss your project requirements or request pricing.
        </p>
        <Link 
          href="/contact"
          className="inline-block bg-amber-500 hover:bg-amber-600 text-black font-bold py-4 px-8 rounded-xl transition-colors"
        >
          Contact Us Today
        </Link>
      </section>
    </div>
  );
}
