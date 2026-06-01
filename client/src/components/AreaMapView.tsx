import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import type { AreaGraphData, AreaGraphNode, AreaAnalytics } from '../api/live';
import {
  Maximize2, ZoomIn, ZoomOut, RotateCcw, Search, X, Palette,
} from 'lucide-react';

// Region colors (matching the map_generator palette)
const REGION_COLORS: Record<string, string> = {
  'Murann': '#4A90D9',
  'Murann Outskirts': '#6BA3E0',
  'Trademeet': '#50C878',
  'Dausann': '#B8860B',
  'Dorletta': '#DEB887',
  'Karnann': '#CD853F',
  'Tethir Road': '#DAA520',
  'The Wealdath': '#228B22',
  'Brost': '#CD853F',
  'Brost Lowlands': '#D2691E',
  'Bormton': '#8B4513',
  'Tarseth Coast': '#20B2AA',
  'Irphong Island': '#4682B4',
  'Ommlur Hills': '#9ACD32',
  'The Small Teeth': '#708090',
  'Shadow of the Small Teeth': '#5F6A6A',
  'The Oathlands': '#BDB76B',
  'Sangrue Foothills': '#6B8E23',
  'Lake Rossath': '#5F9EA0',
  'Goatherd Paths': '#BC8F8F',
  'Goldberry': '#FFD700',
  "Fool's Canyon": '#A0522D',
  'At Sea': '#1E90FF',
  'The Upperdark': '#483D8B',
  'The Forgotten Vale': '#2E8B57',
  'The Long Dark': '#2F2F2F',
  "Rowena's Bog": '#556B2F',
  'Caves/Dungeons': '#696969',
  'Interiors': '#A0522D',
  'Afterlife': '#9370DB',
  'Transit': '#778899',
  'Planar': '#9932CC',
  'OOC Areas': '#FF69B4',
  'System Areas': '#C0C0C0',
  'Event/Dream Areas': '#DA70D6',
  'Uncategorized': '#808080',
};

function heatHexColor(ratio: number): string {
  if (ratio > 0.8) return '#ef4444';   // red-500
  if (ratio > 0.6) return '#f97316';   // orange-500
  if (ratio > 0.4) return '#eab308';   // yellow-500
  if (ratio > 0.2) return '#22c55e';   // green-500
  if (ratio > 0.05) return '#10b981';  // emerald-500
  return '#6b7280';                     // gray-500
}

type ColorMode = 'heat' | 'region';
type TimeRange = 'today' | 'week' | 'month' | 'allTime';

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  node: AreaGraphNode | null;
  analytics: AreaAnalytics | null;
}

const cytoscapeStyles: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'label': '',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '8px',
      'text-margin-y': 5,
      'background-color': 'data(color)',
      'border-width': 2,
      'border-color': '#444',
      'width': 'data(size)',
      'height': 'data(size)',
      'text-outline-color': '#1a1a2e',
      'text-outline-width': 1,
      'text-max-width': '120px',
      'text-wrap': 'ellipsis',
      'color': '#fff',
    },
  },
  {
    selector: 'node[isDungeon]',
    style: {
      'shape': 'diamond',
      'border-color': '#8B0000',
      'border-width': 3,
    },
  },
  {
    selector: 'node[areaType = "interior"]',
    style: { 'shape': 'round-rectangle' },
  },
  {
    selector: 'node[areaType = "underground"]',
    style: { 'shape': 'hexagon' },
  },
  {
    selector: 'node[connections = 0]',
    style: { 'border-style': 'dashed', 'opacity': 0.5 },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#FFD700',
      'border-width': 4,
      'label': 'data(label)',
      'z-index': 9999,
    },
  },
  {
    selector: 'node.highlighted',
    style: {
      'border-color': '#00BFFF',
      'border-width': 3,
      'label': 'data(label)',
      'opacity': 1,
    },
  },
  {
    selector: 'node.dimmed',
    style: { 'opacity': 0.15 },
  },
  {
    selector: 'node.search-match',
    style: {
      'border-color': '#FFD700',
      'border-width': 3,
      'label': 'data(label)',
      'opacity': 1,
    },
  },
  {
    selector: 'node.hover-label',
    style: { 'label': 'data(label)' },
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#555',
      'target-arrow-color': '#555',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.7,
      'curve-style': 'bezier',
      'opacity': 0.5,
    },
  },
  {
    selector: 'edge.bidirectional',
    style: {
      'source-arrow-shape': 'triangle',
      'source-arrow-color': '#555',
    },
  },
  {
    selector: 'edge.highlighted',
    style: {
      'line-color': '#00BFFF',
      'target-arrow-color': '#00BFFF',
      'source-arrow-color': '#00BFFF',
      'width': 3,
      'opacity': 1,
      'z-index': 999,
    },
  },
  {
    selector: 'edge.dimmed',
    style: { 'opacity': 0.08 },
  },
  {
    selector: 'node.show-label',
    style: { 'label': 'data(label)' },
  },
];

