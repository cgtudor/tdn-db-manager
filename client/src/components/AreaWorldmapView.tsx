import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ZoomIn, ZoomOut, Maximize2, Users } from 'lucide-react';
import { subscribePlayerStream } from '../api/live';
import type { AreaPopulation } from '../types';
import { apiGet } from '../api/client';

interface WorldmapArea {
  id: string;
  name: string;
  region: string;
  tag: string;
  areaType: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WorldmapMeta {
  width: number;
  height: number;
  tileUrl: string;
  areas: WorldmapArea[];
}

function getWorldmapMeta(): Promise<WorldmapMeta> {
  return apiGet('/api/live/analytics/worldmap-meta');
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
  const [fitted, setFitted] = useState(false);

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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart(pan);
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (dragging) {
      setPan({
        x: panStart.x + (e.clientX - dragStart.x),
        y: panStart.y + (e.clientY - dragStart.y),
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

  const isExterior = useCallback((area: WorldmapArea) => area.areaType === 'exterior', []);

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
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {!meta ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading worldmap...
          </div>
        ) : (
          <>
            {/* Area tiles - each is its own positioned image */}
            {visibleAreas.map(area => {
              const underground = !isExterior(area);
              return (
              <img
                key={area.id}
                src={`/api/live/analytics/worldmap-tiles/${area.id}`}
                alt=""
                draggable={false}
                loading="lazy"
                onMouseEnter={() => setHoveredArea(area)}
                onMouseLeave={() => setHoveredArea(null)}
                style={{
                  position: 'absolute',
                  left: pan.x + area.x * scale,
                  top: pan.y + area.y * scale,
                  width: area.w * scale,
                  height: area.h * scale,
                  imageRendering: scale > 1.5 ? 'pixelated' : 'auto',
                  userSelect: 'none',
                  opacity: underground ? 0.5 : 1,
                  outline: hoveredArea?.id === area.id ? '2px solid rgba(255,255,255,0.7)' : 'none',
                  zIndex: hoveredArea?.id === area.id ? 10 : underground ? 0 : 1,
                }}
              />
              );
            })}

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
