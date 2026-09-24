"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { FiZap, FiX, FiMic, FiSend, FiMessageSquare, FiVolume2, FiVolumeX, FiThumbsUp, FiThumbsDown, FiShield, FiCheckCircle } from 'react-icons/fi';

interface AiAssistantProps {
  user?: { id?: string; name?: string; role?: string };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  logId?: string; // AiChatLog id for feedback
  feedback?: boolean | null; // null = no feedback, true = helpful, false = not helpful
  pendingActions?: Array<{ toolName: string; summary: string; confirmationToken: string }>;
  verified?: boolean;
  sourceCount?: number;
  suggestedReplies?: string[];
}

const AGENT_QUICK_PROMPTS = [
  "Review my upcoming engagement steps and offer the next actions",
  "Show me today's sales",
  "What's my commission total this month?",
  "How many tasks are due?",
  "Show my overdue collections",
  "What's my VIG goal progress?",
];

const ADMIN_QUICK_PROMPTS = [
  "Show company sales this month",
  "List all reps and their stats",
  "Which rep has the most sales?",
  "Show all overdue invoices",
  "What's the total company profit this year?",
];

const PUBLIC_QUICK_PROMPTS = [
  "Find blade for 14\" gas saw",
  "Best blade for hard concrete & rebar?",
  "How do I get contractor discount pricing?",
  "Calculate RPM for 18\" blade",
  "Contact sales support",
];

function isAdminRole(role?: string): boolean {
  if (!role) return false;
  return role.toLowerCase().includes('admin') || role === 'ADMIN';
}

interface ActionOpportunity {
  id: string;
  label: string;
  detail: string;
  count: number;
  prompt: string;
}

