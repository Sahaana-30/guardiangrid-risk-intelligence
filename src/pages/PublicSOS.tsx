import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Phone,
  MapPin,
  Mic,
  MicOff,
  Camera,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Compass,
  Send,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import type {
  EmergencyCategory,
  EmergencyLanguage,
  PublicSOSPayload,
  PublicSOSReceipt,
  RescueCell,
} from '../types/emergency';
import {
  enqueueOfflineSOS,
  fetchRescueCells,
  flushOfflineSOSQueue,
  getOfflineSOSQueue,
  submitPublicSOS,
} from '../services/emergencyApi';

const COPY = {
  en: {
    emergencyBanner: 'Life-threatening emergency? Call India Emergency 112 immediately',
    call112: 'Call 112 Now',
    title: 'Public Water Safety SOS',
    subtitle: 'Report a coastal emergency to GuardianGrid dispatchers for human verification.',
    safetyNotice:
      'Important: This form alerts coastal dispatchers for human verification. It does not automatically dispatch 112 ambulances or hospitals. Always call 112 directly for immediate life-threatening emergencies.',
    categoryHeading: '1. Select Emergency Type',
    locationHeading: '2. Location & Beach Rescue Cell',
    detailsHeading: '3. Report Details (Voice or Text)',
    useGps: 'Detect My GPS Location',
    gpsLocating: 'Locating GPS...',
    voiceStart: 'Start Voice Dictation (English)',
    voiceStop: 'Stop Listening',
    voiceUnsupported: 'Voice dictation is not supported in this browser. Type your report below.',
    photoLabel: 'Optional Photo (compressed for low-network)',
    lowNetworkToggle: 'Low-Network Mode (text-only, offline queue enabled)',
    submitBtn: 'Send SOS Alert for Verification',
    submitting: 'Sending SOS...',
    queuedNotice:
      'You are offline or in low-network fallback. Your SOS is safely queued locally and will auto-submit when signal returns. Call 112 or alert the nearest lifeguard tower immediately.',
    receiptTitle: 'SOS Alert Received — Pending Human Verification',
    receiptBody:
      'Your report is now in the GuardianGrid Incident Command queue. A human dispatcher must verify the alert before responders are dispatched.',
    newReport: 'Submit Another Report',
    categories: {
      drowning: { label: 'Drowning', hint: 'Person struggling or submerged in water' },
      swept_away: { label: 'Swept-Away Swimmer', hint: 'Pulled past surf zone by rip current' },
      missing_person: { label: 'Missing Person / Lost Child', hint: 'Unaccounted swimmer or child on shore' },
      medical: { label: 'Medical Emergency', hint: 'Injury, collapse, or breathing distress' },
    },
  },
  ta: {
    emergencyBanner: 'உயிருக்கு ஆபத்தான அவசரநிலையா? உடனே 112-ஐ அழைக்கவும்',
    call112: '112 அழைக்கவும்',
    title: 'பொது நீர் பாதுகாப்பு SOS',
    subtitle: 'கடற்கரை அவசரநிலையை மனித கட்டுப்பாட்டு அதிகாரி சரிபார்ப்புக்காக அனுப்பவும்.',
    safetyNotice:
      'முக்கியம்: இந்த தகவல் கடற்கரை கட்டுப்பாட்டு அறைக்கு சரிபார்ப்புக்காக அனுப்பப்படும். இது 112 ஆம்புலன்ஸை நேரடியாக அனுப்பாது. உடனடி ஆபத்திற்கு 112-ஐ அழைக்கவும்.',
    categoryHeading: '1. அவசரநிலை வகையைத் தேர்ந்தெடுக்கவும்',
    locationHeading: '2. இருப்பிடம் & கடற்கரை மீட்பு பகுதி',
    detailsHeading: '3. விவரங்கள் (குரல் அல்லது உரை)',
    useGps: 'எனது GPS இருப்பிடத்தைக் கண்டறி',
    gpsLocating: 'GPS கண்டறியப்படுகிறது...',
    voiceStart: 'தமிழ் குரல் பதிவு தொடங்கு',
    voiceStop: 'பதிவை நிறுத்து',
    voiceUnsupported: 'இந்த உலாவியில் குரல் பதிவு இல்லை. கீழே தட்டச்சு செய்யவும்.',
    photoLabel: 'விருப்ப புகைப்படம் (குறைந்த நெட்வொர்க் சுருக்கம்)',
    lowNetworkToggle: 'குறைந்த நெட்வொர்க் பயன்முறை (உரை மட்டும், ஆஃப்லைன் வரிசை)',
    submitBtn: 'SOS எச்சரிக்கையை அனுப்பவும்',
    submitting: 'அனுப்பப்படுகிறது...',
    queuedNotice:
      'இணையம் இல்லை. உங்கள் SOS சேமிக்கப்பட்டுள்ளது; சிக்னல் வந்தவுடன் தானாக அனுப்பப்படும். உடனே 112-ஐ அழைக்கவும்.',
    receiptTitle: 'SOS பெறப்பட்டது — மனித சரிபார்ப்புக்காக காத்திருக்கிறது',
    receiptBody:
      'உங்கள் புகார் கட்டுப்பாட்டு அறைக்கு சென்றடைந்துள்ளது. அதிகாரி சரிபார்த்த பின் மீட்பு குழு அனுப்பப்படும்.',
    newReport: 'மற்றொரு புகார் அனுப்பு',
    categories: {
      drowning: { label: 'நீரில் மூழ்குதல்', hint: 'தண்ணீரில் சிக்கித் தவிப்பவர்' },
      swept_away: { label: 'அலையில் இழுத்துச் செல்லப்பட்டவர்', hint: 'வலுவான அலையில் அடித்துச் செல்லப்பட்டவர்' },
      missing_person: { label: 'காணாமல் போனவர் / குழந்தை', hint: 'கடற்கரையில் காணாமல் போன குழந்தை அல்லது நபர்' },
      medical: { label: 'மருத்துவ அவசரம்', hint: 'காயம், மயக்கம் அல்லது மூச்சுத் திணறல்' },
    },
  },
} as const;

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to read image file'));
    };
    img.src = objectUrl;
  });
}

