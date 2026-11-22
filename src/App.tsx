import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { NexconnProvider } from './context/NexconnContext';
import { EmergencyProvider } from './context/EmergencyContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { AnalystProvider } from './context/AnalystContext';
import { AppShell } from './components/AppShell';
import { IncomingCallPopup } from './components/comms/IncomingCallPopup';
import { ActiveCallModal } from './components/comms/ActiveCallModal';
import { GoogleMapsProvider } from './components/maps/GoogleMapsProvider';
import { NavigationProvider } from './context/NavigationContext';

import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { MapPage } from './pages/MapPage';
import { WaterBodies } from './pages/WaterBodies';
import { WaterBodyDetail } from './pages/WaterBodyDetail';
import { Forecast } from './pages/Forecast';
import { Explain } from './pages/Explain';
import { Clusters } from './pages/Clusters';
import { Fairness } from './pages/Fairness';
import { Analyst } from './pages/Analyst';
import { Reports } from './pages/Reports';
import { Incidents } from './pages/Incidents';
import { Methodology } from './pages/Methodology';
import { Settings } from './pages/Settings';
import { Messages } from './pages/Messages';
import { CommandCenter } from './pages/CommandCenter';
import { PublicSOS } from './pages/PublicSOS';
import { ResponderFieldKit } from './pages/ResponderFieldKit';
import { PublicParamedicTrack } from './pages/PublicParamedicTrack';
import { WorkspaceSettings } from './pages/WorkspaceSettings';
import { Responders } from './pages/Responders';
import { MedicalHandoffHub } from './pages/MedicalHandoffHub';
import { AnalyticsHub } from './pages/AnalyticsHub';

const QueryPreservingRedirect: React.FC<{ to: string }> = ({ to }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
};

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  return (
    <AuthProvider>
      <WorkspaceProvider>
      <AppProvider>
        <NexconnProvider>
          <EmergencyProvider>
          <AnalystProvider>
          {mapsQuotaExceeded && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
              <span>
                Google Maps Platform quota reached. Emergency maps have switched to Leaflet fallback. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 hover:text-amber-800"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}
          <GoogleMapsProvider>
          <HashRouter>
          <NavigationProvider>
          <Routes>
            {/* Landing page: No sidebar, clean full hero */}
            <Route path="/" element={<Landing />} />

            {/* Public Emergency SOS (standalone QR-accessible public page, no admin sidebar) */}
            <Route path="/sos" element={<PublicSOS />} />
            <Route path="/sos/:cellId" element={<PublicSOS />} />

            {/* Public Read-Only 112 / Paramedic Live Tracking Page (token-validated, no login required) */}
            <Route path="/track/:token" element={<PublicParamedicTrack />} />

            {/* Risk Map page: TopNav variant from screenshot panel 3 */}
            <Route path="/map" element={<MapPage />} />

          {/* Core App Pages wrapped in AppShell with sidebar */}
          <Route
            path="/dashboard"
            element={
              <AppShell>
                <Dashboard />
              </AppShell>
            }
          />
          <Route
            path="/water-bodies"
            element={
              <AppShell>
                <WaterBodies />
              </AppShell>
            }
          />
          <Route
            path="/water-bodies/:id"
            element={
              <AppShell>
                <WaterBodyDetail />
              </AppShell>
            }
          />
          <Route
            path="/forecast"
            element={
              <AppShell>
                <Forecast />
              </AppShell>
            }
          />
          <Route
            path="/explain"
            element={
              <AppShell>
                <Explain />
              </AppShell>
            }
          />
          <Route
            path="/clusters"
            element={
              <AppShell>
                <Clusters />
              </AppShell>
            }
          />
          <Route
            path="/fairness"
            element={
              <AppShell>
                <Fairness />
              </AppShell>
            }
          />
          <Route
            path="/analyst"
            element={
              <AppShell>
                <Analyst />
              </AppShell>
            }
          />
          <Route
            path="/reports"
            element={
              <AppShell>
                <Reports />
              </AppShell>
            }
          />
          <Route
            path="/reports/:id"
            element={
              <AppShell>
                <Reports />
              </AppShell>
            }
          />
          <Route
            path="/incidents"
            element={
              <AppShell>
                <Incidents />
              </AppShell>
            }
          />
          <Route
            path="/methodology"
            element={
              <AppShell>
                <Methodology />
              </AppShell>
            }
          />
          <Route
            path="/messages"
            element={
              <AppShell>
                <Messages />
              </AppShell>
            }
          />
          <Route
            path="/command"
            element={
              <AppShell>
                <CommandCenter />
              </AppShell>
            }
          />
          <Route path="/field-kit" element={<ResponderFieldKit />} />
          <Route
            path="/workspace"
            element={
              <AppShell>
                <WorkspaceSettings />
              </AppShell>
            }
          />
          <Route
            path="/responders"
            element={
              <AppShell>
                <Responders />
              </AppShell>
            }
          />
          <Route
            path="/medical-handoff"
            element={
              <AppShell>
                <MedicalHandoffHub />
              </AppShell>
            }
          />
          <Route
            path="/analytics"
            element={
              <AppShell>
                <AnalyticsHub />
              </AppShell>
            }
          />
          <Route
            path="/settings"
            element={
              <AppShell>
                <Settings />
              </AppShell>
            }
          />

          {/* Consolidated Four-Area Aliases (preserve query params & deep links) */}
          <Route path="/operations" element={<QueryPreservingRedirect to="/dashboard" />} />
          <Route path="/intelligence" element={<QueryPreservingRedirect to="/analytics" />} />
          <Route path="/communications" element={<QueryPreservingRedirect to="/messages" />} />
          <Route path="/organization" element={<QueryPreservingRedirect to="/workspace" />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <IncomingCallPopup />
        <ActiveCallModal />
        </NavigationProvider>
        </HashRouter>
        </GoogleMapsProvider>
        </AnalystProvider>
        </EmergencyProvider>
      </NexconnProvider>
    </AppProvider>
    </WorkspaceProvider>
    </AuthProvider>
  );
}
