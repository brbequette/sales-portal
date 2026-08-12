"use client";

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { FiZap, FiX, FiMinimize2, FiMic, FiSend, FiMessageSquare } from 'react-icons/fi';

interface AiAssistantProps {
  user?: { id?: string; name?: string; role?: string };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  "Show me today's sales",
  "What's my commission total?",
  "How many tasks are due?",
  "Find account by name",
  "Draft a follow-up message",
];

export function AiAssistant({ user }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const pathname = usePathname();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Speech recognition ref
  const recognitionRef = useRef<any>(null);

  // Keyboard shortcut
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
      alert("Voice input not supported in this browser.");
      return;
    }
    
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
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
    } catch (error) {
      console.error(error);
      const errorMessage: Message = { role: 'assistant', content: "Sorry, I'm having trouble connecting right now.", timestamp: new Date() };
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[90] flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:scale-105 transition-transform duration-200"
      >
        <FiZap className="w-6 h-6 text-white" />
        <div className="absolute inset-0 rounded-full animate-ping bg-amber-500 opacity-20"></div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 md:inset-auto md:top-0 md:bottom-0 md:right-0 md:w-[400px] z-[100] flex flex-col bg-neutral-900/95 backdrop-blur-2xl md:border-l border-white/10 shadow-2xl transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-600">
            <FiZap className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">Titan AI</h2>
        </div>
        <div className="flex items-center gap-2 text-neutral-400">
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors hidden md:block">
            <FiMinimize2 className="w-5 h-5" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <FiX className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
              <FiMessageSquare className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <h3 className="text-xl font-medium text-white mb-2">How can I help you today?</h3>
              <p className="text-sm text-neutral-400">Ask me anything about your sales, accounts, or tasks.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {QUICK_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-neutral-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-amber-500/20 text-amber-500 rounded-tr-sm'
                  : 'bg-white/5 text-white border border-white/10 rounded-tl-sm'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex space-x-1">
              <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-neutral-500 rounded-full animate-bounce"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-neutral-900">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Titan AI..."
              className="w-full bg-neutral-800 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 resize-none max-h-32 min-h-[44px]"
              rows={1}
            />
            <button
              onClick={toggleListening}
              className={`absolute right-2 bottom-1.5 p-2 rounded-lg transition-colors ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title="Voice input"
            >
              <FiMic className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim() && !isLoading}
            className="flex-shrink-0 flex items-center justify-center w-11 h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-neutral-950 rounded-xl transition-colors"
          >
            <FiSend className="w-5 h-5" />
          </button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-neutral-500">AI can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  );
}
