"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  FiDollarSign, 
  FiClock, 
  FiFileText, 
  FiPlus, 
  FiCheck, 
  FiX, 
  FiAlertCircle, 
  FiSend, 
  FiUser, 
  FiTarget, 
  FiCalendar, 
  FiRefreshCw 
} from 'react-icons/fi';

// Types
interface RepData {
  repId: string;
  repName: string;
  email: string;
}

interface CompensationPlan {
  payType: string;
  baseAmount: number;
  baseInterval: string;
  commissionEnabled: boolean;
  commissionRate: number;
  commissionBasis: string;
  payoutStructure: string;
  commitmentEnabled: boolean;
  commitmentMetric: string;
  commitmentTarget: number;
  commitmentVigRate: number;
  startDate: string;
  notes: string;
}

interface BasePayEarning {
  type: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  hoursWorked?: number;
  hourlyRate?: number;
  description: string;
  status: string;
}

interface Advance {
  id: string;
  amount: number;
  reason: string;
  issueDate: string;
  deductionRate: number;
  termWeeks: number;
  termEndDate: string;
  agreedPayback: number;
  amountPaidBack: number;
  isFullyPaid: boolean;
  extensions?: any[];
}

interface Reimbursement {
  id: string;
  amount: number;
  description: string;
  status: string;
  dateSubmitted: string;
}

function PortalContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [repData, setRepData] = useState<RepData | null>(null);
  const [plan, setPlan] = useState<CompensationPlan | null>(null);
  const [earnings, setEarnings] = useState<BasePayEarning[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  
  const [activeTab, setActiveTab] = useState('plan');

  // Forms State
  const [reimburseDesc, setReimburseDesc] = useState('');
  const [reimburseAmount, setReimburseAmount] = useState('');
  const [reimburseSubmitting, setReimburseSubmitting] = useState(false);

  const [extendingAdvanceId, setExtendingAdvanceId] = useState<string | null>(null);
  const [extensionWeeks, setExtensionWeeks] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionSubmitting, setExtensionSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No magic link token provided. Please use the link sent to your email.");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const verifyRes = await fetch(`/api/rep-portal/verify?token=${token}`);
        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          setError(verifyData.error || "Invalid or expired token.");
          setLoading(false);
          return;
        }

        setRepData({
          repId: verifyData.repId,
          repName: verifyData.repName,
          email: verifyData.email
        });

        const repId = verifyData.repId;

        // Fetch everything else
        const [planRes, earnRes, advRes, reimbRes] = await Promise.all([
          fetch(`/api/compensation-plans?repId=${repId}&status=ACTIVE`),
          fetch(`/api/base-pay-earnings?repId=${repId}`),
          fetch(`/api/manage-advances?userId=${repId}`),
          fetch(`/api/manage-reimbursements?userId=${repId}`)
        ]);

        const planData = await planRes.json();
        const earnData = await earnRes.json();
        const advData = await advRes.json();
        const reimbData = await reimbRes.json();

        if (planData.success && planData.data?.length > 0) {
          setPlan(planData.data[0]);
        }
        if (earnData.success) setEarnings(earnData.data);
        if (advData.success) setAdvances(advData.data);
        if (reimbData.success) setReimbursements(reimbData.data);

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Failed to load portal data. Please try again later.");
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const submitReimbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repData || !reimburseAmount || !reimburseDesc) return;
    
    setReimburseSubmitting(true);
    try {
      const res = await fetch('/api/manage-reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: repData.repId,
          amount: parseFloat(reimburseAmount),
          description: reimburseDesc,
          status: 'PENDING'
        })
      });
      const data = await res.json();
      if (data.success) {
        // Optimistic update or refetch
        setReimbursements([{
          id: Date.now().toString(),
          amount: parseFloat(reimburseAmount),
          description: reimburseDesc,
          status: 'PENDING',
          dateSubmitted: new Date().toISOString()
        }, ...reimbursements]);
        setReimburseDesc('');
        setReimburseAmount('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReimburseSubmitting(false);
    }
  };

  const submitExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repData || !extendingAdvanceId || !extensionWeeks || !extensionReason) return;
    
    setExtensionSubmitting(true);
    try {
      const res = await fetch('/api/advance-extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advanceId: extendingAdvanceId,
          requestedBy: repData.repId,
          additionalWeeks: parseInt(extensionWeeks, 10),
          reason: extensionReason
        })
      });
      const data = await res.json();
      if (data.success) {
        setExtendingAdvanceId(null);
        setExtensionWeeks('');
        setExtensionReason('');
        // You could refresh advances here
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExtensionSubmitting(false);
    }
  };

  const formatCurrency = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 to-neutral-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center">
          <FiRefreshCw className="animate-spin text-4xl text-emerald-500 mb-4" />
          <p className="text-neutral-400">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 to-neutral-900 flex items-center justify-center p-4">
        <div className="bg-white/[0.03] backdrop-blur border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <FiAlertCircle className="text-red-500 text-5xl mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-neutral-400">{error}</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'plan', label: 'My Plan', icon: <FiFileText /> },
    { id: 'earnings', label: 'Earnings', icon: <FiDollarSign /> },
    { id: 'advances', label: 'Advances', icon: <FiTarget /> },
    { id: 'reimbursements', label: 'Reimbursements', icon: <FiSend /> }
  ];

  const totalEarned = earnings.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalPaid = earnings.filter(e => e.status === 'PAID').reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalPending = earnings.filter(e => e.status === 'PENDING').reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 to-neutral-900 text-neutral-100 font-sans pb-20">
      
      {/* Header */}
      <div className="border-b border-white/10 bg-white/[0.02] sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FiUser className="text-xl" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Titan Diamond</h1>
              <p className="text-sm text-neutral-400">Welcome, {repData?.repName}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-6 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-emerald-500 text-emerald-400' 
                    : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* TAB: PLAN */}
        {activeTab === 'plan' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {!plan ? (
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
                <FiFileText className="text-4xl text-neutral-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Active Plan</h3>
                <p className="text-neutral-400">You do not have an active compensation plan. Please contact your manager.</p>
              </div>
            ) : (
              <div className="bg-white/[0.03] backdrop-blur border border-white/10 rounded-2xl p-6 md:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                  <FiFileText className="text-9xl text-white" />
                </div>
                
                <div className="flex items-center gap-3 mb-8">
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full uppercase tracking-wider border border-emerald-500/30">
                    {plan.payType}
                  </span>
                  <span className="text-sm text-neutral-400 flex items-center gap-1">
                    <FiCalendar /> Started {formatDate(plan.startDate)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm text-neutral-400 uppercase tracking-wider font-semibold mb-1">Base Pay</h4>
                      <p className="text-2xl font-light text-white">
                        {formatCurrency(plan.baseAmount)} <span className="text-lg text-neutral-500">/ {plan.baseInterval.toLowerCase()}</span>
                      </p>
                    </div>

                    {plan.commissionEnabled && (
                      <div>
                        <h4 className="text-sm text-neutral-400 uppercase tracking-wider font-semibold mb-1">Commission</h4>
                        <div className="bg-black/20 rounded-xl p-4 border border-white/5 mt-2 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Rate</span>
                            <span className="font-medium">{plan.commissionRate}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Basis</span>
                            <span className="font-medium capitalize">{plan.commissionBasis?.replace('_', ' ').toLowerCase()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Payout</span>
                            <span className="font-medium capitalize">{plan.payoutStructure?.replace('_', ' ').toLowerCase()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    {plan.commitmentEnabled && (
                      <div>
                        <h4 className="text-sm text-neutral-400 uppercase tracking-wider font-semibold mb-1">Performance Commitment</h4>
                        <div className="bg-purple-900/10 rounded-xl p-4 border border-purple-500/20 mt-2 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Target Metric</span>
                            <span className="font-medium text-purple-300">{plan.commitmentMetric?.replace('_', ' ')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Target Goal</span>
                            <span className="font-medium text-white">{plan.commitmentTarget}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">VIG Rate</span>
                            <span className="font-medium text-amber-400">{plan.commitmentVigRate}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {plan.notes && (
                      <div>
                        <h4 className="text-sm text-neutral-400 uppercase tracking-wider font-semibold mb-2">Notes</h4>
                        <p className="text-sm text-neutral-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                          {plan.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: EARNINGS */}
        {activeTab === 'earnings' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                <p className="text-sm text-neutral-400 mb-1">Total Earned (All Time)</p>
                <p className="text-3xl font-light text-white">{formatCurrency(totalEarned)}</p>
              </div>
              <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-2xl p-6">
                <p className="text-sm text-emerald-400/80 mb-1">Total Paid</p>
                <p className="text-3xl font-light text-emerald-400">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="bg-amber-900/10 border border-amber-500/20 rounded-2xl p-6">
                <p className="text-sm text-amber-400/80 mb-1">Pending Payment</p>
                <p className="text-3xl font-light text-amber-400">{formatCurrency(totalPending)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white mt-8 mb-4">Earnings History</h3>
              {earnings.length === 0 ? (
                <div className="text-center p-8 border border-white/10 border-dashed rounded-2xl">
                  <p className="text-neutral-500">No earnings records found.</p>
                </div>
              ) : (
                earnings.map((earning, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-medium">{earning.type}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-md font-medium ${
                          earning.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {earning.status}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-400">
                        {formatDate(earning.periodStart)} - {formatDate(earning.periodEnd)}
                      </p>
                      {earning.description && (
                        <p className="text-sm text-neutral-500 mt-1">{earning.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-medium text-white">{formatCurrency(earning.amount)}</p>
                      {earning.hoursWorked !== undefined && (
                        <p className="text-xs text-neutral-500 mt-1 flex items-center justify-end gap-1">
                          <FiClock /> {earning.hoursWorked} hrs @ {formatCurrency(earning.hourlyRate)}/hr
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB: ADVANCES */}
        {activeTab === 'advances' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {advances.length === 0 ? (
              <div className="text-center p-12 border border-white/10 border-dashed rounded-2xl bg-white/[0.01]">
                <FiTarget className="text-4xl text-neutral-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Active Advances</h3>
                <p className="text-neutral-500">You do not have any advances on record.</p>
              </div>
            ) : (
              advances.map(adv => {
                const remaining = adv.amount - adv.amountPaidBack;
                const progress = Math.min(100, Math.max(0, (adv.amountPaidBack / adv.amount) * 100));
                
                return (
                  <div key={adv.id} className="bg-white/[0.03] backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
                    <div className="p-6 md:p-8">
                      <div className="flex flex-col md:flex-row justify-between md:items-start gap-4 mb-6">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-semibold text-white">{adv.reason}</h3>
                            {adv.isFullyPaid ? (
                              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-md">Paid Off</span>
                            ) : (
                              <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-md">Active</span>
                            )}
                          </div>
                          <p className="text-sm text-neutral-400">Issued: {formatDate(adv.issueDate)}</p>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="text-sm text-neutral-400 mb-1">Remaining Balance</p>
                          <p className="text-3xl font-light text-white">{formatCurrency(remaining)}</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-8">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-emerald-400">{formatCurrency(adv.amountPaidBack)} paid</span>
                          <span className="text-neutral-500">of {formatCurrency(adv.amount)}</span>
                        </div>
                        <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-black/20 rounded-xl border border-white/5">
                        <div>
                          <p className="text-xs text-neutral-500 mb-1">Deduction Rate</p>
                          <p className="text-sm font-medium text-white">{adv.deductionRate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500 mb-1">Agreed Payback</p>
                          <p className="text-sm font-medium text-white">{formatCurrency(adv.agreedPayback)}/wk</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500 mb-1">Terms</p>
                          <p className="text-sm font-medium text-white">{adv.termWeeks} Weeks</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500 mb-1">Projected Payoff</p>
                          <p className="text-sm font-medium text-white">{formatDate(adv.termEndDate)}</p>
                        </div>
                      </div>

                      {!adv.isFullyPaid && (
                        <div className="border-t border-white/10 pt-6 mt-2">
                          {extendingAdvanceId === adv.id ? (
                            <form onSubmit={submitExtension} className="bg-white/5 p-4 rounded-xl space-y-4 border border-white/10">
                              <h4 className="text-sm font-medium text-white">Request Extension</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs text-neutral-400 mb-1">Additional Weeks</label>
                                  <input 
                                    type="number" 
                                    required 
                                    min="1"
                                    value={extensionWeeks}
                                    onChange={e => setExtensionWeeks(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-neutral-400 mb-1">Reason</label>
                                  <input 
                                    type="text" 
                                    required
                                    value={extensionReason}
                                    onChange={e => setExtensionReason(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                    placeholder="Brief explanation..."
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end mt-2">
                                <button 
                                  type="button" 
                                  onClick={() => setExtendingAdvanceId(null)}
                                  className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                                <button 
                                  type="submit" 
                                  disabled={extensionSubmitting}
                                  className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50"
                                >
                                  {extensionSubmitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button 
                              onClick={() => setExtendingAdvanceId(adv.id)}
                              className="text-sm flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                              <FiPlus /> Request Extension
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB: REIMBURSEMENTS */}
        {activeTab === 'reimbursements' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="bg-white/[0.03] backdrop-blur border border-white/10 rounded-2xl p-6 md:p-8">
              <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
                <FiPlus className="text-emerald-500" /> Submit New Reimbursement
              </h3>
              
              <form onSubmit={submitReimbursement} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Description</label>
                  <input 
                    type="text" 
                    required
                    value={reimburseDesc}
                    onChange={e => setReimburseDesc(e.target.value)}
                    placeholder="e.g. Travel expenses for client meeting"
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Amount ($)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FiDollarSign className="text-neutral-500" />
                    </div>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={reimburseAmount}
                      onChange={e => setReimburseAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={reimburseSubmitting}
                  className="w-full flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 mt-2"
                >
                  {reimburseSubmitting ? 'Submitting...' : <><FiSend /> Submit Request</>}
                </button>
              </form>
            </div>

            <div>
              <h3 className="text-lg font-medium text-white mb-4">Past Reimbursements</h3>
              {reimbursements.length === 0 ? (
                <div className="text-center p-8 border border-white/10 border-dashed rounded-2xl bg-white/[0.01]">
                  <p className="text-neutral-500">No reimbursement history.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reimbursements.map((r, i) => (
                    <div key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium mb-1">{r.description}</p>
                        <p className="text-xs text-neutral-500">{formatDate(r.dateSubmitted)}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-lg font-medium text-white">{formatCurrency(r.amount)}</p>
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 ${
                          r.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' :
                          r.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {r.status === 'APPROVED' && <FiCheck />}
                          {r.status === 'REJECTED' && <FiX />}
                          {r.status === 'PENDING' && <FiClock />}
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default function RepPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 to-neutral-900 flex items-center justify-center text-white">
        <FiRefreshCw className="animate-spin text-4xl text-emerald-500" />
      </div>
    }>
      <PortalContent />
    </Suspense>
  );
}
