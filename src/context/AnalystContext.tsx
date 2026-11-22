import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext';
import { useWorkspace } from './WorkspaceContext';
import { buildOperationalHeaders } from '../services/emergencyApi';
import { apiUrl, getApiCredentials } from '../services/apiBase';
import {
  executeRuleBasedAnalyst,
  resetConversationMemory,
  type AnalystContext as RuleAnalystContext,
} from '../lib/ruleAnalyst';

export interface AnalystMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modelUsed?: string;
  isRuleBased?: boolean;
  toolsUsed?: string[];
  offTopic?: boolean;
  securityGuarded?: boolean;
}

export interface AnalystAiStatus {
  configured: boolean;
  available: boolean;
  mode: 'gemini' | 'rule_engine';
  model: string;
  reason: string | null;
  checked: boolean;
}

interface AnalystContextValue {
  messages: AnalystMessage[];
  isSubmitting: boolean;
  cooldownSeconds: number;
  selectedBeach: string | null;
  setSelectedBeach: (beach: string | null) => void;
  sendMessage: (queryText: string) => Promise<void>;
  clearConversation: () => void;
  activeScopeOrgId: string;
  activeScopeName: string;
  aiStatus: AnalystAiStatus;
  refreshAiStatus: () => Promise<void>;
}

const AnalystContext = createContext<AnalystContextValue | null>(null);

function createGreetingMessage(cityName: string, region: string, workspaceName: string, siteCount: number): AnalystMessage {
  return {
    id: `init-${Date.now()}`,
    sender: 'assistant',
    text: `Hello! I'm Guardian Analyst for ${workspaceName} (${cityName}, ${region}). I ground answers in your workspace's authorized operational status and live Open-Meteo marine/weather telemetry across ${siteCount} monitored water bodies. Personal details you share stay in this session only and are never saved across sessions. How can I help with coastal safety or emergency intelligence?`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isRuleBased: false,
  };
}

