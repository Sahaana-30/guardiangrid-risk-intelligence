import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Compass,
  FileHeart,
  Hand,
  Home,
  Image as ImageIcon,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Mic,
  Navigation,
  Phone,
  PhoneCall,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  Video,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEmergency } from '../context/EmergencyContext';
import { useNexconn } from '../context/NexconnContext';
import { MedicalHandoffCard } from '../components/emergency/MedicalHandoffCard';
import { EmergencyChatCard } from '../components/comms/EmergencyChatCard';
import { ResponderRoutePanel } from '../components/emergency/ResponderRoutePanel';
import { BackNavButton } from '../components/BackNavButton';
import type {
  EmergencyIncident,
  FieldResponderAction,
  IncidentState,
} from '../types/emergency';
import { makeChannelKey } from '../types/comms';
import {
  buildEmergencySmsUri,
  clearSentQueueItems,
  createClientRequestId,
  detectNetworkQuality,
  loadFieldKitQueue,
  upsertFieldKitQueueItem,
  type FieldKitQueueItem,
  type NetworkQualitySnapshot,
} from '../services/fieldKitResilience';

const GLOVE_MODE_KEY = 'gg_fieldkit_glove_mode';

const TAMIL_QUICK_REPLIES = [
  'உதவி தேவை',
  'சம்பவ இடத்தை அடைந்துவிட்டேன்',
  'மருத்துவ உதவி தேவை',
  'கூடுதல் உதவி அனுப்பவும்',
];

const ENGLISH_QUICK_REPLIES = [
  'Need assistance',
  'I have reached the location',
  'Medical assistance required',
  'Send backup',
];

const STATE_LABEL: Record<IncidentState, string> = {
  UNVERIFIED: 'Unverified SOS',
  VERIFIED: 'Verified',
  DISPATCHED: 'Dispatched',
  EN_ROUTE: 'En Route',
  ON_SCENE: 'On Scene',
  VICTIM_RECOVERED: 'Victim Recovered (Awaiting Dispatch Closure)',
  MEDICAL_HANDOFF: 'Medical Handoff',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};