export const PublicSOS: React.FC = () => {
  const { cellId: routeCellId } = useParams<{ cellId?: string }>();
  const [lang, setLang] = useState<EmergencyLanguage>('en');
  const [cells, setCells] = useState<RescueCell[]>([]);
  const [selectedCellId, setSelectedCellId] = useState<string>(routeCellId?.toUpperCase() || 'MARINA-C2');
  const [category, setCategory] = useState<EmergencyCategory>('drowning');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  // Lost child fields
  const [childAge, setChildAge] = useState('');
  const [childClothing, setChildClothing] = useState('');
  const [childMinutesAgo, setChildMinutesAgo] = useState('5');

  // Location state
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLon, setGpsLon] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Voice & media
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Connectivity & low-network queue
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lowNetworkMode, setLowNetworkMode] = useState<boolean>(false);
  const [queuedCount, setQueuedCount] = useState<number>(() => getOfflineSOSQueue().length);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PublicSOSReceipt | null>(null);
  const [queuedConfirmation, setQueuedConfirmation] = useState(false);

  const t = COPY[lang];

  useEffect(() => {
    fetchRescueCells()
      .then((res) => {
        setCells(res.cells);
        if (routeCellId) {
          const match = res.cells.find((c) => c.id.toUpperCase() === routeCellId.toUpperCase());
          if (match) setSelectedCellId(match.id);
        }
      })
      .catch(() => {
        // Offline fallback handled gracefully
      });
  }, [routeCellId]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const result = await flushOfflineSOSQueue();
      setQueuedCount(result.remaining);
      if (result.synced.length > 0 && !receipt) {
        setReceipt(result.synced[result.synced.length - 1]);
        setQueuedConfirmation(false);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setLowNetworkMode(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [receipt]);

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Browser geolocation is unavailable. Select your rescue cell manually.');
      return;
    }
    setLocatingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setGpsLat(lat);
        setGpsLon(lon);
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setLocatingGps(false);

        if (cells.length > 0) {
          let best = cells[0];
          let bestDist = Infinity;
          for (const c of cells) {
            const d = Math.hypot(c.lat - lat, c.lon - lon);
            if (d < bestDist) {
              bestDist = d;
              best = c;
            }
          }
          setSelectedCellId(best.id);
        }
      },
      (err) => {
        setLocatingGps(false);
        setGpsError(err.message || 'Unable to access GPS. Select your beach rescue cell below.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  };

  const handleToggleVoice = () => {
    setVoiceError(null);
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceError(t.voiceUnsupported);
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setVoiceTranscript((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => {
        setIsListening(false);
        setVoiceError('Microphone capture interrupted. You can type your details directly.');
      };
      rec.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      setVoiceError(t.voiceUnsupported);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoDataUrl(compressed);
      setPhotoName(file.name);
    } catch {
      setSubmitError('Unable to process photo. You can submit the SOS without a photo.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 3) {
      setSubmitError(
        lang === 'ta'
          ? 'அவசரநிலை விவரத்தை சுருக்கமாக உள்ளிடவும்.'
          : 'Please enter or dictate a brief description of the emergency.'
      );
      return;
    }

    const payload: PublicSOSPayload = {
      clientRequestId: `sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      language: lang,
      description: trimmedDesc,
      reporterName: reporterName.trim() || undefined,
      reporterPhone: reporterPhone.trim() || undefined,
      cellId: selectedCellId,
      lat: gpsLat,
      lon: gpsLon,
      gpsAccuracyMeters: gpsAccuracy,
      locationSource: gpsLat !== null ? 'gps' : routeCellId ? 'cell_qr' : 'manual',
      photoDataUrl: lowNetworkMode ? undefined : photoDataUrl,
      hasVoiceNote: Boolean(voiceTranscript),
      voiceTranscript: voiceTranscript || undefined,
      lostChildDetails:
        category === 'missing_person'
          ? {
              approximateAge: childAge.trim() || undefined,
              clothingDescription: childClothing.trim() || undefined,
              lastSeenMinutesAgo: Number.parseInt(childMinutesAgo, 10) || undefined,
            }
          : undefined,
    };

    if (!isOnline) {
      const updated = enqueueOfflineSOS(payload);
      setQueuedCount(updated.length);
      setQueuedConfirmation(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitPublicSOS(payload);
      setReceipt(res);
      setQueuedConfirmation(false);
    } catch {
      // Network failure fallback: queue locally for automatic retry
      const updated = enqueueOfflineSOS(payload);
      setQueuedCount(updated.length);
      setQueuedConfirmation(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSync = async () => {
    const res = await flushOfflineSOSQueue();
    setQueuedCount(res.remaining);
    if (res.synced.length > 0) {
      setReceipt(res.synced[res.synced.length - 1]);
      setQueuedConfirmation(false);
    }
  };

  const activeCell = cells.find((c) => c.id === selectedCellId);

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-[#1B2A38] font-sans">
      {/* Persistent India 112 Emergency Bar */}
      <div className="bg-[#D65A4A] text-white px-4 py-3 sticky top-0 z-40 shadow-sm">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{t.emergencyBanner}</span>
          </div>
          <a
            href="tel:112"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[#D65A4A] text-xs sm:text-sm font-bold shadow-xs hover:bg-[#FBF8F3] min-h-[40px]"
          >
            <Phone className="w-4 h-4" />
            <span>{t.call112}</span>
          </a>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Top brand + language switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0F766E] text-white flex items-center justify-center">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif-heading text-xl font-bold text-[#0B3B3C] leading-tight">
                {t.title}
              </h1>
              <p className="text-xs text-[#5B687A]">{t.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center bg-[#E9E1D3]/70 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  lang === 'en' ? 'bg-white text-[#0F766E] shadow-xs' : 'text-[#5B687A]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('ta')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  lang === 'ta' ? 'bg-white text-[#0F766E] shadow-xs' : 'text-[#5B687A]'
                }`}
              >
                தமிழ்
              </button>
            </div>
            <Link
              to="/command"
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-[#5B687A] hover:text-[#0F766E]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Command</span>
            </Link>
          </div>
        </div>

        {/* Safety & Verification Disclosure */}
        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 text-xs text-[#5B687A] leading-relaxed">
          {t.safetyNotice}
        </div>

        {/* Offline / Queued Warning */}
        {(!isOnline || queuedCount > 0) && (
          <div className="bg-[#FFF7ED] border border-[#F59E0B]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#7C2D12]">
            <div className="flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {!isOnline
                    ? 'Offline Low-Network Mode Active'
                    : `${queuedCount} queued SOS report(s) awaiting sync`}
                </p>
                <p className="mt-0.5">
                  VHF Fallback: {activeCell?.vhfChannel || 'VHF Ch 16'} · National Emergency: 112
                </p>
              </div>
            </div>
            {isOnline && queuedCount > 0 && (
              <button
                type="button"
                onClick={() => void handleManualSync()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F766E] text-white font-semibold shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Now</span>
              </button>
            )}
          </div>
        )}

        {/* Queued offline confirmation */}
        {queuedConfirmation && !receipt && (
          <div className="bg-[#FBF8F3] border border-[#F59E0B]/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#9A3412]">SOS Queued Locally (Offline)</h2>
            <p className="text-xs text-[#5B687A] leading-relaxed">{t.queuedNotice}</p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="tel:112"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D65A4A] text-white text-xs font-bold"
              >
                <Phone className="w-4 h-4" />
                <span>{t.call112}</span>
              </a>
              <button
                type="button"
                onClick={() => setQueuedConfirmation(false)}
                className="px-4 py-2.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#1B2A38]"
              >
                {t.newReport}
              </button>
            </div>
          </div>
        )}

        {/* Verified Receipt Screen */}
        {receipt ? (
          <div className="bg-[#FBF8F3] border border-[#0F766E]/30 rounded-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#0F766E] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-[#0B3B3C]">{t.receiptTitle}</h2>
                <p className="text-xs text-[#5B687A] mt-1 leading-relaxed">{t.receiptBody}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#E9E1D3] text-xs">
              <div>
                <span className="text-[#5B687A]">Reference Code</span>
                <p className="font-mono font-bold text-sm text-[#0B3B3C] mt-0.5">{receipt.code}</p>
              </div>
              <div>
                <span className="text-[#5B687A]">Current Status</span>
                <p className="font-semibold text-[#B45309] mt-0.5">
                  UNVERIFIED (Awaiting Dispatcher)
                </p>
              </div>
              <div>
                <span className="text-[#5B687A]">Rescue Cell</span>
                <p className="font-semibold text-[#1B2A38] mt-0.5">
                  {receipt.cellId} · {receipt.siteName}
                </p>
              </div>
              <div>
                <span className="text-[#5B687A]">Radio / Phone Fallback</span>
                <p className="font-semibold text-[#1B2A38] mt-0.5">
                  {receipt.vhfChannel} · Call 112
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="tel:112"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D65A4A] text-white text-xs font-bold"
              >
                <Phone className="w-4 h-4" />
                <span>{t.call112}</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setReceipt(null);
                  setDescription('');
                  setVoiceTranscript('');
                  setPhotoDataUrl(undefined);
                  setPhotoName(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#1B2A38]"
              >
                {t.newReport}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
            {/* 1. Category */}
            <section className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-[#0B3B3C]">{t.categoryHeading}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['drowning', 'swept_away', 'missing_person', 'medical'] as EmergencyCategory[]).map(
                  (cat) => {
                    const active = category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`text-left p-3.5 rounded-xl border transition-all min-h-[56px] ${
                          active
                            ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-xs'
                            : 'bg-white text-[#1B2A38] border-[#E9E1D3] hover:border-[#0F766E]/50'
                        }`}
                      >
                        <div className="text-sm font-bold">{t.categories[cat].label}</div>
                        <div
                          className={`text-xs mt-0.5 ${
                            active ? 'text-white/85' : 'text-[#5B687A]'
                          }`}
                        >
                          {t.categories[cat].hint}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>

              {category === 'missing_person' && (
                <div className="pt-3 border-t border-[#E9E1D3] grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#5B687A] mb-1">
                      Approximate Age
                    </label>
                    <input
                      type="text"
                      value={childAge}
                      onChange={(e) => setChildAge(e.target.value)}
                      placeholder="e.g. 7 years"
                      className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5B687A] mb-1">
                      Clothing Description
                    </label>
                    <input
                      type="text"
                      value={childClothing}
                      onChange={(e) => setChildClothing(e.target.value)}
                      placeholder="e.g. Yellow t-shirt"
                      className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5B687A] mb-1">
                      Last Seen (mins ago)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={childMinutesAgo}
                      onChange={(e) => setChildMinutesAgo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* 2. Location & Rescue Cell */}
            <section className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[#0B3B3C]">{t.locationHeading}</h2>
                <button
                  type="button"
                  onClick={handleDetectGps}
                  disabled={locatingGps}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F766E]/10 text-[#0F766E] text-xs font-semibold hover:bg-[#0F766E]/15 min-h-[40px]"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{locatingGps ? t.gpsLocating : t.useGps}</span>
                </button>
              </div>

              <div>
                <label htmlFor="sos-cell" className="block text-xs font-medium text-[#5B687A] mb-1">
                  Beach Rescue Cell {routeCellId ? `(Pre-filled via QR: ${routeCellId})` : ''}
                </label>
                <select
                  id="sos-cell"
                  value={selectedCellId}
                  onChange={(e) => setSelectedCellId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E9E1D3] bg-white text-xs text-[#1B2A38] min-h-[44px]"
                >
                  {cells.length === 0 ? (
                    <option value={selectedCellId}>{selectedCellId}</option>
                  ) : (
                    cells.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} — {lang === 'ta' ? c.labelTa : c.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {gpsLat !== null && gpsLon !== null && (
                <p className="text-xs text-[#0F766E] font-mono">
                  GPS locked: {gpsLat.toFixed(5)}, {gpsLon.toFixed(5)}
                  {gpsAccuracy ? ` (±${gpsAccuracy}m)` : ''}
                </p>
              )}
              {gpsError && <p className="text-xs text-[#D65A4A]">{gpsError}</p>}
              {activeCell && (
                <p className="text-xs text-[#5B687A] flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  <span>
                    Nearest Tower: {activeCell.towerName} · {activeCell.vhfChannel}
                  </span>
                </p>
              )}
            </section>

            {/* 3. Details, Tamil/English Voice & Optional Photo */}
            <section className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[#0B3B3C]">{t.detailsHeading}</h2>
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold min-h-[40px] ${
                    isListening
                      ? 'bg-[#D65A4A] text-white'
                      : 'bg-white border border-[#E9E1D3] text-[#1B2A38] hover:border-[#0F766E]'
                  }`}
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-[#0F766E]" />}
                  <span>{isListening ? t.voiceStop : t.voiceStart}</span>
                </button>
              </div>

              {voiceError && <p className="text-xs text-[#D65A4A]">{voiceError}</p>}

              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder={
                  lang === 'ta'
                    ? 'எத்தனை பேர் பாதிக்கப்பட்டுள்ளனர், எங்கே உள்ளனர் என்பதை சுருக்கமாக எழுதவும்...'
                    : 'Describe what happened, how many people need help, and nearest landmark...'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E9E1D3] bg-white text-sm text-[#1B2A38] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#5B687A] mb-1">
                    Your Name (optional, masked in logs)
                  </label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5B687A] mb-1">
                    Callback Phone (optional, masked in logs)
                  </label>
                  <input
                    type="tel"
                    value={reporterPhone}
                    onChange={(e) => setReporterPhone(e.target.value)}
                    placeholder="+91..."
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs min-h-[40px]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E9E1D3]">
                <label className="inline-flex items-center gap-2 text-xs text-[#1B2A38] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lowNetworkMode}
                    onChange={(e) => setLowNetworkMode(e.target.checked)}
                    className="rounded border-[#E9E1D3] text-[#0F766E]"
                  />
                  <span>{t.lowNetworkToggle}</span>
                </label>

                {!lowNetworkMode && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] cursor-pointer hover:border-[#0F766E]/50">
                    <Camera className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>{photoName ? `Attached: ${photoName.slice(0, 18)}` : t.photoLabel}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => void handlePhotoChange(e)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </section>

            {submitError && (
              <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#D65A4A]/40 text-xs text-[#991B1B]">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-5 rounded-2xl bg-[#D65A4A] hover:bg-[#B94334] text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 min-h-[52px] disabled:opacity-60 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? t.submitting : t.submitBtn}</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
