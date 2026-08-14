"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiArrowLeft, FiPlus, FiTrash2, FiToggleLeft, FiToggleRight, FiEdit2, FiInfo, FiCheck, FiX, FiSliders, FiPlay } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

interface CustomTool {
  id: string;
  name: string;
  description: string;
  parameters: any;
  endpointUrl: string;
  method: string;
  bodyTemplate?: string | null;
  isActive: boolean;
  createdAt: string;
}

const DEFAULT_PARAMETERS = {
  type: "object",
  properties: {
    param1: {
      type: "string",
      description: "Description of param1"
    }
  },
  required: ["param1"]
};

export default function AiToolsAdminPage() {
  const [tools, setTools] = useState<CustomTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [method, setMethod] = useState('POST');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [parametersStr, setParametersStr] = useState(JSON.stringify(DEFAULT_PARAMETERS, null, 2));
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-tools');
      const data = await res.json();
      if (data.success) {
        setTools(data.tools || []);
      } else {
        toast.error("Failed to load tools: " + data.error);
      }
    } catch (e: any) {
      toast.error("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    let parsedParams: any;
    try {
      parsedParams = JSON.parse(parametersStr);
    } catch {
      toast.error("Parameters must be a valid JSON object");
      return;
    }

    if (bodyTemplate) {
      try {
        JSON.parse(bodyTemplate);
      } catch {
        toast.error("Body template must be empty or a valid JSON template string");
        return;
      }
    }

    const payload = {
      id: editingId,
      name,
      description,
      parameters: parsedParams,
      endpointUrl,
      method,
      bodyTemplate: bodyTemplate || null,
      isActive
    };

    try {
      const res = await fetch('/api/admin/ai-tools', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        toast.success(editingId ? "Tool updated successfully!" : "New tool created!");
        resetForm();
        fetchTools();
      } else {
        toast.error(data.error || "Save failed");
      }
    } catch (e: any) {
      toast.error("Error saving tool: " + e.message);
    }
  };

  const handleEdit = (tool: CustomTool) => {
    setIsEditing(true);
    setEditingId(tool.id);
    setName(tool.name);
    setDescription(tool.description);
    setEndpointUrl(tool.endpointUrl);
    setMethod(tool.method);
    setBodyTemplate(tool.bodyTemplate || '');
    setParametersStr(JSON.stringify(tool.parameters, null, 2));
    setIsActive(tool.isActive);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this custom tool? The AI will immediately lose the ability to perform this action.")) return;

    try {
      const res = await fetch(`/api/admin/ai-tools?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success("Tool deleted!");
        fetchTools();
      } else {
        toast.error(data.error || "Delete failed");
      }
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };

  const toggleStatus = async (tool: CustomTool) => {
    try {
      const res = await fetch('/api/admin/ai-tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tool.id, isActive: !tool.isActive })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(tool.isActive ? "Tool deactivated" : "Tool activated");
        fetchTools();
      } else {
        toast.error(data.error);
      }
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setName('');
    setDescription('');
    setEndpointUrl('');
    setMethod('POST');
    setBodyTemplate('');
    setParametersStr(JSON.stringify(DEFAULT_PARAMETERS, null, 2));
    setIsActive(true);
  };

  return (
    <div className="min-h-screen bg-[#0d0e10] text-neutral-100 p-6 md:p-12">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/admin" className="text-xs text-neutral-500 hover:text-amber-400 flex items-center gap-1.5 mb-2 font-mono transition-colors">
            <FiArrowLeft /> Back to Admin
          </Link>
          <h1 className="text-3xl font-black uppercase text-white tracking-wider flex items-center gap-3">
            AI Custom Tools
            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
              Dynamic Mappings
            </span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
            Expose internal API endpoints and Zoho actions directly to the Titan AI assistant. Custom tools are loaded dynamically when the assistant initiates a chat request.
          </p>
        </div>

        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black rounded-xl text-sm shadow-md transition-all self-start md:self-auto"
          >
            <FiPlus size={16} /> ADD CUSTOM FUNCTION
          </button>
        )}
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor Form Panel */}
        {isEditing && (
          <div className="lg:col-span-1 glass-panel border border-white/10 rounded-2xl p-6 h-fit space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <h2 className="text-sm font-black uppercase text-white tracking-wider">
                {editingId ? 'Edit Custom Tool' : 'Create Custom Tool'}
              </h2>
              <button onClick={resetForm} className="text-neutral-500 hover:text-white transition">
                <FiX size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdate} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider block mb-1">
                  Function Name (alphanumeric & underscores only)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. recalculate_timecard"
                  disabled={!!editingId}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider block mb-1">
                  Function Description (Instructs GPT when to call this tool)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Recalculates timecard details for a specific user and month. Use when user asks to fix timecard totals."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider block mb-1">
                    HTTP Method
                  </label>
                  <select
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider block mb-1">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. /api/timeclock/recalculate"
                    value={endpointUrl}
                    onChange={e => setEndpointUrl(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider block">
                    Parameters schema (JSON Schema Object)
                  </label>
                  <a href="https://openai.com/blog/function-calling-and-other-api-updates" target="_blank" rel="noreferrer" className="text-[9px] text-amber-500 hover:underline flex items-center gap-0.5">
                    <FiInfo size={10} /> OpenAI Spec
                  </a>
                </div>
                <textarea
                  rows={6}
                  required
                  value={parametersStr}
                  onChange={e => setParametersStr(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-[10px] font-mono text-emerald-400 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider block mb-1">
                  Body Template JSON (Optional, supports variables)
                </label>
                <textarea
                  rows={3}
                  placeholder='e.g. { "userId": "{{repId}}", "monthKey": "{{monthKey}}" }'
                  value={bodyTemplate}
                  onChange={e => setBodyTemplate(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-[10px] font-mono text-cyan-400 placeholder-neutral-700 focus:outline-none focus:border-amber-500/50"
                />
                <span className="text-[9px] text-neutral-500 mt-1 block">
                  Use `{"{{param}}"}` to inject values parsed by AI. Also supports global `{"{{userId}}"}` and `{"{{userRole}}"}` helpers.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="rounded border-white/10 bg-black text-amber-500 focus:ring-0 focus:ring-offset-0"
                />
                <label htmlFor="isActive" className="text-xs text-neutral-300 select-none cursor-pointer">
                  Activate this function immediately
                </label>
              </div>

              <div className="flex gap-2 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2 text-xs bg-neutral-900 hover:bg-neutral-800 border border-white/5 text-neutral-400 hover:text-white rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black rounded-xl transition"
                >
                  Save Tool
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Custom Tools Grid List */}
        <div className={isEditing ? 'lg:col-span-2 space-y-4' : 'lg:col-span-3 space-y-4'}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-sm">Retrieving registered tools...</span>
            </div>
          ) : tools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border border-white/5 rounded-2xl text-neutral-600 text-center">
              <FiSliders size={40} className="mb-4 opacity-40" />
              <span className="text-base font-bold text-white mb-1">No custom tools registered</span>
              <span className="text-xs max-w-sm">
                Expose dynamic CRUD functions and custom webhook automation handlers to the AI assistant to give it custom abilities.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tools.map(tool => (
                <div
                  key={tool.id}
                  className={`glass-panel border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 ${
                    tool.isActive 
                      ? 'border-white/10 hover:border-amber-500/30' 
                      : 'border-white/5 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-black uppercase text-white tracking-wider font-mono">
                        {tool.name}
                      </h3>
                      <button
                        onClick={() => toggleStatus(tool)}
                        className="text-neutral-500 hover:text-white transition-colors"
                        title={tool.isActive ? 'Deactivate tool' : 'Activate tool'}
                      >
                        {tool.isActive ? (
                          <FiToggleRight size={22} className="text-emerald-500" />
                        ) : (
                          <FiToggleLeft size={22} className="text-neutral-600" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                      {tool.description}
                    </p>

                    <div className="space-y-1.5 mb-4 text-[10px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500">METHOD:</span>
                        <span className="text-blue-400 font-bold">{tool.method}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500">ENDPOINT:</span>
                        <span className="text-neutral-300 truncate max-w-[240px]" title={tool.endpointUrl}>
                          {tool.endpointUrl}
                        </span>
                      </div>
                      {tool.bodyTemplate && (
                        <div className="flex items-start gap-1.5">
                          <span className="text-neutral-500">TEMPLATE:</span>
                          <span className="text-cyan-500 truncate max-w-[240px]" title={tool.bodyTemplate}>
                            {tool.bodyTemplate}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-white/5 mt-auto">
                    <span className="text-[9px] text-neutral-600 font-mono">
                      Added: {new Date(tool.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(tool)}
                        className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 hover:border-amber-500/30 rounded-xl transition text-neutral-400 hover:text-white"
                        title="Edit Function"
                      >
                        <FiEdit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(tool.id)}
                        className="p-2 bg-neutral-900 hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 rounded-xl transition text-neutral-500 hover:text-red-400"
                        title="Delete Function"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
