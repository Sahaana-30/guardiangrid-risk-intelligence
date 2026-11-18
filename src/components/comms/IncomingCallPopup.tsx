import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useNexconn } from '../../context/NexconnContext';

export const IncomingCallPopup: React.FC = () => {
  const { incomingCall, acceptIncomingCall, rejectIncomingCall } = useNexconn();

  if (!incomingCall) return null;

  const isVideo = incomingCall.mediaType === 'video';

  return (
    <div className="fixed bottom-5 right-5 z-[1100] w-[calc(100vw-2.5rem)] max-w-sm bg-[#0B3B3C] text-white rounded-2xl shadow-2xl border border-white/15 p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-[#0F766E] flex items-center justify-center shrink-0 ring-4 ring-white/15 animate-pulse">
          {isVideo ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            Incoming {isVideo ? 'Video' : 'Audio'} Call
          </span>
          <h4 className="font-serif-heading text-base font-bold truncate mt-0.5">
            {incomingCall.callerName}
          </h4>
          {incomingCall.callerRole && (
            <p className="text-[11px] text-white/75 truncate">{incomingCall.callerRole}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <button
          type="button"
          onClick={() => void rejectIncomingCall()}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#D65A4A] hover:bg-[#b84637] text-white text-xs font-semibold transition-colors"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          <span>Decline</span>
        </button>

        <button
          type="button"
          onClick={() => void acceptIncomingCall()}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#0E9F6E] hover:bg-[#0b855b] text-white text-xs font-semibold transition-colors"
        >
          {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
          <span>Accept</span>
        </button>
      </div>
    </div>
  );
};
