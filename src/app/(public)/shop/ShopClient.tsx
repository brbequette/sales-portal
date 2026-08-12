"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiSearch } from 'react-icons/fi';

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  imageUrl: string | null;
  description: string | null;
};

const CATEGORIES = [
  "All",
  "Diamond Blades",
  "Core Bits",
  "Cup Wheels",
  "Polishing Pads",
  "Wire Products",
  "Accessories"
];

export default function ShopClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    // Page view counter
    const views = parseInt(localStorage.getItem('td_public_views') || '0', 10);
    const newViews = views + 1;
    localStorage.setItem('td_public_views', newViews.toString());

    if (newViews >= 10) {
      setShowLoginModal(true);
    }

    // Fetch products
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/get-products');
        if (res.ok) {
          const data = await res.json();
          setProducts(data);
        }
      } catch (error) {
        console.error("Failed to fetch products:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase()) || 
                          product.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative">
      {/* Login Modal Overlay */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
            <h2 className="text-2xl font-bold mb-4">Account Required</h2>
            <p className="text-neutral-400 mb-8">
              Create an account to continue browsing our catalog and view exclusive pricing.
            </p>
            <div className="flex flex-col gap-4">
              <Link 
                href="/login"
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                Sign In / Register
              </Link>
              <a 
                href="tel:+1XXXXXXXXXX"
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-medium py-3 px-6 rounded-xl transition-colors border border-white/5"
              >
                Call Us
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Product Catalog</h1>
          <p className="text-neutral-400">Browse our premium selection of diamond tools and accessories.</p>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center mb-8">
          <div className="relative w-full md:w-96">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search products or SKUs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  activeCategory === category
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-neutral-800 hover:bg-neutral-700 border border-transparent'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map(product => (
              <div 
                key={product.id}
                className="bg-neutral-900/60 border border-white/5 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] flex flex-col group"
              >
                <div className="h-48 bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center relative">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="object-cover h-full w-full opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <span className="text-6xl font-bold text-neutral-700 uppercase">{product.name.charAt(0)}</span>
                  )}
                  <div className="absolute top-4 left-4">
                    <span className="bg-black/50 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-xs text-neutral-300">
                      {product.category}
                    </span>
                  </div>
                </div>
                
                <div className="p-6 flex-grow flex flex-col">
                  <div className="text-sm text-neutral-500 mb-1">{product.sku}</div>
                  <h3 className="text-xl font-bold text-white mb-2">{product.name}</h3>
                  <p className="text-sm text-neutral-400 mb-6 line-clamp-2">{product.description}</p>
                  
                  <div className="mt-auto">
                    <div className="text-amber-500 text-sm font-medium mb-4">
                      Sign in for pricing
                    </div>
                    <Link
                      href="/contact"
                      className="block w-full text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2.5 rounded-xl transition-colors"
                    >
                      Request Quote
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center py-12 text-neutral-500">
                No products found matching your criteria.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
