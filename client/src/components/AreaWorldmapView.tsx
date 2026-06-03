import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ZoomIn, ZoomOut, Maximize2, Users, DoorOpen, X, Skull } from 'lucide-react';
import { subscribePlayerStream } from '../api/live';
import type { AreaPopulation } from '../types';
import { apiGet } from '../api/client';

interface WorldmapArea {
  id: string;
  name: string;
  region: string;
  tag: string;
  isInterior: boolean;
  dungeonLevel?: number;
  encounters?: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WorldmapLink {
  source: string;
  target: string;
  type: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

interface WorldmapInterior {
  id: string;
  name: string;
  tag: string;
  dungeonLevel?: number;
  encounters?: string[];
  w: number;
  h: number;
}

interface WorldmapMeta {
  width: number;
  height: number;
  tileUrl: string;
  areas: WorldmapArea[];
  links: WorldmapLink[];
  interiors: Record<string, WorldmapInterior[]>;
}

function getWorldmapMeta(): Promise<WorldmapMeta> {
  return apiGet('/api/live/analytics/worldmap-meta');
}

function InteriorCard({
  interior,
  pop,
  dungeon,
}: {
  interior: WorldmapInterior;
  pop: AreaPopulation | undefined;
  dungeon: number | undefined;
}) {
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);

  const handleEnter = (e: React.MouseEvent) => {
    setHovered(true);
    setTipPos({ x: e.clientX, y: e.clientY });
  };
  const handleMove = (e: React.MouseEvent) => {
    if (hovered) setTipPos({ x: e.clientX, y: e.clientY });
  };

  const shortName = interior.name.includes(' - ')
    ? interior.name.split(' - ').pop()!
    : interior.name.split(': ').pop()!;

  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={handleEnter}
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(false)}
        className={`group relative rounded overflow-hidden border transition-colors ${
          dungeon
            ? 'border-red-500/20 bg-red-950/20 hover:border-red-400/50'
            : 'border-white/5 bg-black/30 hover:border-amber-400/40'
        }`}
      >
        <div className="relative">
          <img
            src={`/api/live/analytics/worldmap-tiles/${interior.id}?v=3`}
            alt=""
            draggable={false}
            className="w-full aspect-square object-contain bg-black/50"
            style={{ imageRendering: 'pixelated' }}
          />
          {dungeon && (
            <div className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: 'inset 0 0 12px rgba(180,20,20,0.3)' }}
            />
          )}
        </div>
        {pop && (
          <div className="absolute top-1 right-1">
            <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[7px] font-bold shadow-sm shadow-emerald-500/50 animate-pulse">
              {pop.playerCount}
            </div>
          </div>
        )}
        <div className="px-1.5 py-1">
          <div className="flex items-center gap-1">
            {dungeon && <Skull className="h-2.5 w-2.5 text-red-400 shrink-0" />}
            <div className={`text-[10px] truncate transition-colors ${
              dungeon ? 'text-red-300/70 group-hover:text-red-200' : 'text-text-muted group-hover:text-text'
            }`}>
              {shortName}
            </div>
            {dungeon && (
              <span className="text-[8px] font-bold text-red-400/70 shrink-0">L{dungeon}</span>
            )}
          </div>
          {interior.encounters && interior.encounters.length > 0 && (
            <div className="text-[8px] text-red-300/50 truncate mt-0.5">
              {interior.encounters.slice(0, 3).join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && tipPos && (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{ left: tipPos.x + 12, top: tipPos.y + 12 }}
        >
          <div className={`rounded-lg shadow-xl px-3 py-2 max-w-[220px] border ${
            dungeon ? 'bg-[#1a0a0a] border-red-500/30' : 'bg-surface border-border'
          }`}>
            <div className="text-[11px] font-semibold text-text flex items-center gap-1.5">
              {interior.name.includes(' - ') ? interior.name.split(' - ').pop() : interior.name.split(': ').pop()}
              {dungeon && (
                <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[7px] font-bold uppercase bg-red-900/60 text-red-300 border border-red-500/30">
                  <Skull className="h-1.5 w-1.5" />L{dungeon}
                </span>
              )}
            </div>
            <div className="text-[9px] text-text-muted">{interior.name}</div>
            {interior.encounters && interior.encounters.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-red-500/15">
                <div className="text-[8px] font-semibold uppercase tracking-wider text-red-400/60 mb-0.5">Encounters</div>
                {interior.encounters.map((name, i) => (
                  <div key={i} className="text-[9px] text-red-300/70 leading-relaxed">{name}</div>
                ))}
              </div>
            )}
            {pop && (
              <div className="mt-1.5 pt-1.5 border-t border-border">
                <div className="text-[9px] text-emerald-400 flex items-center gap-1">
                  <Users className="h-2 w-2" />
                  {pop.players.map(p => p.name).join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function InteriorPopup({
  area,
  interiors,
  screenX,
  screenY,
  containerRef,
  playersByTag,
  parentScreenPos,
  onClose,
}: {
  area: WorldmapArea;
  interiors: WorldmapInterior[];
  screenX: number;
  screenY: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  playersByTag: Map<string, AreaPopulation>;
  parentScreenPos: { x: number; y: number };
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Position panel near click, clamped to container
  useEffect(() => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return;
    const cRect = container.getBoundingClientRect();
    const pW = panel.offsetWidth;
    const pH = panel.offsetHeight;
    let x = screenX - cRect.left + 16;
    let y = screenY - cRect.top - pH / 2;
    // Clamp
    if (x + pW > cRect.width - 8) x = screenX - cRect.left - pW - 16;
    if (y < 8) y = 8;
    if (y + pH > cRect.height - 8) y = cRect.height - pH - 8;
    setPos({ x, y });
  }, [screenX, screenY, containerRef]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing from the same click that opened
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Connector line endpoints relative to container
  const containerRect = containerRef.current?.getBoundingClientRect();
  const lineFromX = parentScreenPos.x;
  const lineFromY = parentScreenPos.y;
  const lineToX = pos.x;
  const lineToY = pos.y + (panelRef.current?.offsetHeight ?? 0) / 2;

  return (
    <>
      {/* Connecting line */}
      {containerRect && (
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 39,
          }}
        >
          <line
            x1={lineFromX}
            y1={lineFromY}
            x2={lineToX}
            y2={lineToY}
            stroke="rgba(245,180,60,0.5)"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
        </svg>
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          zIndex: 40,
          maxWidth: 400,
          minWidth: 240,
        }}
        className="bg-surface border border-border rounded-lg shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-dim">
          <DoorOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-text truncate">{area.name}</div>
            <div className="text-[10px] text-text-muted">{interiors.length} interior{interiors.length !== 1 ? 's' : ''}</div>
          </div>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-surface text-text-muted hover:text-text shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Interior grid */}
        <div className="p-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
          {interiors.map(interior => {
            const pop = playersByTag.get(interior.tag);
            const dungeon = interior.dungeonLevel;
            return (
              <InteriorCard
                key={interior.id}
                interior={interior}
                pop={pop}
                dungeon={dungeon}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

export function AreaWorldmapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredArea, setHoveredArea] = useState<WorldmapArea | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showPlayers, setShowPlayers] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [fitted, setFitted] = useState(false);
  const [interiorPopup, setInteriorPopup] = useState<{ area: WorldmapArea; screenX: number; screenY: number } | null>(null);

  const { data: meta } = useQuery({
    queryKey: ['worldmap-meta'],
    queryFn: getWorldmapMeta,
    staleTime: 5 * 60_000,
  });

  // Live player data
  const [liveAreas, setLiveAreas] = useState<AreaPopulation[]>([]);
  useEffect(() => {
    return subscribePlayerStream((data) => setLiveAreas(data.areas));
  }, []);

  const playersByTag = useMemo(() => {
    const map = new Map<string, AreaPopulation>();
    for (const a of liveAreas) {
      if (a.playerCount > 0) map.set(a.areaTag, a);
    }
    return map;
  }, [liveAreas]);

  const clampScale = (s: number) => Math.min(Math.max(s, 0.05), 6);

  // Zoom toward cursor
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => {
      const next = clampScale(prev * factor);
      const ratio = next / prev;
      setPan(p => ({
        x: cursorX - ratio * (cursorX - p.x),
        y: cursorY - ratio * (cursorY - p.y),
      }));
      return next;
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const dragDistRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart(pan);
    dragDistRef.current = 0;
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (dragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      dragDistRef.current = Math.max(dragDistRef.current, Math.abs(dx) + Math.abs(dy));
      setPan({
        x: panStart.x + dx,
        y: panStart.y + dy,
      });
    }
  }, [dragging, dragStart, panStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const fitToView = useCallback(() => {
    if (!containerRef.current || !meta) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fitScale = Math.min(rect.width / meta.width, rect.height / meta.height) * 0.95;
    const s = clampScale(fitScale);
    setScale(s);
    setPan({
      x: (rect.width - meta.width * s) / 2,
      y: (rect.height - meta.height * s) / 2,
    });
  }, [meta]);

  // Fit on first load
  useEffect(() => {
    if (meta && !fitted) {
      fitToView();
      setFitted(true);
    }
  }, [meta, fitted, fitToView]);

  // Close interior popup on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInteriorPopup(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAreaClick = useCallback((area: WorldmapArea, e: React.MouseEvent) => {
    // Ignore if we dragged
    if (dragDistRef.current > 5) return;
    if (!meta?.interiors?.[area.id]) {
      setInteriorPopup(null);
      return;
    }
    setInteriorPopup({ area, screenX: e.clientX, screenY: e.clientY });
  }, [meta]);

  // Only show exterior areas on the map (interiors are in popups)
  const visibleAreas = useMemo(() => {
    if (!meta) return [];
    return meta.areas.filter(a => !a.isInterior);
  }, [meta]);

  // Areas with players (including interior player counts aggregated onto parent)
  const areasWithPlayers = useMemo(() => {
    if (!meta || !showPlayers) return [];

    // Build interior tag -> parent area id map
    const interiorTagToParent = new Map<string, string>();
    if (meta.interiors) {
      for (const [parentId, children] of Object.entries(meta.interiors)) {
        for (const child of children) {
          interiorTagToParent.set(child.tag, parentId);
        }
      }
    }

    // Aggregate: for each area, count direct players + interior players
    const areaById = new Map(meta.areas.map(a => [a.id, a]));
    const aggregated = new Map<string, { area: WorldmapArea; count: number; names: string[] }>();

    for (const [tag, pop] of playersByTag) {
      // Direct match: player is in this area
      const directArea = meta.areas.find(a => a.tag === tag);
      if (directArea && !directArea.isInterior) {
        const entry = aggregated.get(directArea.id) ?? { area: directArea, count: 0, names: [] };
        entry.count += pop.playerCount;
        entry.names.push(...pop.players.map(p => p.name));
        aggregated.set(directArea.id, entry);
        continue;
      }

      // Interior match: roll up to parent
      const parentId = interiorTagToParent.get(tag);
      if (parentId) {
        const parentArea = areaById.get(parentId);
        if (parentArea) {
          const entry = aggregated.get(parentId) ?? { area: parentArea, count: 0, names: [] };
          entry.count += pop.playerCount;
          entry.names.push(...pop.players.map(p => `${p.name} (inside)`));
          aggregated.set(parentId, entry);
        }
      }
    }

    return Array.from(aggregated.values());
  }, [meta, playersByTag, showPlayers]);

  const totalPlayers = liveAreas.reduce((s, a) => s + a.playerCount, 0);

  // Region centroids for labels
  const regionLabels = useMemo(() => {
    if (!meta || scale > 0.3) return [];
    const centroids = new Map<string, { sx: number; sy: number; c: number }>();
    for (const area of meta.areas) {
      if (!area.region) continue;
      const r = centroids.get(area.region) || { sx: 0, sy: 0, c: 0 };
      r.sx += area.x + area.w / 2;
      r.sy += area.y + area.h / 2;
      r.c += 1;
      centroids.set(area.region, r);
    }
    return Array.from(centroids.entries())
      .filter(([, r]) => r.c >= 3)
      .map(([name, r]) => ({ name, x: r.sx / r.c, y: r.sy / r.c }));
  }, [meta, scale]);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-dim">
        <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Worldmap</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowLinks(!showLinks)}
          className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
            showLinks ? 'bg-blue-500/20 text-blue-400' : 'text-text-muted hover:text-text'
          }`}
          title="Toggle transition lines"
        >
          Links
        </button>
        <button
          onClick={() => setShowPlayers(!showPlayers)}
          className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
            showPlayers ? 'bg-emerald-500/20 text-emerald-400' : 'text-text-muted hover:text-text'
          }`}
        >
          <Users className="h-3 w-3" />{totalPlayers} online
        </button>
        <button onClick={() => setScale(s => clampScale(s * 1.3))} className="p-1 rounded hover:bg-surface text-text-muted hover:text-text">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setScale(s => clampScale(s * 0.7))} className="p-1 rounded hover:bg-surface text-text-muted hover:text-text">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button onClick={fitToView} className="p-1 rounded hover:bg-surface text-text-muted hover:text-text">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <span className="text-[10px] text-text-muted ml-1">{Math.round(scale * 100)}%</span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        style={{ cursor: dragging ? 'grabbing' : 'grab', background: '#141424' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={(e) => {
          handleMouseUp();
          // Close popup if clicking on background (not an area tile)
          if (dragDistRef.current <= 5 && e.target === containerRef.current) {
            setInteriorPopup(null);
          }
        }}
        onMouseLeave={handleMouseUp}
      >
        {!meta ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading worldmap...
          </div>
        ) : (
          <>
            {/* Transition links */}
            {showLinks && meta.links && (
              <svg
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              >
                {meta.links.map((link, i) => (
                  <line
                    key={i}
                    x1={pan.x + link.sx * scale}
                    y1={pan.y + link.sy * scale}
                    x2={pan.x + link.tx * scale}
                    y2={pan.y + link.ty * scale}
                    stroke={link.type === 'door' ? 'rgba(180,140,80,0.4)' : 'rgba(100,160,255,0.3)'}
                    strokeWidth={Math.max(1, scale * 2)}
                  />
                ))}
              </svg>
            )}

            {/* Area tiles - each is its own positioned image */}
            {visibleAreas.map(area => {
              const hasInteriors = !!meta.interiors?.[area.id];
              const isHovered = hoveredArea?.id === area.id;
              const isPopupTarget = interiorPopup?.area.id === area.id;
              return (
              <img
                key={area.id}
                src={`/api/live/analytics/worldmap-tiles/${area.id}?v=3`}
                alt=""
                draggable={false}
                loading="lazy"
                onMouseEnter={() => setHoveredArea(area)}
                onMouseLeave={() => setHoveredArea(null)}
                onMouseUp={(e) => handleAreaClick(area, e)}
                style={{
                  position: 'absolute',
                  left: pan.x + area.x * scale,
                  top: pan.y + area.y * scale,
                  width: area.w * scale,
                  height: area.h * scale,
                  imageRendering: scale > 1.5 ? 'pixelated' : 'auto',
                  userSelect: 'none',
                  cursor: hasInteriors ? 'pointer' : undefined,
                  outline: isHovered ? '2px solid rgba(255,255,255,0.7)'
                    : isPopupTarget ? '2px solid rgba(245,180,60,0.8)' : 'none',
                  boxShadow: area.dungeonLevel && scale > 0.15
                    ? `inset 0 0 ${Math.max(4, 12 * scale)}px rgba(220,40,40,0.35), 0 0 ${Math.max(3, 8 * scale)}px rgba(180,20,20,0.25)`
                    : undefined,
                  zIndex: isHovered ? 10 : 1,
                }}
              />
              );
            })}

            {/* Door badges on areas with interiors */}
            {meta.interiors && visibleAreas.filter(a => meta.interiors[a.id]).map(area => (
              <div
                key={`door-${area.id}`}
                style={{
                  position: 'absolute',
                  left: pan.x + (area.x + area.w) * scale - 8,
                  top: pan.y + area.y * scale - 8,
                  pointerEvents: 'none',
                  zIndex: 15,
                }}
              >
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/90 shadow-sm shadow-amber-500/40">
                  <DoorOpen className="h-2.5 w-2.5 text-white" />
                </div>
              </div>
            ))}

            {/* Skull badges on dungeon areas */}
            {scale > 0.15 && visibleAreas.filter(a => a.dungeonLevel).map(area => (
              <div
                key={`skull-${area.id}`}
                style={{
                  position: 'absolute',
                  left: pan.x + area.x * scale - 4,
                  top: pan.y + (area.y + area.h) * scale - 6,
                  pointerEvents: 'none',
                  zIndex: 15,
                }}
              >
                <div className="flex items-center justify-center w-[18px] h-[18px] rounded bg-red-900/80 border border-red-500/40 shadow-sm shadow-red-900/60">
                  <Skull className="h-2.5 w-2.5 text-red-300" />
                </div>
              </div>
            ))}

            {/* Player indicators */}
            {areasWithPlayers.map(({ area, count, names }) => (
              <div
                key={`player-${area.id}`}
                title={names.join(', ')}
                style={{
                  position: 'absolute',
                  left: pan.x + (area.x + area.w / 2) * scale - 10,
                  top: pan.y + (area.y + area.h / 2) * scale - 10,
                  pointerEvents: 'auto',
                  zIndex: 20,
                }}
              >
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-bold shadow-lg shadow-emerald-500/50 animate-pulse">
                  {count}
                </div>
              </div>
            ))}

            {/* Region labels at low zoom */}
            {regionLabels.map(({ name, x, y }) => (
              <div
                key={`region-${name}`}
                style={{
                  position: 'absolute',
                  left: pan.x + x * scale,
                  top: pan.y + y * scale,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
                className="text-white/30 font-bold text-xs whitespace-nowrap"
              >
                {name}
              </div>
            ))}

            {/* Interior popup panel */}
            {interiorPopup && meta.interiors?.[interiorPopup.area.id] && (
              <InteriorPopup
                area={interiorPopup.area}
                interiors={meta.interiors[interiorPopup.area.id]}
                screenX={interiorPopup.screenX}
                screenY={interiorPopup.screenY}
                containerRef={containerRef}
                playersByTag={playersByTag}
                parentScreenPos={{
                  x: pan.x + (interiorPopup.area.x + interiorPopup.area.w / 2) * scale,
                  y: pan.y + (interiorPopup.area.y + interiorPopup.area.h / 2) * scale,
                }}
                onClose={() => setInteriorPopup(null)}
              />
            )}
          </>
        )}

        {/* Tooltip */}
        {hoveredArea && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: mousePos.x + 14, top: mousePos.y + 14 }}
          >
            <div className="bg-surface border border-border rounded-lg shadow-xl px-3 py-2 max-w-xs">
              <div className="text-xs font-semibold text-text flex items-center gap-1.5">
                {hoveredArea.name}
                {hoveredArea.dungeonLevel && (
                  <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-bold uppercase tracking-wider bg-red-900/60 text-red-300 border border-red-500/30">
                    <Skull className="h-2 w-2" />Lvl {hoveredArea.dungeonLevel}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-text-muted">{hoveredArea.region}</div>
              {hoveredArea.encounters && hoveredArea.encounters.length > 0 && (
                <div className="text-[10px] text-red-300/80 mt-0.5">
                  {hoveredArea.encounters.slice(0, 5).join(', ')}{hoveredArea.encounters.length > 5 ? ` +${hoveredArea.encounters.length - 5} more` : ''}
                </div>
              )}
              {meta?.interiors?.[hoveredArea.id] && (
                <div className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
                  <DoorOpen className="h-2.5 w-2.5" />
                  {meta.interiors[hoveredArea.id].length} interior{meta.interiors[hoveredArea.id].length !== 1 ? 's' : ''} (click to view)
                </div>
              )}
              {(() => {
                const agg = areasWithPlayers.find(e => e.area.id === hoveredArea.id);
                return agg ? (
                  <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                    <Users className="h-2.5 w-2.5" />
                    {agg.names.join(', ')}
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
