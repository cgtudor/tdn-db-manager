import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import type { AreaGraphData, AreaGraphNode, AreaAnalytics, AreaTransition } from '../api/live';
import { subscribePlayerStream } from '../api/live';
import type { AreaPopulation } from '../types';
import {
  Maximize2, ZoomIn, ZoomOut, RotateCcw, Search, X, Palette,
  Filter, Layers, Waypoints, EyeOff, Eye, ChevronDown, Route, Users,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────

const REGION_COLORS: Record<string, string> = {
  'Murann': '#4A90D9', 'Murann Outskirts': '#6BA3E0', 'Trademeet': '#50C878',
  'Dausann': '#B8860B', 'Dorletta': '#DEB887', 'Karnann': '#CD853F',
  'Tethir Road': '#DAA520', 'The Wealdath': '#228B22', 'Brost': '#CD853F',
  'Brost Lowlands': '#D2691E', 'Bormton': '#8B4513', 'Tarseth Coast': '#20B2AA',
  'Irphong Island': '#4682B4', 'Ommlur Hills': '#9ACD32',
  'The Small Teeth': '#708090', 'Shadow of the Small Teeth': '#5F6A6A',
  'The Oathlands': '#BDB76B', 'Sangrue Foothills': '#6B8E23',
  'Lake Rossath': '#5F9EA0', 'Goatherd Paths': '#BC8F8F',
  'Goldberry': '#FFD700', "Fool's Canyon": '#A0522D', 'At Sea': '#1E90FF',
  'The Upperdark': '#483D8B', 'The Forgotten Vale': '#2E8B57',
  'The Long Dark': '#2F2F2F', "Rowena's Bog": '#556B2F',
  'Caves/Dungeons': '#696969', 'Interiors': '#A0522D',
  'Afterlife': '#9370DB', 'Transit': '#778899', 'Planar': '#9932CC',
  'OOC Areas': '#FF69B4', 'System Areas': '#C0C0C0',
  'Event/Dream Areas': '#DA70D6', 'Uncategorized': '#808080',
};

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

// ─── BFS Pathfinding ────────────────────────────────────────

interface PathResult {
  nodes: string[];
  distance: number;
}

function findShortestPaths(
  links: { source: string; target: string }[],
  sourceId: string,
  targetId: string,
  maxPaths = 5,
  maxDepth = 20,
): PathResult[] {
  const adj = new Map<string, Set<string>>();
  for (const l of links) {
    if (!adj.has(l.source)) adj.set(l.source, new Set());
    if (!adj.has(l.target)) adj.set(l.target, new Set());
    adj.get(l.source)!.add(l.target);
    adj.get(l.target)!.add(l.source);
  }

  const results: PathResult[] = [];
  const queue: string[][] = [[sourceId]];
  const visited = new Map<string, number>();
  visited.set(sourceId, 0);

  while (queue.length > 0 && results.length < maxPaths) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (path.length > maxDepth) continue;

    if (current === targetId) {
      results.push({ nodes: path, distance: path.length - 1 });
      continue;
    }

    const neighbors = adj.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      const newDist = path.length;
      if (!visited.has(neighbor) || visited.get(neighbor)! >= newDist - 1) {
        if (!path.includes(neighbor)) {
          visited.set(neighbor, Math.min(visited.get(neighbor) ?? Infinity, newDist));
          queue.push([...path, neighbor]);
        }
      }
    }
  }

  results.sort((a, b) => a.distance - b.distance);
  return results;
}

// ─── Cytoscape Styles ───────────────────────────────────────

