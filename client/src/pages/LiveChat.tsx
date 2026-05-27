import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatStream, useLiveOverview } from '../hooks/useLive';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { MessageSquare, Wifi, WifiOff, Trash2, ArrowDown } from 'lucide-react';

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const channelColors: Record<string, string> = {
  Talk: 'text-text',
  Shout: 'text-orange-400',
};

const channelBadgeVariants: Record<string, 'default' | 'warning'> = {
  Talk: 'default',
  Shout: 'warning',
};

export function LiveChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const areaParam = searchParams.get('area') || '_all';
  const [area, setArea] = useState(areaParam);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTalk, setShowTalk] = useState(true);
  const [showShout, setShowShout] = useState(true);

  const { messages, connected, clearMessages } = useChatStream(area);
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

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  };

  const filteredMessages = messages.filter((m) => {
    if (m.channel === 'Talk' && !showTalk) return false;
    if (m.channel === 'Shout' && !showShout) return false;
    return true;
  });

  const areaOptions = [
    { value: '_all', label: 'All Areas' },
    ...areas.map((a) => ({ value: a.areaTag, label: `${a.areaTag} (${a.playerCount})` })),
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
            <Badge variant="success"><Wifi className="h-3 w-3 inline mr-1" />Live</Badge>
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

      {/* Chat messages */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm"
      >
        {filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            <MessageSquare className="h-5 w-5 mr-2" />
            {connected ? 'Waiting for messages...' : 'Connecting...'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredMessages.map((msg) => (
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
