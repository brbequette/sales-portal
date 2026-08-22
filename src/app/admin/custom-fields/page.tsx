'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { 
  FiDatabase, 
  FiSearch, 
  FiFilter, 
  FiRefreshCw, 
  FiCheckCircle, 
  FiXCircle, 
  FiEdit3, 
  FiSave, 
  FiX, 
  FiShield, 
  FiCode, 
  FiTag, 
  FiLayers 
} from 'react-icons/fi';


interface CustomField {
  id: string;
  entity: string;
  label: string;
  apiName: string;
  customfieldId: string | null;
  internalKey: string;
  dataType: string;
  isActive: boolean;
  description: string | null;
  updatedAt: string;
}

export default function AdminCustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortKey, setSortKey] = useState<'entity' | 'label' | 'apiName' | 'internalKey' | 'dataType'>('entity');

  const entities = ['ALL', 'INVOICE', 'SALESORDER', 'ESTIMATE', 'ITEM', 'ACCOUNT', 'DEAL'];

  const fetchCustomFields = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/custom-fields', window.location.origin);
      if (selectedEntity !== 'ALL') url.searchParams.set('entity', selectedEntity);
      if (searchQuery) url.searchParams.set('search', searchQuery);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setFields(data.fields || []);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load fields' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error fetching fields' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomFields();
  }, [selectedEntity]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomFields();
  };

  const handleToggleActive = async (field: CustomField) => {
    try {
      const res = await fetch('/api/admin/custom-fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: field.id,
          isActive: !field.isActive
        })
      });
      const data = await res.json();
      if (data.success) {
        setFields(prev => prev.map(f => f.id === field.id ? { ...f, isActive: !f.isActive } : f));
        setMessage({ type: 'success', text: `Field '${field.label}' ${!field.isActive ? 'activated' : 'deactivated'}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to update field status' });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/custom-fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingField.id,
          label: editingField.label,
          internalKey: editingField.internalKey,
          dataType: editingField.dataType,
          description: editingField.description
        })
      });
      const data = await res.json();
      if (data.success) {
        setFields(prev => prev.map(f => f.id === editingField.id ? editingField : f));
        setEditingField(null);
        setMessage({ type: 'success', text: `Updated mapping for '${editingField.label}'` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Update failed' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error saving changes' });
    } finally {
      setSaving(false);
    }
  };

  // Stats calculation
  const totalCount = fields.length;
  const activeCount = fields.filter(f => f.isActive).length;
  const invoiceCount = fields.filter(f => f.entity === 'INVOICE').length;
  const soCount = fields.filter(f => f.entity === 'SALESORDER').length;
  const visibleFields = useMemo(() => fields
    .filter((field) => statusFilter === 'all' || (statusFilter === 'active' ? field.isActive : !field.isActive))
    .sort((a, b) => String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''))),
  [fields, statusFilter, sortKey]);

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
            <FiDatabase className="text-blue-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">Custom Fields Catalog</h1>
            <p className="page-subtitle">Manage, catalog, and standardize custom field mappings across Zoho Books & CRM entities</p>
          </div>
        </div>
        <button
          onClick={fetchCustomFields}
          disabled={loading}
          className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition"
        >
          <FiRefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Catalog
        </button>
      </div>

      <div className="page-body">
        <div className="space-y-6">
          {/* Alert Messages */}
          {message && (
            <div className={`p-4 rounded-xl flex items-center justify-between border ${
              message.type === 'success' ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}>
              <div className="flex items-center space-x-2">
                {message.type === 'success' ? <FiCheckCircle className="w-5 h-5" /> : <FiXCircle className="w-5 h-5" />}
                <span className="text-sm font-medium">{message.text}</span>
              </div>
              <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-4">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <FiLayers className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{totalCount}</div>
                <div className="text-xs text-slate-400 font-medium">Total Cataloged Fields</div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <FiShield className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{activeCount}</div>
                <div className="text-xs text-slate-400 font-medium">Active Mappings</div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-4">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
                <FiTag className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{invoiceCount}</div>
                <div className="text-xs text-slate-400 font-medium">Invoice Fields</div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-4">
              <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-lg">
                <FiCode className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{soCount}</div>
                <div className="text-xs text-slate-400 font-medium">Sales Order Fields</div>
              </div>
            </div>
          </div>

          {/* Filter Tabs & Search */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-xl">
            {/* Entity Tabs */}
            <div className="flex flex-wrap gap-1">
              {entities.map(e => (
                <button
                  key={e}
                  onClick={() => setSelectedEntity(e)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    selectedEntity === e
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
                <FiSearch className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search label, API, key..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </form>
              <select aria-label="Filter custom fields by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200">
                <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
              <select aria-label="Sort custom fields" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200">
                <option value="entity">Entity</option><option value="label">Label</option><option value="apiName">API name</option><option value="internalKey">Internal key</option><option value="dataType">Data type</option>
              </select>
              <span className="self-center whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-500">{visibleFields.length} results</span>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Entity</th>
                    <th className="py-3.5 px-4">Field Label</th>
                    <th className="py-3.5 px-4">Canonical API Name</th>
                    <th className="py-3.5 px-4">Custom Field ID</th>
                    <th className="py-3.5 px-4">Normalized Internal Key</th>
                    <th className="py-3.5 px-4">Data Type</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <FiRefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Loading custom field catalog...
                      </td>
                    </tr>
                  ) : visibleFields.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No custom fields found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    visibleFields.map(f => (
                      <tr key={f.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            f.entity === 'INVOICE' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            f.entity === 'SALESORDER' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                            f.entity === 'ESTIMATE' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            f.entity === 'ITEM' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                            'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {f.entity}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">{f.label}</td>
                        <td className="py-3 px-4 font-mono text-blue-300">{f.apiName || '—'}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{f.customfieldId || '—'}</td>
                        <td className="py-3 px-4">
                          <span className="bg-slate-950 px-2 py-1 rounded font-mono text-emerald-400 border border-slate-800">
                            {f.internalKey}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400 uppercase text-[10px]">{f.dataType}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleToggleActive(f)}
                            className={`px-2 py-1 rounded-full text-[10px] font-bold transition border ${
                              f.isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {f.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setEditingField(f)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                            title="Edit Field Mapping"
                          >
                            <FiEdit3 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Field Modal */}
      {editingField && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <FiEdit3 className="w-5 h-5 text-blue-400" />
                <span>Configure Field: {editingField.label}</span>
              </h3>
              <button onClick={() => setEditingField(null)} className="text-slate-400 hover:text-white">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Field Label</label>
                <input
                  type="text"
                  value={editingField.label}
                  onChange={e => setEditingField({ ...editingField, label: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Normalized Internal Key</label>
                <input
                  type="text"
                  value={editingField.internalKey}
                  onChange={e => setEditingField({ ...editingField, internalKey: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Standard property key used in JSON items and API responses</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Canonical API Name</label>
                  <input
                    type="text"
                    disabled
                    value={editingField.apiName}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-500 font-mono cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Data Type</label>
                  <input
                    type="text"
                    value={editingField.dataType}
                    onChange={e => setEditingField({ ...editingField, dataType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Description / Notes</label>
                <textarea
                  rows={3}
                  value={editingField.description || ''}
                  onChange={e => setEditingField({ ...editingField, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="Describe field usage or mapping rationale..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingField(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
              >
                <FiSave className="w-3.5 h-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
