import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  resolvePublicSosBackTarget,
  shouldConfirmSosLeave,
  useInAppNavigation,
} from '../context/NavigationContext';
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
  MessageSquare,
  Clock,
  ShieldAlert,
  Waves,
  Wind,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from 'lucide-react';
import type {
  EmergencyCategory,
  EmergencyLanguage,
  PublicSOSPayload,
  PublicSOSReceipt,
  RescueCell,
} from '../types/emergency';
import type {
  InstantSosResponse,
  PublicNexconnTokenResponse,
} from '../types/officialAlerts';
import {
  enqueueOfflineSOS,
  fetchRescueCells,
  flushOfflineSOSQueue,
  getOfflineSOSQueue,
} from '../services/emergencyApi';
import {
  requestPublicSosNexconnToken,
  sendBystanderSosUpdateApi,
  triggerInstantSos,
} from '../services/officialAlertService';
import { fetchMarine, fetchWeather } from '../services/openMeteo';

const COPY = {
  en: {
    emergencyBanner: 'Life-threatening emergency? Call India Emergency 112 immediately',
    call112: 'Call 112 Now',
    call112Full: 'Call India Emergency 112',
    backBtn: 'Back',
    backAria: 'Go back to previous GuardianGrid page',
    leaveTitle: 'Leave Emergency SOS Page?',
    leaveBody:
      'You have an active SOS alert or entered emergency details. Leaving now will clear unsubmitted details on this page.',
    stayBtn: 'Stay on SOS',
    leaveBtn: 'Leave Page',
    title: 'Public Water Safety SOS',
    subtitle: 'One-tap coastal alert to GuardianGrid Command Dispatchers.',
    safetyNotice:
      'Alerts coastal dispatchers for human verification. Always call 112 directly for immediate life-threatening emergencies.',
    sosEyebrow: 'Zero-Login One-Tap Emergency Dispatch',
    sosIntro:
      'Tap DROWNING, MISSING PERSON, or MEDICAL EMERGENCY to alert Coastal Command and nearby lifeguards immediately.',
    refreshGps: 'Refresh GPS',
    locating: 'Locating...',
    drowningLabel: 'DROWNING',
    drowningSub: 'நீரில் மூழ்குதல் · Submerged or struggling in water',
    sendingSos: 'SENDING CRITICAL SOS...',
    missingLabel: 'MISSING PERSON / LOST CHILD',
    missingSub: 'காணாமல் போனவர் · Unaccounted swimmer or child',
    medicalLabel: 'MEDICAL EMERGENCY',
    medicalSub: 'மருத்துவ அவசரம் · Injury, collapse, breathing distress',
    cellAutoPrefix: '1-Tap Instant Alert · Location:',
    cellDetectingHint: '1-Tap Instant Alert · Detecting GPS location...',
    cellUnconfirmedHint: 'Tap to choose beach zone & send immediately',
    locationSectionLabel: 'Beach Rescue Zone',
    selectCellPromptHeading: 'Confirm Your Beach Rescue Zone to Send SOS',
    selectCellPromptBody:
      'GPS location was unavailable or not yet confirmed. Select the nearest beach tower or tap Refresh GPS so responders go to the exact shoreline zone.',
    selectCellPlaceholder: 'Select beach rescue zone...',
    confirmAndSend: 'Confirm Zone & Send SOS Now',
    cancel: 'Cancel',
    optionalDetailsToggle: 'Add optional details, child info, callback phone or scene photo',
    optionalDetailsNote: 'Optional — you never need to fill this to trigger 1-Tap SOS.',
    voiceStart: 'Dictate Voice Note (English)',
    voiceStop: 'Stop Listening',
    voiceUnsupported: 'Voice dictation is unavailable in this browser. You can type details below.',
    descPlaceholder: 'Describe what happened, number of people, or nearest landmark (optional)...',
    nameLabel: 'Your Name (optional, masked in logs)',
    phoneLabel: 'Callback Phone (optional, masked in logs)',
    childAgeLabel: 'Missing Person / Child Age',
    childAgePlaceholder: 'e.g. 7 years',
    childClothingLabel: 'Clothing Description',
    childClothingPlaceholder: 'e.g. Yellow t-shirt',
    childMinutesLabel: 'Last Seen (mins ago)',
    lowNetworkToggle: 'Low-Network Mode (text-only, offline queue enabled)',
    photoLabel: 'Attach Scene Photo Note (optional)',
    photoAttachedPrefix: 'Photo selected:',
    gpsHigh: 'High Accuracy',
    gpsLow: 'Low Accuracy',
    gpsQr: 'QR Rescue Zone',
    gpsManual: 'Manual Zone Selected',
    gpsUnconfirmed: 'Location Unconfirmed',
    gpsLocatingBadge: 'Locating GPS...',
    gpsLockedPrefix: 'GPS locked:',
    nearestTowerLabel: 'Nearest Tower:',
    landmarkLabel: 'Landmark:',
    // Active Live Guidance screen
    activeSosBadge: 'CRITICAL SOS ACTIVE',
    activeHeading: 'Rescue Officials Alerted · Pending Human Verification',
    escalationLabel: 'Escalation Timer:',
    savedPrefix: 'Saved in',
    fanoutPrefix: 'Fan-out',
    nearestLifeguardsTitle: 'Nearest Lifeguards Notified',
    commandDispatchedFallback: 'Coastal Command Dispatch alerted for immediate verification.',
    warRoomTitle: 'Nexconn Incident War Room',
    channelLabel: 'Channel:',
    warRoomLive: 'Live War Room provisioned & Alert Card posted.',
    warRoomQueued: 'War Room synced via Command Center REST queue.',
    liveUpdatesHeading: 'Send Live Updates to Rescue Chat',
    dictateUpdate: 'Dictate Voice Note',
    stopVoiceUpdate: 'Stop Voice Note',
    sharePhotoNote: 'Share Scene Photo Note',
    liveChatPlaceholder: 'Add child info, swimmer direction, or landmark (e.g. 40m past Tower 2)...',
    sendBtn: 'Send',
    statusSending: 'Sending...',
    statusFailed: 'Failed',
    statusWarRoom: 'War Room',
    statusCommandSse: 'Command SSE',
    submitAnother: 'Submit Another Emergency Report',
    // Offline & synced fallback
    offlineTitle: 'Offline Low-Network Mode Active',
    queuedAwaitingSuffix: 'queued SOS report(s) awaiting sync',
    vhfFallback: 'VHF Fallback:',
    nationalEmergency: 'National Emergency: 112',
    syncNow: 'Sync Now',
    queuedScreenTitle: 'SOS Queued Locally (Offline)',
    queuedNotice:
      'Signal is unavailable. Your SOS is safely queued on this device and will auto-submit when connectivity returns. Call 112 or alert the nearest lifeguard tower immediately.',
    syncedReceiptTitle: 'Queued SOS Synced to Command Center',
    syncedReceiptBody:
      'Your offline SOS alert has synced to GuardianGrid Command Dispatchers for human verification.',
    referenceCode: 'Reference Code',
    currentStatus: 'Current Status',
    awaitingVerification: 'UNVERIFIED (Awaiting Dispatcher)',
    rescueCellLabel: 'Rescue Zone',
    radioFallbackLabel: 'Radio / Phone Fallback',
    newReport: 'Return to 1-Tap SOS',
    // Companion
    companionTitle: 'Beach Safety Companion',
    noCellSelected: 'Beach Rescue Zone Not Yet Selected',
    waveHeight: 'Wave Height',
    windSpeed: 'Wind Speed',
    emergencyNumbers: 'Emergency',
    loadingText: 'Loading...',
    unavailableText: 'Unavailable',
    selectLocText: 'Confirm location',
    elevatedRiskHeading: 'Elevated Surf / Wind Warning:',
    elevatedRiskBody:
      'Strong surf or wind conditions detected. Avoid deep water, watch for rip currents, and stay within patrolled lifeguard zones.',
    forecastSource: 'Source: Open-Meteo Marine & Weather Forecast',
    tideUnavailable: 'In-situ tide gauge unavailable',
    invalidQrTitlePrefix: 'Unrecognized Rescue-Cell QR Code:',
    invalidQrBody:
      'GuardianGrid did not substitute another beach. Tap Refresh GPS or choose your current beach rescue zone below.',
    modeLabel: 'Dispatch Mode:',
    realModeBtn: 'Real Emergency SOS',
    simModeBtn: 'Simulated Test SOS (Safe Sandbox)',
    simModeBanner:
      'SANDBOX TRAINING MODE: Submissions create an isolated simulated drill only. No real 112 calls, SMS, or WhatsApp alerts are dispatched.',
    simOfflineBlocked:
      'Simulated Test SOS cannot be queued offline. Switch to Real Emergency SOS for genuine emergencies, or reconnect to run a sandbox test.',
    activeSimBadge: 'SIMULATED TEST SOS · SANDBOX',
    activeSimHeading: 'Simulated Test Recorded · Zero Real Dispatches Sent',
  },
  ta: {
    emergencyBanner: 'உயிருக்கு ஆபத்தான அவசரநிலையா? உடனே 112-ஐ அழைக்கவும்',
    call112: '112 அழைக்கவும்',
    call112Full: 'இந்திய அவசர எண் 112-ஐ அழைக்கவும்',
    backBtn: 'பின்செல்',
    backAria: 'முந்தைய பக்கத்திற்குத் திரும்பு',
    leaveTitle: 'SOS பக்கத்திலிருந்து வெளியேறவா?',
    leaveBody:
      'உங்கள் அவசர SOS அல்லது உள்ளீடு செய்த விவரங்கள் செயலில் உள்ளன. வெளியேறினால் சேமிக்கப்படாத தகவல்கள் இழக்கப்படும்.',
    stayBtn: 'SOS பக்கத்தில் இரு',
    leaveBtn: 'வெளியேறு',
    title: 'பொது நீர் பாதுகாப்பு SOS',
    subtitle: 'ஒரு தட்டில் கடற்கரை கட்டுப்பாட்டு அறைக்கு அவசர எச்சரிக்கை.',
    safetyNotice:
      'இது மனித கட்டுப்பாட்டு அதிகாரி சரிபார்ப்புக்காக அனுப்பப்படும். உடனடி உயிர் ஆபத்திற்கு எப்போதும் 112-ஐ அழைக்கவும்.',
    sosEyebrow: 'உள்நுழைவு இல்லா ஒரு-தட்டு அவசர தகவல்',
    sosIntro:
      'கடற்கரை கட்டுப்பாட்டு அறை மற்றும் அருகிலுள்ள உயிர்காப்பாளர்களை உடனே எச்சரிக்க கீழேயுள்ள பொத்தானை அழுத்தவும்.',
    refreshGps: 'GPS புதுப்பி',
    locating: 'கண்டறியப்படுகிறது...',
    drowningLabel: 'நீரில் மூழ்குதல் (DROWNING)',
    drowningSub: 'தண்ணீரில் சிக்கியவர் அல்லது மூழ்கும் அவசரம்',
    sendingSos: 'அவசர SOS அனுப்பப்படுகிறது...',
    missingLabel: 'காணாமல் போனவர் / குழந்தை',
    missingSub: 'கடற்கரையில் காணாமல் போன நபர் அல்லது குழந்தை',
    medicalLabel: 'மருத்துவ அவசரம்',
    medicalSub: 'காயம், மயக்கம் அல்லது மூச்சுத் திணறல்',
    cellAutoPrefix: 'ஒரு-தட்டு எச்சரிக்கை · இடம்:',
    cellDetectingHint: 'ஒரு-தட்டு எச்சரிக்கை · GPS இருப்பிடம் கண்டறியப்படுகிறது...',
    cellUnconfirmedHint: 'கடற்கரை பகுதியைத் தேர்ந்தெடுத்து உடனே அனுப்பவும்',
    locationSectionLabel: 'கடற்கரை மீட்பு பகுதி',
    selectCellPromptHeading: 'SOS அனுப்ப உங்கள் கடற்கரை மீட்பு பகுதியை உறுதிப்படுத்தவும்',
    selectCellPromptBody:
      'GPS இருப்பிடம் கிடைக்கவில்லை. மீட்பு குழு சரியான இடத்திற்கு வர கீழே கடற்கரை பகுதியைத் தேர்ந்தெடுக்கவும் அல்லது GPS புதுப்பிக்கவும்.',
    selectCellPlaceholder: 'கடற்கரை மீட்பு பகுதியைத் தேர்ந்தெடுக்கவும்...',
    confirmAndSend: 'பகுதியை உறுதிசெய்து உடனே SOS அனுப்பு',
    cancel: 'ரத்து செய்',
    optionalDetailsToggle: 'விருப்ப விவரங்கள், குழந்தை தகவல், தொலைபேசி அல்லது புகைப்படம் சேர்க்க',
    optionalDetailsNote: 'விருப்பமானது — ஒரு-தட்டு SOS அனுப்ப இதை நிரப்பத் தேவையில்லை.',
    voiceStart: 'தமிழ் குரல் பதிவு தொடங்கு',
    voiceStop: 'பதிவை நிறுத்து',
    voiceUnsupported: 'இந்த உலாவியில் குரல் பதிவு இல்லை. கீழே தட்டச்சு செய்யவும்.',
    descPlaceholder: 'நடந்தது என்ன, எத்தனை பேர், அருகிலுள்ள அடையாளம் (விருப்பம்)...',
    nameLabel: 'உங்கள் பெயர் (விருப்பம், பதிவுகளில் மறைக்கப்படும்)',
    phoneLabel: 'தொடர்பு எண் (விருப்பம், பதிவுகளில் மறைக்கப்படும்)',
    childAgeLabel: 'காணாமல் போனவர் / குழந்தை வயது',
    childAgePlaceholder: 'எ.கா. 7 வயது',
    childClothingLabel: 'உடை அடையாளம்',
    childClothingPlaceholder: 'எ.கா. மஞ்சள் சட்டை',
    childMinutesLabel: 'கடைசியாகப் பார்த்த நேரம் (நிமிடம்)',
    lowNetworkToggle: 'குறைந்த நெட்வொர்க் பயன்முறை (உரை மட்டும், ஆஃப்லைன் சேமிப்பு)',
    photoLabel: 'காட்சி புகைப்படம் இணைக்க (விருப்பம்)',
    photoAttachedPrefix: 'புகைப்படம் இணைக்கப்பட்டது:',
    gpsHigh: 'துல்லிய GPS',
    gpsLow: 'குறைந்த GPS துல்லியம்',
    gpsQr: 'QR கடற்கரை பகுதி',
    gpsManual: 'கைமுறை பகுதி தேர்வு',
    gpsUnconfirmed: 'இருப்பிடம் உறுதிசெய்யப்படவில்லை',
    gpsLocatingBadge: 'GPS கண்டறியப்படுகிறது...',
    gpsLockedPrefix: 'GPS இணைக்கப்பட்டது:',
    nearestTowerLabel: 'அருகிலுள்ள கோபுரம்:',
    landmarkLabel: 'அடையாளம்:',
    // Active Live Guidance screen
    activeSosBadge: 'அவசர SOS செயலில் உள்ளது',
    activeHeading: 'மீட்பு அதிகாரிகள் எச்சரிக்கப்பட்டனர் · மனித சரிபார்ப்பு நிலுவையில்',
    escalationLabel: 'மேல்நிலை எச்சரிக்கை நேரம்:',
    savedPrefix: 'சேமிப்பு',
    fanoutPrefix: 'அறிவிப்பு',
    nearestLifeguardsTitle: 'அறிவிக்கப்பட்ட அருகிலுள்ள உயிர்காப்பாளர்கள்',
    commandDispatchedFallback: 'கடற்கரை கட்டுப்பாட்டு அறை உடனே எச்சரிக்கப்பட்டது.',
    warRoomTitle: 'Nexconn அவசர ஒருங்கிணைப்பு அறை',
    channelLabel: 'சேனல்:',
    warRoomLive: 'நேரடி ஒருங்கிணைப்பு அறை தயார் & எச்சரிக்கை அட்டை அனுப்பப்பட்டது.',
    warRoomQueued: 'கட்டுப்பாட்டு அறை வரிசையுடன் இணைக்கப்பட்டது.',
    liveUpdatesHeading: 'மீட்பு குழுவிற்கு நேரடி தகவல் அனுப்பு',
    dictateUpdate: 'குரல் பதிவு சேர்க்க',
    stopVoiceUpdate: 'பதிவை நிறுத்து',
    sharePhotoNote: 'புகைப்படக் குறிப்பு பகிர்',
    liveChatPlaceholder: 'குழந்தை விவரம், நீச்சலடிப்பவர் திசை அல்லது அடையாளத்தைத் தட்டச்சு செய்க...',
    sendBtn: 'அனுப்பு',
    statusSending: 'அனுப்பப்படுகிறது...',
    statusFailed: 'தோல்வி',
    statusWarRoom: 'ஒருங்கிணைப்பு அறை',
    statusCommandSse: 'கட்டுப்பாட்டு அறை',
    submitAnother: 'மற்றொரு அவசர புகாரை அனுப்பு',
    // Offline & synced fallback
    offlineTitle: 'ஆஃப்லைன் / குறைந்த நெட்வொர்க் பயன்முறை',
    queuedAwaitingSuffix: 'SOS புகார்(கள்) ஒத்திசைவுக்காகக் காத்திருக்கின்றன',
    vhfFallback: 'VHF மாற்று:',
    nationalEmergency: 'தேசிய அவசர எண்: 112',
    syncNow: 'இப்போது ஒத்திசை',
    queuedScreenTitle: 'SOS சாதனத்தில் சேமிக்கப்பட்டது (ஆஃப்லைன்)',
    queuedNotice:
      'இணையம் இல்லை. உங்கள் SOS பாதுகாப்பாகச் சேமிக்கப்பட்டுள்ளது; சிக்னல் வந்தவுடன் தானாக அனுப்பப்படும். உடனே 112-ஐ அழைக்கவும்.',
    syncedReceiptTitle: 'சேமிக்கப்பட்ட SOS கட்டுப்பாட்டு அறைக்கு அனுப்பப்பட்டது',
    syncedReceiptBody:
      'உங்கள் ஆஃப்லைன் SOS எச்சரிக்கை மனித சரிபார்ப்புக்காகக் கட்டுப்பாட்டு அறைக்குச் சென்றடைந்துள்ளது.',
    referenceCode: 'குறிப்பு எண்',
    currentStatus: 'தற்போதைய நிலை',
    awaitingVerification: 'சரிபார்ப்பு நிலுவையில் (UNVERIFIED)',
    rescueCellLabel: 'மீட்பு பகுதி',
    radioFallbackLabel: 'ரேடியோ / தொலைபேசி மாற்று',
    newReport: 'ஒரு-தட்டு SOS பக்கத்திற்குத் திரும்பு',
    // Companion
    companionTitle: 'கடற்கரை பாதுகாப்பு துணை',
    noCellSelected: 'கடற்கரை மீட்பு பகுதி இன்னும் தேர்ந்தெடுக்கப்படவில்லை',
    waveHeight: 'அலை உயரம்',
    windSpeed: 'காற்றின் வேகம்',
    emergencyNumbers: 'அவசரம்',
    loadingText: 'ஏற்றப்படுகிறது...',
    unavailableText: 'கிடைக்கவில்லை',
    selectLocText: 'இடம் தேர்வு செய்க',
    elevatedRiskHeading: 'உயர்ந்த கடல் அபாய எச்சரிக்கை:',
    elevatedRiskBody:
      'அலைகள் அல்லது காற்று அதிகமாக உள்ளது. ஆழமான நீரில் நீந்த வேண்டாம்; உயிர்காப்பாளர் கண்காணிப்பு பகுதியில் மட்டும் இருக்கவும்.',
    forecastSource: 'ஆதாரம்: Open-Meteo கடல் & வானிலை கணிப்பு',
    tideUnavailable: 'நேரடி அலை அளவி இணைப்பு இல்லை',
    invalidQrTitlePrefix: 'அடையாளம் காணப்படாத QR குறியீடு:',
    invalidQrBody:
      'வேறு கடற்கரை தானாகத் தேர்ந்தெடுக்கப்படவில்லை. GPS புதுப்பி பொத்தானை அழுத்தவும் அல்லது கீழே உள்ள கடற்கரை பகுதியைத் தேர்ந்தெடுக்கவும்.',
    modeLabel: 'அனுப்பும் பயன்முறை:',
    realModeBtn: 'உண்மையான அவசர SOS',
    simModeBtn: 'பயிற்சி சோதனை SOS (பாதுகாப்பு நிலை)',
    simModeBanner:
      'பயிற்சி சோதனை நிலை: இது தனிமைப்படுத்தப்பட்ட பயிற்சி பதிவாக மட்டுமே சேமிக்கப்படும். உண்மையான 112 அல்லது SMS எச்சரிக்கைகள் அனுப்பப்படாது.',
    simOfflineBlocked:
      'பயிற்சி சோதனை SOS-ஐ ஆஃப்லைனில் சேமிக்க முடியாது. உண்மையான அவசரத்திற்கு Real Emergency SOS பயன்முறைக்கு மாற்றவும்.',
    activeSimBadge: 'பயிற்சி சோதனை SOS · பாதுகாப்பு நிலை',
    activeSimHeading: 'பயிற்சி சோதனை பதிவு செய்யப்பட்டது · உண்மையான எச்சரிக்கை அனுப்பப்படவில்லை',
  },
} as const;

