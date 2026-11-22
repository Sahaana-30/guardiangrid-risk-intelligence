import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  User,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { isPublicSafetyRoute, useNexconn } from '../../context/NexconnContext';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * GuardianGrid Nexconn Call SDK Overlay.
 * Supports full-screen modal and Docked Corner Overlay mode so dispatchers can conduct
 * live video triage alongside the Google Maps incident view, with Audio Fallback.
 */
export const ActiveCallModal: React.FC = () => {
  const location = useLocation();
  const isPublicRoute = isPublicSafetyRoute(location.pathname);
  const {
    activeCall,
    callError,
    hangupActiveCall,
    toggleMicrophone,
    toggleCamera,
    bindVideos,
    clearCallError,
  } = useNexconn();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isDocked, setIsDocked] = useState<boolean>(false);
  const [audioFallbackActive, setAudioFallbackActive] = useState<boolean>(false);

  // Default to docked side-by-side overlay when on Command Center so Google Maps stays interactive
  useEffect(() => {
    if (activeCall?.callId) {
      setIsDocked(location.pathname === '/command');
      setAudioFallbackActive(false);
    }
  }, [activeCall?.callId, location.pathname]);

  useEffect(() => {
    if (!activeCall?.connectedAt) {
      setElapsedSec(0);
      return;
    }
    const update = () => {
      setElapsedSec(
        Math.max(0, Math.floor((Date.now() - (activeCall.connectedAt || Date.now())) / 1000))
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.connectedAt]);

  useEffect(() => {
    if (isPublicRoute || !activeCall || activeCall.mediaType !== 'video' || audioFallbackActive) return;
    bindVideos(localVideoRef.current, remoteVideoRef.current);
  }, [
    isPublicRoute,
    activeCall?.callId,
    activeCall?.mediaType,
    activeCall?.status,
    activeCall?.remoteUserId,
    isDocked,
    audioFallbackActive,
    bindVideos,
  ]);

  if (isPublicRoute) return null;

  if (!activeCall && callError) {
    return (
      <div className="fixed bottom-5 right-5 z-[1100] max-w-sm bg-[#FBF8F3] border border-[#D65A4A]/40 rounded-2xl shadow-xl p-3.5 flex items-center gap-3 text-xs text-[#1B2A38]">
        <div className="flex-1 font-medium text-[#D65A4A]">{callError}</div>
        <button
          type="button"
          onClick={clearCallError}
          className="p-1 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/50"
          aria-label="Dismiss call alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (!activeCall) return null;

  const isVideo = activeCall.mediaType === 'video' && !audioFallbackActive;
  const statusText =
    activeCall.status === 'oncall'
      ? formatDuration(elapsedSec)
      : activeCall.status === 'calling'
        ? 'Calling...'
        : activeCall.status === 'connecting'
          ? 'Connecting...'
          : 'Ringing...';

  const handleEnableAudioFallback = async () => {
    if (activeCall.isCameraEnabled) {
      await toggleCamera();
    }
    setAudioFallbackActive(true);
  };

  const handleRestoreVideo = async () => {
    setAudioFallbackActive(false);
    if (!activeCall.isCameraEnabled) {
      await toggleCamera();
    }
  };

  // Docked Corner Overlay (allows viewing & interacting with Google Maps alongside video triage)
  if (isDocked) {
    return (
      <div className="fixed bottom-5 right-5 z-[1100] w-[360px] max-w-[calc(100vw-2rem)] bg-[#0B3B3C] text-white rounded-2xl shadow-2xl border border-white/20 overflow-hidden flex flex-col">
        <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/10 bg-[#072627]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                {audioFallbackActive ? 'Audio Fallback' : isVideo ? 'Video Triage' : 'Audio Dispatch'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#0F766E] text-[10px] font-mono font-semibold">
                {statusText}
              </span>
            </div>
            <p className="text-xs font-bold truncate mt-0.5">{activeCall.remoteName}</p>
          </div>

          <button
            type="button"
            onClick={() => setIsDocked(false)}
            title="Expand call overlay"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {isVideo ? (
          <div className="relative aspect-video bg-[#062223] w-full overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {(activeCall.status !== 'oncall' || activeCall.isRemoteCameraOff) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07292A]/90 text-center p-4">
                <User className="w-7 h-7 text-white/80 mb-1.5" />
                <div className="text-xs font-semibold">{activeCall.remoteName}</div>
                <div className="text-[10px] text-white/65">{statusText}</div>
              </div>
            )}
            <div className="absolute bottom-2 right-2 w-24 aspect-video rounded-lg overflow-hidden bg-[#0B3B3C] border border-white/30">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        ) : (
          <div className="py-5 px-4 flex items-center gap-3 bg-[#0B3B3C]">
            <div className="w-11 h-11 rounded-full bg-[#0F766E] flex items-center justify-center font-bold text-sm shrink-0">
              {activeCall.remoteName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{activeCall.remoteName}</p>
              <p className="text-[11px] text-emerald-300">
                {audioFallbackActive ? 'Audio-only fallback active' : statusText}
              </p>
            </div>
          </div>
        )}

        <div className="px-3 py-2.5 bg-[#072627] border-t border-white/10 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void toggleMicrophone()}
            className={`p-2 rounded-xl text-xs font-semibold ${
              activeCall.isMicEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-amber-500'
            }`}
            title={activeCall.isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {activeCall.isMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          {activeCall.mediaType === 'video' && (
            <button
              type="button"
              onClick={() =>
                void (audioFallbackActive ? handleRestoreVideo() : handleEnableAudioFallback())
              }
              className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold flex items-center gap-1 ${
                audioFallbackActive ? 'bg-amber-500 text-white' : 'bg-white/15 hover:bg-white/25'
              }`}
              title={audioFallbackActive ? 'Restore video' : 'Switch to audio-only fallback'}
            >
              {audioFallbackActive ? <Phone className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
              <span>{audioFallbackActive ? 'Audio Only' : 'Audio Fallback'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void hangupActiveCall()}
            className="px-3 py-2 rounded-xl bg-[#D65A4A] hover:bg-[#b84637] text-white text-xs font-semibold flex items-center gap-1"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>End</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0B3B3C] text-white rounded-3xl shadow-2xl border border-white/15 overflow-hidden flex flex-col">
        {/* Call Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
              GuardianGrid {audioFallbackActive ? 'Audio Fallback' : isVideo ? 'Video' : 'Audio'} Dispatch
            </span>
            <h3 className="font-serif-heading text-lg font-bold leading-tight">
              {activeCall.remoteName}
            </h3>
            {activeCall.remoteRole && (
              <p className="text-xs text-white/70">{activeCall.remoteRole}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeCall.isRemoteMicMuted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-[11px] text-amber-200">
                <MicOff className="w-3 h-3" />
                Remote muted
              </span>
            )}
            <span className="px-3 py-1 rounded-full bg-[#0F766E] text-xs font-mono font-semibold">
              {statusText}
            </span>
            <button
              type="button"
              onClick={() => setIsDocked(true)}
              title="Dock alongside Google Maps"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-semibold"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Dock Over Map</span>
            </button>
          </div>
        </div>

        {/* Media Viewport */}
        {isVideo ? (
          <div className="relative aspect-video bg-[#062223] w-full overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {(activeCall.status !== 'oncall' || activeCall.isRemoteCameraOff) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07292A]/90 text-center p-6">
                <div className="w-20 h-20 rounded-full bg-[#0F766E]/40 border border-white/20 flex items-center justify-center mb-3">
                  <User className="w-9 h-9 text-white/85" />
                </div>
                <div className="text-sm font-semibold">{activeCall.remoteName}</div>
                <div className="text-xs text-white/65 mt-1">
                  {activeCall.status !== 'oncall'
                    ? statusText
                    : 'Remote camera is currently off'}
                </div>
              </div>
            )}

            {/* Local PiP Preview */}
            <div className="absolute bottom-4 right-4 w-36 sm:w-44 aspect-video rounded-xl overflow-hidden bg-[#0B3B3C] border-2 border-white/25 shadow-xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!activeCall.isCameraEnabled && (
                <div className="absolute inset-0 bg-[#0B3B3C] flex flex-col items-center justify-center text-[10px] text-white/75 gap-1">
                  <VideoOff className="w-4 h-4" />
                  <span>Camera Off</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-14 px-6 flex flex-col items-center justify-center bg-gradient-to-b from-[#0B3B3C] to-[#072627]">
            <div className="w-24 h-24 rounded-full bg-[#0F766E] ring-8 ring-white/10 flex items-center justify-center text-2xl font-serif-heading font-bold">
              {activeCall.remoteName.slice(0, 2).toUpperCase()}
            </div>
            <div className="mt-4 text-base font-semibold">{activeCall.remoteName}</div>
            <div className="mt-1 text-xs text-emerald-300 font-mono">
              {audioFallbackActive ? `Audio Fallback · ${statusText}` : statusText}
            </div>
          </div>
        )}

        {/* Controls Footer */}
        <div className="px-6 py-5 bg-[#072627] border-t border-white/10 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void toggleMicrophone()}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-colors ${
              activeCall.isMicEnabled
                ? 'bg-white/15 hover:bg-white/25 text-white'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {activeCall.isMicEnabled ? (
              <>
                <Mic className="w-4 h-4" />
                <span>Mute</span>
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4" />
                <span>Unmute</span>
              </>
            )}
          </button>

          {activeCall.mediaType === 'video' && (
            <>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-colors ${
                  activeCall.isCameraEnabled && !audioFallbackActive
                    ? 'bg-white/15 hover:bg-white/25 text-white'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
              >
                {activeCall.isCameraEnabled && !audioFallbackActive ? (
                  <>
                    <Video className="w-4 h-4" />
                    <span>Camera On</span>
                  </>
                ) : (
                  <>
                    <VideoOff className="w-4 h-4" />
                    <span>Camera Off</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  void (audioFallbackActive ? handleRestoreVideo() : handleEnableAudioFallback())
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>{audioFallbackActive ? 'Restore Video' : 'Audio Fallback'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => void hangupActiveCall()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#D65A4A] hover:bg-[#b84637] text-white text-xs font-semibold shadow-md transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