const cytoscapeStyles: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'label': '', 'text-valign': 'bottom', 'text-halign': 'center',
      'font-size': '7px', 'text-margin-y': 4,
      'background-color': 'data(color)', 'border-width': 2, 'border-color': '#444',
      'width': 'data(size)', 'height': 'data(size)',
      'text-outline-color': '#1a1a2e', 'text-outline-width': 2,
      'text-max-width': '100px', 'text-wrap': 'ellipsis', 'color': '#eee',
    },
  },
  { selector: 'node[isDungeon]', style: { 'shape': 'diamond', 'border-color': '#8B0000', 'border-width': 3 } },
  { selector: 'node[areaType = "interior"]', style: { 'shape': 'round-rectangle' } },
  { selector: 'node[areaType = "underground"]', style: { 'shape': 'hexagon' } },
  { selector: 'node[connections = 0]', style: { 'border-style': 'dashed', 'opacity': 0.4 } },
  { selector: 'node:selected', style: { 'border-color': '#FFD700', 'border-width': 4, 'label': 'data(label)', 'z-index': 9999 } },
  { selector: 'node.highlighted', style: { 'border-color': '#00BFFF', 'border-width': 3, 'label': 'data(label)', 'opacity': 1 } },
  { selector: 'node.dimmed', style: { 'opacity': 0.1 } },
  { selector: 'node.search-match', style: { 'border-color': '#FFD700', 'border-width': 3, 'label': 'data(label)', 'opacity': 1 } },
  { selector: 'node.hover-label', style: { 'label': 'data(label)' } },
  { selector: 'node.show-label', style: { 'label': 'data(label)' } },
  // Nodes with collapsed interiors: show label and slightly larger
  { selector: 'node[interiorCount > 0]', style: { 'label': 'data(label)', 'border-width': 3, 'border-color': '#6366f1' } },
  // Player indicator: green glow ring
  { selector: 'node.has-players', style: { 'border-color': '#22c55e', 'border-width': 4, 'label': 'data(label)' } },
  // Path styles
  { selector: 'node.path-node', style: { 'border-color': '#a855f7', 'border-width': 4, 'label': 'data(label)', 'opacity': 1, 'z-index': 9999 } },
  { selector: 'node.path-source', style: { 'background-color': '#22c55e', 'border-color': '#15803d' } },
  { selector: 'node.path-target', style: { 'background-color': '#ef4444', 'border-color': '#991b1b' } },
  // Edges
  {
    selector: 'edge',
    style: {
      'width': 'data(weight)', 'line-color': '#444', 'target-arrow-color': '#444',
      'target-arrow-shape': 'triangle', 'arrow-scale': 0.6,
      'curve-style': 'bezier', 'opacity': 0.35,
    },
  },
  { selector: 'edge.bidirectional', style: { 'source-arrow-shape': 'triangle', 'source-arrow-color': '#444' } },
  { selector: 'edge.highlighted', style: { 'line-color': '#00BFFF', 'target-arrow-color': '#00BFFF', 'source-arrow-color': '#00BFFF', 'width': 3, 'opacity': 1, 'z-index': 999 } },
  { selector: 'edge.path-edge', style: { 'line-color': '#a855f7', 'target-arrow-color': '#a855f7', 'source-arrow-color': '#a855f7', 'width': 4, 'opacity': 1, 'z-index': 9999 } },
  { selector: 'edge.dimmed', style: { 'opacity': 0.04 } },
  // Traffic flow: high-traffic edges get a distinct color
  { selector: 'edge.traffic-high', style: { 'line-color': '#f97316', 'target-arrow-color': '#f97316', 'source-arrow-color': '#f97316' } },
];

// ─── Component ──────────────────────────────────────────────

interface AreaMapViewProps {
  graphData: AreaGraphData;
  analytics: AreaAnalytics[] | undefined;
  transitions: AreaTransition[] | undefined;
  timeRange: TimeRange;
}

