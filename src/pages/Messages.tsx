import React, { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useNexconn } from '../context/NexconnContext';
import { ConversationList } from '../components/comms/ConversationList';
import { ChatThread } from '../components/comms/ChatThread';
import { NewGroupModal } from '../components/comms/NewGroupModal';

export const Messages: React.FC = () => {
  const { connectionStatus, connectionError, selectedChannel, reconnect } = useNexconn();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const showThreadOnMobile = mobileShowThread && Boolean(selectedChannel);

  return (
    <div className="space-y-4">
      {connectionStatus === 'error' && connectionError && (
        <div className="bg-[#FBF8F3] border border-[#D65A4A]/40 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-[#1B2A38]">
            <AlertTriangle className="w-4 h-4 text-[#D65A4A] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[#D65A4A]">
                Nexconn Session Connection Error
              </div>
              <p className="text-[#5B687A] mt-0.5">{connectionError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reconnect()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B3B3C] shrink-0 self-start sm:self-center"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl shadow-xs overflow-hidden h-[calc(100vh-9.5rem)] min-h-[540px] flex">
        {/* Left pane: Conversations & Operator Directory */}
        <div
          className={`${
            showThreadOnMobile ? 'hidden lg:block' : 'block'
          } w-full lg:w-80 xl:w-96 h-full shrink-0`}
        >
          <ConversationList
            onOpenNewGroup={() => setNewGroupOpen(true)}
            onSelectDone={() => setMobileShowThread(true)}
          />
        </div>

        {/* Right pane: Active Chat Thread */}
        <div
          className={`${
            showThreadOnMobile ? 'flex' : 'hidden lg:flex'
          } flex-1 h-full min-w-0`}
        >
          <ChatThread onBackMobile={() => setMobileShowThread(false)} />
        </div>
      </div>

      <NewGroupModal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} />
    </div>
  );
};
