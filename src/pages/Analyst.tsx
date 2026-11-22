import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAnalyst } from '../context/AnalystContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { DataTrustBadge } from '../components/ProvenanceTip';
import { BackNavButton } from '../components/BackNavButton';
import {
  Bot,
  Send,
  Sparkles,
  Clock,
  ShieldCheck,
  RotateCcw,
  Cpu,
  User,
  Lock,
  MapPin,
  AlertTriangle,
} from 'lucide-react';

export const Analyst: React.FC = () => {
  const { currentCity, sites } = useApp();
  const { activeWorkspace } = useWorkspace();
  const {
    messages,
    isSubmitting,
    cooldownSeconds,
    selectedBeach,
    setSelectedBeach,
    sendMessage,
    clearConversation,
    aiStatus,
  } = useAnalyst();

  const [inputQuery, setInputQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting]);

  const quickPrompts = [
    `Is Marina Beach safe for swimming right now?`,
    `Which beaches have HIGH or CRITICAL risk today and why?`,
    `My height is 175 cm — is it safe to wade into waist-deep surf at Marina Beach?`,
    `Summarize active operational incidents and responder readiness in this workspace`,
  ];

  const handleSubmit = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean || isSubmitting || cooldownSeconds > 0) return;
    setInputQuery('');
    await sendMessage(clean);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <BackNavButton fallbackPath="/dashboard" />
            <div className="w-9 h-9 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <h1 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#0B3B3C]">
              Guardian Analyst
            </h1>
            {aiStatus.available ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#0F766E]/10 text-[#0F766E] border border-[#0F766E]/25 text-[10px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                AI Powered
              </span>
            ) : !aiStatus.checked ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold uppercase tracking-wider">
                <Cpu className="w-3 h-3" />
                Checking AI...
              </span>
            ) : (
              <span
                title={aiStatus.reason || 'Deterministic Rule Engine Active'}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold uppercase tracking-wider"
              >
                <Cpu className="w-3 h-3" />
                Rule Engine Active
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#5B687A] mt-1">
            Grounded coastal safety, drowning prevention, and emergency operations assistant scoped server-side to{' '}
            <span className="font-semibold text-[#1B2A38]">{activeWorkspace.name}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs">
            <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
            <select
              value={selectedBeach || ''}
              onChange={(e) => setSelectedBeach(e.target.value || null)}
              aria-label="Focus beach"
              className="bg-transparent text-xs text-[#1B2A38] font-medium cursor-pointer focus:outline-none"
            >
              <option value="">All {currentCity.name} beaches</option>
              {sites.map((s) => (
                <option key={s.id} value={s.name}>
                  Focus: {s.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={clearConversation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white hover:border-[#0F766E]/40 text-xs font-medium text-[#5B687A] hover:text-[#1B2A38] cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear conversation</span>
          </button>
        </div>
      </div>

      {/* Privacy & Grounding Trust Strip */}
      <div className="rounded-2xl bg-[#FBF8F3] border border-[#E9E1D3] px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#5B687A]">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
          <span>
            <strong>Session-only privacy:</strong> Personal details stay in this active conversation only, are never stored across sessions, and clear automatically when you switch workspaces.
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <DataTrustBadge
            classification="derived_analytical"
            compact
            source="Server-Derived Workspace Context + Open-Meteo Telemetry"
            note="Organization and role are derived on the server from your session. In-situ coastal water-level gauges are unavailable."
          />
        </div>
      </div>

      {aiStatus.checked && !aiStatus.available && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Deterministic Rule Engine Active:</strong>{' '}
            {aiStatus.reason || 'Live Gemini synthesis is currently offline. Safety evaluations are computed directly from live Open-Meteo telemetry and SHAP rules without fabricated AI output.'}
          </span>
        </div>
      )}

      {/* Chat Container */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl overflow-hidden shadow-xs flex flex-col h-[600px]">
        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-xs ${
                    isUser ? 'bg-[#0B3B3C]' : 'bg-[#0F766E]'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

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
                    className={`flex items-center gap-2 text-[10px] text-[#5B687A] px-1 flex-wrap ${
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
                    {m.securityGuarded && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                        <ShieldCheck className="w-2.5 h-2.5" /> Tenant Guard
                      </span>
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
                <span>Evaluating server-verified workspace status and coastal telemetry...</span>
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
              type="button"
              onClick={() => void handleSubmit(prompt)}
              disabled={isSubmitting || cooldownSeconds > 0}
              className="px-3 py-1 text-xs bg-white border border-[#E9E1D3] rounded-full text-[#1B2A38] hover:border-[#0F766E] hover:text-[#0F766E] cursor-pointer transition whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
              void handleSubmit(inputQuery);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={
                cooldownSeconds > 0
                  ? `Ready in ${cooldownSeconds}s...`
                  : 'Ask about beach safety, waves, drowning prevention, or active incidents...'
              }
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isSubmitting || cooldownSeconds > 0}
              className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0F766E] text-[#1B2A38] disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!inputQuery.trim() || isSubmitting || cooldownSeconds > 0}
              className="px-5 py-2.5 text-xs font-semibold rounded-2xl bg-[#0F766E] text-white hover:bg-[#0B5A54] cursor-pointer transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/50"
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

          <div className="flex items-center justify-between text-[11px] text-[#5B687A] px-1 flex-wrap gap-2">
            <span>
              Advisory intelligence only — for an active emergency, call <strong>112</strong> or alert lifeguards immediately.
            </span>
            <span className="font-semibold text-[#0F766E]">Server-grounded · No fabricated readings</span>
          </div>
        </div>
      </div>
    </div>
  );
};
