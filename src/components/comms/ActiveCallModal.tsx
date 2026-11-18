import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  User,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { useNexconn } from '../../context/NexconnContext';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const ActiveCallModal: React.FC = () => {
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
    if (!activeCall || activeCall.mediaType !== 'video') return;
    bindVideos(localVideoRef.current, remoteVideoRef.current);
  }, [
    activeCall?.callId,
    activeCall?.mediaType,
    activeCall?.status,
    activeCall?.remoteUserId,
    bindVideos,
  ]);

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

  const isVideo = activeCall.mediaType === 'video';
  const statusText =
    activeCall.status === 'oncall'
      ? formatDuration(elapsedSec)
      : activeCall.status === 'calling'
        ? 'Calling...'
        : activeCall.status === 'connecting'
          ? 'Connecting...'
          : 'Ringing...';

  return (
    <div className="fixed inset-0 z-[1100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0B3B3C] text-white rounded-3xl shadow-2xl border border-white/15 overflow-hidden flex flex-col">
        {/* Call Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
              GuardianGrid {isVideo ? 'Video' : 'Audio'} Dispatch
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
            <div className="mt-1 text-xs text-emerald-300 font-mono">{statusText}</div>
          </div>
        )}

        {/* Controls Footer */}
        <div className="px-6 py-5 bg-[#072627] border-t border-white/10 flex items-center justify-center gap-4">
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

          {isVideo && (
            <button
              type="button"
              onClick={() => void toggleCamera()}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-colors ${
                activeCall.isCameraEnabled
                  ? 'bg-white/15 hover:bg-white/25 text-white'
                  : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {activeCall.isCameraEnabled ? (
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
