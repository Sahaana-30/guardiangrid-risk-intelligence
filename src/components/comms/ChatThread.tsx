import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Phone,
  Send,
  Users,
  Video,
} from 'lucide-react';
import { useNexconn } from '../../context/NexconnContext';
import type { CommsMessage } from '../../types/comms';

interface ChatThreadProps {
  onBackMobile?: () => void;
}

function formatMessageTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ChatThread: React.FC<ChatThreadProps> = ({ onBackMobile }) => {
  const {
    connectionStatus,
    selectedChannel,
    messages,
    hasMoreMessages,
    isLoadingMessages,
    uploadProgress,
    onlineMap,
    typingUsersInSelected,
    loadOlderMessages,
    sendText,
    sendImage,
    sendFile,
    notifyTyping,
    startCall,
    getOperatorName,
  } = useNexconn();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSendError(null);
  }, [selectedChannel?.key]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedChannel?.key]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selectedChannel || sending) return;
    setSendError(null);
    setSending(true);
    const text = draft;
    setDraft('');
    try {
      await sendText(text);
    } catch (err: any) {
      setDraft(text);
      setSendError(err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSendError(null);
    try {
      await sendImage(file);
    } catch (err: any) {
      setSendError(err?.message || 'Image upload failed.');
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSendError(null);
    try {
      await sendFile(file);
    } catch (err: any) {
      setSendError(err?.message || 'File upload failed.');
    }
  };

  const handleDownload = async (msg: CommsMessage) => {
    try {
      if (msg.rawMessage) {
        await msg.rawMessage.downloadMedia();
        return;
      }
      const targetUrl = msg.fileUrl || msg.imageUrl;
      if (targetUrl) {
        const a = document.createElement('a');
        a.href = targetUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.download = msg.fileName || 'attachment';
        a.click();
      }
    } catch (err: any) {
      setSendError(err?.message || 'Unable to download attachment.');
    }
  };

  if (!selectedChannel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F6F1E7]/50">
        <div className="w-14 h-14 rounded-2xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center mb-4">
          <Users className="w-7 h-7" />
        </div>
        <h3 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
          Select a Conversation
        </h3>
        <p className="text-xs text-[#5B687A] max-w-sm mt-1.5 leading-relaxed">
          Choose an operator or response group on the left to exchange real-time messages, share
          field attachments, or launch an encrypted audio or video call.
        </p>
      </div>
    );
  }

  const isDirectOnline =
    selectedChannel.channelType === 'direct'
      ? Boolean(onlineMap[selectedChannel.channelId])
      : false;

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F6F1E7]/40 min-w-0">
      {/* Thread Header */}
      <div className="px-4 py-3 bg-[#FBF8F3] border-b border-[#E9E1D3] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBackMobile && (
            <button
              type="button"
              onClick={onBackMobile}
              className="lg:hidden p-1.5 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/50"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-[#0F766E] text-white text-xs font-bold flex items-center justify-center">
              {selectedChannel.channelType === 'group' ? (
                <Users className="w-4 h-4" />
              ) : (
                selectedChannel.initials
              )}
            </div>
            {selectedChannel.channelType === 'direct' && (
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#FBF8F3] ${
                  isDirectOnline ? 'bg-[#0E9F6E]' : 'bg-slate-300'
                }`}
              />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#1B2A38] truncate">
              {selectedChannel.name}
            </h3>
            <p className="text-[11px] text-[#5B687A] truncate">
              {typingUsersInSelected.length > 0 ? (
                <span className="text-[#0F766E] font-medium">
                  {typingUsersInSelected.map(getOperatorName).join(', ')} typing...
                </span>
              ) : selectedChannel.channelType === 'direct' ? (
                `${selectedChannel.subtitle} • ${isDirectOnline ? 'Online' : 'Offline'}`
              ) : (
                selectedChannel.subtitle
              )}
            </p>
          </div>
        </div>

        {/* 1:1 Audio & Video Call Controls */}
        {selectedChannel.channelType === 'direct' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => void startCall(selectedChannel.channelId, 'audio')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E] hover:text-[#0F766E] transition-colors disabled:opacity-45"
            >
              <Phone className="w-3.5 h-3.5 text-[#0F766E]" />
              <span className="hidden sm:inline">Audio Call</span>
            </button>
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => void startCall(selectedChannel.channelId, 'video')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B3B3C] transition-colors disabled:opacity-45"
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Video Call</span>
            </button>
          </div>
        )}
      </div>

      {/* Message History Viewport */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasMoreMessages && (
          <div className="text-center pb-2">
            <button
              type="button"
              disabled={isLoadingMessages}
              onClick={() => void loadOlderMessages()}
              className="px-3 py-1 rounded-full bg-white border border-[#E9E1D3] text-[11px] font-medium text-[#5B687A] hover:text-[#0F766E] transition-colors disabled:opacity-50"
            >
              {isLoadingMessages ? 'Loading history...' : 'Load older messages'}
            </button>
          </div>
        )}

        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-[#5B687A] gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#0F766E]" />
            <span>Syncing channel history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-xs text-[#5B687A]">
            No messages in this channel yet. Send a message below to begin.
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.direction === 'send';
            const imgSrc =
              msg.imageUrl ||
              (msg.thumbnailBase64
                ? msg.thumbnailBase64.startsWith('data:')
                  ? msg.thumbnailBase64
                  : `data:image/jpeg;base64,${msg.thumbnailBase64}`
                : undefined);

            return (
              <div
                key={msg.messageId}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                {!isMine && selectedChannel.channelType === 'group' && (
                  <span className="text-[10px] font-medium text-[#5B687A] mb-1 px-1">
                    {getOperatorName(msg.senderUserId)}
                  </span>
                )}

                <div
                  className={`max-w-[82%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs ${
                    isMine
                      ? 'bg-[#0F766E] text-white rounded-br-sm'
                      : 'bg-white border border-[#E9E1D3] text-[#1B2A38] rounded-bl-sm'
                  }`}
                >
                  {msg.kind === 'image' && imgSrc ? (
                    <div className="space-y-1.5">
                      <img
                        src={imgSrc}
                        alt="Shared attachment"
                        onClick={() => void handleDownload(msg)}
                        className="max-h-56 rounded-xl object-cover cursor-pointer border border-black/10"
                      />
                      <button
                        type="button"
                        onClick={() => void handleDownload(msg)}
                        className={`inline-flex items-center gap-1 text-[10px] underline ${
                          isMine ? 'text-white/85' : 'text-[#0F766E]'
                        }`}
                      >
                        <Download className="w-3 h-3" />
                        <span>Open / Download</span>
                      </button>
                    </div>
                  ) : msg.kind === 'file' ? (
                    <div className="flex items-center gap-2.5 min-w-[190px]">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isMine ? 'bg-white/15' : 'bg-[#F6F1E7]'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{msg.fileName || 'File'}</div>
                        <div
                          className={`text-[10px] ${
                            isMine ? 'text-white/75' : 'text-[#5B687A]'
                          }`}
                        >
                          {formatBytes(msg.fileSize) || msg.fileType || 'Document'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDownload(msg)}
                        title="Download file"
                        className={`p-1.5 rounded-lg ${
                          isMine ? 'hover:bg-white/15' : 'hover:bg-[#F6F1E7]'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                  )}

                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isMine ? 'text-white/75' : 'text-[#5B687A]'
                    }`}
                  >
                    <span>{formatMessageTime(msg.sentTime)}</span>
                    {isMine &&
                      (msg.sentStatus === 'read' || (msg.readCount ?? 0) > 0 ? (
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-200" aria-label="Read" />
                      ) : (
                        <Check className="w-3 h-3" aria-label="Sent" />
                      ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Upload Progress or Send Error */}
      {(uploadProgress !== null || sendError) && (
        <div className="px-4 py-2 bg-[#FBF8F3] border-t border-[#E9E1D3] text-xs">
          {uploadProgress !== null && (
            <div className="flex items-center gap-2 text-[#0F766E]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Uploading attachment: {Math.round(uploadProgress)}%</span>
            </div>
          )}
          {sendError && <div className="text-[#D65A4A] font-medium">{sendError}</div>}
        </div>
      )}

      {/* Message Composer */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="p-3 bg-[#FBF8F3] border-t border-[#E9E1D3] flex items-center gap-2 shrink-0"
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => void handleImagePick(e)}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => void handleFilePick(e)}
          className="hidden"
        />

        <button
          type="button"
          disabled={!isConnected || uploadProgress !== null}
          onClick={() => imageInputRef.current?.click()}
          title="Share image"
          className="p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] transition-colors disabled:opacity-45"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          disabled={!isConnected || uploadProgress !== null}
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          className="p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] transition-colors disabled:opacity-45"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={draft}
          disabled={!isConnected}
          onChange={(e) => {
            setDraft(e.target.value);
            notifyTyping();
          }}
          placeholder={
            isConnected
              ? `Message ${selectedChannel.name}...`
              : 'Connect Nexconn session to send messages'
          }
          className="flex-1 px-3.5 py-2 text-xs bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] placeholder:text-[#5B687A]/60 focus:outline-none focus:border-[#0F766E] disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!isConnected || !draft.trim() || sending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B3B3C] transition-colors disabled:opacity-45"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
};