export function AreaMapView({ graphData, analytics, transitions, timeRange }: AreaMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const cyRef = useRef<Core | null>(null);

  // UI state
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

  // Collapsible interiors - which exterior nodes have interiors expanded
  const [expandedExteriors, setExpandedExteriors] = useState<Set<string>>(new Set());
  const [collapseInteriors, setCollapseInteriors] = useState(true);

  // Path finding state
  const [pathMode, setPathMode] = useState(false);
  const [pathSource, setPathSource] = useState<string | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [pathResults, setPathResults] = useState<PathResult[]>([]);

  // Live players
  const [liveAreas, setLiveAreas] = useState<AreaPopulation[]>([]);
  const [showPlayers, setShowPlayers] = useState(true);

  // Tooltip
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; node: AreaGraphNode | null; analytics: AreaAnalytics | null }>({
    visible: false, x: 0, y: 0, node: null, analytics: null,
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setRegionDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Subscribe to live player stream
  useEffect(() => {
    const unsub = subscribePlayerStream((data) => {
      setLiveAreas(data.areas);
    });
    return unsub;
  }, []);

  // ─── Derived data ───────────────────────────────────────────

  const analyticsMap = useMemo(() => {
    const map = new Map<string, AreaAnalytics>();
    if (analytics) for (const a of analytics) map.set(a.areaTag, a);
    return map;
  }, [analytics]);

  const maxVisits = useMemo(() => {
    if (!analytics) return 1;
    return Math.max(...analytics.map(a => a[timeRange]), 1);
  }, [analytics, timeRange]);

  // Build transition weight map (edgeKey -> count)
  const transitionMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!transitions) return map;
    for (const t of transitions) {
      // Combine both directions
      const key = [t.from, t.to].sort().join('|');
      map.set(key, (map.get(key) || 0) + t.count);
    }
    return map;
  }, [transitions]);

  const maxTransitions = useMemo(() => {
    if (transitionMap.size === 0) return 1;
    return Math.max(...transitionMap.values(), 1);
  }, [transitionMap]);

  // Build tag->nodeId lookup (area tags to graph node IDs)
  const tagToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of graphData.nodes) map.set(n.tag, n.id);
    return map;
  }, [graphData.nodes]);

  // Live player areas mapped to node IDs
  const playerNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const area of liveAreas) {
      if (area.playerCount > 0) {
        const nodeId = tagToNodeId.get(area.areaTag);
        if (nodeId) set.add(nodeId);
      }
    }
    return set;
  }, [liveAreas, tagToNodeId]);

  const playerAreaMap = useMemo(() => {
    const map = new Map<string, AreaPopulation>();
    for (const area of liveAreas) {
      const nodeId = tagToNodeId.get(area.areaTag);
      if (nodeId) map.set(nodeId, area);
    }
    return map;
  }, [liveAreas, tagToNodeId]);

  // Filtered nodes (with interior collapse logic)
  const filteredNodes = useMemo(() => {
    return graphData.nodes.filter(n => {
      if (!selectedRegions.has(n.region)) return false;
      if (!showOrphans && n.connections === 0) return false;

      // Collapse interiors: hide interior nodes unless their parent is expanded
      if (collapseInteriors && n.parentExterior) {
        if (!expandedExteriors.has(n.parentExterior)) return false;
      }

      return true;
    });
  }, [graphData.nodes, selectedRegions, showOrphans, collapseInteriors, expandedExteriors]);

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

  // ─── Build Cytoscape ─────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    // Count collapsed interiors per exterior for badge display
    const collapsedCounts = new Map<string, number>();
    if (collapseInteriors) {
      for (const n of graphData.nodes) {
        if (n.parentExterior && !expandedExteriors.has(n.parentExterior) && selectedRegions.has(n.region)) {
          collapsedCounts.set(n.parentExterior, (collapsedCounts.get(n.parentExterior) || 0) + 1);
        }
      }
    }

    const nodeElements = filteredNodes.map(node => {
      const hiddenCount = collapsedCounts.get(node.id) || 0;
      const label = hiddenCount > 0 ? `${node.name} [+${hiddenCount}]` : node.name;
      return {
        data: {
          id: node.id, label, region: node.region,
          areaType: node.areaType, connections: node.connections,
          isDungeon: node.isDungeon || undefined,
          interiorCount: hiddenCount,
          color: getNodeColor(node),
          size: hiddenCount > 0 ? Math.max(getNodeSize(node), 18 + hiddenCount * 0.5) : getNodeSize(node),
        },
        position: { x: node.x, y: -node.y },
      };
    });

    // Deduplicate edges and compute weights
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
        const trafficCount = transitionMap.get(key) || 0;
        const trafficRatio = trafficCount / maxTransitions;
        const weight = Math.max(1, 1 + trafficRatio * 4);
        const classes = [
          pair.forward && pair.backward ? 'bidirectional' : '',
          trafficRatio > 0.3 ? 'traffic-high' : '',
        ].filter(Boolean).join(' ');
        return {
          data: { id: `${link.source}-${link.target}`, source: link.source, target: link.target, weight },
          classes,
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
      wheelSensitivity: 1.5,
    });

    const cy = cyRef.current;

    // Node click
    cy.on('tap', 'node', (event: EventObject) => {
      const nodeId = event.target.id();

      if (pathMode) {
        if (!pathSource) {
          setPathSource(nodeId);
        } else if (nodeId !== pathSource) {
          setPathTarget(nodeId);
          const paths = findShortestPaths(filteredLinks, pathSource, nodeId);
          setPathResults(paths);
        }
        return;
      }

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

    // Double-click to expand/collapse interiors
    cy.on('dbltap', 'node', (event: EventObject) => {
      const nodeId = event.target.id();
      const interiors = event.target.data('interiorCount') || 0;
      if (interiors > 0 && collapseInteriors) {
        setExpandedExteriors(prev => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
      }
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
      if (zoom > 3.5) cy.nodes().addClass('show-label');
      else cy.nodes().removeClass('show-label');
      drawMinimap();
    });

    cy.on('pan', drawMinimap);

    cy.fit(undefined, 50);
    setTimeout(drawMinimap, 100);

    return () => {
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
    };
  }, [filteredNodes, filteredLinks, graphData.nodes, analyticsMap, transitionMap, maxTransitions]);

  // Update colors without rebuilding
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

  // Update live player indicators
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('has-players');
    if (!showPlayers) return;
    for (const nodeId of playerNodeIds) {
      cy.getElementById(nodeId).addClass('has-players');
    }
  }, [playerNodeIds, showPlayers]);

  // Path highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('path-node path-source path-target path-edge');

    if (!pathMode || pathResults.length === 0) return;

    const pathNodeIds = new Set<string>();
    const pathEdgeKeys = new Set<string>();
    for (const path of pathResults) {
      for (const n of path.nodes) pathNodeIds.add(n);
      for (let i = 0; i < path.nodes.length - 1; i++) {
        pathEdgeKeys.add(`${path.nodes[i]}-${path.nodes[i + 1]}`);
        pathEdgeKeys.add(`${path.nodes[i + 1]}-${path.nodes[i]}`);
      }
    }

    cy.nodes().forEach(n => { if (pathNodeIds.has(n.id())) n.addClass('path-node'); else n.addClass('dimmed'); });
    cy.edges().forEach(e => { if (pathEdgeKeys.has(e.id())) e.addClass('path-edge'); else e.addClass('dimmed'); });

    if (pathSource) cy.getElementById(pathSource).addClass('path-source');
    if (pathTarget) cy.getElementById(pathTarget).addClass('path-target');
  }, [pathMode, pathResults, pathSource, pathTarget]);

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
      if (label.includes(q) || id.includes(q) || region.includes(q)) node.addClass('search-match');
    });
  }, [searchQuery]);

  // ─── Minimap ──────────────────────────────────────────────────

  const drawMinimap = useCallback(() => {
    const cy = cyRef.current;
    const canvas = minimapRef.current;
    if (!cy || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    // Get bounds of all nodes
    const bb = cy.elements().boundingBox();
    if (bb.w === 0 || bb.h === 0) return;

    const pad = 10;
    const scaleX = (w - 2 * pad) / bb.w;
    const scaleY = (h - 2 * pad) / bb.h;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = pad + ((w - 2 * pad) - bb.w * scale) / 2;
    const offsetY = pad + ((h - 2 * pad) - bb.h * scale) / 2;

    const mapX = (x: number) => offsetX + (x - bb.x1) * scale;
    const mapY = (y: number) => offsetY + (y - bb.y1) * scale;

    // Draw edges (very faint)
    ctx.strokeStyle = 'rgba(100,100,100,0.15)';
    ctx.lineWidth = 0.5;
    cy.edges().forEach(e => {
      const sp = e.source().position();
      const tp = e.target().position();
      ctx.beginPath();
      ctx.moveTo(mapX(sp.x), mapY(sp.y));
      ctx.lineTo(mapX(tp.x), mapY(tp.y));
      ctx.stroke();
    });

    // Draw nodes as dots
    cy.nodes().forEach(node => {
      const pos = node.position();
      const x = mapX(pos.x);
      const y = mapY(pos.y);
      const color = node.data('color') || '#666';
      const hasPlayers = node.hasClass('has-players');

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, hasPlayers ? 3 : 1.5, 0, Math.PI * 2);
      ctx.fill();

      if (hasPlayers) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // Draw viewport rectangle
    const ext = cy.extent();
    const vx1 = mapX(ext.x1);
    const vy1 = mapY(ext.y1);
    const vx2 = mapX(ext.x2);
    const vy2 = mapY(ext.y2);

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx1, vy1, vx2 - vx1, vy2 - vy1);
  }, []);

  // ─── Toolbar Actions ──────────────────────────────────────────

  const fitToView = useCallback(() => {
    const cy = cyRef.current;
    if (cy) { cy.animate({ fit: { eles: cy.nodes(), padding: 50 }, duration: 300 }); setTimeout(drawMinimap, 350); }
  }, [drawMinimap]);

  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.animate({ zoom: { level: cy.zoom() * 1.5, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 200 });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.animate({ zoom: { level: cy.zoom() / 1.5, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 200 });
  }, []);

  const resetLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach(node => {
      const orig = graphData.nodes.find(n => n.id === node.id());
      if (orig) node.animate({ position: { x: orig.x, y: -orig.y }, duration: 300 });
    });
    setTimeout(() => { cy.fit(undefined, 50); drawMinimap(); }, 350);
  }, [graphData, drawMinimap]);

  const spreadNodes = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.nodes();
    const minDist = 50;
    const positions = new Map<string, { x: number; y: number }>();
    nodes.forEach(n => { const p = n.position(); positions.set(n.id(), { x: p.x, y: p.y }); });

    for (let iter = 0; iter < 80; iter++) {
      let moved = false;
      nodes.forEach(n1 => {
        const p1 = positions.get(n1.id())!;
        nodes.forEach(n2 => {
          if (n1.id() >= n2.id()) return;
          const p2 = positions.get(n2.id())!;
          const dx = p2.x - p1.x, dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) * 0.4;
            const px = (dx / dist) * push, py = (dy / dist) * push;
            p1.x -= px; p1.y -= py; p2.x += px; p2.y += py;
            moved = true;
          } else if (dist === 0) {
            const angle = Math.random() * Math.PI * 2;
            p1.x -= Math.cos(angle) * 20; p1.y -= Math.sin(angle) * 20;
            moved = true;
          }
        });
      });
      if (!moved) break;
    }
    nodes.forEach(n => { n.animate({ position: positions.get(n.id())!, duration: 300 }); });
  }, []);

  const focusSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    const cy = cyRef.current;
    if (!cy) return;
    const matches = cy.nodes('.search-match');
    if (matches.length > 0) cy.animate({ fit: { eles: matches, padding: 80 }, duration: 300 });
  }, [searchQuery]);

  const clearPath = useCallback(() => {
    setPathSource(null);
    setPathTarget(null);
    setPathResults([]);
    cyRef.current?.elements().removeClass('path-node path-source path-target path-edge dimmed');
  }, []);

  const togglePathMode = useCallback(() => {
    if (pathMode) {
      clearPath();
      setPathMode(false);
    } else {
      setPathMode(true);
      setSelectedNode(null);
      cyRef.current?.elements().removeClass('highlighted dimmed');
    }
  }, [pathMode, clearPath]);

  // Region helpers
  const toggleRegion = useCallback((r: string) => {
    setSelectedRegions(prev => { const n = new Set(prev); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  }, []);
  const selectAllRegions = useCallback(() => setSelectedRegions(new Set(graphData.regions)), [graphData.regions]);
  const selectGameplayRegions = useCallback(() => {
    const all = new Set(graphData.regions);
    for (const r of HIDDEN_BY_DEFAULT) all.delete(r);
    setSelectedRegions(all);
  }, [graphData.regions]);

  const regionCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of graphData.nodes) c.set(n.region, (c.get(n.region) || 0) + 1);
    return c;
  }, [graphData.nodes]);

  // Region centroids for labels
  const regionCentroids = useMemo(() => {
    const groups = new Map<string, { sumX: number; sumY: number; count: number }>();
    for (const n of filteredNodes) {
      if (!groups.has(n.region)) groups.set(n.region, { sumX: 0, sumY: 0, count: 0 });
      const g = groups.get(n.region)!;
      g.sumX += n.x; g.sumY += -n.y; g.count++;
    }
    const result: { region: string; x: number; y: number }[] = [];
    for (const [region, g] of groups) {
      if (g.count >= 3) result.push({ region, x: g.sumX / g.count, y: g.sumY / g.count });
    }
    return result;
  }, [filteredNodes]);

  // Render region labels as overlay divs
  const [regionLabels, setRegionLabels] = useState<{ region: string; screenX: number; screenY: number }[]>([]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !containerRef.current) return;

    const updateLabels = () => {
      const zoom = cy.zoom();
      // Show region labels at overview zoom (below 0.8), hide when zoomed in
      if (zoom > 0.8) { setRegionLabels([]); return; }

      const pan = cy.pan();
      const rect = containerRef.current!.getBoundingClientRect();
      const labels = regionCentroids.map(c => ({
        region: c.region,
        screenX: c.x * zoom + pan.x,
        screenY: c.y * zoom + pan.y,
      })).filter(l => l.screenX > -50 && l.screenX < rect.width + 50 && l.screenY > -20 && l.screenY < rect.height + 20);
      setRegionLabels(labels);
    };

    cy.on('zoom pan', updateLabels);
    updateLabels();
    return () => { cy.off('zoom pan', updateLabels); };
  }, [regionCentroids]);

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
    const pop = playerAreaMap.get(selectedNode);
    return { node, analytics: a, connections, players: pop };
  }, [selectedNode, graphData, analyticsMap, playerAreaMap]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden relative" style={{ height: 'calc(100vh - 340px)', minHeight: '500px' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-dim gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={fitToView} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Fit to view"><Maximize2 className="h-3.5 w-3.5" /></button>
          <button onClick={zoomIn} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={zoomOut} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></button>
          <button onClick={resetLayout} className="p-1.5 rounded hover:bg-surface-hover text-text-muted hover:text-text" title="Reset positions"><RotateCcw className="h-3.5 w-3.5" /></button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button onClick={spreadNodes} className="flex items-center gap-1 px-2 py-1 text-xs rounded text-text-muted hover:text-text hover:bg-surface-hover" title="Push overlapping nodes apart">
            <Waypoints className="h-3 w-3" />Spread
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button onClick={() => setColorMode(m => m === 'heat' ? 'region' : 'heat')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${colorMode === 'region' ? 'bg-indigo-500/20 text-indigo-300' : 'text-text-muted hover:text-text'}`}>
            <Palette className="h-3 w-3" />{colorMode === 'heat' ? 'Heat' : 'Region'}
          </button>

          <button onClick={() => setCollapseInteriors(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${collapseInteriors ? 'bg-indigo-500/20 text-indigo-300' : 'text-text-muted hover:text-text'}`}
            title={collapseInteriors ? 'Interiors collapsed (double-click a node to expand). Click to show all.' : 'All interiors shown. Click to collapse.'}>
            <Layers className="h-3 w-3" />{collapseInteriors ? 'Grouped' : 'All'}
          </button>

          <button onClick={() => setShowOrphans(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${showOrphans ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text'}`}>
            {showOrphans ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}Orphans
          </button>

          <button onClick={() => setShowPlayers(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${showPlayers ? 'bg-green-500/20 text-green-300' : 'text-text-muted hover:text-text'}`}
            title="Show/hide live player positions">
            <Users className="h-3 w-3" />
            {liveAreas.filter(a => a.playerCount > 0).length > 0
              ? `${liveAreas.reduce((s, a) => s + a.playerCount, 0)} online`
              : 'Players'}
          </button>

          <button onClick={togglePathMode}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${pathMode ? 'bg-purple-500/20 text-purple-300' : 'text-text-muted hover:text-text'}`}>
            <Route className="h-3 w-3" />Path
          </button>

          {/* Region filter */}
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setRegionDropdownOpen(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${selectedRegions.size < graphData.regions.length ? 'bg-indigo-500/20 text-indigo-300' : 'text-text-muted hover:text-text'}`}>
              <Filter className="h-3 w-3" />Regions ({selectedRegions.size}/{graphData.regions.length})<ChevronDown className="h-3 w-3" />
            </button>
            {regionDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-border rounded-lg shadow-xl w-72 max-h-80 overflow-y-auto">
                <div className="sticky top-0 bg-surface border-b border-border px-3 py-2 flex gap-1">
                  <button onClick={selectAllRegions} className="px-2 py-0.5 text-[10px] rounded bg-surface-dim text-text-muted hover:text-text">All</button>
                  <button onClick={selectGameplayRegions} className="px-2 py-0.5 text-[10px] rounded bg-surface-dim text-text-muted hover:text-text">Gameplay</button>
                  <button onClick={() => setSelectedRegions(new Set())} className="px-2 py-0.5 text-[10px] rounded bg-surface-dim text-text-muted hover:text-text">None</button>
                </div>
                <div className="p-1">
                  {graphData.regions.slice().sort((a, b) => (regionCounts.get(b) || 0) - (regionCounts.get(a) || 0)).map(region => (
                    <div key={region} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-hover group">
                      <input type="checkbox" checked={selectedRegions.has(region)} onChange={() => toggleRegion(region)} className="rounded border-border" />
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: REGION_COLORS[region] || '#808080' }} />
                      <span className="text-xs text-text flex-1 truncate">{region}</span>
                      <span className="text-[10px] text-text-muted tabular-nums">{regionCounts.get(region) || 0}</span>
                      <button onClick={() => { setSelectedRegions(new Set([region])); setRegionDropdownOpen(false); }}
                        className="text-[10px] text-text-muted hover:text-primary opacity-0 group-hover:opacity-100 px-1">solo</button>
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
            <input type="text" placeholder="Search areas..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && focusSearch()}
              className="pl-6 pr-6 py-1 text-xs rounded border border-border bg-surface text-text w-44 focus:outline-none focus:ring-1 focus:ring-primary" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"><X className="h-3 w-3" /></button>}
          </div>
          <span className="text-[10px] text-text-muted tabular-nums whitespace-nowrap">{filteredNodes.length} / {graphData.stats.totalAreas}</span>
        </div>
      </div>

      {/* Path mode banner */}
      {pathMode && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-purple-500/10 border-b border-purple-500/30 text-xs">
          <Route className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-purple-300">
            {!pathSource ? 'Click source area' : !pathTarget ? 'Click destination area' : `${pathResults.length} route(s) found — shortest: ${pathResults[0]?.distance ?? '?'} steps`}
          </span>
          {(pathSource || pathTarget) && (
            <button onClick={clearPath} className="text-purple-400 hover:text-purple-200 text-[10px]">Reset</button>
          )}
          <button onClick={togglePathMode} className="ml-auto text-purple-400 hover:text-purple-200 text-[10px]">Exit</button>
        </div>
      )}

      {/* Graph + details panel */}
      <div className="flex" style={{ height: pathMode ? 'calc(100% - 66px)' : 'calc(100% - 36px)' }}>
        <div className="flex-1 relative">
          <div ref={containerRef} className="w-full h-full" />

          {/* Region labels overlay */}
          {regionLabels.map(l => (
            <div key={l.region} className="absolute pointer-events-none text-[11px] font-bold text-white/30 whitespace-nowrap"
              style={{ left: l.screenX, top: l.screenY, transform: 'translate(-50%, -50%)' }}>
              {l.region}
            </div>
          ))}

          {/* Minimap */}
          <canvas ref={minimapRef} width={180} height={120}
            className="absolute bottom-2 right-2 border border-border rounded bg-gray-900/80 backdrop-blur-sm"
            style={{ imageRendering: 'pixelated' }} />

          {/* Legend */}
          {colorMode === 'heat' && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-surface/90 backdrop-blur-sm border border-border rounded px-2 py-1">
              <span className="text-[10px] text-text-muted">Visits:</span>
              {[{ color: '#374151', label: 'None' }, { color: '#10b981', label: 'Low' }, { color: '#22c55e', label: 'Med' },
                { color: '#eab308', label: 'High' }, { color: '#f97316', label: 'V.High' }, { color: '#ef4444', label: 'Hot' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-0.5">
                  <div className="w-3 h-2 rounded" style={{ backgroundColor: color }} />
                  <span className="text-[9px] text-text-muted">{label}</span>
                </div>
              ))}
              {showPlayers && <><div className="w-px h-3 bg-border mx-1" /><div className="w-3 h-2 rounded border-2 border-green-500" /><span className="text-[9px] text-text-muted">Players</span></>}
            </div>
          )}
        </div>

        {/* Details sidebar */}
        {selectedNodeData && (
          <div className="w-64 border-l border-border bg-surface-dim overflow-y-auto p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-text truncate pr-2">{selectedNodeData.node.name}</h4>
              <button onClick={() => { setSelectedNode(null); cyRef.current?.elements().removeClass('highlighted dimmed'); }}
                className="text-text-muted hover:text-text shrink-0"><X className="h-3.5 w-3.5" /></button>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between"><span className="text-text-muted">ResRef</span><span className="font-mono text-text">{selectedNodeData.node.id}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Region</span><span className="text-text">{selectedNodeData.node.region}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Type</span><span className="text-text">{selectedNodeData.node.areaType}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Size</span><span className="text-text">{selectedNodeData.node.width}x{selectedNodeData.node.height}</span></div>
            </div>

            {selectedNodeData.players && selectedNodeData.players.playerCount > 0 && (
              <div className="border-t border-border pt-2 mb-3">
                <h5 className="font-semibold text-green-400 uppercase tracking-wider mb-1.5">
                  <Users className="h-3 w-3 inline mr-1" />{selectedNodeData.players.playerCount} Player(s) Here
                </h5>
                <ul className="space-y-0.5">
                  {selectedNodeData.players.players.map(p => (
                    <li key={p.uuid} className="text-text">{p.name}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedNodeData.analytics && (
              <div className="border-t border-border pt-2 mb-3">
                <h5 className="font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Visits</h5>
                <div className="space-y-1">
                  {(['today', 'week', 'month', 'allTime'] as const).map(t => (
                    <div key={t} className="flex justify-between">
                      <span className="text-text-muted">{t === 'allTime' ? 'All Time' : t === 'today' ? 'Today' : t === 'week' ? '7 Days' : '30 Days'}</span>
                      <span className={`tabular-nums ${t === timeRange ? 'text-primary font-semibold' : 'text-text'}`}>
                        {selectedNodeData.analytics![t].toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-2">
              <h5 className="font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Connections ({selectedNodeData.connections.length})</h5>
              {selectedNodeData.connections.length === 0 ? (
                <p className="text-text-muted italic">No connections (orphan)</p>
              ) : (
                <ul className="space-y-0.5">
                  {selectedNodeData.connections.map(c => (
                    <li key={c.id} className="flex items-start gap-1">
                      <span className="text-text-muted shrink-0">{c.direction === 'interior' ? 'int' : c.direction.charAt(0).toUpperCase()}</span>
                      <button onClick={() => { const cy = cyRef.current; if (cy) { const n = cy.getElementById(c.id); if (n.length > 0) cy.animate({ center: { eles: n }, zoom: 1.5, duration: 300 }); } }}
                        className="text-left text-primary hover:underline truncate">{c.name}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tooltip */}
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
            {(() => {
              const pop = playerAreaMap.get(tooltip.node.id);
              if (!pop || pop.playerCount === 0) return null;
              return (
                <div className="mt-1 text-[10px] border-t border-gray-700 pt-1 text-green-400">
                  <Users className="h-3 w-3 inline mr-1" />{pop.playerCount} player(s): {pop.players.map(p => p.name).join(', ')}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
