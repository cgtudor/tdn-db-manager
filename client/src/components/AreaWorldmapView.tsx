import { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const WORLDMAP_URL = '/api/live/analytics/worldmap-image';

export function AreaWorldmapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(0.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const clampScale = (s: number) => Math.min(Math.max(s, 0.1), 4);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => clampScale(s * delta));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ ...pan });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: panStart.x + (e.clientX - dragStart.x),
      y: panStart.y + (e.clientY - dragStart.y),
    });
  }, [dragging, dragStart, panStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const fitToView = useCallback(() => {
    if (!containerRef.current || !imgRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const imgW = imgRef.current.naturalWidth;
    const imgH = imgRef.current.naturalHeight;
    if (!imgW || !imgH) return;
    const fitScale = Math.min(container.width / imgW, container.height / imgH) * 0.95;
    setScale(clampScale(fitScale));
    setPan({
      x: (container.width - imgW * fitScale) / 2,
      y: (container.height - imgH * fitScale) / 2,
    });
  }, []);

  useEffect(() => {
    if (imgLoaded) fitToView();
  }, [imgLoaded, fitToView]);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-dim">
        <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Worldmap</span>
        <div className="flex-1" />
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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {imgError ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Worldmap image not available. Run <code className="mx-1 px-1 py-0.5 bg-surface-dim rounded text-xs">stitch_worldmap.py</code> to generate it.
          </div>
        ) : (
          <img
            ref={imgRef}
            src={WORLDMAP_URL}
            alt="TDN Worldmap"
            draggable={false}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            style={{
              position: 'absolute',
              left: pan.x,
              top: pan.y,
              width: imgRef.current ? imgRef.current.naturalWidth * scale : undefined,
              height: imgRef.current ? imgRef.current.naturalHeight * scale : undefined,
              imageRendering: scale > 1 ? 'pixelated' : 'auto',
              userSelect: 'none',
              opacity: imgLoaded ? 1 : 0,
            }}
          />
        )}
        {!imgLoaded && !imgError && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading worldmap...
          </div>
        )}
      </div>
    </div>
  );
}
