"use client";

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FiSearch, FiLock, FiPhone, FiTag, FiBox, FiArrowRight } from 'react-icons/fi';

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  imageUrl?: string | null;
  description?: string | null;
  price?: number;
  stock?: number;
};

type ParsedProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  imageUrl: string;
  textDescription: string;
  price?: number;
  stock?: number;
};

const CATEGORIES = [
  "All",
  "Professional Blades",
  "Saw Blades",
  "Core Bits",
  "Concrete Polisher",
  "Grinding Products",
  "Turbo Blades",
  "Tile Blades",
  "Tuck Points",
  "Stone Products",
  "ZENESIS™",
  "DIAMONDX™"
];

function getCategoryFallbackImage(category: string): string {
  const cat = (category || '').toLowerCase();
  if (cat.includes('core')) return '/images/core_bit.png';
  if (cat.includes('cup') || cat.includes('grind') || cat.includes('tuck') || cat.includes('polish')) return '/images/tuck_point.jpg';
  if (cat.includes('turbo') || cat.includes('tile')) return '/images/turbo_blade.png';
  if (cat.includes('rim')) return '/images/continuous_rim_blade.png';
  return '/images/saw_blade.jpg';
}

function ShopContent() {
  const searchParams = useSearchParams();
  const initialCat = searchParams.get('category') || "All";

  const [products, setProducts] = useState<ParsedProduct[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ParsedProduct | null>(null);

  useEffect(() => {
    if (initialCat) {
      const matched = CATEGORIES.find(c => c.toLowerCase() === initialCat.toLowerCase() || c.toLowerCase().includes(initialCat.toLowerCase()));
      if (matched) setActiveCategory(matched);
    }
  }, [initialCat]);

  useEffect(() => {
    // Page view counter
    const views = parseInt(localStorage.getItem('td_public_views') || '0', 10);
    const newViews = views + 1;
    localStorage.setItem('td_public_views', newViews.toString());

    if (newViews >= 10) {
      setShowLoginModal(true);
    }

    // Fetch products & SKU Map
    const fetchProducts = async () => {
      try {
        let skuMap: Record<string, string> = {};
        try {
          const mapRes = await fetch('/sku_map.json');
          if (mapRes.ok) skuMap = await mapRes.json();
        } catch (e) {
          console.warn("Could not load sku_map.json", e);
        }

        const res = await fetch('/api/get-products');
        if (res.ok) {
          const data = await res.json();
          const rawList = Array.isArray(data) ? data : (data.products || []);
          
          const parsedList: ParsedProduct[] = rawList.map((item: Product) => {
            let img = item.imageUrl || '';
            let textDesc = '';

            if (item.description) {
              try {
                if (item.description.startsWith('{')) {
                  const parsed = JSON.parse(item.description);
                  if (parsed.image && !parsed.image.includes('placeholder')) {
                    img = parsed.image;
                  }
                  textDesc = parsed.text || parsed.pertinentInfo || '';
                } else {
                  textDesc = item.description;
                }
              } catch {
                textDesc = item.description;
              }
            }

            // Check SKU Map for exact filename match (.jpg, .png, etc.)
            const cleanSku = (item.sku || '').trim().toUpperCase();
            if (skuMap[cleanSku]) {
              img = `/product-images/${skuMap[cleanSku]}`;
            } else if (!img || img.includes('placeholder')) {
              img = `/product-images/${item.sku}.png`;
            }

            return {
              id: item.id || item.sku,
              name: item.name,
              sku: item.sku,
              category: item.category || 'General',
              imageUrl: img,
              textDescription: textDesc,
              price: item.price,
              stock: item.stock
            };
          });

          setProducts(parsedList);
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
    
    let matchesCategory = activeCategory === "All";
    if (!matchesCategory) {
      const catLower = activeCategory.toLowerCase();
      const prodCatLower = product.category.toLowerCase();
      matchesCategory = prodCatLower.includes(catLower) || catLower.includes(prodCatLower);
    }

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative">
      {/* 10 Page View Limit Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border border-amber-500/30 rounded-3xl p-8 max-w-md w-full text-center shadow-[0_0_50px_rgba(245,158,11,0.15)] relative overflow-hidden">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-amber-400">
              <FiLock size={32} />
            </div>
            <h2 className="text-2xl font-black mb-2 text-white">Contractor Access Required</h2>
            <p className="text-neutral-400 text-sm mb-8 leading-relaxed">
              You&apos;ve reached the preview limit. Sign in to access full specs, live stock levels, and wholesale contractor pricing.
            </p>
            <div className="flex flex-col gap-3">
              <Link 
                href="/login"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg hover:shadow-orange-500/25 flex items-center justify-center gap-2"
              >
                Sign In to View Contractor Rates <FiArrowRight />
              </Link>
              <a 
                href="tel:18005550199"
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors border border-white/10 flex items-center justify-center gap-2 text-sm"
              >
                <FiPhone /> Call Direct Sales (800) 555-0199
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Quick Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSelectedProduct(null)}>
          <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-2xl w-full text-left shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedProduct(null)} 
              className="absolute top-4 right-4 text-neutral-400 hover:text-white text-xl font-bold w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center"
            >
              ✕
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-64 bg-neutral-950 border border-white/5 rounded-2xl flex items-center justify-center p-4 relative overflow-hidden">
                <img 
                  src={selectedProduct.imageUrl} 
                  alt={selectedProduct.name}
                  className="max-h-full max-w-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes('/images/')) {
                      target.src = getCategoryFallbackImage(selectedProduct.category);
                    }
                  }}
                />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full inline-block mb-3">
                  {selectedProduct.category}
                </span>
                <h3 className="text-xl font-bold mb-2 text-white">{selectedProduct.name}</h3>
                <div className="text-xs font-mono text-neutral-400 mb-4 flex items-center gap-2">
                  <FiTag className="text-amber-500" /> SKU: {selectedProduct.sku}
                </div>
                {selectedProduct.textDescription && (
                  <p className="text-xs text-neutral-300 mb-6 leading-relaxed bg-neutral-950 p-3 rounded-xl border border-white/5">
                    {selectedProduct.textDescription}
                  </p>
                )}
                
                <div className="p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl mb-6">
                  <div className="text-xs text-amber-400 font-bold mb-1 flex items-center gap-1.5">
                    <FiLock size={12} /> Contractor Pricing Hidden
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Sign in with your Titan account to unlock wholesale pricing and immediate shipping.
                  </div>
                </div>

                <div className="flex gap-3">
                  <Link 
                    href="/login"
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold py-2.5 px-4 rounded-xl text-center text-xs transition-all"
                  >
                    Log In to Purchase
                  </Link>
                  <Link 
                    href="/contact"
                    className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors border border-white/10"
                  >
                    Request Quote
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-block mb-3">
            Industrial Grade Diamond Tooling
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
            TITAN DIAMOND USA CATALOG
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed">
            Engineered for maximum cutting speed, laser-welded durability, and concrete jobsite reliability.
          </p>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center mb-8 bg-neutral-900/50 p-4 border border-white/5 rounded-2xl">
          <div className="relative w-full md:w-80">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search products or SKUs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                  activeCategory === category
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                    : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-white/5'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
            <span className="text-xs text-neutral-500 font-mono">Loading Titan Diamond Catalog...</span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-neutral-900/30 rounded-3xl border border-white/5">
            <FiBox className="mx-auto text-neutral-600 mb-3" size={40} />
            <h3 className="text-lg font-bold text-white mb-1">No products found</h3>
            <p className="text-xs text-neutral-500 mb-4">Try adjusting your category filter or search query.</p>
            <button 
              onClick={() => { setSearch(''); setActiveCategory('All'); }}
              className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map(product => (
              <div 
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="bg-neutral-900/80 border border-white/5 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col cursor-pointer group"
              >
                <div className="h-52 bg-gradient-to-b from-neutral-950 to-neutral-900/90 flex items-center justify-center p-6 relative border-b border-white/5 overflow-hidden">
                  <img 
                    src={product.imageUrl} 
                    alt={product.name} 
                    className="max-h-full max-w-full object-contain filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)] group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('/images/')) {
                        target.src = getCategoryFallbackImage(product.category);
                      }
                    }}
                  />
                  <div className="absolute top-3 left-3">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider bg-neutral-950/80 backdrop-blur-md text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md">
                      {product.category}
                    </span>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-neutral-500 mb-1">SKU: {product.sku}</div>
                    <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors line-clamp-2 mb-2">
                      {product.name}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400/90 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                      <FiLock size={10} /> Contractor Rates
                    </div>
                    <span className="text-xs font-semibold text-neutral-400 group-hover:text-white transition-colors flex items-center gap-1">
                      Details <FiArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShopClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
      </div>
    }>
      <ShopContent />
    </Suspense>
  );
}