function priorityForCategory(category: EmergencyIncident['category']): string {
  if (category === 'drowning' || category === 'swept_away') return 'P1 CRITICAL';
  if (category === 'medical' || category === 'missing_person') return 'P1 URGENT';
  return 'P2 PRIORITY';
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

interface ConfirmDialogState {
  action: 'VICTIM_RECOVERED' | 'REQUEST_BACKUP' | 'REJECT_ASSIGNMENT';
  title: string;
  body: string;
  confirmLabel: string;
}

function calcDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export const ResponderFieldKit: React.FC = () => {
  const { user, signInWithGoogle, signOut } = useAuth();
  const {
    incidents,
    responders,
    cells,
    loading: incidentsLoading,
    refreshIncidents,
    updateIncidentStatus,
  } = useEmergency();

  const {
    connectionStatus,
    activeOperator,
    directory,
    selectedChannelKey,
    messages,
    isLoadingMessages,
    activeCall,
    callError,
    clearCallError,
    selectChannel,
    sendTextToChannel,
    sendImage,
    sendVoice,
    startCall,
    reconnect,
    getOperatorName,
  } = useNexconn();

  const [gloveMode, setGloveMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GLOVE_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [mobileSection, setMobileSection] = useState<'actions' | 'comms' | 'medical'>('actions');
  const medicalSectionRef = useRef<HTMLDivElement | null>(null);

  const [searchParams] = useSearchParams();
  const deepLinkIncidentId = searchParams.get('incidentId');

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);

  // Validate deep-link ?incidentId= against authenticated tenant's incident list (Override #4)
  useEffect(() => {
    if (!deepLinkIncidentId || incidentsLoading) return;
    const trimmed = deepLinkIncidentId.trim();
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(trimmed)) {
      setDeepLinkNotice('Invalid incident ID in deep link.');
      return;
    }
    const match = incidents.find((i) => i.id === trimmed);
    if (match) {
      setSelectedIncidentId(match.id);
      setDeepLinkNotice(null);
    } else {
      setDeepLinkNotice(
        `Incident "${trimmed}" was not found in your authorized workspace or has been archived.`
      );
    }
  }, [deepLinkIncidentId, incidents, incidentsLoading]);
  const [network, setNetwork] = useState<NetworkQualitySnapshot>(() => detectNetworkQuality());
  const [gps, setGps] = useState<{ lat: number; lon: number; accuracy?: number; capturedAt: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [actionBusy, setActionBusy] = useState<FieldResponderAction | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const [queue, setQueue] = useState<FieldKitQueueItem[]>(() => loadFieldKitQueue());
  const [syncingQueue, setSyncingQueue] = useState(false);

  // Embedded Nexconn chat state
  const [quickLang, setQuickLang] = useState<'ta' | 'en'>('ta');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Push-to-Talk voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(GLOVE_MODE_KEY, gloveMode ? '1' : '0');
    } catch {
      // Ignore storage error
    }
  }, [gloveMode]);

  // Monitor network quality, GPS staleness tick & tenant queue reloads
  useEffect(() => {
    const updateNet = () => setNetwork(detectNetworkQuality());
    const reloadQueue = () => setQueue(loadFieldKitQueue());
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    window.addEventListener('gg-tenant-changed', reloadQueue);
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', updateNet);
    const tick = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => {
      window.removeEventListener('online', updateNet);
      window.removeEventListener('offline', updateNet);
      window.removeEventListener('gg-tenant-changed', reloadQueue);
      conn?.removeEventListener?.('change', updateNet);
      window.clearInterval(tick);
    };
  }, []);

  // Select active incident (prefer operational non-resolved incident)
  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.state !== 'RESOLVED' && i.state !== 'REJECTED'),
    [incidents]
  );

  const selectedIncident: EmergencyIncident | null = useMemo(() => {
    if (selectedIncidentId) {
      const match = incidents.find((i) => i.id === selectedIncidentId);
      if (match) return match;
    }
    return activeIncidents[0] || incidents[0] || null;
  }, [incidents, activeIncidents, selectedIncidentId]);

  const currentCell = useMemo(
    () => (selectedIncident ? cells.find((c) => c.id === selectedIncident.cellId) || null : null),
    [cells, selectedIncident]
  );

  // Identify responder actor profile
  const activeResponderProfile = useMemo(() => {
    if (activeOperator) {
      const byOp = responders.find((r) => r.nexconnUserId === activeOperator.userId);
      if (byOp) return byOp;
    }
    if (selectedIncident?.assignedResponderIds?.length) {
      const byAssigned = responders.find((r) =>
        selectedIncident.assignedResponderIds.includes(r.id)
      );
      if (byAssigned) return byAssigned;
    }
    return responders[0] || null;
  }, [activeOperator, responders, selectedIncident]);

  const actorId = activeResponderProfile?.id || activeOperator?.userId || 'resp-marina-1';
  const actorName = activeResponderProfile?.name || activeOperator?.name || 'Field Responder Unit';

  // Target dispatcher user ID for Live Visual Triage call
  const dispatchTargetOperator = useMemo(() => {
    const dispatcher = directory.find(
      (op) =>
        op.userId !== activeOperator?.userId &&
        (op.role.toLowerCase().includes('dispatch') || op.userId.includes('dispatch'))
    );
    if (dispatcher) return dispatcher;
    return directory.find((op) => op.userId !== activeOperator?.userId) || null;
  }, [directory, activeOperator]);

  // Capture GPS location
  const captureGps = useCallback((): Promise<{ lat: number; lon: number } | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('Browser geolocation unavailable on this device.');
      return Promise.resolve(null);
    }
    setGpsStatus('locating');
    setGpsError(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            capturedAt: Date.now(),
          };
          setGps(coords);
          setGpsStatus('ready');
          resolve({ lat: coords.lat, lon: coords.lon });
        },
        (err) => {
          setGpsStatus('error');
          setGpsError(err.message || 'Location permission denied.');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 }
      );
    });
  }, []);

  useEffect(() => {
    void captureGps();
  }, [captureGps]);

  // Auto-select the incident's Nexconn group channel when incident changes
  const groupId = selectedIncident?.nexconnGroupLive ? selectedIncident.nexconnGroupId : null;
  const groupChannelKey = groupId ? makeChannelKey('group', groupId) : null;

  useEffect(() => {
    if (groupId && connectionStatus === 'connected' && selectedChannelKey !== groupChannelKey) {
      void selectChannel('group', groupId);
    }
  }, [groupId, connectionStatus, selectedChannelKey, groupChannelKey, selectChannel]);

  const groupMessages = useMemo(() => {
    if (!groupChannelKey || selectedChannelKey !== groupChannelKey) return [];
    return messages;
  }, [groupChannelKey, selectedChannelKey, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [groupMessages.length]);

  // Sync offline queue whenever connectivity returns
  const flushOfflineQueue = useCallback(async () => {
    const current = loadFieldKitQueue();
    const pendingItems = current.filter((item) => item.status === 'pending' || item.status === 'failed');
    if (pendingItems.length === 0 || !navigator.onLine) return;

    setSyncingQueue(true);
    let syncedCount = 0;
    let failedCount = 0;

    for (const item of [...pendingItems].reverse()) {
      try {
        if (item.kind === 'status_update') {
          await updateIncidentStatus({
            incidentId: item.incidentId,
            nextState: item.nextState,
            requestBackup: item.requestBackup,
            rejectAssignment: item.rejectAssignment,
            arrivalVerification: item.arrivalVerification,
            actorId: item.actorId,
            actorName: item.actorName,
            actorRole: 'responder',
            note: item.note,
            clientRequestId: item.clientRequestId,
            responderLat: item.responderLat,
            responderLon: item.responderLon,
          });
          if (item.groupId && item.messageText && connectionStatus === 'connected') {
            try {
              await sendTextToChannel('group', item.groupId, item.messageText);
            } catch {
              // Group notification failure does not fail PostgreSQL status sync
            }
          }
        } else if (
          (item.kind === 'group_message' || item.kind === 'media_metadata') &&
          item.groupId &&
          item.messageText
        ) {
          if (connectionStatus !== 'connected') {
            throw new Error('Nexconn session disconnected');
          }
          await sendTextToChannel('group', item.groupId, item.messageText);
        }

        const updated = upsertFieldKitQueueItem({
          ...item,
          status: 'sent',
          attempts: item.attempts + 1,
          lastError: undefined,
          syncedAt: new Date().toISOString(),
        });
        setQueue(updated);
        syncedCount += 1;
      } catch (err: any) {
        const updated = upsertFieldKitQueueItem({
          ...item,
          status: 'failed',
          attempts: item.attempts + 1,
          lastError: err?.message || 'Sync retry failed',
        });
        setQueue(updated);
        failedCount += 1;
      }
    }

    setSyncingQueue(false);
    if (syncedCount > 0) {
      setFeedback({
        kind: 'success',
        text: `Synced ${syncedCount} queued field update${syncedCount > 1 ? 's' : ''} to Command Center.`,
      });
    } else if (failedCount > 0) {
      setFeedback({
        kind: 'error',
        text: `${failedCount} queued update${failedCount > 1 ? 's' : ''} failed to sync. Check connection and retry.`,
      });
    }
  }, [updateIncidentStatus, sendTextToChannel, connectionStatus]);

  useEffect(() => {
    if (network.online) {
      void flushOfflineQueue();
    }
  }, [network.online, flushOfflineQueue]);

  // Execute one-tap field status update
  const executeFieldAction = useCallback(
    async (action: FieldResponderAction) => {
      if (!selectedIncident) return;
      setActionBusy(action);
      setFeedback(null);

      const clientRequestId = createClientRequestId(`fk-${action.toLowerCase()}`);
      const isGpsFresh = gps ? Date.now() - gps.capturedAt <= 120_000 : false;
      const latestCoords = isGpsFresh && gps ? { lat: gps.lat, lon: gps.lon } : await captureGps();
      const isBackup = action === 'REQUEST_BACKUP';
      const isReject = action === 'REJECT_ASSIGNMENT';
      const nextState: IncidentState | undefined = isBackup || isReject ? undefined : action;

      let arrivalVerification: EmergencyIncident['arrivalVerification'] = undefined;
      if (action === 'ON_SCENE') {
        const targetLat = selectedIncident.lat ?? currentCell?.lat ?? null;
        const targetLon = selectedIncident.lon ?? currentCell?.lon ?? null;
        const distanceMeters =
          latestCoords && targetLat !== null && targetLon !== null
            ? calcDistanceMeters(latestCoords.lat, latestCoords.lon, targetLat, targetLon)
            : null;
        arrivalVerification =
          distanceMeters !== null && distanceMeters <= 300 ? 'gps_verified' : 'manual_confirmed';
      }

      const coordsText = latestCoords
        ? `GPS ${latestCoords.lat.toFixed(5)}, ${latestCoords.lon.toFixed(5)}`
        : 'GPS unavailable';

      const statusBanner =
        action === 'EN_ROUTE'
          ? 'EN ROUTE to incident cell'
          : action === 'ON_SCENE'
            ? 'ON SCENE at incident location'
            : action === 'VICTIM_RECOVERED'
              ? 'VICTIM RECOVERED (awaiting dispatcher confirmation & medical handoff)'
              : action === 'REJECT_ASSIGNMENT'
                ? 'DECLINED DISPATCH — requesting backup reassignment'
                : 'REQUESTING IMMEDIATE BACKUP';

      const groupBroadcast = `[FIELD UPDATE · ${selectedIncident.code}] ${actorName}: ${statusBanner} · ${selectedIncident.cellId} · ${coordsText}`;

      const queueOffline = (reason: string) => {
        const queued: FieldKitQueueItem = {
          id: clientRequestId,
          clientRequestId,
          kind: 'status_update',
          incidentId: selectedIncident.id,
          incidentCode: selectedIncident.code,
          action,
          nextState,
          requestBackup: isBackup,
          rejectAssignment: isReject,
          arrivalVerification,
          note: `${statusBanner} (${coordsText})`,
          actorId,
          actorName,
          responderLat: latestCoords?.lat ?? null,
          responderLon: latestCoords?.lon ?? null,
          groupId,
          messageText: groupBroadcast,
          status: 'pending',
          attempts: 0,
          lastError: reason,
          createdAt: new Date().toISOString(),
        };
        setQueue(upsertFieldKitQueueItem(queued));
        setFeedback({
          kind: 'info',
          text: `Saved offline (${action.replace('_', ' ')}). Will auto-sync when connectivity returns. Use 112, VHF Ch 16, or Device SMS App if urgent.`,
        });
      };

      if (!navigator.onLine) {
        queueOffline('Device offline');
        setActionBusy(null);
        return;
      }

      try {
        await updateIncidentStatus({
          incidentId: selectedIncident.id,
          nextState,
          requestBackup: isBackup,
          rejectAssignment: isReject,
          arrivalVerification,
          actorId,
          actorName,
          actorRole: 'responder',
          note: `${statusBanner} (${coordsText})`,
          clientRequestId,
          responderLat: latestCoords?.lat ?? null,
          responderLon: latestCoords?.lon ?? null,
        });

        let groupNote = '';
        if (groupId && connectionStatus === 'connected') {
          try {
            await sendTextToChannel('group', groupId, groupBroadcast);
            groupNote = ' and posted to Nexconn incident group';
          } catch {
            groupNote = ' (Nexconn group post failed — check comms)';
          }
        }

        setFeedback({
          kind: 'success',
          text: `${statusBanner} synced to Command Center${groupNote}.`,
        });
      } catch (err: any) {
        const msg = err?.message || 'Status update failed.';
        const isNetworkError =
          !navigator.onLine ||
          msg.toLowerCase().includes('failed to fetch') ||
          msg.toLowerCase().includes('network');
        if (isNetworkError) {
          queueOffline(msg);
        } else {
          setFeedback({ kind: 'error', text: msg });
        }
      } finally {
        setActionBusy(null);
      }
    },
    [
      selectedIncident,
      gps,
      captureGps,
      actorId,
      actorName,
      groupId,
      connectionStatus,
      updateIncidentStatus,
      sendTextToChannel,
    ]
  );

  const handleActionTap = (action: FieldResponderAction) => {
    if (!selectedIncident || actionBusy) return;
    if (action === 'VICTIM_RECOVERED') {
      setConfirmDialog({
        action: 'VICTIM_RECOVERED',
        title: 'Confirm Victim Recovered',
        body: 'This updates Command Center and posts to the incident group. The incident will NOT auto-resolve — a human dispatcher must confirm final medical handoff and closure.',
        confirmLabel: 'Confirm Victim Recovered',
      });
      return;
    }
    if (action === 'REQUEST_BACKUP') {
      setConfirmDialog({
        action: 'REQUEST_BACKUP',
        title: 'Confirm Immediate Backup Request',
        body: 'This immediately escalates the incident in Command Center and alerts dispatch and nearby rescue units in the Nexconn group.',
        confirmLabel: 'Request Backup Now',
      });
      return;
    }
    if (action === 'REJECT_ASSIGNMENT') {
      setConfirmDialog({
        action: 'REJECT_ASSIGNMENT',
        title: 'Decline Dispatch Assignment',
        body: 'This removes your unit from the assignment and immediately flags the highest-ranked backup responder for Command Center escalation.',
        confirmLabel: 'Confirm Decline & Escalate',
      });
      return;
    }
    void executeFieldAction(action);
  };

  // Live Visual Triage call launcher
  const handleLiveVisualTriage = async () => {
    clearCallError();
    if (network.tier === 'offline') {
      setFeedback({
        kind: 'error',
        text: 'Offline — WebRTC Live Visual Triage requires connectivity. Use Call 112, VHF Ch 16, or Device SMS App.',
      });
      return;
    }
    if (connectionStatus !== 'connected') {
      setFeedback({
        kind: 'error',
        text: 'Nexconn session is not connected. Tap Reconnect before starting Live Visual Triage.',
      });
      return;
    }
    if (!dispatchTargetOperator) {
      setFeedback({
        kind: 'error',
        text: 'No dispatch operator available in the Nexconn directory.',
      });
      return;
    }
    const mediaMode = network.recommendedCallMode === 'video' ? 'video' : 'audio';
    await startCall(dispatchTargetOperator.userId, mediaMode);
  };

  // Embedded Nexconn text & quick reply sender
  const handleSendGroupMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || !selectedIncident) return;
    setChatError(null);

    if (!navigator.onLine) {
      const clientRequestId = createClientRequestId('fk-msg');
      const queued: FieldKitQueueItem = {
        id: clientRequestId,
        clientRequestId,
        kind: 'group_message',
        incidentId: selectedIncident.id,
        incidentCode: selectedIncident.code,
        actorId,
        actorName,
        groupId,
        messageText: trimmed,
        status: 'pending',
        attempts: 0,
        lastError: 'Device offline',
        createdAt: new Date().toISOString(),
      };
      setQueue(upsertFieldKitQueueItem(queued));
      setChatInput('');
      setFeedback({
        kind: 'info',
        text: 'Message queued offline — will send to incident group when reconnected.',
      });
      return;
    }

    if (!groupId) {
      setChatError('No live Nexconn incident group linked yet. Verify incident in Command Center first.');
      return;
    }
    if (connectionStatus !== 'connected') {
      setChatError('Nexconn messaging is disconnected. Tap Reconnect above.');
      return;
    }

    setChatBusy(true);
    try {
      await sendTextToChannel('group', groupId, trimmed);
      setChatInput('');
    } catch (err: any) {
      setChatError(err?.message || 'Unable to send message to incident group.');
    } finally {
      setChatBusy(false);
    }
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setChatError(null);

    if (!navigator.onLine) {
      setChatError(
        `Photo uploads ("${file.name}") require active connectivity. Send a text update or status update to queue offline, or attach the photo once online.`
      );
      return;
    }

    if (!groupId || connectionStatus !== 'connected') {
      setChatError('Connect to a live incident group before sharing photos.');
      return;
    }
    setChatBusy(true);
    try {
      if (selectedChannelKey !== groupChannelKey) {
        await selectChannel('group', groupId);
      }
      await sendImage(file);
    } catch (err: any) {
      setChatError(err?.message || 'Image upload failed. Verify media storage and network.');
    } finally {
      setChatBusy(false);
    }
  };

  // Push-to-Talk HD Voice recording using MediaRecorder -> sendVoice
  const stopVoiceRecording = useCallback(
    (shouldSend: boolean) => {
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        setIsRecording(false);
        setRecordSeconds(0);
        return;
      }

      recorder.onstop = async () => {
        const stream = recordStreamRef.current;
        stream?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        mediaRecorderRef.current = null;

        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];
        setIsRecording(false);
        setRecordSeconds(0);

        if (!shouldSend || chunks.length === 0) return;

        const mimeType = recorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const voiceFile = new File([blob], `ptt-${Date.now()}.${ext}`, { type: mimeType });

        setChatBusy(true);
        setChatError(null);
        try {
          if (groupId && selectedChannelKey !== groupChannelKey) {
            await selectChannel('group', groupId);
          }
          await sendVoice(voiceFile);
        } catch (err: any) {
          setChatError(
            err?.message ||
              'Voice note upload failed. Ensure microphone permission and Nexconn media upload are available.'
          );
        } finally {
          setChatBusy(false);
        }
      };

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
    [groupId, groupChannelKey, selectedChannelKey, selectChannel, sendVoice]
  );

  const startVoiceRecording = async () => {
    setChatError(null);
    if (!groupId || connectionStatus !== 'connected') {
      setChatError('Connect to the incident Nexconn group before sending voice notes.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setChatError('Microphone recording is unavailable in this browser or requires HTTPS.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setChatError('Audio recording (MediaRecorder) is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordChunksRef.current.push(ev.data);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setChatError('Microphone permission denied. Allow microphone access in browser settings.');
      } else {
        setChatError(err?.message || 'Unable to start microphone recording.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const smsHref = useMemo(() => {
    return buildEmergencySmsUri({
      incidentCode: selectedIncident?.code || 'NO-INCIDENT',
      cellId: selectedIncident?.cellId || 'UNASSIGNED',
      regionName: currentCell?.siteName,
      statusLabel: selectedIncident ? STATE_LABEL[selectedIncident.state] : 'Standby',
      responderName: actorName,
      lat: gps?.lat ?? selectedIncident?.lat ?? null,
      lon: gps?.lon ?? selectedIncident?.lon ?? null,
    });
  }, [selectedIncident, currentCell, actorName, gps]);

  const pendingQueueCount = queue.filter((q) => q.status !== 'sent').length;
  const actionBtnHeight = gloveMode ? 'min-h-[84px] text-base px-5 py-4' : 'min-h-[60px] text-sm px-4 py-3';
  const canUpdateStatus =
    Boolean(selectedIncident) &&
    selectedIncident?.state !== 'UNVERIFIED' &&
    selectedIncident?.state !== 'RESOLVED' &&
    selectedIncident?.state !== 'REJECTED';

  const openMedicalSection = () => {
    setMobileSection('medical');
    window.setTimeout(() => {
      medicalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-[#1B2A38] px-3 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-4 pb-8">
        {/* Compact High-Contrast Field Header with GuardianGrid Branding & Auth */}
        <header className="bg-[#0B3B3C] text-white rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/15">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <BackNavButton fallbackPath="/command" variant="dark" />
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold"
              >
                <Compass className="w-4 h-4 text-[#A7F3D0]" />
                <span className="font-serif-heading tracking-tight">GuardianGrid</span>
              </Link>
              <span className="text-[#A7F3D0] font-bold uppercase tracking-wider hidden sm:inline">
                Responder Field Kit
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setGloveMode((g) => !g)}
                aria-pressed={gloveMode}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[40px] cursor-pointer ${
                  gloveMode
                    ? 'bg-[#F59E0B] text-[#111827] border-[#FBBF24]'
                    : 'bg-white/10 text-white border-white/25 hover:bg-white/20'
                }`}
              >
                <Hand className="w-4 h-4" />
                <span>{gloveMode ? 'Glove: ON' : 'Glove: OFF'}</span>
              </button>

              <Link
                to="/command"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white min-h-[40px]"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Command</span>
              </Link>

              <Link
                to="/messages"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white min-h-[40px]"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Messages</span>
              </Link>

              <Link
                to="/"
                aria-label="GuardianGrid Home"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white min-h-[40px]"
              >
                <Home className="w-4 h-4" />
              </Link>

              {user ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  title={user.email || 'Signed in'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white min-h-[40px] cursor-pointer"
                >
                  <span className="max-w-[90px] truncate">{user.displayName?.split(' ')[0] || 'Responder'}</span>
                  <LogOut className="w-3.5 h-3.5 text-[#A7F3D0]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F766E] hover:bg-[#115E59] border border-teal-300/30 text-xs font-bold text-white min-h-[40px] cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#A7F3D0] font-semibold uppercase tracking-wider">
                <Radio className="w-4 h-4" />
                <span>{actorName}</span>
                {selectedIncident && (
                  <>
                    <span>·</span>
                    <span>{priorityForCategory(selectedIncident.category)}</span>
                  </>
                )}
              </div>
              <h1 className="font-serif-heading text-xl sm:text-2xl font-bold tracking-tight">
                {selectedIncident
                  ? `${selectedIncident.code} · ${selectedIncident.cellId}`
                  : 'No Active Incident Assigned'}
              </h1>
              <p className="text-xs text-[#E2E8F0]">
                {selectedIncident
                  ? `${STATE_LABEL[selectedIncident.state]} · ${selectedIncident.siteName}`
                  : 'Select an incident or monitor Command Center for dispatch.'}
              </p>
            </div>

            {selectedIncident && (
              <button
                type="button"
                onClick={openMedicalSection}
                className="self-start sm:self-center inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#0B3B3C] hover:bg-[#FBF8F3] text-xs font-bold shadow-xs cursor-pointer min-h-[40px]"
              >
                <FileHeart className="w-4 h-4 text-[#0F766E]" />
                <span>Medical Handoff (SBAR)</span>
              </button>
            )}
          </div>
        </header>

      {/* Network Quality & Degradation Banner */}
      <div
        role="status"
        className={`rounded-2xl px-4 py-3 border flex flex-wrap items-center justify-between gap-2 text-xs font-semibold ${
          network.tier === 'offline'
            ? 'bg-[#FEF2F2] border-[#DC2626] text-[#991B1B]'
            : network.tier === 'degraded'
              ? 'bg-[#FFFBEB] border-[#D97706] text-[#92400E]'
              : 'bg-[#ECFDF5] border-[#0F766E]/40 text-[#0B3B3C]'
        }`}
      >
        <div className="flex items-center gap-2">
          {network.tier === 'offline' ? (
            <WifiOff className="w-4 h-4 shrink-0" />
          ) : (
            <Wifi className="w-4 h-4 shrink-0" />
          )}
          <span>
            {network.tier === 'offline'
              ? 'OFFLINE MODE'
              : network.tier === 'degraded'
                ? 'DEGRADED NETWORK · AUDIO-ONLY'
                : 'GOOD CONNECTIVITY'}
          </span>
          <span className="font-normal">— {network.summary}</span>
        </div>

        <div className="flex items-center gap-3">
          {pendingQueueCount > 0 && (
            <span className="font-mono text-[#92400E]">
              {pendingQueueCount} queued
            </span>
          )}
          {connectionStatus !== 'connected' && network.online && (
            <button
              type="button"
              onClick={() => void reconnect()}
              className="px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold min-h-[36px]"
            >
              Reconnect Nexconn
            </button>
          )}
        </div>
      </div>

      {/* Deep-Link Validation Notice */}
      {deepLinkNotice && (
        <div className="rounded-2xl px-4 py-3 border bg-[#FFFBEB] border-[#D97706] text-[#92400E] flex items-start justify-between gap-3 text-xs font-medium">
          <span>{deepLinkNotice}</span>
          <button
            type="button"
            onClick={() => setDeepLinkNotice(null)}
            className="text-xs font-bold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-2xl px-4 py-3 border flex items-start justify-between gap-3 text-xs font-medium ${
            feedback.kind === 'error'
              ? 'bg-[#FEF2F2] border-[#DC2626] text-[#991B1B]'
              : feedback.kind === 'info'
                ? 'bg-[#FFFBEB] border-[#D97706] text-[#92400E]'
                : 'bg-[#ECFDF5] border-[#0F766E] text-[#0B3B3C]'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="p-1 rounded hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mobile Thumb-First Quick Section Switcher (< lg only) */}
      <div className="lg:hidden grid grid-cols-3 gap-2 bg-white border-2 border-[#0B3B3C]/15 rounded-2xl p-1.5 text-xs font-bold">
        <button
          type="button"
          onClick={() => setMobileSection('actions')}
          className={`py-2.5 px-2 rounded-xl flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
            mobileSection === 'actions' ? 'bg-[#0B3B3C] text-white' : 'text-[#5B687A]'
          }`}
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>1. Status &amp; Map</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('comms')}
          className={`py-2.5 px-2 rounded-xl flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
            mobileSection === 'comms' ? 'bg-[#0B3B3C] text-white' : 'text-[#5B687A]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span>2. Chat &amp; PTT</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('medical')}
          className={`py-2.5 px-2 rounded-xl flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
            mobileSection === 'medical' ? 'bg-[#0B3B3C] text-white' : 'text-[#5B687A]'
          }`}
        >
          <FileHeart className="w-3.5 h-3.5 shrink-0" />
          <span>3. Medical SBAR</span>
        </button>
      </div>

      {/* Main 2-Column Responsive Layout (Mobile tabbed thumb access, Desktop 2-col side-by-side) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Incident Context, State-Dependent Primary CTA, Live Visual Triage, Route Map, Offline Queue */}
        <div
          className={`lg:col-span-6 space-y-4 ${
            mobileSection === 'actions' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Active Incident & GPS Context Card */}
          <section className="bg-white border-2 border-[#0B3B3C]/15 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="field-incident-select"
                className="text-xs font-bold uppercase tracking-wider text-[#5B687A]"
              >
                Active Incident Assignment
              </label>
              <button
                type="button"
                onClick={() => void refreshIncidents()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {incidentsLoading ? (
              <p className="text-xs text-[#5B687A]">Loading assigned incidents...</p>
            ) : incidents.length === 0 ? (
              <p className="text-xs text-[#5B687A]">
                No incidents found. Trigger a drill or submit a Public SOS to test field workflows.
              </p>
            ) : (
              <select
                id="field-incident-select"
                value={selectedIncident?.id || ''}
                onChange={(e) => setSelectedIncidentId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#FBF8F3] text-sm font-bold text-[#1B2A38] min-h-[46px]"
              >
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.code} — {inc.category.replace('_', ' ').toUpperCase()} · {inc.cellId} ({inc.state})
                  </option>
                ))}
              </select>
            )}

            {selectedIncident && (
              <div className="space-y-2 pt-1 text-xs text-[#1B2A38]">
                <p className="text-sm font-semibold leading-snug">{selectedIncident.description}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#5B687A]">
                  <span className="inline-flex items-center gap-1 font-semibold text-[#0B3B3C]">
                    <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
                    {selectedIncident.cellLabel}
                  </span>
                  <span>·</span>
                  <span>
                    {selectedIncident.isSimulated ? 'SIMULATED DRILL' : 'REAL PUBLIC SOS'}
                  </span>
                  {selectedIncident.lat !== null && selectedIncident.lon !== null && (
                    <>
                      <span>·</span>
                      <span className="font-mono">
                        Target: {selectedIncident.lat.toFixed(4)}, {selectedIncident.lon.toFixed(4)}
                      </span>
                    </>
                  )}
                </div>

                {/* Responder GPS Sync Row */}
                <div className="pt-2 border-t border-[#E9E1D3] flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-[#5B687A] flex items-center gap-1.5">
                    <LocateFixed className="w-3.5 h-3.5 text-[#0F766E]" />
                    {gps ? (
                      <span className="font-mono text-[#1B2A38] font-medium">
                        Unit GPS: {gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}
                        {gps.accuracy ? ` (±${gps.accuracy}m)` : ''}
                        {nowTick - gps.capturedAt > 120_000 && (
                          <span className="ml-1.5 text-[#B45309] font-sans font-bold">
                            · Stale (&gt;2m)
                          </span>
                        )}
                      </span>
                    ) : gpsStatus === 'locating' ? (
                      <span>Acquiring GPS fix...</span>
                    ) : (
                      <span className="text-[#B45309]">{gpsError || 'GPS unavailable'}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void captureGps()}
                    className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#0B3B3C] hover:bg-[#FBF8F3] min-h-[36px] cursor-pointer"
                  >
                    Update GPS
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* State-Dependent Primary Field Status Controls (Thumb-First Placement) */}
          <section className="bg-white border-2 border-[#0B3B3C]/15 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B3B3C]">
                Field Status Controls
              </h2>
              {selectedIncident && (
                <span className="text-xs font-bold text-[#0F766E]">
                  Current: {STATE_LABEL[selectedIncident.state]}
                </span>
              )}
            </div>

            {selectedIncident?.state === 'UNVERIFIED' && (
              <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#D97706] text-xs text-[#92400E] font-medium">
                Incident is still UNVERIFIED. A human dispatcher must verify it in Command Center before field status transitions are accepted.
              </div>
            )}

            {selectedIncident &&
            (selectedIncident.state === 'VERIFIED' || selectedIncident.state === 'DISPATCHED') ? (
              <div className={gloveMode ? 'space-y-3.5' : 'space-y-2.5'}>
                <button
                  type="button"
                  disabled={!canUpdateStatus || actionBusy !== null}
                  onClick={() => handleActionTap('EN_ROUTE')}
                  className={`w-full rounded-xl font-extrabold flex items-center justify-center gap-2.5 transition-colors border-2 disabled:opacity-45 cursor-pointer ${
                    gloveMode ? 'min-h-[90px] text-lg px-5 py-4' : 'min-h-[72px] text-base px-4 py-3.5'
                  } bg-[#0F766E] hover:bg-[#0B5D56] text-white border-[#0B3B3C] shadow-sm`}
                >
                  <Navigation className="w-5 h-5 shrink-0" />
                  <span>{actionBusy === 'EN_ROUTE' ? 'UPDATING...' : 'CONFIRM EN ROUTE'}</span>
                </button>

                <div className={`grid grid-cols-2 ${gloveMode ? 'gap-3.5' : 'gap-2.5'}`}>
                  <button
                    type="button"
                    disabled={!canUpdateStatus || actionBusy !== null}
                    onClick={() => handleActionTap('ON_SCENE')}
                    className={`w-full rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border-2 disabled:opacity-45 cursor-pointer ${actionBtnHeight} bg-[#FBF8F3] hover:bg-white text-[#0B3B3C] border-[#0B3B3C]/30`}
                  >
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span>{actionBusy === 'ON_SCENE' ? 'UPDATING...' : 'ON SCENE'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canUpdateStatus || actionBusy !== null}
                    onClick={() => handleActionTap('REQUEST_BACKUP')}
                    className={`w-full rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border-2 disabled:opacity-45 cursor-pointer ${actionBtnHeight} bg-[#DC2626] hover:bg-[#B91C1C] text-white border-[#7F1D1D]`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {actionBusy === 'REQUEST_BACKUP' ? 'ESCALATING...' : 'REQUEST BACKUP'}
                    </span>
                  </button>
                </div>
              </div>
            ) : selectedIncident?.state === 'EN_ROUTE' ? (
              <div className={gloveMode ? 'space-y-3.5' : 'space-y-2.5'}>
                <button
                  type="button"
                  disabled={!canUpdateStatus || actionBusy !== null}
                  onClick={() => handleActionTap('ON_SCENE')}
                  className={`w-full rounded-xl font-extrabold flex items-center justify-center gap-2.5 transition-colors border-2 disabled:opacity-45 cursor-pointer ${
                    gloveMode ? 'min-h-[90px] text-lg px-5 py-4' : 'min-h-[72px] text-base px-4 py-3.5'
                  } bg-[#0B3B3C] hover:bg-[#1B2A38] text-white border-[#0B3B3C] shadow-sm`}
                >
                  <MapPin className="w-5 h-5 shrink-0" />
                  <span>{actionBusy === 'ON_SCENE' ? 'UPDATING...' : 'CONFIRM ON SCENE'}</span>
                </button>

                <div className={`grid grid-cols-2 ${gloveMode ? 'gap-3.5' : 'gap-2.5'}`}>
                  <button
                    type="button"
                    disabled={!canUpdateStatus || actionBusy !== null}
                    onClick={() => handleActionTap('VICTIM_RECOVERED')}
                    className={`w-full rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border-2 disabled:opacity-45 cursor-pointer ${actionBtnHeight} bg-[#15803D] hover:bg-[#166534] text-white border-[#14532D]`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {actionBusy === 'VICTIM_RECOVERED' ? 'UPDATING...' : 'VICTIM RECOVERED'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!canUpdateStatus || actionBusy !== null}
                    onClick={() => handleActionTap('REQUEST_BACKUP')}
                    className={`w-full rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border-2 disabled:opacity-45 cursor-pointer ${actionBtnHeight} bg-[#DC2626] hover:bg-[#B91C1C] text-white border-[#7F1D1D]`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {actionBusy === 'REQUEST_BACKUP' ? 'ESCALATING...' : 'REQUEST BACKUP'}
                    </span>
                  </button>
                </div>
              </div>
            ) : selectedIncident?.state === 'ON_SCENE' ? (
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${gloveMode ? 'gap-3.5' : 'gap-2.5'}`}>
                <button
                  type="button"
                  disabled={!canUpdateStatus || actionBusy !== null}
                  onClick={() => handleActionTap('VICTIM_RECOVERED')}
                  className={`w-full rounded-xl font-extrabold flex items-center justify-center gap-2.5 transition-colors border-2 disabled:opacity-45 cursor-pointer ${
                    gloveMode ? 'min-h-[90px] text-base px-5 py-4' : 'min-h-[72px] text-sm px-4 py-3'
                  } bg-[#15803D] hover:bg-[#166534] text-white border-[#14532D] shadow-sm`}
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>
                    {actionBusy === 'VICTIM_RECOVERED' ? 'UPDATING...' : 'VICTIM RECOVERED'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!canUpdateStatus || actionBusy !== null}
                  onClick={() => handleActionTap('REQUEST_BACKUP')}
                  className={`w-full rounded-xl font-extrabold flex items-center justify-center gap-2.5 transition-colors border-2 disabled:opacity-45 cursor-pointer ${
                    gloveMode ? 'min-h-[90px] text-base px-5 py-4' : 'min-h-[72px] text-sm px-4 py-3'
                  } bg-[#DC2626] hover:bg-[#B91C1C] text-white border-[#7F1D1D] shadow-sm`}
                >
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>
                    {actionBusy === 'REQUEST_BACKUP' ? 'ESCALATING...' : 'REQUEST BACKUP'}
                  </span>
                </button>
              </div>
            ) : selectedIncident &&
              (selectedIncident.state === 'VICTIM_RECOVERED' ||
                selectedIncident.state === 'MEDICAL_HANDOFF') ? (
              <div className={gloveMode ? 'space-y-3.5' : 'space-y-2.5'}>
                <button
                  type="button"
                  onClick={openMedicalSection}
                  className={`w-full rounded-xl font-extrabold flex items-center justify-center gap-2.5 transition-colors border-2 cursor-pointer ${
                    gloveMode ? 'min-h-[84px] text-base px-5 py-4' : 'min-h-[68px] text-sm px-4 py-3'
                  } bg-[#0F766E] hover:bg-[#0B5D56] text-white border-[#0B3B3C] shadow-sm`}
                >
                  <FileHeart className="w-5 h-5 shrink-0" />
                  <span>OPEN MEDICAL HANDOFF (SBAR)</span>
                </button>
                <button
                  type="button"
                  disabled={!canUpdateStatus || actionBusy !== null}
                  onClick={() => handleActionTap('REQUEST_BACKUP')}
                  className="w-full rounded-xl font-bold text-xs px-4 py-2.5 min-h-[44px] border border-[#DC2626]/40 text-[#991B1B] bg-[#FEF2F2] hover:bg-[#FEE2E2] transition-colors disabled:opacity-45 cursor-pointer"
                >
                  {actionBusy === 'REQUEST_BACKUP' ? 'ESCALATING...' : 'Request Backup'}
                </button>
              </div>
            ) : null}

            {selectedIncident?.state === 'DISPATCHED' && (
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={() => handleActionTap('REJECT_ASSIGNMENT')}
                className="w-full rounded-xl font-bold text-xs px-4 py-2.5 min-h-[44px] border border-[#DC2626]/40 text-[#991B1B] bg-[#FEF2F2] hover:bg-[#FEE2E2] transition-colors disabled:opacity-45 cursor-pointer"
              >
                {actionBusy === 'REJECT_ASSIGNMENT'
                  ? 'DECLINING & ESCALATING...'
                  : 'Decline Assignment & Trigger Backup Escalation'}
              </button>
            )}

            <p className="text-[11px] text-[#5B687A]">
              VICTIM RECOVERED notifies dispatch but never auto-closes the incident. Dispatcher confirmation is required to resolve.
            </p>
          </section>

          {/* Collapsible Google Maps Navigation & Route Panel (with Leaflet Fallback) */}
          {selectedIncident && (
            <ResponderRoutePanel
              incident={selectedIncident}
              cell={currentCell}
              responderGps={gps}
              responderProfile={activeResponderProfile}
              gloveMode={gloveMode}
              gpsStatus={gpsStatus}
              onRefreshGps={() => void captureGps()}
            />
          )}

          {/* Prominent One-Tap Live Visual Triage (@nexconn/call) */}
          <section className="bg-white border-2 border-[#0F766E]/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B3B3C]">
                  Live Visual Triage (Nexconn Call)
                </h2>
                <p className="text-xs text-[#5B687A] mt-0.5">
                  {network.tier === 'good'
                    ? `Direct Video + Audio call to ${dispatchTargetOperator?.name || 'Dispatch Control'}`
                    : network.tier === 'degraded'
                      ? 'Bandwidth degraded — call will start in Audio-Only mode'
                      : 'Offline — WebRTC call unavailable; use 112 / VHF / Device SMS'}
                </p>
              </div>
              {activeCall && (
                <span className="text-xs font-bold text-[#0F766E]">
                  Call: {activeCall.status.toUpperCase()}
                </span>
              )}
            </div>

            {callError && (
              <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#DC2626] text-xs text-[#991B1B] flex items-start justify-between gap-2">
                <span>{callError}</span>
                <button
                  type="button"
                  onClick={clearCallError}
                  className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
                  aria-label="Clear call error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={network.tier === 'offline' || Boolean(activeCall)}
              onClick={() => void handleLiveVisualTriage()}
              className={`w-full rounded-xl font-extrabold flex items-center justify-center gap-3 transition-colors border-2 disabled:opacity-50 cursor-pointer ${
                gloveMode ? 'min-h-[84px] text-lg px-5 py-4' : 'min-h-[60px] text-base px-4 py-3'
              } bg-[#0B3B3C] hover:bg-[#0F766E] text-white border-[#0B3B3C]`}
            >
              {network.tier === 'degraded' ? (
                <PhoneCall className="w-6 h-6 shrink-0" />
              ) : (
                <Video className="w-6 h-6 shrink-0" />
              )}
              <span>
                {activeCall
                  ? `TRIAGE CALL ${activeCall.status.toUpperCase()}`
                  : network.tier === 'degraded'
                    ? 'LIVE AUDIO TRIAGE (LOW BANDWIDTH)'
                    : 'LIVE VISUAL TRIAGE'}
              </span>
            </button>
          </section>

          {/* Offline Sync Queue & Emergency Fallback Bar */}
          <section className="bg-white border-2 border-[#0B3B3C]/15 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B3B3C]">
                Offline Queue &amp; Emergency Fallback
              </h2>
              <div className="flex items-center gap-2">
                {pendingQueueCount > 0 && (
                  <button
                    type="button"
                    disabled={syncingQueue || !network.online}
                    onClick={() => void flushOfflineQueue()}
                    className="px-2.5 py-1 rounded-lg bg-[#0F766E] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {syncingQueue ? 'Syncing...' : 'Retry Sync'}
                  </button>
                )}
                {queue.some((q) => q.status === 'sent') && (
                  <button
                    type="button"
                    onClick={() => setQueue(clearSentQueueItems())}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#CBD5E1] text-xs text-[#5B687A] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Sent</span>
                  </button>
                )}
              </div>
            </div>

            {queue.length > 0 ? (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {queue.map((item) => (
                  <li
                    key={item.clientRequestId}
                    className="text-xs px-3 py-2 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-[#1B2A38]">
                        {item.action ? item.action.replace('_', ' ') : 'Group Message'}
                      </span>
                      <span className="text-[#5B687A]"> · {item.incidentCode}</span>
                      {item.lastError && item.status !== 'sent' && (
                        <p className="text-[11px] text-[#B91C1C] truncate">{item.lastError}</p>
                      )}
                    </div>
                    <span
                      className={`font-mono text-[11px] font-bold uppercase shrink-0 ${
                        item.status === 'sent'
                          ? 'text-[#15803D]'
                          : item.status === 'failed'
                            ? 'text-[#DC2626]'
                            : 'text-[#B45309]'
                      }`}
                    >
                      {item.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#5B687A]">
                All field updates synced. Offline updates are stored locally with duplicate-safe request IDs.
              </p>
            )}

            {/* 112 / VHF / Device SMS Fallback */}
            <div className="pt-3 border-t border-[#E9E1D3] grid grid-cols-1 sm:grid-cols-3 gap-2">
              <a
                href="tel:112"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold min-h-[44px]"
              >
                <Phone className="w-4 h-4" />
                <span>Call 112</span>
              </a>
              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#FBF8F3] border border-[#CBD5E1] text-[#1B2A38] text-xs font-bold min-h-[44px]">
                <Radio className="w-4 h-4 text-[#0F766E]" />
                <span>VHF Ch 16</span>
              </div>
              <a
                href={smsHref}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#0B3B3C] hover:bg-[#1B2A38] text-white text-xs font-bold min-h-[44px]"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open SMS App</span>
              </a>
            </div>
            <p className="text-[11px] text-[#5B687A]">
              Open SMS App pre-fills your incident coordinates in the device SMS application; you must confirm sending manually.
            </p>
          </section>
        </div>

        {/* Right Column: Embedded Nexconn Group Comms + Quick Replies + PTT + Medical SBAR */}
        <div className="lg:col-span-6 space-y-4">
          <section
            className={`bg-white border-2 border-[#0B3B3C]/15 rounded-2xl flex flex-col overflow-hidden min-h-[540px] ${
              mobileSection === 'comms' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="px-4 py-3 border-b border-[#E9E1D3] bg-[#FBF8F3] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#0B3B3C] flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#0F766E]" />
                  <span>Incident Nexconn Group</span>
                </h2>
                <p className="text-[11px] text-[#5B687A]">
                  {groupId
                    ? `${selectedIncident?.nexconnGroupName || groupId} · ${connectionStatus}`
                    : 'Group activates after incident verification in Command Center'}
                </p>
              </div>
              <Link
                to="/messages"
                className="text-xs font-semibold text-[#0F766E] hover:underline"
              >
                Full Comms View
              </Link>
            </div>

            {/* Tamil & English Quick Replies + PTT right in thumb reach above/below feed */}
            <div className="px-4 py-3 border-b border-[#E9E1D3] bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B687A]">
                  One-Tap Quick Replies
                </span>
                <div className="inline-flex rounded-lg border border-[#CBD5E1] overflow-hidden text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setQuickLang('ta')}
                    className={`px-2.5 py-1 cursor-pointer ${
                      quickLang === 'ta' ? 'bg-[#0F766E] text-white' : 'bg-white text-[#5B687A]'
                    }`}
                  >
                    தமிழ்
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickLang('en')}
                    className={`px-2.5 py-1 cursor-pointer ${
                      quickLang === 'en' ? 'bg-[#0F766E] text-white' : 'bg-white text-[#5B687A]'
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(quickLang === 'ta' ? TAMIL_QUICK_REPLIES : ENGLISH_QUICK_REPLIES).map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    disabled={chatBusy}
                    onClick={() => void handleSendGroupMessage(phrase)}
                    className={`text-left px-3 rounded-xl border-2 border-[#CBD5E1] hover:border-[#0F766E] bg-[#FBF8F3] text-[#1B2A38] font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                      gloveMode ? 'min-h-[54px] text-sm py-2.5' : 'min-h-[42px] text-xs py-2'
                    }`}
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Feed */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[360px] bg-[#FAF7F0]">
              {!groupId ? (
                <div className="py-12 text-center space-y-2 text-xs text-[#5B687A]">
                  <p className="font-semibold text-[#1B2A38]">
                    No live Nexconn group for this incident yet
                  </p>
                  <p>
                    Verify the incident in Command Center to provision its real-time Nexconn group channel.
                  </p>
                </div>
              ) : isLoadingMessages ? (
                <p className="text-xs text-[#5B687A] text-center py-8">Loading group messages...</p>
              ) : groupMessages.length === 0 ? (
                <p className="text-xs text-[#5B687A] text-center py-8">
                  No messages yet. Use a Tamil/English quick reply, photo, or Push-to-Talk voice note.
                </p>
              ) : (
                groupMessages.map((msg) => {
                  const isMine = msg.direction === 'send';
                  const handoffMatch =
                    msg.handoffMarker ||
                    (msg.kind === 'text'
                      ? (() => {
                          const m = msg.text.match(/^\[GG_MEDICAL_HANDOFF:([^:\]]+):([^\]]+)\]/);
                          return m ? { reportId: m[1], incidentId: m[2] } : undefined;
                        })()
                      : undefined);
                  if (handoffMatch) {
                    return (
                      <div key={msg.messageId || String(msg.clientId)} className="w-full">
                        <MedicalHandoffCard
                          incidentId={handoffMatch.incidentId}
                          embeddedReportId={handoffMatch.reportId}
                          compact={true}
                          canReviewAndShare={false}
                        />
                      </div>
                    );
                  }
                  if (msg.sosCard || msg.sbarCard) {
                    return (
                      <div key={msg.messageId || String(msg.clientId)} className="w-full">
                        <EmergencyChatCard sosCard={msg.sosCard} sbarCard={msg.sbarCard} />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={msg.messageId || String(msg.clientId)}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm border ${
                          isMine
                            ? 'bg-[#0B3B3C] text-white border-[#0B3B3C]'
                            : 'bg-white text-[#1B2A38] border-[#CBD5E1]'
                        }`}
                      >
                        {!isMine && (
                          <p className="text-[11px] font-bold text-[#0F766E] mb-1">
                            {getOperatorName(msg.senderUserId)}
                          </p>
                        )}

                        {msg.kind === 'image' && msg.imageUrl ? (
                          <a href={msg.imageUrl} target="_blank" rel="noreferrer">
                            <img
                              src={msg.imageUrl}
                              alt="Field photo"
                              className="max-h-48 rounded-lg object-cover"
                            />
                          </a>
                        ) : msg.kind === 'voice' && msg.audioUrl ? (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold flex items-center gap-1.5">
                              <Mic className="w-3.5 h-3.5" />
                              <span>
                                Voice Note{msg.audioDuration ? ` (${msg.audioDuration}s)` : ''}
                              </span>
                            </p>
                            <audio controls src={msg.audioUrl} className="max-w-full h-9" />
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words leading-snug">{msg.text}</p>
                        )}

                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                            isMine ? 'text-[#A7F3D0]' : 'text-[#5B687A]'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formatTime(new Date(msg.sentTime).toISOString())}</span>
                          {isMine &&
                            (msg.sentStatus === 'read' ? (
                              <CheckCheck className="w-3.5 h-3.5" aria-label="Read" />
                            ) : msg.sentStatus === 'sent' ? (
                              <Check className="w-3.5 h-3.5" aria-label="Sent" />
                            ) : null)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Media + Push-to-Talk + Text Composer */}
            <div className="p-3.5 border-t border-[#E9E1D3] bg-[#FBF8F3] space-y-2.5">
              {chatError && (
                <div className="p-2.5 rounded-xl bg-[#FEF2F2] border border-[#DC2626] text-xs text-[#991B1B]">
                  {chatError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageFile}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={
                    chatBusy || !network.online || !groupId || connectionStatus !== 'connected'
                  }
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-white text-xs font-bold text-[#1B2A38] hover:border-[#0F766E] min-h-[44px] disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-[#0F766E]" />
                  <span>Photo</span>
                </button>

                {!isRecording ? (
                  <button
                    type="button"
                    disabled={
                      chatBusy || !network.online || !groupId || connectionStatus !== 'connected'
                    }
                    onClick={() => void startVoiceRecording()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5D56] text-white text-xs font-bold min-h-[44px] disabled:opacity-50 cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Push-to-Talk Voice</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stopVoiceRecording(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#DC2626] text-white text-xs font-bold min-h-[44px] cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop &amp; Send ({recordSeconds}s)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => stopVoiceRecording(false)}
                      className="px-3 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-xs font-semibold text-[#5B687A] min-h-[44px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  disabled={
                    chatBusy || !network.online || !groupId || connectionStatus !== 'connected'
                  }
                  onClick={() => imageInputRef.current?.click()}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-xs font-semibold text-[#5B687A] min-h-[44px] disabled:opacity-50 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Gallery</span>
                </button>
              </div>

              {!network.online && (
                <p className="text-[11px] text-[#92400E]">
                  Offline: text messages queue locally; photos and voice notes require connectivity.
                </p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendGroupMessage(chatInput);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send field update to incident group..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-white text-sm text-[#1B2A38] min-h-[46px]"
                />
                <button
                  type="submit"
                  disabled={chatBusy || !chatInput.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0B3B3C] hover:bg-[#0F766E] text-white text-sm font-bold min-h-[46px] disabled:opacity-45 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </section>

          {/* Direct Medical Handoff SBAR Access for Field Responder */}
          {selectedIncident && (
            <div
              ref={medicalSectionRef}
              className={mobileSection === 'medical' ? 'block' : 'hidden lg:block'}
            >
              {selectedIncident.state === 'UNVERIFIED' || selectedIncident.state === 'REJECTED' ? (
                <div className="bg-white border-2 border-[#0B3B3C]/15 rounded-2xl p-4 text-xs text-[#5B687A]">
                  <p className="font-bold text-[#0B3B3C] mb-1">Medical Handoff (SBAR)</p>
                  <p>
                    Medical SBAR handoff drafts become available once this incident is verified by Coastal Dispatch.
                  </p>
                </div>
              ) : (
                <MedicalHandoffCard
                  incidentId={selectedIncident.id}
                  incidentCode={selectedIncident.code}
                  cellId={selectedIncident.cellId}
                  nexconnGroupLive={selectedIncident.nexconnGroupLive}
                  canReviewAndShare={false}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Critical Field Actions */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-field-action-title"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border-2 border-[#0B3B3C] p-5 space-y-4 shadow-2xl">
            <h3 id="confirm-field-action-title" className="text-lg font-bold text-[#0B3B3C]">
              {confirmDialog.title}
            </h3>
            <p className="text-sm text-[#1B2A38] leading-relaxed">{confirmDialog.body}</p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-3 rounded-xl border-2 border-[#CBD5E1] bg-white text-sm font-bold text-[#1B2A38] min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const act = confirmDialog.action;
                  setConfirmDialog(null);
                  void executeFieldAction(act);
                }}
                className={`px-4 py-3 rounded-xl text-sm font-bold text-white min-h-[48px] ${
                  confirmDialog.action === 'REQUEST_BACKUP'
                    ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                    : 'bg-[#15803D] hover:bg-[#166534]'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
