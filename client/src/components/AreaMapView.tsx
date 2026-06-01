import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import type { AreaGraphData, AreaGraphNode, AreaAnalytics } from '../api/live';
import {
  Maximize2, ZoomIn, ZoomOut, RotateCcw, Search, X, Palette,
  Filter, Layers, Waypoints, EyeOff, Eye, ChevronDown,
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

// Regions to hide by default (system/meta areas that clutter the map)
const HIDDEN_BY_DEFAULT = new Set([
  'OOC Areas', 'System Areas', 'Event/Dream Areas', 'Transit', 'Afterlife', 'Planar',
]);

function heatHexColor(ratio: number): string {
  if (ratio > 0.8) return '#ef4444';
  if (ratio > 0.6) return '#f97316';
  if (ratio > 0.4) return '#eab308';
  if (ratio > 0.2) return '#22c55e';
  if (ratio > 0.05) return '#10b981';
  return '#6b7280';
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
      'font-size': '7px',
      'text-margin-y': 4,
      'background-color': 'data(color)',
      'border-width': 2,
      'border-color': '#444',
      'width': 'data(size)',
      'height': 'data(size)',
      'text-outline-color': '#1a1a2e',
      'text-outline-width': 2,
      'text-max-width': '100px',
      'text-wrap': 'ellipsis',
      'color': '#eee',
    },
  },
  {
    selector: 'node[isDungeon]',
    style: { 'shape': 'diamond', 'border-color': '#8B0000', 'border-width': 3 },
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
    style: { 'border-style': 'dashed', 'opacity': 0.4 },
  },
  {
    selector: 'node:selected',
    style: { 'border-color': '#FFD700', 'border-width': 4, 'label': 'data(label)', 'z-index': 9999 },
  },
  {
    selector: 'node.highlighted',
    style: { 'border-color': '#00BFFF', 'border-width': 3, 'label': 'data(label)', 'opacity': 1 },
  },
  {
    selector: 'node.dimmed',
    style: { 'opacity': 0.1 },
  },
  {
    selector: 'node.search-match',
    style: { 'border-color': '#FFD700', 'border-width': 3, 'label': 'data(label)', 'opacity': 1 },
  },
  {
    selector: 'node.hover-label',
    style: { 'label': 'data(label)' },
  },
  {
    selector: 'node.show-label',
    style: { 'label': 'data(label)' },
  },
  {
    selector: 'edge',
    style: {
      'width': 1,
      'line-color': '#444',
      'target-arrow-color': '#444',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.6,
      'curve-style': 'bezier',
      'opacity': 0.35,
    },
  },
  {
    selector: 'edge.bidirectional',
    style: { 'source-arrow-shape': 'triangle', 'source-arrow-color': '#444' },
  },
  {
    selector: 'edge.highlighted',
    style: {
      'line-color': '#00BFFF', 'target-arrow-color': '#00BFFF', 'source-arrow-color': '#00BFFF',
      'width': 3, 'opacity': 1, 'z-index': 999,
    },
  },
  {
    selector: 'edge.dimmed',
    style: { 'opacity': 0.04 },
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
  const [showOrphans, setShowOrphans] = useState(false);
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(() => {
    const all = new Set(graphData.regions);
    for (const r of HIDDEN_BY_DEFAULT) all.delete(r);
    return all;
  });
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, node: null, analytics: null,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRegionDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const analyticsMap = useMemo(() => {
    const map = new Map<string, AreaAnalytics>();
    if (analytics) {
      for (const a of analytics) map.set(a.areaTag, a);
    }
    return map;
  }, [analytics]);

  const maxVisits = useMemo(() => {
    if (!analytics) return 1;
    return Math.max(...analytics.map(a => a[timeRange]), 1);
  }, [analytics, timeRange]);

  // Filter nodes based on region + orphan filters
  const filteredNodes = useMemo(() => {
    return graphData.nodes.filter(n => {
      if (!selectedRegions.has(n.region)) return false;
      if (!showOrphans && n.connections === 0) return false;
      return true;
    });
  }, [graphData.nodes, selectedRegions, showOrphans]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);

  const filteredLinks = useMemo(() => {
    return graphData.links.filter(l => filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target));
  }, [graphData.links, filteredNodeIds]);

  const getNodeColor = useCallback((node: AreaGraphNode): string => {
    if (colorMode === 'region') return REGION_COLORS[node.region] || '#808080';
    const a = analyticsMap.get(node.tag);
    if (!a) return '#374151';
    const val = a[timeRange];
    if (val === 0) return '#374151';
    return heatHexColor(val / maxVisits);
  }, [colorMode, analyticsMap, timeRange, maxVisits]);

  const getNodeSize = useCallback((node: AreaGraphNode): number => {
    if (colorMode === 'heat') {
      const a = analyticsMap.get(node.tag);
      if (!a) return 12;
      const val = a[timeRange];
      if (val === 0) return 10;
      return Math.max(12, Math.min(40, 12 + (val / maxVisits) * 28));
    }
    return Math.max(12, Math.min(35, 12 + node.connections * 2.5));
  }, [colorMode, analyticsMap, timeRange, maxVisits]);

  // Build Cytoscape when filtered data changes
  useEffect(() => {
    if (!containerRef.current) return;

    const nodeElements = filteredNodes.map(node => ({
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
    for (const link of filteredLinks) {
      const key = [link.source, link.target].sort().join('|');
      const isForward = link.source < link.target;
      if (!edgePairs.has(key)) edgePairs.set(key, { forward: false, backward: false });
      const pair = edgePairs.get(key)!;
      if (isForward) pair.forward = true;
      else pair.backward = true;
    }

    const seenEdges = new Set<string>();
    const edgeElements = filteredLinks
      .filter(link => {
        const key = [link.source, link.target].sort().join('|');
        if (seenEdges.has(key)) return false;
        seenEdges.add(key);
        return true;
      })
      .map(link => {
        const key = [link.source, link.target].sort().join('|');
        const pair = edgePairs.get(key)!;
        return {
          data: { id: `${link.source}-${link.target}`, source: link.source, target: link.target },
          classes: pair.forward && pair.backward ? 'bidirectional' : '',
        };
      });

    if (cyRef.current) cyRef.current.destroy();

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [...nodeElements, ...edgeElements],
      style: cytoscapeStyles,
      layout: { name: 'preset' },
      minZoom: 0.02,
      maxZoom: 6,
      wheelSensitivity: 0.6,
    });

    const cy = cyRef.current;

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

    cy.on('tap', (event: EventObject) => {
      if (event.target === cy) {
        setSelectedNode(null);
        cy.elements().removeClass('highlighted dimmed');
        setTooltip(t => ({ ...t, visible: false }));
      }
    });

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

    cy.on('zoom', () => {
      const zoom = cy.zoom();
      const fontSize = Math.max(4, Math.min(14, 7 / zoom));
      cy.style().selector('node').style('font-size', `${fontSize}px`).update();
      if (zoom > 3.5) {
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
  }, [filteredNodes, filteredLinks, graphData.nodes, analyticsMap]);

  // Update colors/sizes without rebuilding the graph
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      for (const node of filteredNodes) {
        const cyNode = cy.getElementById(node.id);
        if (cyNode.length > 0) {
          cyNode.data('color', getNodeColor(node));
          cyNode.data('size', getNodeSize(node));
        }
      }
    });
  }, [colorMode, timeRange, analyticsMap, maxVisits, getNodeColor, getNodeSize, filteredNodes]);

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
    const cy = cyRef.current;
    if (!cy) return;
    const visible = cy.nodes(':visible');
    if (visible.length > 0) cy.animate({ fit: { eles: visible, padding: 50 }, duration: 300 });
  }, []);

  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.animate({ zoom: { level: cy.zoom() * 1.4, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 200 });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.animate({ zoom: { level: cy.zoom() / 1.4, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 200 });
  }, []);

  const resetLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach(node => {
      const orig = graphData.nodes.find(n => n.id === node.id());
      if (orig) node.animate({ position: { x: orig.x, y: -orig.y }, duration: 300 });
    });
    setTimeout(() => cy.fit(undefined, 50), 350);
  }, [graphData]);

  // Cluster by region - spread regions into a grid so they don't overlap
  const clusterByRegion = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Group nodes by region and compute centroids
    const regionGroups = new Map<string, { nodes: cytoscape.NodeSingular[]; cx: number; cy: number }>();
    cy.nodes().forEach(node => {
      const region = node.data('region') as string;
      if (!regionGroups.has(region)) regionGroups.set(region, { nodes: [], cx: 0, cy: 0 });
      regionGroups.get(region)!.nodes.push(node);
    });

    // Sort regions by size (largest first get center positions)
    const sorted = [...regionGroups.entries()].sort((a, b) => b[1].nodes.length - a[1].nodes.length);

    // Arrange regions in a grid with generous spacing
    const cols = Math.ceil(Math.sqrt(sorted.length));
    const spacing = 1200;

    sorted.forEach(([_region, group], idx) => {
      const targetX = (idx % cols) * spacing;
      const targetY = Math.floor(idx / cols) * spacing;

      // Compute current centroid
      let sumX = 0, sumY = 0;
      for (const n of group.nodes) {
        const p = n.position();
        sumX += p.x;
        sumY += p.y;
      }
      const cx = sumX / group.nodes.length;
      const cy_ = sumY / group.nodes.length;

      // Shift all nodes by the offset
      const dx = targetX - cx;
      const dy = targetY - cy_;
      for (const n of group.nodes) {
        const p = n.position();
        n.animate({ position: { x: p.x + dx, y: p.y + dy }, duration: 400 });
      }
    });

    setTimeout(() => cy.fit(undefined, 60), 450);
  }, []);

  // Spread overlapping nodes apart
  const spreadNodes = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const nodes = cy.nodes();
    const minDist = 50;
    const positions = new Map<string, { x: number; y: number }>();
    nodes.forEach(n => {
      const p = n.position();
      positions.set(n.id(), { x: p.x, y: p.y });
    });

    for (let iter = 0; iter < 80; iter++) {
      let moved = false;
      nodes.forEach(n1 => {
        const p1 = positions.get(n1.id())!;
        nodes.forEach(n2 => {
          if (n1.id() >= n2.id()) return;
          const p2 = positions.get(n2.id())!;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) * 0.4;
            const px = (dx / dist) * push;
            const py = (dy / dist) * push;
            p1.x -= px; p1.y -= py;
            p2.x += px; p2.y += py;
            moved = true;
          } else if (dist === 0) {
            const angle = Math.random() * Math.PI * 2;
            p1.x -= Math.cos(angle) * 20;
            p1.y -= Math.sin(angle) * 20;
            moved = true;
          }
        });
      });
      if (!moved) break;
    }

    nodes.forEach(n => {
      const p = positions.get(n.id())!;
      n.animate({ position: p, duration: 300 });
    });
  }, []);

  const focusSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    const cy = cyRef.current;
    if (!cy) return;
    const matches = cy.nodes('.search-match');
    if (matches.length > 0) cy.animate({ fit: { eles: matches, padding: 80 }, duration: 300 });
  }, [searchQuery]);

  // Isolate a single region
  const isolateRegion = useCallback((region: string) => {
    setSelectedRegions(new Set([region]));
    setRegionDropdownOpen(false);
  }, []);

  const toggleRegion = useCallback((region: string) => {
    setSelectedRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  }, []);

  const selectAllRegions = useCallback(() => {
    setSelectedRegions(new Set(graphData.regions));
  }, [graphData.regions]);

  const selectGameplayRegions = useCallback(() => {
    const all = new Set(graphData.regions);
    for (const r of HIDDEN_BY_DEFAULT) all.delete(r);
    setSelectedRegions(all);
  }, [graphData.regions]);

  // Region counts
  const regionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of graphData.nodes) {
      counts.set(n.region, (counts.get(n.region) || 0) + 1);
    }
    return counts;
  }, [graphData.nodes]);

  // Selected node details
  const selectedNodeData = useMemo(() => {
    if (!selectedNode || !graphData) return null;
    const node = graphData.nodes.find(n => n.id === selectedNode);
    if (!node) return null;
    const a = analyticsMap.get(node.tag);
    const seen = new Set<string>();
    const connections = graphData.links
      .filter(l => l.source === selectedNode || l.target === selectedNode)
      .map(l => {
        const tid = l.source === selectedNode ? l.target : l.source;
        const tn = graphData.nodes.find(n => n.id === tid);
        return { id: tid, name: tn?.name || tid, direction: l.direction };
      })
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    return { node, analytics: a, connections };
  }, [selectedNode, graphData, analyticsMap]);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden relative" style={{ height: 'calc(100vh - 340px)', minHeight: '500px' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-dim gap-2">
        <div className="flex items-center gap-1">
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

          <div className="w-px h-4 bg-border mx-0.5" />

          <button onClick={clusterByRegion} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-text-muted hover:text-text hover:bg-surface-hover" title="Separate regions into clusters">
            <Layers className="h-3 w-3" />Cluster
          </button>
          <button onClick={spreadNodes} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-text-muted hover:text-text hover:bg-surface-hover" title="Push overlapping nodes apart">
            <Waypoints className="h-3 w-3" />Spread
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

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

          <button
            onClick={() => setShowOrphans(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              showOrphans ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text'
            }`}
            title={showOrphans ? 'Hide disconnected areas' : 'Show disconnected areas'}
          >
            {showOrphans ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Orphans
          </button>

          {/* Region filter dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setRegionDropdownOpen(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                selectedRegions.size < graphData.regions.length ? 'bg-indigo-500/20 text-indigo-300' : 'text-text-muted hover:text-text'
              }`}
            >
              <Filter className="h-3 w-3" />
              Regions ({selectedRegions.size}/{graphData.regions.length})
              <ChevronDown className="h-3 w-3" />
            </button>

            {regionDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-border rounded-lg shadow-xl w-72 max-h-80 overflow-y-auto">
                <div className="sticky top-0 bg-surface border-b border-border px-3 py-2 flex gap-1">
                  <button onClick={selectAllRegions} className="px-2 py-0.5 text-[10px] rounded bg-surface-dim text-text-muted hover:text-text">All</button>
                  <button onClick={selectGameplayRegions} className="px-2 py-0.5 text-[10px] rounded bg-surface-dim text-text-muted hover:text-text">Gameplay</button>
                  <button onClick={() => setSelectedRegions(new Set())} className="px-2 py-0.5 text-[10px] rounded bg-surface-dim text-text-muted hover:text-text">None</button>
                </div>
                <div className="p-1">
                  {graphData.regions
                    .slice()
                    .sort((a, b) => (regionCounts.get(b) || 0) - (regionCounts.get(a) || 0))
                    .map(region => (
                      <div key={region} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-hover group">
                        <input
                          type="checkbox"
                          checked={selectedRegions.has(region)}
                          onChange={() => toggleRegion(region)}
                          className="rounded border-border"
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: REGION_COLORS[region] || '#808080' }}
                        />
                        <span className="text-xs text-text flex-1 truncate">{region}</span>
                        <span className="text-[10px] text-text-muted tabular-nums">{regionCounts.get(region) || 0}</span>
                        <button
                          onClick={() => isolateRegion(region)}
                          className="text-[10px] text-text-muted hover:text-primary opacity-0 group-hover:opacity-100 px-1"
                          title="Show only this region"
                        >
                          solo
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
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
              className="pl-6 pr-6 py-1 text-xs rounded border border-border bg-surface text-text w-44 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-[10px] text-text-muted tabular-nums whitespace-nowrap">
            {filteredNodes.length} / {graphData.stats.totalAreas}
          </span>
        </div>
      </div>

      {/* Graph + optional details panel */}
      <div className="flex h-[calc(100%-36px)]">
        <div ref={containerRef} className="flex-1" />

        {selectedNodeData && (
          <div className="w-64 border-l border-border bg-surface-dim overflow-y-auto p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-text truncate pr-2">{selectedNodeData.node.name}</h4>
              <button
                onClick={() => { setSelectedNode(null); cyRef.current?.elements().removeClass('highlighted dimmed'); }}
                className="text-text-muted hover:text-text shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between"><span className="text-text-muted">ResRef</span><span className="font-mono text-text">{selectedNodeData.node.id}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Region</span><span className="text-text">{selectedNodeData.node.region}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Type</span><span className="text-text">{selectedNodeData.node.areaType}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Size</span><span className="text-text">{selectedNodeData.node.width}x{selectedNodeData.node.height}</span></div>
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
                            if (n.length > 0) cy.animate({ center: { eles: n }, zoom: 1.5, duration: 300 });
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
        <div className="fixed z-50 pointer-events-none" style={{ left: tooltip.x + 15, top: tooltip.y - 10 }}>
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

      {/* Legend */}
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