export const AnalystProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentCity, sites, siteRisks, incidents, siteForecasts } = useApp();
  const { activeWorkspace } = useWorkspace();

  const [messages, setMessages] = useState<AnalystMessage[]>(() => [
    createGreetingMessage(
      currentCity.name,
      currentCity.region,
      activeWorkspace.name,
      sites.length
    ),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [selectedBeach, setSelectedBeach] = useState<string | null>(null);
  const [activeScopeOrgId, setActiveScopeOrgId] = useState(activeWorkspace.organizationId);
  const [aiStatus, setAiStatus] = useState<AnalystAiStatus>({
    configured: false,
    available: false,
    mode: 'rule_engine',
    model: 'gemini-3.1-flash-lite',
    reason: null,
    checked: false,
  });

  const refreshAiStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/analyst/status'), {
        credentials: getApiCredentials(),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        setAiStatus((prev) => ({
          ...prev,
          available: false,
          mode: 'rule_engine',
          reason: `Status check failed (HTTP ${res.status})`,
          checked: true,
        }));
        return;
      }
      const data = await res.json();
      setAiStatus({
        configured: Boolean(data.configured),
        available: Boolean(data.available),
        mode: data.available ? 'gemini' : 'rule_engine',
        model: data.model || 'gemini-3.1-flash-lite',
        reason: data.reason || null,
        checked: true,
      });
    } catch {
      setAiStatus((prev) => ({
        ...prev,
        available: false,
        mode: 'rule_engine',
        reason: 'Unable to reach Guardian Analyst backend service.',
        checked: true,
      }));
    }
  }, []);

  useEffect(() => {
    void refreshAiStatus();
  }, [refreshAiStatus]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  // Clear / re-scope conversation immediately whenever workspace switches so zero context leaks across tenants
  useEffect(() => {
    if (activeWorkspace.organizationId !== activeScopeOrgId) {
      resetConversationMemory();
      setActiveScopeOrgId(activeWorkspace.organizationId);
      setSelectedBeach(null);
      setMessages([
        createGreetingMessage(
          currentCity.name,
          currentCity.region,
          activeWorkspace.name,
          sites.length
        ),
      ]);
    }
  }, [
    activeWorkspace.organizationId,
    activeWorkspace.name,
    activeScopeOrgId,
    currentCity.name,
    currentCity.region,
    sites.length,
  ]);

  const clearConversation = useCallback(() => {
    resetConversationMemory();
    setMessages([
      createGreetingMessage(
        currentCity.name,
        currentCity.region,
        activeWorkspace.name,
        sites.length
      ),
    ]);
  }, [currentCity.name, currentCity.region, activeWorkspace.name, sites.length]);

  const sendMessage = useCallback(
    async (queryText: string) => {
      const textToSend = queryText.trim();
      if (!textToSend || isSubmitting || cooldownSeconds > 0) return;

      const userMessage: AnalystMessage = {
        id: `usr-${Date.now()}`,
        sender: 'user',
        text: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const historySnapshot = messages
        .filter((m) => !m.id.startsWith('init-'))
        .slice(-12)
        .map((m) => ({ sender: m.sender, text: m.text }));

      setMessages((prev) => [...prev, userMessage]);
      setIsSubmitting(true);
      setCooldownSeconds(3);

      const analystContext: RuleAnalystContext = {
        sites: sites.map((s) => {
          const risk = siteRisks.get(s.id);
          return {
            id: s.id,
            name: s.name,
            type: s.type,
            isCoastal: s.isCoastal,
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
        siteForecasts,
        currentCity: {
          name: currentCity.name,
          region: currentCity.region,
          country: currentCity.country,
        },
      };

      try {
        let botResponse: {
          text: string;
          modelUsed: string;
          isRuleBased: boolean;
          toolsUsed?: string[];
          offTopic?: boolean;
          securityGuarded?: boolean;
        } | null = null;

        try {
          const headers = await buildOperationalHeaders(true);
          const res = await fetch(apiUrl('/api/analyst'), {
            method: 'POST',
            credentials: getApiCredentials(),
            headers,
            body: JSON.stringify({
              query: textToSend,
              history: historySnapshot,
              context: {
                sites: analystContext.sites,
                currentCity: analystContext.currentCity,
                selectedBeach,
              },
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.fallback) {
              setAiStatus((prev) => ({
                ...prev,
                available: false,
                mode: 'rule_engine',
                reason: data.reason || data.error || 'Gemini AI unavailable — using deterministic rule engine.',
                checked: true,
              }));
            } else if (data.text) {
              if (data.aiAvailable === true) {
                setAiStatus((prev) => ({
                  ...prev,
                  configured: true,
                  available: true,
                  mode: 'gemini',
                  model: data.modelUsed || prev.model,
                  reason: null,
                  checked: true,
                }));
              }
              botResponse = {
                text: data.text,
                modelUsed: data.modelUsed || 'Gemini 3.1 Flash-Lite',
                isRuleBased: Boolean(data.isRuleBased),
                toolsUsed: data.offTopic
                  ? ['domain_guard']
                  : data.securityGuarded
                  ? ['tenant_isolation_guard']
                  : ['server_tenant_context', 'coastal_telemetry', 'gemini_synthesis'],
                offTopic: Boolean(data.offTopic),
                securityGuarded: Boolean(data.securityGuarded),
              };
            }
          } else {
            setAiStatus((prev) => ({
              ...prev,
              available: false,
              mode: 'rule_engine',
              reason: `Analyst backend error (HTTP ${res.status})`,
              checked: true,
            }));
          }
        } catch {
          setAiStatus((prev) => ({
            ...prev,
            available: false,
            mode: 'rule_engine',
            reason: 'Backend unavailable — using local deterministic safety engine.',
            checked: true,
          }));
        }

        if (!botResponse) {
          const ruleRes = executeRuleBasedAnalyst(textToSend, analystContext);
          botResponse = {
            text: ruleRes.text,
            modelUsed: 'Deterministic Safety Engine (Local Fallback)',
            isRuleBased: true,
            toolsUsed: ruleRes.toolsUsed,
          };
        }

        const assistantMessage: AnalystMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          text: botResponse.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: botResponse.modelUsed,
          isRuleBased: botResponse.isRuleBased,
          toolsUsed: botResponse.toolsUsed,
          offTopic: botResponse.offTopic,
          securityGuarded: botResponse.securityGuarded,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'assistant',
            text: 'An error occurred while evaluating your question. Please retry or check Live Operations directly.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRuleBased: true,
          },
        ]);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      cooldownSeconds,
      messages,
      sites,
      siteRisks,
      incidents,
      siteForecasts,
      currentCity,
      selectedBeach,
    ]
  );

  const value = useMemo<AnalystContextValue>(
    () => ({
      messages,
      isSubmitting,
      cooldownSeconds,
      selectedBeach,
      setSelectedBeach,
      sendMessage,
      clearConversation,
      activeScopeOrgId,
      activeScopeName: activeWorkspace.name,
      aiStatus,
      refreshAiStatus,
    }),
    [
      messages,
      isSubmitting,
      cooldownSeconds,
      selectedBeach,
      sendMessage,
      clearConversation,
      activeScopeOrgId,
      activeWorkspace.name,
      aiStatus,
      refreshAiStatus,
    ]
  );

  return <AnalystContext.Provider value={value}>{children}</AnalystContext.Provider>;
};

export function useAnalyst(): AnalystContextValue {
  const ctx = useContext(AnalystContext);
  if (!ctx) {
    throw new Error('useAnalyst must be used within an AnalystProvider');
  }
  return ctx;
}
