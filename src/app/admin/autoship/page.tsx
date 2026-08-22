'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiX } from 'react-icons/fi';

export default function AutoshipBundleManagement() {
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [discountPct, setDiscountPct] = useState(10);
  const [items, setItems] = useState<any[]>([]);

  // Product picker state
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [bundleSearch, setBundleSearch] = useState('');
  const [bundleStatus, setBundleStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [bundleSort, setBundleSort] = useState<'name' | 'items' | 'discount' | 'subscriptions'>('name');

  useEffect(() => {
    fetchBundles();
  }, []);

  const fetchBundles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/autoship-bundles');
      const data = await res.json();
      if (data.success) {
        setBundles(data.bundles);
      }
    } catch (error) {
      console.error('Error fetching bundles:', error);
    }
    setLoading(false);
  };

  const searchProducts = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setProducts([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/get-products?search=${encodeURIComponent(query)}`);
      if (res.ok) {
          const data = await res.json();
          // Adjust based on your get-products response structure
          setProducts(data.products || data || []); 
      }
    } catch (error) {
      console.error('Error searching products:', error);
    }
    setSearching(false);
  };

  const handleOpenModal = (bundle: any = null) => {
    if (bundle) {
      setEditingBundle(bundle);
      setName(bundle.name);
      setDescription(bundle.description || '');
      setFrequency(bundle.frequency);
      setDiscountPct(bundle.discountPct);
      setItems(bundle.items || []);
    } else {
      setEditingBundle(null);
      setName('');
      setDescription('');
      setFrequency('monthly');
      setDiscountPct(10);
      setItems([]);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSearchQuery('');
    setProducts([]);
  };

  const handleAddItem = (product: any) => {
    // Check if already added
    if (items.find((i) => i.sku === product.sku)) return;

    setItems([...items, { sku: product.sku, name: product.name, qty: 1, unitPrice: product.price || 0 }]);
    setSearchQuery('');
    setProducts([]);
  };

  const handleRemoveItem = (sku: string) => {
    setItems(items.filter(item => item.sku !== sku));
  };

  const handleItemQtyChange = (sku: string, qty: number) => {
    setItems(items.map(item => item.sku === sku ? { ...item, qty: Math.max(1, qty) } : item));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name, description, frequency, discountPct, items };
      let res;
      if (editingBundle) {
        res = await fetch('/api/admin/autoship-bundles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingBundle.id, ...payload })
        });
      } else {
        res = await fetch('/api/admin/autoship-bundles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        handleCloseModal();
        fetchBundles();
      }
    } catch (error) {
      console.error('Error saving bundle:', error);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this bundle?')) return;
    try {
      const res = await fetch(`/api/admin/autoship-bundles?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchBundles();
      }
    } catch (error) {
      console.error('Error deactivating bundle:', error);
    }
  };

  // Summary stats
  const totalBundles = bundles.length;
  const activeBundles = bundles.filter(b => b.isActive).length;
  const totalSubs = bundles.reduce((acc, b) => acc + (b._count?.subscriptions || 0), 0);
  const visibleBundles = useMemo(() => {
    const query = bundleSearch.trim().toLowerCase();
    return bundles
      .filter((bundle) => {
        if (bundleStatus === 'active' && !bundle.isActive) return false;
        if (bundleStatus === 'inactive' && bundle.isActive) return false;
        if (!query) return true;
        const itemNames = Array.isArray(bundle.items) ? bundle.items.map((item: any) => `${item.name || ''} ${item.sku || ''}`).join(' ') : '';
        return `${bundle.name || ''} ${bundle.description || ''} ${bundle.frequency || ''} ${itemNames}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (bundleSort === 'items') return (b.items?.length || 0) - (a.items?.length || 0);
        if (bundleSort === 'discount') return (b.discountPct || 0) - (a.discountPct || 0);
        if (bundleSort === 'subscriptions') return (b._count?.subscriptions || 0) - (a._count?.subscriptions || 0);
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [bundles, bundleSearch, bundleStatus, bundleSort]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Autoship Bundle Management</h1>
            <p className="text-neutral-400 mt-2">Manage subscription packages and product bundles.</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl transition-colors font-medium"
          >
            <FiPlus />
            Create Bundle
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
            <p className="text-neutral-400 text-sm">Total Bundles</p>
            <p className="text-3xl font-bold mt-2">{totalBundles}</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
            <p className="text-neutral-400 text-sm">Active Bundles</p>
            <p className="text-3xl font-bold mt-2 text-emerald-400">{activeBundles}</p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
            <p className="text-neutral-400 text-sm">Active Subscriptions</p>
            <p className="text-3xl font-bold mt-2 text-amber-400">{totalSubs}</p>
          </div>
        </div>

        {/* Bundles Table */}
        <div className="glass-panel rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-neutral-800 p-4 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search autoship bundles</span>
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input value={bundleSearch} onChange={(event) => setBundleSearch(event.target.value)} placeholder="Search bundle, frequency, product, or SKU..." className="w-full rounded-lg border border-neutral-800 bg-neutral-950 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-amber-500" />
            </label>
            <select aria-label="Filter bundles by status" value={bundleStatus} onChange={(event) => setBundleStatus(event.target.value as typeof bundleStatus)} className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm">
              <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
            <select aria-label="Sort autoship bundles" value={bundleSort} onChange={(event) => setBundleSort(event.target.value as typeof bundleSort)} className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm">
              <option value="name">Name A–Z</option><option value="items">Most items</option><option value="discount">Highest discount</option><option value="subscriptions">Most subscriptions</option>
            </select>
            <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-neutral-500">{visibleBundles.length} results</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/50">
                  <th className="px-6 py-4 font-medium text-neutral-300">Name</th>
                  <th className="px-6 py-4 font-medium text-neutral-300">Items Count</th>
                  <th className="px-6 py-4 font-medium text-neutral-300">Frequency</th>
                  <th className="px-6 py-4 font-medium text-neutral-300">Discount %</th>
                  <th className="px-6 py-4 font-medium text-neutral-300">Active Subs</th>
                  <th className="px-6 py-4 font-medium text-neutral-300">Status</th>
                  <th className="px-6 py-4 font-medium text-neutral-300 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-neutral-400">Loading bundles...</td></tr>
                ) : visibleBundles.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-neutral-400">No bundles found.</td></tr>
                ) : (
                  visibleBundles.map((bundle) => (
                    <tr key={bundle.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium">{bundle.name}</p>
                        {bundle.description && <p className="text-xs text-neutral-500 truncate max-w-xs">{bundle.description}</p>}
                      </td>
                      <td className="px-6 py-4">{Array.isArray(bundle.items) ? bundle.items.length : 0} items</td>
                      <td className="px-6 py-4 capitalize">{bundle.frequency}</td>
                      <td className="px-6 py-4">{bundle.discountPct}%</td>
                      <td className="px-6 py-4">{bundle._count?.subscriptions || 0}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${bundle.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {bundle.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => handleOpenModal(bundle)} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                            <FiEdit2 />
                          </button>
                          {bundle.isActive && (
                            <button onClick={() => handleDeactivate(bundle.id)} className="p-2 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-neutral-900/90 backdrop-blur border-b border-neutral-800 p-6 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold">{editingBundle ? 'Edit Bundle' : 'Create Bundle'}</h2>
              <button onClick={handleCloseModal} className="p-2 text-neutral-400 hover:text-white rounded-lg">
                <FiX size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Bundle Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 focus:outline-none focus:border-amber-500 transition-colors"
                    placeholder="e.g. Monthly Wellness Pack"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 focus:outline-none focus:border-amber-500 transition-colors h-24 resize-none"
                    placeholder="Short description of this bundle..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Frequency</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 focus:outline-none focus:border-amber-500 transition-colors appearance-none"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="biannual">Biannual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Discount %</label>
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(Number(e.target.value))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Items Section */}
              <div className="border-t border-neutral-800 pt-6">
                <h3 className="text-lg font-semibold mb-4">Bundle Items</h3>
                
                {/* Product Search */}
                <div className="relative mb-6">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => searchProducts(e.target.value)}
                      placeholder="Search products to add..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                  
                  {/* Search Results Dropdown */}
                  {searchQuery.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20">
                      {searching ? (
                        <div className="p-4 text-center text-sm text-neutral-400">Searching...</div>
                      ) : products.length > 0 ? (
                        products.map(product => (
                          <button
                            key={product.sku || product.id}
                            type="button"
                            onClick={() => handleAddItem(product)}
                            className="w-full text-left px-4 py-3 hover:bg-neutral-800 flex justify-between items-center transition-colors border-b border-neutral-800/50 last:border-0"
                          >
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-xs text-neutral-500">SKU: {product.sku}</p>
                            </div>
                            <span className="text-amber-400">${product.price || 0}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-neutral-400">No products found</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Added Items List */}
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <p className="text-center py-4 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                      No items added yet. Search above to add products.
                    </p>
                  ) : (
                    items.map(item => (
                      <div key={item.sku} className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.name}</p>
                          <div className="flex gap-4 mt-1 text-xs text-neutral-500">
                            <span>SKU: {item.sku}</span>
                            <span>Price: ${item.unitPrice}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-neutral-400">Qty:</label>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => handleItemQtyChange(item.sku, parseInt(e.target.value) || 1)}
                              className="w-16 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500 text-center"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.sku)}
                            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          >
                            <FiX />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="pt-6 border-t border-neutral-800 flex justify-end gap-3 sticky bottom-0 bg-neutral-900 pb-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={items.length === 0}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded-xl transition-colors font-medium"
                >
                  Save Bundle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