interface AreaMapViewProps {
  graphData: AreaGraphData;
  analytics: AreaAnalytics[] | undefined;
  timeRange: TimeRange;
}

export function AreaMapView({ graphData, analytics, timeRange }: AreaMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('heat');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, node: null, analytics: null,
  });

  // Build a lookup from areaTag -> analytics
  const analyticsMap = useMemo(() => {
    const map = new Map<string, AreaAnalytics>();
    if (analytics) {
      for (const a of analytics) {
        map.set(a.areaTag, a);
      }
    }
    return map;
  }, [analytics]);

  const maxVisits = useMemo(() => {
    if (!analytics) return 1;
    return Math.max(...analytics.map(a => a[timeRange]), 1);
  }, [analytics, timeRange]);

  // Get node color based on mode
  const getNodeColor = useCallback((node: AreaGraphNode): string => {
    if (colorMode === 'region') {
      return REGION_COLORS[node.region] || '#808080';
    }
    // Heat mode - color by visit count
    const a = analyticsMap.get(node.tag);
    if (!a) return '#374151'; // gray-700 for untracked areas
    const val = a[timeRange];
    if (val === 0) return '#374151';
    return heatHexColor(val / maxVisits);
  }, [colorMode, analyticsMap, timeRange, maxVisits]);

  // Get node size based on visits or connections
  const getNodeSize = useCallback((node: AreaGraphNode): number => {
    if (colorMode === 'heat') {
      const a = analyticsMap.get(node.tag);
      if (!a) return 12;
      const val = a[timeRange];
      if (val === 0) return 10;
      const ratio = val / maxVisits;
      return Math.max(12, Math.min(40, 12 + ratio * 28));
    }
    return Math.max(12, Math.min(35, 12 + node.connections * 2.5));
  }, [colorMode, analyticsMap, timeRange, maxVisits]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const nodeElements = graphData.nodes.map(node => ({
      data: {
        id: node.id,
        label: node.name,
        region: node.region,
        areaType: node.areaType,
        connections: node.connections,
        isDungeon: node.isDungeon || undefined,
        color: getNodeColor(node),
        size: getNodeSize(node),
      },
      position: { x: node.x, y: -node.y },
    }));

    // Deduplicate edges
    const edgePairs = new Map<string, { forward: boolean; backward: boolean }>();
    for (const link of graphData.links) {
      const key = [link.source, link.target].sort().join('|');
      const isForward = link.source < link.target;
      if (!edgePairs.has(key)) edgePairs.set(key, { forward: false, backward: false });
      const pair = edgePairs.get(key)!;
      if (isForward) pair.forward = true;
      else pair.backward = true;
    }

    const seenEdges = new Set<string>();
    const edgeElements = graphData.links
      .filter(link => {
        const key = [link.source, link.target].sort().join('|');
        if (seenEdges.has(key)) return false;
        seenEdges.add(key);
        return true;
      })
      .map(link => {
        const key = [link.source, link.target].sort().join('|');
        const pair = edgePairs.get(key)!;
        const bidir = pair.forward && pair.backward;
        return {
          data: {
            id: `${link.source}-${link.target}`,
            source: link.source,
            target: link.target,
          },
          classes: bidir ? 'bidirectional' : '',
        };
      });

    if (cyRef.current) cyRef.current.destroy();

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [...nodeElements, ...edgeElements],
      style: cytoscapeStyles,
      layout: { name: 'preset' },
      minZoom: 0.05,
      maxZoom: 5,
      wheelSensitivity: 0.8,
    });

    const cy = cyRef.current;

    // Click node -> select & highlight neighbors
    cy.on('tap', 'node', (event: EventObject) => {
      const nodeId = event.target.id();
      setSelectedNode(nodeId);

      cy.elements().removeClass('highlighted dimmed');
      const neighbors = event.target.neighborhood();
      cy.nodes().addClass('dimmed');
      cy.edges().addClass('dimmed');
      event.target.removeClass('dimmed');
      neighbors.removeClass('dimmed');
      event.target.connectedEdges().addClass('highlighted');
      neighbors.nodes().addClass('highlighted');
    });

    // Click background -> deselect
    cy.on('tap', (event: EventObject) => {
      if (event.target === cy) {
        setSelectedNode(null);
        cy.elements().removeClass('highlighted dimmed');
        setTooltip(t => ({ ...t, visible: false }));
      }
    });

    // Hover -> tooltip
    cy.on('mouseover', 'node', (event: EventObject) => {
      event.target.addClass('hover-label');
      const nodeId = event.target.id();
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (node) {
        const renderedPos = event.target.renderedPosition();
        const rect = containerRef.current!.getBoundingClientRect();
        setTooltip({
          visible: true,
          x: renderedPos.x + rect.left,
          y: renderedPos.y + rect.top,
          node,
          analytics: analyticsMap.get(node.tag) || null,
        });
      }
    });

    cy.on('mouseout', 'node', (event: EventObject) => {
      event.target.removeClass('hover-label');
      setTooltip(t => ({ ...t, visible: false }));
    });

    // Zoom-based label visibility
    cy.on('zoom', () => {
      const zoom = cy.zoom();
      const fontSize = Math.max(4, Math.min(12, 8 / zoom));
      cy.style().selector('node').style('font-size', `${fontSize}px`).update();
      if (zoom > 2) {
        cy.nodes().addClass('show-label');
      } else {
        cy.nodes().removeClass('show-label');
      }
    });

    cy.fit(undefined, 50);

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [graphData]); // Only rebuild on graph data change

  // Update colors when mode/timeRange/analytics change (without rebuilding the whole graph)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graphData) return;

    cy.batch(() => {
      for (const node of graphData.nodes) {
        const cyNode = cy.getElementById(node.id);
        if (cyNode.length > 0) {
          cyNode.data('color', getNodeColor(node));
          cyNode.data('size', getNodeSize(node));
        }
      }
    });
  }, [colorMode, timeRange, analyticsMap, maxVisits, getNodeColor, getNodeSize, graphData]);

  // Search highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().removeClass('search-match');
    if (!searchQuery.trim()) return;

    const q = searchQuery.toLowerCase();
    cy.nodes().forEach(node => {
      const label = (node.data('label') || '').toLowerCase();
      const id = node.id().toLowerCase();
      const region = (node.data('region') || '').toLowerCase();
      if (label.includes(q) || id.includes(q) || region.includes(q)) {
        node.addClass('search-match');
      }
    });
  }, [searchQuery]);

  const fitToView = useCallback(() => {
    cyRef.current?.animate({ fit: { eles: cyRef.current.nodes(), padding: 50 }, duration: 300 });
  }, []);

  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.animate({ zoom: { level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 200 });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.animate({ zoom: { level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 200 });
  }, []);

  const resetLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !graphData) return;
    cy.nodes().forEach(node => {
      const orig = graphData.nodes.find(n => n.id === node.id());
      if (orig) {
        node.animate({ position: { x: orig.x, y: -orig.y }, duration: 300 });
      }
    });
    setTimeout(() => cy.fit(undefined, 50), 350);
  }, [graphData]);

  const focusSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    const cy = cyRef.current;
    if (!cy) return;
    const matches = cy.nodes('.search-match');
    if (matches.length > 0) {
      cy.animate({ fit: { eles: matches, padding: 80 }, duration: 300 });
    }
  }, [searchQuery]);

  // Selected node details
  const selectedNodeData = useMemo(() => {
    if (!selectedNode || !graphData) return null;
    const node = graphData.nodes.find(n => n.id === selectedNode);
    if (!node) return null;
    const a = analyticsMap.get(node.tag);
    const connections = graphData.links
      .filter(l => l.source === selectedNode || l.target === selectedNode)
      .map(l => {
        const targetId = l.source === selectedNode ? l.target : l.source;
        const targetNode = graphData.nodes.find(n => n.id === targetId);
        return { id: targetId, name: targetNode?.name || targetId, direction: l.direction };
      });
    // Deduplicate connections
    const seen = new Set<string>();
    const unique = connections.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return { node, analytics: a, connections: unique };
  }, [selectedNode, graphData, analyticsMap]);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden" style={{ height: 'calc(100vh - 340px)', minHeight: '500px' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-dim">
        <div className="flex items-center gap-1.5">
          <button onClick={fitToView} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Fit to view">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={zoomIn} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button onClick={zoomOut} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button onClick={resetLayout} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Reset positions">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => setColorMode(m => m === 'heat' ? 'region' : 'heat')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              colorMode === 'region' ? 'bg-indigo-500/20 text-indigo-300' : 'text-text-muted hover:text-text'
            }`}
            title={colorMode === 'heat' ? 'Switch to region colors' : 'Switch to heatmap colors'}
          >
            <Palette className="h-3 w-3" />
            {colorMode === 'heat' ? 'Heat' : 'Region'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted" />
            <input
              type="text"
              placeholder="Search areas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && focusSearch()}
              className="pl-6 pr-6 py-1 text-xs rounded border border-border bg-surface text-text w-48 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-[10px] text-text-muted tabular-nums">
            {graphData.stats.totalAreas} areas / {graphData.stats.totalLinks} links
          </span>
        </div>
      </div>

      {/* Graph + optional details panel */}
      <div className="flex h-[calc(100%-36px)]">
        {/* Cytoscape canvas */}
        <div ref={containerRef} className="flex-1" />

        {/* Details sidebar (shown when node selected) */}
        {selectedNodeData && (
          <div className="w-64 border-l border-border bg-surface-dim overflow-y-auto p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-text truncate pr-2">{selectedNodeData.node.name}</h4>
              <button
                onClick={() => {
                  setSelectedNode(null);
                  cyRef.current?.elements().removeClass('highlighted dimmed');
                }}
                className="text-text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between">
                <span className="text-text-muted">ResRef</span>
                <span className="font-mono text-text">{selectedNodeData.node.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Region</span>
                <span className="text-text">{selectedNodeData.node.region}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Type</span>
                <span className="text-text">{selectedNodeData.node.areaType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Size</span>
                <span className="text-text">{selectedNodeData.node.width}x{selectedNodeData.node.height}</span>
              </div>
            </div>

            {selectedNodeData.analytics && (
              <div className="border-t border-border pt-2 mb-3">
                <h5 className="font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Visits</h5>
                <div className="space-y-1">
                  {(['today', 'week', 'month', 'allTime'] as const).map(t => (
                    <div key={t} className="flex justify-between">
                      <span className="text-text-muted">
                        {t === 'allTime' ? 'All Time' : t === 'today' ? 'Today' : t === 'week' ? '7 Days' : '30 Days'}
                      </span>
                      <span className={`tabular-nums ${t === timeRange ? 'text-primary font-semibold' : 'text-text'}`}>
                        {selectedNodeData.analytics![t].toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-2">
              <h5 className="font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                Connections ({selectedNodeData.connections.length})
              </h5>
              {selectedNodeData.connections.length === 0 ? (
                <p className="text-text-muted italic">No connections (orphan)</p>
              ) : (
                <ul className="space-y-0.5">
                  {selectedNodeData.connections.map(c => (
                    <li key={c.id} className="flex items-start gap-1">
                      <span className="text-text-muted shrink-0">{c.direction === 'interior' ? 'int' : c.direction.charAt(0).toUpperCase()}</span>
                      <button
                        onClick={() => {
                          const cy = cyRef.current;
                          if (cy) {
                            const n = cy.getElementById(c.id);
                            if (n.length > 0) {
                              cy.animate({ center: { eles: n }, zoom: 1.5, duration: 300 });
                            }
                          }
                        }}
                        className="text-left text-primary hover:underline truncate"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating tooltip */}
      {tooltip.visible && tooltip.node && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltip.x + 15, top: tooltip.y - 10 }}
        >
          <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl max-w-xs">
            <div className="font-semibold mb-0.5">{tooltip.node.name}</div>
            <div className="text-gray-400 font-mono text-[10px] mb-1">{tooltip.node.id}</div>
            <div className="flex gap-3 text-[10px]">
              <span className="text-gray-400">{tooltip.node.region}</span>
              <span className="text-gray-400">{tooltip.node.areaType}</span>
              <span className="text-gray-400">{tooltip.node.connections} links</span>
            </div>
            {tooltip.analytics && (
              <div className="flex gap-3 mt-1 text-[10px] border-t border-gray-700 pt-1">
                <span>Today: <strong>{tooltip.analytics.today}</strong></span>
                <span>7d: <strong>{tooltip.analytics.week}</strong></span>
                <span>30d: <strong>{tooltip.analytics.month}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend (heat mode) */}
      {colorMode === 'heat' && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-surface/90 backdrop-blur-sm border border-border rounded px-2 py-1">
          <span className="text-[10px] text-text-muted">Visits:</span>
          {[
            { color: '#374151', label: 'None' },
            { color: '#10b981', label: 'Low' },
            { color: '#22c55e', label: 'Med' },
            { color: '#eab308', label: 'High' },
            { color: '#f97316', label: 'V.High' },
            { color: '#ef4444', label: 'Hot' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-0.5">
              <div className="w-3 h-2 rounded" style={{ backgroundColor: color }} />
              <span className="text-[9px] text-text-muted">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
