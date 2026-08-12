"use client";

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { FiZap, FiX, FiMinimize2, FiMic, FiSend, FiMessageSquare, FiVolume2, FiVolumeX } from 'react-icons/fi';

interface AiAssistantProps {
  user?: { id?: string; name?: string; role?: string };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const PUBLIC_QUICK_PROMPTS = [
  "Find blade for 14\" gas saw",
  "Best blade for hard concrete & rebar?",
  "How do I get contractor discount pricing?",
  "Calculate RPM for 18\" blade",
  "Contact sales support"
];

const REP_QUICK_PROMPTS = [
  "Show me today's sales",
  "What's my commission total?",
  "How many tasks are due?",
  "Find account by name",
  "Draft a follow-up message"
];

export function AiAssistant({ user }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const pathname = usePathname();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Speech recognition & synthesis refs
  const recognitionRef = useRef<any>(null);

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

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;

        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (finalTranscript) {
            setInputText((prev) => prev + finalTranscript);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
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
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async (text: string = inputText) => {
    if (!text.trim()) return;

    const userMessage: Message = { role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
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
          },
          conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      const aiMessage: Message = { role: 'assistant', content: data.response, timestamp: new Date() };
      setMessages((prev) => [...prev, aiMessage]);
      
      // Auto-read response if user was using voice
      if (isListening) {
        speakText(data.response);
      }
    } catch (error) {
      console.error(error);
      const errorMessage: Message = { role: 'assistant', content: "Titan AI assist is active! For immediate sales support call (800) 555-0199.", timestamp: new Date() };
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

  const activePrompts = user?.id ? REP_QUICK_PROMPTS : PUBLIC_QUICK_PROMPTS;

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
              TITAN AI <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">VOICE ACTIVE</span>
            </h2>
            <span className="text-[10px] text-neutral-400 font-mono block">24/7 Expert Sales & Tech Support</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-neutral-400">
          <button 
            onClick={() => setIsOpen(false)} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Minimize"
          >
            <FiX className="w-5 h-5 text-neutral-300" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-5 py-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <FiMessageSquare className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase text-white mb-1">Welcome to Titan AI</h3>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-xs">
                Ask about blade specifications, diamond matrix formulas, contractor volume pricing, or jobsite recommendations.
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
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            
            {msg.role === 'assistant' && (
              <button 
                onClick={() => speakText(msg.content)} 
                className="mt-1 text-[10px] text-neutral-500 hover:text-amber-400 flex items-center gap-1 font-mono transition-colors"
              >
                {isSpeaking ? <FiVolumeX className="text-amber-400" /> : <FiVolume2 />} Listen to Voice
              </button>
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
              placeholder={isListening ? "Listening..." : "Ask Titan AI or speak..."}
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