function AssistantMessage({ content }: { content: string }) {
  const parts = content.split(/(\[[^\]]+\]\((?:\/[A-Za-z0-9_~!$&'()*+,;=:@%/?#.-]*)\))/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, index) => {
        const match = part.match(/^\[([^\]]+)\]\((\/[A-Za-z0-9_~!$&'()*+,;=:@%/?#.-]*)\)$/);
        if (!match) return <React.Fragment key={index}>{part}</React.Fragment>;
        return <a key={index} href={match[2]} className="font-bold text-amber-300 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-200">{match[1]}</a>;
      })}
    </p>
  );
}

export function AiAssistant({ user }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [dynamicPrompts, setDynamicPrompts] = useState<string[]>([]);
  const [opportunities, setOpportunities] = useState<ActionOpportunity[] | null>(null);
  const pathname = usePathname();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const admin = isAdminRole(user?.role);

  // Determine which static prompts to show as fallback
  const staticPrompts = user?.id
    ? admin ? ADMIN_QUICK_PROMPTS : AGENT_QUICK_PROMPTS
    : PUBLIC_QUICK_PROMPTS;

  // Fetch dynamic prompts from popular questions
  const fetchDynamicPrompts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/ai/popular-questions?role=${user.role || ''}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.questions.length > 0) {
          setDynamicPrompts(data.questions);
        }
      }
    } catch {
      // Silently fail — static prompts are always available
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (isOpen && dynamicPrompts.length === 0) {
      fetchDynamicPrompts();
    }
  }, [isOpen, dynamicPrompts.length, fetchDynamicPrompts]);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    fetch('/api/ai/action-opportunities', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success && Array.isArray(data.opportunities)) setOpportunities(data.opportunities);
      })
      .catch(() => undefined);
  }, [isOpen, user?.id]);

  // Keyboard shortcut Ctrl+Shift+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOpenAi = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      setIsOpen(true);
      if (prompt) setInputText(prompt);
    };
    window.addEventListener('openTitanAi', handleOpenAi);
    return () => window.removeEventListener('openTitanAi', handleOpenAi);
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript) {
            setInputText((prev) => prev + finalTranscript);
          }
        };

        recognitionRef.current.onerror = () => setIsListening(false);
        recognitionRef.current.onend = () => setIsListening(false);
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Speech recognition start failed", e);
      }
    }
  };

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, isLoading]);

  // Submit feedback
  const handleFeedback = async (msgIndex: number, helpful: boolean) => {
    const msg = messages[msgIndex];
    if (!msg?.logId) return;

    // Optimistic update
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, feedback: helpful } : m
    ));

    try {
      await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: msg.logId, helpful }),
      });
    } catch {
      // Revert on failure
      setMessages(prev => prev.map((m, i) =>
        i === msgIndex ? { ...m, feedback: null } : m
      ));
    }
  };

  const handleSend = async (text: string = inputText, confirmationToken?: string) => {
    if (!text.trim()) return;

    if (!confirmationToken) {
      const userMessage: Message = { role: 'user', content: text, timestamp: new Date() };
      setMessages((prev) => [...prev, userMessage]);
    }
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: {
            page: pathname,
            userId: user?.id,
            userRole: user?.role,
            userName: user?.name,
          },
          conversationHistory: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
          confirmationToken,
        }),
      });

      const data = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const aiMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        logId: data.logId,
        feedback: null,
        pendingActions: data.pendingActions || [],
        verified: data.verified === true,
        sourceCount: Number(data.sourceCount || 0),
        suggestedReplies: Array.isArray(data.suggestedReplies) ? data.suggestedReplies.slice(0, 3) : [],
      };
      setMessages((prev) => [...prev, aiMessage]);

      // Auto-read if user was using voice
      if (isListening) {
        speakText(data.response);
      }
    } catch (error: any) {
      const msg = error?.message || '';
      let errorText: string;
      
      if (msg.includes('API key') || msg.includes('OPENAI')) {
        errorText = "⚠️ Titan AI is not configured yet. Please ask your admin to add the OpenAI API key.";
      } else if (msg && msg !== 'Failed to fetch') {
        errorText = `⚠️ ${msg}`;
      } else {
        errorText = "I'm having trouble connecting right now. Please try again in a moment.";
      }

      const errorMessage: Message = {
        role: 'assistant',
        content: errorText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Merge dynamic and static prompts (dynamic first, fill gaps with static)
  const activePrompts = (() => {
    if (dynamicPrompts.length >= 5) return dynamicPrompts.slice(0, 5);
    const combined = [...dynamicPrompts];
    for (const sp of staticPrompts) {
      if (combined.length >= 5) break;
      if (!combined.some(dp => dp.toLowerCase() === sp.toLowerCase())) {
        combined.push(sp);
      }
    }
    return combined;
  })();

  // Floating button (closed state)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open Titan AI Assistant"
        className="fixed bottom-6 right-6 z-[999] flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 shadow-[0_0_30px_rgba(245,158,11,0.6)] hover:scale-110 active:scale-95 transition-all duration-300 group border border-amber-300/40"
      >
        <FiZap className="w-6 h-6 text-neutral-950 group-hover:rotate-12 transition-transform" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-neutral-950 rounded-full animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 md:inset-auto md:bottom-6 md:right-6 md:w-[420px] md:h-[600px] z-[1000] flex flex-col bg-neutral-950/95 backdrop-blur-2xl border border-amber-500/30 md:rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-neutral-900/90">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-md">
            <FiZap className="w-5 h-5 text-neutral-950" />
          </div>
          <div>
            <h2 className="text-base font-black uppercase text-white tracking-wider flex items-center gap-2">
              TITAN AI
              {admin ? (
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <FiShield size={9} /> ADMIN ACCESS
                </span>
              ) : user?.id ? (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  VOICE ACTIVE
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  PUBLIC
                </span>
              )}
            </h2>
            <span className="text-[10px] text-neutral-400 font-mono block">
              {admin ? 'Full company data access' : user?.id ? 'Your sales data & company totals' : '24/7 Expert Sales & Tech Support'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-neutral-400">
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Close"
          >
            <FiX className="w-5 h-5 text-neutral-300" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {user?.id && (
          <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 shadow-inner">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-300">
              <FiZap size={12} /> What I can do to help
            </div>
            <p className="mt-1 text-[10px] text-neutral-500">Live work that needs attention—select an item and I’ll review it with you.</p>
            <div className="mt-3 space-y-1.5">
              {opportunities === null && <div className="py-2 text-[10px] text-neutral-500">Checking your open work…</div>}
              {opportunities?.length === 0 && <div className="py-2 text-[10px] font-semibold text-emerald-300">No urgent work is waiting right now.</div>}
              {opportunities?.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSend(item.prompt)}
                  disabled={isLoading}
                  className="group flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left hover:border-emerald-500/35 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-emerald-500/15 px-1 text-[10px] font-black text-emerald-300">{item.count}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold text-neutral-100 group-hover:text-emerald-200">{item.label}</span>
                    <span className="block truncate text-[9px] text-neutral-500">{item.detail}</span>
                  </span>
                  <FiSend size={11} className="text-neutral-600 group-hover:text-emerald-300" />
                </button>
              ))}
            </div>
          </section>
        )}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-5 py-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <FiMessageSquare className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase text-white mb-1">
                {admin ? 'Admin Data Assistant' : user?.id ? `Hey ${user.name?.split(' ')[0] || 'there'}!` : 'Welcome to Titan AI'}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-xs">
                {admin
                  ? 'Ask about any rep, account, invoice, commission, or company-wide data. You have full access.'
                  : user?.id
                    ? 'Ask about your sales, commissions, accounts, tasks, VIG goals, or company totals.'
                    : 'Ask about blade specifications, diamond matrix formulas, contractor volume pricing, or jobsite recommendations.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {activePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  className="px-3 py-1.5 text-xs bg-neutral-900 hover:bg-neutral-800 border border-white/10 hover:border-amber-500/40 rounded-full text-neutral-300 transition-all font-medium text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-neutral-950 font-medium rounded-tr-xs shadow-md'
                  : 'bg-neutral-900 text-neutral-100 border border-white/10 rounded-tl-xs shadow-md'
              }`}
            >
              {msg.role === 'assistant'
                ? <AssistantMessage content={msg.content} />
                : <p className="whitespace-pre-wrap">{msg.content}</p>}
            </div>

            {/* Assistant action row: listen + feedback */}
            {msg.role === 'assistant' && (
              <div className="mt-1.5 flex max-w-[92%] flex-col items-start gap-2">
                {!!msg.suggestedReplies?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.suggestedReplies.map(reply => (
                      <button
                        key={reply}
                        onClick={() => handleSend(reply)}
                        disabled={isLoading}
                        className="rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1.5 text-left text-[10px] font-semibold text-amber-200 hover:border-amber-400/50 hover:bg-amber-500/15 disabled:opacity-50"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                {msg.verified && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold" title={`${msg.sourceCount || 0} retrieved record(s) checked`}>
                    <FiCheckCircle size={11} /> Verified from records{msg.sourceCount ? ` (${msg.sourceCount})` : ''}
                  </span>
                )}
                {msg.pendingActions?.map(action => (
                  <button
                    key={action.confirmationToken}
                    onClick={() => handleSend(`Confirm ${action.toolName}`, action.confirmationToken)}
                    disabled={isLoading}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 flex items-center gap-1.5 text-[10px] font-bold"
                    title={action.summary}
                  >
                    <FiCheckCircle size={11} /> Confirm action
                  </button>
                ))}
                <button
                  onClick={() => speakText(msg.content)}
                  className="text-[10px] text-neutral-500 hover:text-amber-400 flex items-center gap-1 font-mono transition-colors"
                >
                  {isSpeaking ? <FiVolumeX className="text-amber-400" size={11} /> : <FiVolume2 size={11} />}
                  Listen
                </button>

                {msg.logId && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFeedback(idx, true)}
                      className={`p-1 rounded transition-colors ${
                        msg.feedback === true
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-neutral-600 hover:text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                      title="Helpful"
                    >
                      <FiThumbsUp size={11} />
                    </button>
                    <button
                      onClick={() => handleFeedback(idx, false)}
                      className={`p-1 rounded transition-colors ${
                        msg.feedback === false
                          ? 'text-red-400 bg-red-500/10'
                          : 'text-neutral-600 hover:text-red-400 hover:bg-red-500/10'
                      }`}
                      title="Not helpful"
                    >
                      <FiThumbsDown size={11} />
                    </button>
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-900 border border-white/10 rounded-2xl rounded-tl-xs px-4 py-3 flex space-x-1.5">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-neutral-900/90">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening..." : admin ? "Ask anything about any data..." : "Ask about your sales data..."}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 pl-4 pr-10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
            />
            <button
              onClick={toggleListening}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'text-neutral-400 hover:text-amber-400'
              }`}
              title="Speak to Titan AI"
            >
              <FiMic className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim() && !isLoading}
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black rounded-xl transition-all shadow-md disabled:opacity-40"
          >
            <FiSend className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
