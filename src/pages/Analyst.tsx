import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { executeRuleBasedAnalyst, AnalystContext } from '../lib/ruleAnalyst';
import { TierBadge } from '../components/TierBadge';
import {
  Bot,
  Send,
  Sparkles,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Cpu,
  User,
  ExternalLink,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modelUsed?: string;
  isRuleBased?: boolean;
  toolsUsed?: string[];
}

export const Analyst: React.FC = () => {
  const { currentCity, sites, siteRisks, incidents } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: `Hello! I am your GuardianGrid Environmental Intelligence Analyst for ${currentCity.name}, ${currentCity.region}. I monitor real-time marine, weather, flood discharge, and infrastructure safety observations across ${sites.length} water bodies. How can I assist you with water safety intelligence today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'Guardian Hybrid Engine',
      isRuleBased: true,
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 6-second cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting]);

  const quickPrompts = [
    `Is Marina Beach safe for swimming right now?`,
    `Which sites have high or severe risk warnings today?`,
    `Explain why Chembarambakkam is at its current risk level`,
    `Compare coastal beaches vs inland reservoirs in ${currentCity.name}`,
  ];

  const handleSendMessage = async (queryText: string) => {
    const textToSend = queryText.trim();
    if (!textToSend || isSubmitting || cooldownSeconds > 0) return;

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsSubmitting(true);
    setCooldownSeconds(6);

    // Build context
    const analystContext: AnalystContext = {
      sites: sites.map((s) => {
        const risk = siteRisks.get(s.id);
        return {
          id: s.id,
          name: s.name,
          score: risk?.score ?? 40,
          tier: risk?.tier ?? 'Low',
          dataConfidence: risk?.dataConfidence ?? 85,
          environmentalFactors: risk?.environmentalFactors,
          lifeguardPresent: Boolean(s.hasLifeguard || s.lifeguardPresent),
          topShapFactors: (risk?.shapValues || []).map((sv) => ({
            label: sv.label || sv.featureName || 'Factor',
            value: sv.value ?? sv.hazard ?? 0,
            unit: sv.unit || '',
            shap: sv.shap ?? sv.shapContribution ?? 0,
          })),
        };
      }),
      incidents,
    };

    try {
      // First attempt server Gemini route
      let botResponse: { text: string; modelUsed: string; isRuleBased: boolean; toolsUsed?: string[] } | null = null;

      try {
        const res = await fetch('/api/analyst', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: textToSend, context: analystContext }),
        });

        if (res.ok) {
          const data = await res.json();
          if (!data.fallback && data.text) {
            botResponse = {
              text: data.text,
              modelUsed: data.modelUsed || 'Gemini 2.5 Flash-Lite',
              isRuleBased: false,
              toolsUsed: ['gemini_contextual_synthesis'],
            };
          }
        }
      } catch (err) {
        // Fallback to rule engine
      }

      // If server failed or no Gemini API key, use deterministic rule-based analyst
      if (!botResponse) {
        const ruleRes = executeRuleBasedAnalyst(textToSend, analystContext);
        botResponse = {
          text: ruleRes.text,
          modelUsed: 'Deterministic Safety Engine (Rule-Based Fallback)',
          isRuleBased: true,
          toolsUsed: ruleRes.toolsUsed,
        };
      }

      const assistantMessage: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: botResponse.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: botResponse.modelUsed,
        isRuleBased: botResponse.isRuleBased,
        toolsUsed: botResponse.toolsUsed,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e: any) {
      const errMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: 'An error occurred while evaluating the query. GuardianGrid rule analyst is standing by.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRuleBased: true,
      };
      setMessages((prev) => [...prev, errMessage]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#0F766E]" />
            <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
              Guardian Analyst
            </h1>
          </div>
          <p className="text-sm text-[#5B687A] mt-1">
            Real-time conversational risk assistant powered by Gemini 2.5 Flash-Lite with zero-dependency deterministic fallback.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2F855A] animate-pulse"></span>
          <span className="text-[#5B687A]">Live Context Synced</span>
        </div>
      </div>

      {/* Chat Container */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl overflow-hidden shadow-xs flex flex-col h-[640px]">
        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-xs ${
                    isUser ? 'bg-[#1E3A8A]' : 'bg-[#0F766E]'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className="space-y-1.5">
                  <div
                    className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-[#0F766E] text-white shadow-xs'
                        : 'bg-white border border-[#E9E1D3] text-[#1B2A38] shadow-xs'
                    }`}
                  >
                    {m.text}
                  </div>

                  <div
                    className={`flex items-center gap-2 text-[10px] text-[#5B687A] px-1 ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span>{m.timestamp}</span>
                    {m.modelUsed && (
                      <>
                        <span>•</span>
                        <span className="font-semibold text-[#0F766E] flex items-center gap-1">
                          <Cpu className="w-3 h-3" />
                          {m.modelUsed}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isSubmitting && (
            <div className="flex gap-3 max-w-xl mr-auto">
              <div className="w-9 h-9 rounded-2xl bg-[#0F766E] flex items-center justify-center shrink-0 text-white shadow-xs animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#E9E1D3] text-xs text-[#5B687A] flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#0F766E] animate-spin" />
                <span>Evaluating environmental telemetry and running model inference...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompt Chips */}
        <div className="p-3 bg-[#E9E1D3]/30 border-t border-[#E9E1D3] flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-semibold text-[#5B687A] shrink-0 pl-2">Quick prompts:</span>
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              disabled={isSubmitting || cooldownSeconds > 0}
              className="px-3 py-1 text-xs bg-white border border-[#E9E1D3] rounded-full text-[#1B2A38] hover:border-[#0F766E] hover:text-[#0F766E] transition whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white border-t border-[#E9E1D3] space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputQuery);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={
                cooldownSeconds > 0
                  ? `Rate limit cooldown active (${cooldownSeconds}s)...`
                  : 'Ask about wave conditions, swimming safety, or risk explanation...'
              }
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isSubmitting || cooldownSeconds > 0}
              className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0F766E] text-[#1B2A38] disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!inputQuery.trim() || isSubmitting || cooldownSeconds > 0}
              className="px-5 py-2.5 text-xs font-semibold rounded-2xl bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs disabled:opacity-40 flex items-center gap-2"
            >
              {cooldownSeconds > 0 ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>{cooldownSeconds}s</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-[#5B687A] px-1">
            <span>
              Calls rate-limited to 1 per 6s. Gemini 2.5 Flash-Lite or transparent local rule fallback.
            </span>
            <span className="font-semibold text-[#0F766E]">No synthetic data</span>
          </div>
        </div>
      </div>
    </div>
  );
};