export const PublicSOS: React.FC = () => {
  const navigate = useNavigate();
  const { hasInAppOrigin, lastNonSosRoute } = useInAppNavigation();
  const { cellId: routeCellId } = useParams<{ cellId?: string }>();
  const [lang, setLang] = useState<EmergencyLanguage>('en');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const [cells, setCells] = useState<RescueCell[]>([]);
  // Never silently pre-select MARINA-C2 before GPS or QR resolution completes
  const [selectedCellId, setSelectedCellId] = useState<string>('');
  const [invalidQrCell, setInvalidQrCell] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<EmergencyCategory | null>(null);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(false);

  const [beachEnv, setBeachEnv] = useState<{
    waveHeight: number | null;
    windSpeed: number | null;
    timestamp: string | null;
    loading: boolean;
    error: boolean;
  }>({ waveHeight: null, windSpeed: null, timestamp: null, loading: false, error: false });

  // Optional enrichment fields
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childClothing, setChildClothing] = useState('');
  const [childMinutesAgo, setChildMinutesAgo] = useState('5');

  // Location state
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLon, setGpsLon] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [locatingGps, setLocatingGps] = useState<boolean>(
    typeof navigator !== 'undefined' && Boolean(navigator.geolocation)
  );
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Voice & optional photo note
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Connectivity & low-network queue
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lowNetworkMode, setLowNetworkMode] = useState<boolean>(false);
  const [queuedCount, setQueuedCount] = useState<number>(() => getOfflineSOSQueue().length);

  // Unified Instant SOS + synced receipt state
  const [publicToken, setPublicToken] = useState<PublicNexconnTokenResponse | null>(null);
  const [instantFiring, setInstantFiring] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [instantResult, setInstantResult] = useState<InstantSosResponse | null>(null);
  const [syncedReceipt, setSyncedReceipt] = useState<PublicSOSReceipt | null>(null);
  const [queuedConfirmation, setQueuedConfirmation] = useState(false);
  const [escalationRemainingSec, setEscalationRemainingSec] = useState<number>(90);

  // Active guidance bystander updates (chat/voice/photo note)
  const [bystanderChatInput, setBystanderChatInput] = useState('');
  const [bystanderUpdates, setBystanderUpdates] = useState<
    Array<{
      id: string;
      text: string;
      time: string;
      kind: 'text' | 'voice' | 'photo';
      deliveryStatus: 'sending' | 'sent' | 'failed';
      deliveredToNexconn?: boolean;
      error?: string;
    }>
  >([]);

  const instantAttemptKeyRef = useRef<{
    category: EmergencyCategory;
    isSimulated: boolean;
    key: string;
  } | null>(null);
  const t = COPY[lang];

  useEffect(() => {
    fetchRescueCells()
      .then((res) => {
        setCells(res.cells);
        if (routeCellId) {
          const match = res.cells.find((c) => c.id.toUpperCase() === routeCellId.toUpperCase());
          if (match) {
            setSelectedCellId(match.id);
            setInvalidQrCell(null);
          } else {
            // Never silently substitute an invalid QR code with another beach
            setSelectedCellId('');
            setInvalidQrCell(routeCellId.toUpperCase());
          }
        }
      })
      .catch(() => {
        // Offline fallback handled gracefully
      });

    // Zero-login anonymous PUBLIC_SOS Nexconn token issuance
    requestPublicSosNexconnToken()
      .then((tok) => setPublicToken(tok))
      .catch(() => {
        // Non-blocking; SOS works via REST even without Nexconn token
      });
  }, [routeCellId]);

  // Automatic non-blocking browser geolocation capture on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocatingGps(false);
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLon(pos.coords.longitude);
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setLocatingGps(false);
        setGpsError(null);
      },
      (err) => {
        setLocatingGps(false);
        setGpsError(err?.message || null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  }, []);

  // Auto-select nearest rescue cell ONLY once both GPS and cells resolve (unless QR cellId specified)
  useEffect(() => {
    if (routeCellId || gpsLat === null || gpsLon === null || cells.length === 0) return;
    let best = cells[0];
    let bestDist = Infinity;
    for (const c of cells) {
      const d = Math.hypot(c.lat - gpsLat, c.lon - gpsLon);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    setSelectedCellId(best.id);
  }, [cells, gpsLat, gpsLon, routeCellId]);

  const activeCell = cells.find((c) => c.id === selectedCellId) || null;

  // Public Beach Safety Companion: fetch public Open-Meteo conditions ONLY when GPS or confirmed cell coordinates exist
  useEffect(() => {
    const matchedCell = cells.find((c) => c.id === selectedCellId);
    const targetLat = gpsLat ?? matchedCell?.lat ?? null;
    const targetLon = gpsLon ?? matchedCell?.lon ?? null;
    if (targetLat === null || targetLon === null) return;

    let cancelled = false;
    setBeachEnv((prev) => ({ ...prev, loading: true, error: false }));
    Promise.all([
      fetchWeather(targetLat, targetLon).catch(() => null),
      fetchMarine(targetLat, targetLon).catch(() => null),
    ]).then(([weather, marine]) => {
      if (cancelled) return;
      const nowIsoHour = new Date().toISOString().slice(0, 13);
      const wIdx = Math.max(
        0,
        weather?.hourly?.time?.findIndex((ts) => ts.startsWith(nowIsoHour)) ?? 0
      );
      const mIdx = Math.max(
        0,
        marine?.hourly?.time?.findIndex((ts) => ts.startsWith(nowIsoHour)) ?? 0
      );
      const windSpeed = weather?.hourly?.wind_speed_10m?.[wIdx] ?? null;
      const waveHeight = marine?.hourly?.wave_height?.[mIdx] ?? null;
      const timestamp = weather?.hourly?.time?.[wIdx] || marine?.hourly?.time?.[mIdx] || null;
      setBeachEnv({
        waveHeight: typeof waveHeight === 'number' ? waveHeight : null,
        windSpeed: typeof windSpeed === 'number' ? windSpeed : null,
        timestamp,
        loading: false,
        error: !weather && !marine,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCellId, cells, gpsLat, gpsLon]);

  // Escalation countdown timer while active live-guidance screen is open
  useEffect(() => {
    if (!instantResult) return;
    setEscalationRemainingSec(instantResult.escalationTimeoutSeconds || 90);
    const timer = window.setInterval(() => {
      setEscalationRemainingSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [instantResult]);

  // Offline queue auto-flush when connection returns
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const result = await flushOfflineSOSQueue();
      setQueuedCount(result.remaining);
      if (result.synced.length > 0 && !instantResult && !syncedReceipt) {
        setSyncedReceipt(result.synced[result.synced.length - 1]);
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
  }, [instantResult, syncedReceipt]);

  const handleDetectGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError(
        lang === 'ta'
          ? 'இந்த உலாவியில் GPS இல்லை. கீழே கடற்கரை பகுதியைத் தேர்ந்தெடுக்கவும்.'
          : 'Browser geolocation is unavailable. Select your beach rescue zone below.'
      );
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
        setGpsError(
          err.message ||
            (lang === 'ta'
              ? 'GPS அனுமதி மறுக்கப்பட்டது. கீழே கடற்கரை பகுதியைத் தேர்ந்தெடுக்கவும்.'
              : 'Unable to access GPS. Select your beach rescue zone below.')
        );
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
          if (instantResult) {
            void handleSendBystanderUpdate('voice', transcript);
          }
        }
      };
      rec.onerror = () => {
        setIsListening(false);
        setVoiceError(
          lang === 'ta'
            ? 'குரல் பதிவு தடைபட்டது. கீழே தட்டச்சு செய்யலாம்.'
            : 'Microphone capture interrupted. You can type your details directly.'
        );
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

  const handlePreTapPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
  };

  const handleManualSync = async () => {
    const res = await flushOfflineSOSQueue();
    setQueuedCount(res.remaining);
    if (res.synced.length > 0) {
      setSyncedReceipt(res.synced[res.synced.length - 1]);
      setQueuedConfirmation(false);
    }
  };

  const buildOptionalDescription = (selectedCategory: EmergencyCategory): string | undefined => {
    const parts: string[] = [];
    const trimmed = description.trim();
    if (trimmed) parts.push(trimmed);
    if (selectedCategory === 'missing_person') {
      const childParts: string[] = [];
      if (childAge.trim()) childParts.push(`Age: ${childAge.trim()}`);
      if (childClothing.trim()) childParts.push(`Clothing: ${childClothing.trim()}`);
      if (childMinutesAgo.trim()) childParts.push(`Last seen: ${childMinutesAgo.trim()}m ago`);
      if (childParts.length > 0) {
        parts.push(`[Lost Child Info: ${childParts.join(' · ')}]`);
      }
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  };

  const fireUnifiedSos = async (selectedCategory: EmergencyCategory, confirmedCellId: string) => {
    if (instantFiring) return;
    setSubmitError(null);
    setPendingCategory(null);

    if (
      !instantAttemptKeyRef.current ||
      instantAttemptKeyRef.current.category !== selectedCategory ||
      instantAttemptKeyRef.current.isSimulated !== isSimulatedMode
    ) {
      instantAttemptKeyRef.current = {
        category: selectedCategory,
        isSimulated: isSimulatedMode,
        key: `sos-instant-${isSimulatedMode ? 'sim' : 'real'}-${selectedCategory}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
    }
    const stableRequestId = instantAttemptKeyRef.current.key;
    const combinedDesc = buildOptionalDescription(selectedCategory);

    if (!isOnline) {
      if (isSimulatedMode) {
        setSubmitError(t.simOfflineBlocked);
        return;
      }
      const offlinePayload: PublicSOSPayload = {
        clientRequestId: stableRequestId,
        category: selectedCategory,
        language: lang,
        description:
          combinedDesc || `ONE-TAP ${selectedCategory.toUpperCase()} SOS (queued offline).`,
        reporterName: reporterName.trim() || undefined,
        reporterPhone: reporterPhone.trim() || undefined,
        cellId: confirmedCellId,
        lat: gpsLat,
        lon: gpsLon,
        gpsAccuracyMeters: gpsAccuracy,
        locationSource: gpsLat !== null ? 'gps' : routeCellId && !invalidQrCell ? 'cell_qr' : 'manual',
        hasVoiceNote: Boolean(voiceTranscript),
        voiceTranscript: voiceTranscript || undefined,
        lostChildDetails:
          selectedCategory === 'missing_person'
            ? {
                approximateAge: childAge.trim() || undefined,
                clothingDescription: childClothing.trim() || undefined,
                lastSeenMinutesAgo: Number.parseInt(childMinutesAgo, 10) || undefined,
              }
            : undefined,
      };
      const updated = enqueueOfflineSOS(offlinePayload);
      setQueuedCount(updated.length);
      setQueuedConfirmation(true);
      return;
    }

    setInstantFiring(true);
    try {
      const res = await triggerInstantSos({
        category: selectedCategory,
        cellId: confirmedCellId,
        lat: gpsLat,
        lon: gpsLon,
        gpsAccuracyMeters: gpsAccuracy,
        locationSource: gpsLat !== null ? 'gps' : routeCellId && !invalidQrCell ? 'qr_cell' : 'manual',
        language: lang,
        description: combinedDesc,
        reporterName: reporterName.trim() || undefined,
        reporterPhone: reporterPhone.trim() || undefined,
        reporterNexconnUserId: publicToken?.userId,
        clientRequestId: stableRequestId,
        isSandboxTest: isSimulatedMode,
      });
      setInstantResult(res);
      setQueuedConfirmation(false);

      // If citizen selected a scene photo note before tapping, relay note immediately into live channel
      if (photoName && !lowNetworkMode && res.incidentId && res.bystanderChannelToken) {
        try {
          await sendBystanderSosUpdateApi({
            incidentId: res.incidentId,
            channelToken: res.bystanderChannelToken,
            kind: 'photo',
            text: `Scene photo note attached: ${photoName}`,
          });
        } catch {
          // Non-fatal; SOS alert itself succeeded
        }
      }
    } catch (err: any) {
      setSubmitError(
        err?.message ||
          (lang === 'ta'
            ? 'SOS அனுப்ப முடியவில்லை. உடனே 112-ஐ அழைக்கவும்.'
            : 'Unable to send instant SOS. Please retry or call 112 immediately.')
      );
    } finally {
      setInstantFiring(false);
    }
  };

  const handleOneTapInstantSos = (selectedCategory: EmergencyCategory) => {
    if (instantFiring) return;
    // Honest location guarantee: never silently fabricate MARINA-C2 when no GPS/QR/manual zone exists
    if (!selectedCellId) {
      setPendingCategory(selectedCategory);
      setSubmitError(null);
      return;
    }
    void fireUnifiedSos(selectedCategory, selectedCellId);
  };

  const handleSendBystanderUpdate = async (
    kind: 'text' | 'voice' | 'photo',
    text: string,
    targetResult?: InstantSosResponse
  ) => {
    const active = targetResult || instantResult;
    const clean = text.trim();
    if (!clean) return;
    const localId = `upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timeLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setBystanderUpdates((prev) => [
      {
        id: localId,
        text: clean,
        kind,
        time: timeLabel,
        deliveryStatus: 'sending',
      },
      ...prev,
    ]);
    if (kind === 'text') setBystanderChatInput('');

    if (!active?.incidentId || !active?.bystanderChannelToken) {
      setBystanderUpdates((prev) =>
        prev.map((u) =>
          u.id === localId
            ? {
                ...u,
                deliveryStatus: 'failed',
                error:
                  lang === 'ta'
                    ? 'நேரடி தகவல் டோக்கன் இல்லை. அவசரத்திற்கு 112 அழைக்கவும்.'
                    : 'Live update token unavailable. Call 112 for urgent updates.',
              }
            : u
        )
      );
      return;
    }

    try {
      const apiRes = await sendBystanderSosUpdateApi({
        incidentId: active.incidentId,
        channelToken: active.bystanderChannelToken,
        kind: kind === 'voice' ? 'voice_transcript' : kind,
        text: clean,
      });
      setBystanderUpdates((prev) =>
        prev.map((u) =>
          u.id === localId
            ? {
                ...u,
                id: apiRes.updateId || localId,
                deliveryStatus: 'sent',
                deliveredToNexconn: apiRes.deliveredToNexconn,
              }
            : u
        )
      );
    } catch (err: any) {
      setBystanderUpdates((prev) =>
        prev.map((u) =>
          u.id === localId
            ? {
                ...u,
                deliveryStatus: 'failed',
                error:
                  err?.message ||
                  (lang === 'ta'
                    ? 'தகவலை கட்டுப்பாட்டு அறைக்கு அனுப்ப முடியவில்லை.'
                    : 'Unable to relay update to Command Center.'),
              }
            : u
        )
      );
    }
  };

  const performBackNavigation = () => {
    const target = resolvePublicSosBackTarget({
      hasInAppOrigin,
      lastNonSosRoute,
    });
    navigate(target.path);
  };

  const handleBackClick = () => {
    const needsConfirm = shouldConfirmSosLeave({
      submitting: false,
      instantFiring,
      hasReceipt: Boolean(syncedReceipt),
      hasInstantResult: Boolean(instantResult),
      hasQueuedConfirmation: queuedConfirmation,
      description,
      reporterName,
      reporterPhone,
      voiceTranscript,
      photoDataUrl: photoName ? photoName : undefined,
      childAge,
      childClothing,
      bystanderChatInput,
    });
    if (needsConfirm) {
      setLeaveConfirmOpen(true);
      return;
    }
    performBackNavigation();
  };

  const categoryTitle = (cat: EmergencyCategory) => {
    if (cat === 'drowning') return t.drowningLabel;
    if (cat === 'missing_person') return t.missingLabel;
    return t.medicalLabel;
  };

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

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-5">
        {/* Top back control, brand heading + language switcher */}
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleBackClick}
              aria-label={t.backAria}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] hover:bg-white hover:border-[#0F766E]/40 text-xs font-semibold text-[#0B3B3C] shadow-2xs cursor-pointer transition-colors min-h-[40px] shrink-0 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40"
            >
              <ArrowLeft className="w-4 h-4 text-[#0F766E]" />
              <span>{t.backBtn}</span>
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#0F766E] text-white hidden sm:flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
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
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  lang === 'en' ? 'bg-white text-[#0F766E] shadow-xs' : 'text-[#5B687A]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('ta')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  lang === 'ta' ? 'bg-white text-[#0F766E] shadow-xs' : 'text-[#5B687A]'
                }`}
              >
                தமிழ்
              </button>
            </div>
          </div>
        </div>

        {/* Invalid QR Code Warning */}
        {invalidQrCell && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1.5">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                {t.invalidQrTitlePrefix} "{invalidQrCell}"
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">{t.invalidQrBody}</p>
          </div>
        )}

        {/* Offline / Queued Warning */}
        {(!isOnline || queuedCount > 0) && (
          <div className="bg-[#FFF7ED] border border-[#F59E0B]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#7C2D12]">
            <div className="flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {!isOnline ? t.offlineTitle : `${queuedCount} ${t.queuedAwaitingSuffix}`}
                </p>
                <p className="mt-0.5">
                  {t.vhfFallback} {activeCell?.vhfChannel || 'VHF Ch 16'} · {t.nationalEmergency}
                </p>
              </div>
            </div>
            {isOnline && queuedCount > 0 && (
              <button
                type="button"
                onClick={() => void handleManualSync()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F766E] text-white font-semibold shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t.syncNow}</span>
              </button>
            )}
          </div>
        )}

        {/* 1. PRIMARY: ZERO-LOGIN UNIFIED ONE-TAP EMERGENCY SOS PANEL */}
        {!instantResult && !syncedReceipt && !queuedConfirmation && (
          <section className="bg-[#1B2A38] text-white rounded-2xl p-5 space-y-4 shadow-lg border border-[#0B3B3C]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{t.sosEyebrow}</span>
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">{t.sosIntro}</p>
              </div>

              <button
                type="button"
                onClick={handleDetectGps}
                disabled={locatingGps}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer shrink-0"
              >
                <MapPin className="w-3.5 h-3.5 text-teal-300" />
                <span>{locatingGps ? t.locating : t.refreshGps}</span>
              </button>
            </div>

            {/* Explicit Dispatch Mode Switch: Real Emergency SOS (Default) vs Simulated Sandbox Test */}
            <div className="rounded-xl bg-[#0F172A]/80 border border-white/15 p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  {t.modeLabel}
                </span>
                <div className="inline-flex items-center bg-black/30 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSimulatedMode(false);
                      setSubmitError(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      !isSimulatedMode
                        ? 'bg-[#DC2626] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {t.realModeBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSimulatedMode(true);
                      setSubmitError(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      isSimulatedMode
                        ? 'bg-amber-400 text-[#1B2A38] shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    <span>{t.simModeBtn}</span>
                  </button>
                </div>
              </div>
              {isSimulatedMode && (
                <div className="rounded-lg bg-amber-400/15 border border-amber-300/40 px-3 py-2 text-[11px] text-amber-100 flex items-start gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <span>{t.simModeBanner}</span>
                </div>
              )}
            </div>

            {/* Honest GPS / Rescue Zone Confirmation Bar */}
            <div className="rounded-xl bg-white/8 border border-white/15 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-300 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 block">
                    {t.locationSectionLabel}
                  </span>
                  <span className="font-semibold text-white truncate block">
                    {activeCell
                      ? `${activeCell.siteName} · ${lang === 'ta' ? activeCell.labelTa : activeCell.label} (${activeCell.id})`
                      : locatingGps
                        ? t.gpsLocatingBadge
                        : t.noCellSelected}
                  </span>
                </div>
              </div>

              <select
                aria-label={t.locationSectionLabel}
                value={selectedCellId}
                onChange={(e) => {
                  setSelectedCellId(e.target.value);
                  setInvalidQrCell(null);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[#0F172A] border border-white/25 text-xs text-white min-h-[36px] max-w-full"
              >
                <option value="">{t.selectCellPlaceholder}</option>
                {cells.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {lang === 'ta' ? c.labelTa : c.label}
                  </option>
                ))}
              </select>
            </div>

            {gpsError && !activeCell && (
              <p className="text-[11px] text-amber-300">{gpsError}</p>
            )}

            {/* Inline Rescue-Zone Confirmation Prompt ONLY if user taps SOS before location resolves */}
            {pendingCategory && !selectedCellId && (
              <div className="rounded-xl bg-amber-950/80 border border-amber-400/60 p-4 space-y-3 text-xs">
                <div className="space-y-1">
                  <p className="font-bold text-amber-200">{t.selectCellPromptHeading}</p>
                  <p className="text-amber-100/90 leading-relaxed">{t.selectCellPromptBody}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedCellId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedCellId(val);
                      if (val) {
                        void fireUnifiedSos(pendingCategory, val);
                      }
                    }}
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-white text-[#1B2A38] font-semibold text-xs min-h-[40px]"
                  >
                    <option value="">{t.selectCellPlaceholder}</option>
                    {cells.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} — {lang === 'ta' ? c.labelTa : c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleDetectGps}
                    className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold min-h-[40px]"
                  >
                    {t.refreshGps}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingCategory(null)}
                    className="px-3 py-2 rounded-xl bg-black/30 hover:bg-black/50 text-slate-200 font-semibold min-h-[40px]"
                  >
                    {t.cancel}
                  </button>
                </div>
                <p className="text-[11px] text-amber-200 font-semibold">
                  {categoryTitle(pendingCategory)} — {t.confirmAndSend}
                </p>
              </div>
            )}

            {/* Three Oversized One-Tap Category Dispatch Buttons */}
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                disabled={instantFiring}
                onClick={() => handleOneTapInstantSos('drowning')}
                className="w-full py-5 px-5 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] active:scale-[0.99] transition-all text-white shadow-lg border-2 border-red-300/60 flex flex-col items-center justify-center gap-1 disabled:opacity-60 cursor-pointer"
              >
                <span className="text-lg sm:text-xl font-black tracking-wide">
                  {instantFiring ? t.sendingSos : t.drowningLabel}
                </span>
                <span className="text-xs font-medium text-red-100 text-center">
                  {t.drowningSub}
                </span>
                <span className="text-[11px] font-mono text-red-200/95">
                  {activeCell
                    ? `${t.cellAutoPrefix} ${activeCell.id}`
                    : locatingGps
                      ? t.cellDetectingHint
                      : t.cellUnconfirmedHint}
                </span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={instantFiring}
                  onClick={() => handleOneTapInstantSos('missing_person')}
                  className="py-4 px-4 rounded-2xl bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-sm shadow-md border border-amber-300/40 flex flex-col items-center justify-center gap-0.5 disabled:opacity-60 cursor-pointer"
                >
                  <span>{t.missingLabel}</span>
                  <span className="text-[11px] font-medium text-amber-100 text-center">
                    {t.missingSub}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={instantFiring}
                  onClick={() => handleOneTapInstantSos('medical')}
                  className="py-4 px-4 rounded-2xl bg-[#0F766E] hover:bg-[#0B5E58] text-white font-bold text-sm shadow-md border border-teal-300/40 flex flex-col items-center justify-center gap-0.5 disabled:opacity-60 cursor-pointer"
                >
                  <span>{t.medicalLabel}</span>
                  <span className="text-[11px] font-medium text-teal-100 text-center">
                    {t.medicalSub}
                  </span>
                </button>
              </div>
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-red-950/90 border border-red-400/50 text-xs text-red-100">
                {submitError}
              </div>
            )}

            {/* Collapsible Optional Pre-Tap Details (Unified Flow — Never Required) */}
            <div className="border-t border-white/15 pt-3">
              <button
                type="button"
                onClick={() => setShowOptionalDetails((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-teal-200 hover:text-white cursor-pointer"
              >
                <span>{t.optionalDetailsToggle}</span>
                {showOptionalDetails ? (
                  <ChevronUp className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" />
                )}
              </button>

              {showOptionalDetails && (
                <div className="mt-3 p-4 rounded-xl bg-[#FBF8F3] text-[#1B2A38] space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[#5B687A] font-medium">
                      {t.optionalDetailsNote}
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleVoice}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                        isListening
                          ? 'bg-[#D65A4A] text-white'
                          : 'bg-white border border-[#E9E1D3] text-[#1B2A38] hover:border-[#0F766E]'
                      }`}
                    >
                      {isListening ? (
                        <MicOff className="w-3.5 h-3.5" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-[#0F766E]" />
                      )}
                      <span>{isListening ? t.voiceStop : t.voiceStart}</span>
                    </button>
                  </div>

                  {voiceError && <p className="text-xs text-[#D65A4A]">{voiceError}</p>}

                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t.descPlaceholder}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs text-[#1B2A38]"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-[#5B687A] mb-1">
                        {t.childAgeLabel}
                      </label>
                      <input
                        type="text"
                        value={childAge}
                        onChange={(e) => setChildAge(e.target.value)}
                        placeholder={t.childAgePlaceholder}
                        className="w-full px-2.5 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5B687A] mb-1">
                        {t.childClothingLabel}
                      </label>
                      <input
                        type="text"
                        value={childClothing}
                        onChange={(e) => setChildClothing(e.target.value)}
                        placeholder={t.childClothingPlaceholder}
                        className="w-full px-2.5 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5B687A] mb-1">
                        {t.childMinutesLabel}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={childMinutesAgo}
                        onChange={(e) => setChildMinutesAgo(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-[#5B687A] mb-1">
                        {t.nameLabel}
                      </label>
                      <input
                        type="text"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5B687A] mb-1">
                        {t.phoneLabel}
                      </label>
                      <input
                        type="tel"
                        value={reporterPhone}
                        onChange={(e) => setReporterPhone(e.target.value)}
                        placeholder="+91..."
                        className="w-full px-2.5 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E9E1D3]">
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
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] cursor-pointer hover:border-[#0F766E]/50">
                        <Camera className="w-3.5 h-3.5 text-[#0F766E]" />
                        <span>
                          {photoName
                            ? `${t.photoAttachedPrefix} ${photoName.slice(0, 18)}`
                            : t.photoLabel}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePreTapPhotoChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 2. ACTIVE LIVE-GUIDANCE SCREEN (Post-Instant SOS — Live Bystander Updates without Fake Camera Preview) */}
        {instantResult && (
          <section
            className={`bg-white border-2 rounded-2xl p-5 sm:p-6 space-y-5 shadow-md ${
              instantResult.isSimulated ? 'border-amber-500' : 'border-[#DC2626]'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E9E1D3]">
              <div>
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                    instantResult.isSimulated
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {instantResult.isSimulated ? (
                    <FlaskConical className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {instantResult.isSimulated ? t.activeSimBadge : t.activeSosBadge} · {instantResult.code}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[#0B3B3C] mt-2">
                  {instantResult.isSimulated ? t.activeSimHeading : t.activeHeading}
                </h2>
                <p className="text-xs text-[#5B687A] mt-0.5">
                  {instantResult.cellLabel} ({instantResult.siteName}) · VHF {instantResult.vhfChannel}
                </p>
              </div>

              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {t.escalationLabel} {escalationRemainingSec}s
                  </span>
                </div>
                <p className="text-[10px] text-[#5B687A] mt-1 font-mono">
                  {t.savedPrefix} {instantResult.latency.persistDurationMs}ms · {t.fanoutPrefix}{' '}
                  {instantResult.latency.fanoutDurationMs}ms
                </p>
              </div>
            </div>

            {/* Nearest Responders & War Room Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-1">
                <p className="font-bold text-[#0B3B3C]">{t.nearestLifeguardsTitle}</p>
                {instantResult.nearestResponders.length === 0 ? (
                  <p className="text-[#5B687A]">{t.commandDispatchedFallback}</p>
                ) : (
                  <ul className="space-y-1 text-[#1B2A38]">
                    {instantResult.nearestResponders.map((r) => (
                      <li key={r.id}>
                        • <strong>{r.name}</strong> ({r.radioCallsign}) — {r.distanceMeters}m (~
                        {r.etaMinutes} min)
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-1">
                <p className="font-bold text-[#0B3B3C]">{t.warRoomTitle}</p>
                <p className="font-mono text-[11px] text-[#0F766E]">
                  {t.channelLabel} {instantResult.nexconnGroup.groupId}
                </p>
                <p className="text-[11px] text-[#5B687A]">
                  {instantResult.nexconnGroup.live ? t.warRoomLive : t.warRoomQueued}
                </p>
              </div>
            </div>

            {/* Live Bystander Voice Note, Photo Note & Incident Chat Updates */}
            <div className="p-4 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B3B3C] flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#0F766E]" />
                <span>{t.liveUpdatesHeading}</span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    isListening
                      ? 'bg-red-600 text-white'
                      : 'bg-white border border-[#E9E1D3] text-[#1B2A38]'
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-3.5 h-3.5" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-[#0F766E]" />
                  )}
                  <span>{isListening ? t.stopVoiceUpdate : t.dictateUpdate}</span>
                </button>

                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E9E1D3] text-xs font-semibold text-[#1B2A38] cursor-pointer hover:border-[#0F766E]">
                  <Camera className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>{t.sharePhotoNote}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPhotoName(file.name);
                        void handleSendBystanderUpdate(
                          'photo',
                          `${t.photoAttachedPrefix} ${file.name}`
                        );
                      }
                    }}
                  />
                </label>
              </div>

              {voiceError && <p className="text-xs text-[#D65A4A]">{voiceError}</p>}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bystanderChatInput}
                  onChange={(e) => setBystanderChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleSendBystanderUpdate('text', bystanderChatInput);
                    }
                  }}
                  placeholder={t.liveChatPlaceholder}
                  className="flex-1 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => void handleSendBystanderUpdate('text', bystanderChatInput)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t.sendBtn}</span>
                </button>
              </div>

              {bystanderUpdates.length > 0 && (
                <ul className="space-y-1.5 text-xs">
                  {bystanderUpdates.map((u) => (
                    <li
                      key={u.id}
                      className="px-3 py-2 rounded-lg bg-white border border-[#E9E1D3] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#1B2A38]">{u.text}</span>
                        <span className="font-mono text-[10px] text-[#5B687A] shrink-0">
                          {u.deliveryStatus === 'sending'
                            ? t.statusSending
                            : u.deliveryStatus === 'failed'
                              ? t.statusFailed
                              : u.deliveredToNexconn
                                ? `${t.statusWarRoom} · ${u.time}`
                                : `${t.statusCommandSse} · ${u.time}`}
                        </span>
                      </div>
                      {u.error && <p className="text-[11px] text-[#991B1B]">{u.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <a
                href="tel:112"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D65A4A] text-white text-xs font-bold"
              >
                <Phone className="w-4 h-4" />
                <span>{t.call112Full}</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setInstantResult(null);
                  setBystanderUpdates([]);
                  instantAttemptKeyRef.current = null;
                }}
                className="text-xs font-semibold text-[#5B687A] hover:text-[#1B2A38] cursor-pointer"
              >
                {t.submitAnother}
              </button>
            </div>
          </section>
        )}

        {/* Queued Offline Confirmation Screen */}
        {queuedConfirmation && !syncedReceipt && !instantResult && (
          <div className="bg-[#FBF8F3] border border-[#F59E0B]/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#9A3412]">{t.queuedScreenTitle}</h2>
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
                className="px-4 py-2.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#1B2A38] cursor-pointer"
              >
                {t.newReport}
              </button>
            </div>
          </div>
        )}

        {/* Synced Offline Receipt Screen */}
        {syncedReceipt && !instantResult && (
          <div className="bg-[#FBF8F3] border border-[#0F766E]/30 rounded-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#0F766E] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-[#0B3B3C]">{t.syncedReceiptTitle}</h2>
                <p className="text-xs text-[#5B687A] mt-1 leading-relaxed">{t.syncedReceiptBody}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#E9E1D3] text-xs">
              <div>
                <span className="text-[#5B687A]">{t.referenceCode}</span>
                <p className="font-mono font-bold text-sm text-[#0B3B3C] mt-0.5">
                  {syncedReceipt.code}
                </p>
              </div>
              <div>
                <span className="text-[#5B687A]">{t.currentStatus}</span>
                <p className="font-semibold text-[#B45309] mt-0.5">{t.awaitingVerification}</p>
              </div>
              <div>
                <span className="text-[#5B687A]">{t.rescueCellLabel}</span>
                <p className="font-semibold text-[#1B2A38] mt-0.5">
                  {syncedReceipt.cellId} · {syncedReceipt.siteName}
                </p>
              </div>
              <div>
                <span className="text-[#5B687A]">{t.radioFallbackLabel}</span>
                <p className="font-semibold text-[#1B2A38] mt-0.5">
                  {syncedReceipt.vhfChannel} · 112
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
                  setSyncedReceipt(null);
                  setDescription('');
                  setVoiceTranscript('');
                  setPhotoName(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#1B2A38] cursor-pointer"
              >
                {t.newReport}
              </button>
            </div>
          </div>
        )}

        {/* 3. SECONDARY (BELOW SOS): Public Beach Safety Companion */}
        <section className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#0F766E]">
                {t.companionTitle}
              </div>
              <h2 className="text-sm font-bold text-[#0B3B3C] mt-0.5">
                {activeCell
                  ? `${activeCell.siteName} · ${lang === 'ta' ? activeCell.labelTa : activeCell.label} (${activeCell.id})`
                  : t.noCellSelected}
              </h2>
              {activeCell?.accessLandmark && (
                <p className="text-[11px] text-[#5B687A] mt-0.5">
                  {t.landmarkLabel} {activeCell.accessLandmark} · {t.nearestTowerLabel}{' '}
                  {activeCell.towerName} ({activeCell.vhfChannel})
                </p>
              )}
              {gpsLat !== null && gpsLon !== null && (
                <p className="text-[11px] font-mono text-[#0F766E] mt-0.5">
                  {t.gpsLockedPrefix} {gpsLat.toFixed(5)}, {gpsLon.toFixed(5)}
                  {gpsAccuracy ? ` (±${gpsAccuracy}m)` : ''}
                </p>
              )}
            </div>

            <div className="text-right text-[11px]">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${
                  gpsLat !== null && (gpsAccuracy ?? 999) <= 50
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : gpsLat !== null
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : activeCell
                        ? 'bg-sky-50 text-sky-800 border-sky-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                <MapPin className="w-3 h-3" />
                {gpsLat !== null
                  ? `GPS ±${gpsAccuracy ?? '?'}m (${(gpsAccuracy ?? 999) <= 50 ? t.gpsHigh : t.gpsLow})`
                  : locatingGps
                    ? t.gpsLocatingBadge
                    : activeCell
                      ? routeCellId && !invalidQrCell
                        ? t.gpsQr
                        : t.gpsManual
                      : t.gpsUnconfirmed}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
              <div className="text-[10px] text-[#5B687A] flex items-center gap-1">
                <Waves className="w-3 h-3 text-[#0F766E]" /> {t.waveHeight}
              </div>
              <div className="font-bold text-[#1B2A38] mt-0.5">
                {beachEnv.loading
                  ? t.loadingText
                  : beachEnv.waveHeight !== null
                    ? `${beachEnv.waveHeight.toFixed(1)} m`
                    : gpsLat === null && !activeCell
                      ? t.selectLocText
                      : t.unavailableText}
              </div>
            </div>
            <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
              <div className="text-[10px] text-[#5B687A] flex items-center gap-1">
                <Wind className="w-3 h-3 text-sky-700" /> {t.windSpeed}
              </div>
              <div className="font-bold text-[#1B2A38] mt-0.5">
                {beachEnv.loading
                  ? t.loadingText
                  : beachEnv.windSpeed !== null
                    ? `${Math.round(beachEnv.windSpeed)} km/h`
                    : gpsLat === null && !activeCell
                      ? t.selectLocText
                      : t.unavailableText}
              </div>
            </div>
            <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
              <div className="text-[10px] text-[#5B687A] flex items-center gap-1">
                <Radio className="w-3 h-3 text-[#D65A4A]" /> {t.emergencyNumbers}
              </div>
              <div className="font-bold text-[#1B2A38] mt-0.5">112 · Coast Guard 1554</div>
            </div>
          </div>

          {((beachEnv.waveHeight !== null && beachEnv.waveHeight >= 1.8) ||
            (beachEnv.windSpeed !== null && beachEnv.windSpeed >= 35)) && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] text-rose-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D65A4A] shrink-0 mt-0.5" />
              <span>
                <strong>{t.elevatedRiskHeading}</strong> {t.elevatedRiskBody}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#5B687A] pt-1 border-t border-[#E9E1D3]/60">
            <span>
              {t.forecastSource}
              {beachEnv.timestamp ? ` (${beachEnv.timestamp.replace('T', ' ')})` : ''} ·{' '}
              {t.tideUnavailable}
            </span>
            <span>{t.safetyNotice}</span>
          </div>
        </section>
      </main>

      {/* Accessible Leave Confirmation Modal */}
      {leaveConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sos-leave-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLeaveConfirmOpen(false);
          }}
        >
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="space-y-1.5">
              <h2 id="sos-leave-modal-title" className="text-base font-bold text-[#0B3B3C]">
                {t.leaveTitle}
              </h2>
              <p className="text-xs text-[#5B687A] leading-relaxed">{t.leaveBody}</p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                autoFocus
                onClick={() => setLeaveConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#0F766E] hover:bg-[#0B5A54] text-white text-xs font-semibold min-h-[40px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E]/50"
              >
                {t.stayBtn}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeaveConfirmOpen(false);
                  performBackNavigation();
                }}
                className="px-4 py-2 rounded-xl border border-[#D65A4A]/40 bg-white hover:bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold min-h-[40px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D65A4A]/40"
              >
                {t.leaveBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
