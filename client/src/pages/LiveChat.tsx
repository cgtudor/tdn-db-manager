import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatStream, useLiveOverview } from '../hooks/useLive';
import { searchChat } from '../api/live';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { MessageSquare, Wifi, WifiOff, Trash2, ArrowDown, Search, X, Loader2 } from 'lucide-react';
import type { ChatMessage } from '../types';

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const channelColors: Record<string, string> = {
  Talk: 'text-text',
  Shout: 'text-orange-400',
  Whisper: 'text-purple-400',
  DM: 'text-cyan-400',
};

const channelBadgeVariants: Record<string, 'default' | 'warning' | 'info'> = {
  Talk: 'default',
  Shout: 'warning',
  Whisper: 'info',
  DM: 'info',
};

export function LiveChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const areaParam = searchParams.get('area') || '_all';
  const [area, setArea] = useState(areaParam);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTalk, setShowTalk] = useState(true);
  const [showShout, setShowShout] = useState(true);
  const [showWhisper, setShowWhisper] = useState(true);
  const [showDM, setShowDM] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { messages, connected, clearMessages, loadOlder, loadingOlder, hasOlder } = useChatStream(area);
  const { areas } = useLiveOverview();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Update URL when area changes
  useEffect(() => {
    if (area === '_all') {
      searchParams.delete('area');
    } else {
      searchParams.set('area', area);
    }
    setSearchParams(searchParams, { replace: true });
  }, [area]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Detect manual scroll to disable auto-scroll + load older at top
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);

    // Load older messages when scrolled near the top
    if (scrollTop < 100 && hasOlder && !loadingOlder) {
      loadOlder();
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (m.channel === 'Talk' && !showTalk) return false;
    if (m.channel === 'Shout' && !showShout) return false;
    if (m.channel === 'Whisper' && !showWhisper) return false;
    if (m.channel === 'DM' && !showDM) return false;
    return true;
  });

  // When searching, show search results; otherwise show live filtered messages
  const displayMessages = searchResults !== null ? searchResults : filteredMessages;
  const isSearchMode = searchResults !== null;

  const areaOptions = [
    { value: '_all', label: 'All Areas' },
    { value: '_dm', label: 'DM Channel' },
    ...areas.map((a) => ({ value: a.areaTag, label: `${a.areaName} (${a.playerCount})` })),
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text">
            <MessageSquare className="h-4 w-4 inline mr-1.5" />Area Chat
          </h1>
          {connected ? (
            <Badge variant="success">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </Badge>
          ) : (
            <Badge variant="warning"><WifiOff className="h-3 w-3 inline mr-1" />Connecting</Badge>
          )}
          <Badge>{filteredMessages.length} messages</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Channel filters */}
          <button
            onClick={() => setShowTalk(!showTalk)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showTalk ? 'bg-primary text-white' : 'bg-surface-dim text-text-muted hover:text-text'
            }`}
          >
            Talk
          </button>
          <button
            onClick={() => setShowShout(!showShout)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showShout ? 'bg-orange-500 text-white' : 'bg-surface-dim text-text-muted hover:text-text'
            }`}
          >
            Shout
          </button>
          <button
            onClick={() => setShowWhisper(!showWhisper)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showWhisper ? 'bg-purple-500 text-white' : 'bg-surface-dim text-text-muted hover:text-text'
            }`}
          >
            Whisper
          </button>
          <button
            onClick={() => setShowDM(!showDM)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showDM ? 'bg-cyan-500 text-white' : 'bg-surface-dim text-text-muted hover:text-text'
            }`}
          >
            DM
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Area selector */}
          <Select
            className="text-xs !py-1 w-48"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            options={areaOptions}
          />

          <button
            onClick={clearMessages}
            className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            title="Clear messages"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
        <input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value === '') setSearchResults(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery.length >= 2) {
              setSearching(true);
              searchChat(area, searchQuery).then((results) => {
                setSearchResults(results);
                setSearching(false);
              }).catch(() => setSearching(false));
            }
          }}
          placeholder="Search messages... (Enter to search)"
          className="flex-1 text-sm bg-transparent border-none outline-none text-text placeholder:text-text-muted"
        />
        {searching && <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />}
        {searchResults !== null && (
          <>
            <Badge>{searchResults.length} results</Badge>
            <button
              onClick={() => { setSearchQuery(''); setSearchResults(null); }}
              className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Chat messages */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm"
      >
        {displayMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            <MessageSquare className="h-5 w-5 mr-2" />
            {isSearchMode ? 'No messages match your search' : connected ? 'Waiting for messages...' : 'Connecting...'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Load older indicator (only in live mode) */}
            {!isSearchMode && loadingOlder && (
              <div className="text-center text-xs text-text-muted py-2">Loading older messages...</div>
            )}
            {!isSearchMode && !hasOlder && messages.length > 0 && (
              <div className="text-center text-xs text-text-muted py-2">— Beginning of history —</div>
            )}
            {isSearchMode && (
              <div className="text-center text-xs text-text-muted py-2">— Search results for "{searchQuery}" —</div>
            )}
            {displayMessages.map((msg) => (
              <div key={msg.id} className="flex gap-2 py-0.5 hover:bg-surface-hover rounded px-1 -mx-1 flex-wrap sm:flex-nowrap">
                <span className="text-text-muted text-xs tabular-nums flex-shrink-0 pt-0.5 w-16">
                  {formatTime(msg.ts)}
                </span>
                <Badge
                  variant={channelBadgeVariants[msg.channel] || 'default'}
                  className="text-[10px] flex-shrink-0 h-4 mt-0.5"
                >
                  {msg.channel}
                </Badge>
                {area === '_all' && (
                  <span className="text-xs text-primary/70 flex-shrink-0 truncate max-w-28 pt-0.5">
                    [{msg.areaName}]
                  </span>
                )}
                <span className="font-semibold text-primary flex-shrink-0">{msg.speaker}:</span>
                <span className={`${channelColors[msg.channel] || 'text-text'} break-words min-w-0`}>{msg.msg}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom indicator */}
      {!autoScroll && (
        <div className="flex justify-center pb-2">
          <button
            onClick={() => {
              setAutoScroll(true);
              chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-primary text-white shadow-md hover:bg-primary/90 transition-colors"
          >
            <ArrowDown className="h-3 w-3" /> New messages
          </button>
        </div>
      )}
    </div>
  );
}
