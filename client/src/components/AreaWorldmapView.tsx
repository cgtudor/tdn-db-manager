import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ZoomIn, ZoomOut, Maximize2, Users, DoorOpen, X } from 'lucide-react';
import { subscribePlayerStream } from '../api/live';
import type { AreaPopulation } from '../types';
import { apiGet } from '../api/client';

interface WorldmapArea {
  id: string;
  name: string;
  region: string;
  tag: string;
  isInterior: boolean;
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
            return (
              <div
                key={interior.id}
                className="group relative rounded overflow-hidden border border-white/5 bg-black/30 hover:border-amber-400/40 transition-colors"
              >
                <img
                  src={`/api/live/analytics/worldmap-tiles/${interior.id}?v=3`}
                  alt=""
                  draggable={false}
                  className="w-full aspect-square object-contain bg-black/50"
                  style={{ imageRendering: 'pixelated' }}
                />
                {pop && (
                  <div
                    className="absolute top-1 right-1"
                    title={pop.players.map(p => p.name).join(', ')}
                  >
                    <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[7px] font-bold shadow-sm shadow-emerald-500/50 animate-pulse">
                      {pop.playerCount}
                    </div>
                  </div>
                )}
                <div className="px-1.5 py-1">
                  <div className="text-[10px] text-text-muted truncate group-hover:text-text transition-colors" title={interior.name}>
                    {interior.name.includes(' - ') ? interior.name.split(' - ').pop() : interior.name.split(': ').pop()}
                  </div>
                </div>
              </div>
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
  const [showUnderground, setShowUnderground] = useState(false);
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

  const isExterior = useCallback((area: WorldmapArea) => !area.isInterior, []);

  // Visible areas based on underground toggle
  const visibleAreas = useMemo(() => {
    if (!meta) return [];
    return showUnderground ? meta.areas : meta.areas.filter(isExterior);
  }, [meta, showUnderground, isExterior]);

  // Areas with players
  const areasWithPlayers = useMemo(() => {
    if (!meta || !showPlayers) return [];
    return meta.areas
      .map(area => ({ area, pop: playersByTag.get(area.tag) }))
      .filter((e): e is { area: WorldmapArea; pop: AreaPopulation } => !!e.pop);
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
    <div className="rounded-lg border border-border bg-surface overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
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
          onClick={() => setShowUnderground(!showUnderground)}
          className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
            showUnderground ? 'bg-purple-500/20 text-purple-400' : 'text-text-muted hover:text-text'
          }`}
          title="Toggle underground/interior areas"
        >
          {showUnderground ? 'Hide' : 'Show'} Underground
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
              const underground = !isExterior(area);
              const hasInteriors = !!meta.interiors?.[area.id];
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
                  opacity: underground ? 0.5 : 1,
                  outline: hoveredArea?.id === area.id ? '2px solid rgba(255,255,255,0.7)'
                    : interiorPopup?.area.id === area.id ? '2px solid rgba(245,180,60,0.8)' : 'none',
                  zIndex: hoveredArea?.id === area.id ? 10 : underground ? 0 : 1,
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
                  left: pan.x + (area.x + area.w) * scale - 6,
                  top: pan.y + area.y * scale - 6,
                  pointerEvents: 'none',
                  zIndex: 15,
                }}
              >
                <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-500/90 shadow-sm shadow-amber-500/40">
                  <DoorOpen className="h-2 w-2 text-white" />
                </div>
              </div>
            ))}

            {/* Player indicators */}
            {areasWithPlayers.map(({ area, pop }) => (
              <div
                key={`player-${area.id}`}
                style={{
                  position: 'absolute',
                  left: pan.x + (area.x + area.w / 2) * scale - 8,
                  top: pan.y + (area.y + area.h / 2) * scale - 8,
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              >
                <div className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[8px] font-bold shadow-lg shadow-emerald-500/50 animate-pulse">
                  {pop.playerCount}
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
              <div className="text-xs font-semibold text-text">{hoveredArea.name}</div>
              <div className="text-[10px] text-text-muted">{hoveredArea.region}</div>
              {meta?.interiors?.[hoveredArea.id] && (
                <div className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
                  <DoorOpen className="h-2.5 w-2.5" />
                  {meta.interiors[hoveredArea.id].length} interior{meta.interiors[hoveredArea.id].length !== 1 ? 's' : ''} (click to view)
                </div>
              )}
              {playersByTag.has(hoveredArea.tag) && (
                <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  {playersByTag.get(hoveredArea.tag)!.players.map(p => p.name).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
