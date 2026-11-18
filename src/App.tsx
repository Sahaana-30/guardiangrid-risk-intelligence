import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { NexconnProvider } from './context/NexconnContext';
import { EmergencyProvider } from './context/EmergencyContext';
import { AppShell } from './components/AppShell';
import { IncomingCallPopup } from './components/comms/IncomingCallPopup';
import { ActiveCallModal } from './components/comms/ActiveCallModal';

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

export default function App() {
  return (
    <AppProvider>
      <NexconnProvider>
        <EmergencyProvider>
          <HashRouter>
          <Routes>
            {/* Landing page: No sidebar, clean full hero */}
            <Route path="/" element={<Landing />} />

            {/* Public Emergency SOS (standalone QR-accessible public page, no admin sidebar) */}
            <Route path="/sos" element={<PublicSOS />} />
            <Route path="/sos/:cellId" element={<PublicSOS />} />

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
          <Route
            path="/settings"
            element={
              <AppShell>
                <Settings />
              </AppShell>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <IncomingCallPopup />
        <ActiveCallModal />
        </HashRouter>
        </EmergencyProvider>
      </NexconnProvider>
    </AppProvider>
  );
}
