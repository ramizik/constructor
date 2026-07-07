import { useEffect, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { NODE_COLORS, type GraphData, type GraphNode, type NodeType } from '../types';

cytoscape.use(fcose);

interface Props {
  graph: GraphData;
  selectedId?: string | null;
  onNodeClick?: (node: GraphNode | null) => void;
}

// Per-type visual weight. Hubs (goal) are big, leaves (findings) small so the
// graph reads as a hierarchy instead of a uniform blob.
const NODE_SIZE: Record<NodeType, number> = {
  ResearchGoal: 58,
  Technique: 40,
  Metric: 36,
  Source: 34,
  ExperimentRun: 36,
  ResultArtifact: 36,
  AgentTask: 30,
  Finding: 22,
};

const NODE_SHAPE: Record<NodeType, cytoscape.Css.NodeShape> = {
  ResearchGoal: 'round-hexagon',
  Technique: 'ellipse',
  Metric: 'diamond',
  Source: 'round-rectangle',
  ExperimentRun: 'hexagon',
  ResultArtifact: 'round-tag',
  AgentTask: 'round-rectangle',
  Finding: 'ellipse',
};

function truncate(s: string, max = 22) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function toElements(graph: GraphData): ElementDefinition[] {
  return [
    ...graph.nodes.map((n) => ({
      data: {
        id: n.id,
        label: truncate(n.label),
        fullLabel: n.label,
        type: n.type,
        props: n.props,
      },
    })),
    ...graph.edges.map((e) => ({
      data: { id: e.id, source: e.source, target: e.target, label: e.type },
    })),
  ];
}

const LAYOUT = {
  name: 'fcose',
  quality: 'default',
  animate: true,
  animationDuration: 600,
  randomize: false,
  fit: true,
  padding: 60,
  nodeSeparation: 120,
  idealEdgeLength: 110,
  nodeRepulsion: 8000,
  gravity: 0.25,
  gravityRange: 3.8,
} as const;

export function GraphCanvas({ graph, selectedId, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  // init once
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(graph),
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: NodeSingular) =>
              NODE_COLORS[ele.data('type') as NodeType] ?? '#94a3b8',
            shape: (ele: NodeSingular) => NODE_SHAPE[ele.data('type') as NodeType] ?? 'ellipse',
            width: (ele: NodeSingular) => String(NODE_SIZE[ele.data('type') as NodeType] ?? 26),
            height: (ele: NodeSingular) => String(NODE_SIZE[ele.data('type') as NodeType] ?? 26),
            label: 'data(label)',
            color: '#334155',
            'font-size': 9,
            'font-weight': 500,
            'text-wrap': 'wrap',
            'text-max-width': '90px',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'border-width': 2,
            'border-color': '#ffffff',
            'border-opacity': 0.95,
            'transition-property': 'opacity, border-color, border-width',
            'transition-duration': 180,
          },
        },
        // Findings are numerous — hide their labels until relevant to cut clutter.
        {
          selector: 'node[type = "Finding"]',
          style: { 'font-size': 7, 'text-opacity': 0 },
        },
        {
          selector: 'edge',
          style: {
            width: '1.4',
            'line-color': '#cbd5e1',
            'line-opacity': 0.8,
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 6,
            color: '#64748b',
            'text-opacity': 0,
            'text-rotation': 'autorotate',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
            'transition-property': 'line-opacity, line-color, width',
            'transition-duration': 180,
          },
        },
        // Newly added nodes glow briefly.
        {
          selector: '.new',
          style: {
            'border-color': '#38bdf8',
            'border-width': 4,
            'border-opacity': 1,
          },
        },
        // Selection focus: highlight target + neighborhood, dim the rest.
        {
          selector: '.faded',
          style: { opacity: 0.12, 'text-opacity': 0 },
        },
        {
          selector: 'node.highlight',
          style: {
            'border-color': '#0f172a',
            'border-width': 3,
            'text-opacity': 1,
            'font-size': 10,
            'z-index': 10,
          },
        },
        {
          selector: 'edge.highlight',
          style: {
            'line-color': '#7dd3fc',
            'line-opacity': 1,
            width: '2.2',
            'target-arrow-color': '#7dd3fc',
            'text-opacity': 1,
            'z-index': 9,
          },
        },
        {
          selector: 'node.focus',
          style: {
            'border-color': '#f472b6',
            'border-width': 4,
            'text-opacity': 1,
            'font-size': 11,
            'z-index': 11,
          },
        },
      ],
      layout: LAYOUT,
    });

    const focusNode = (id: string) => {
      cy.elements().removeClass('highlight focus faded');
      const node = cy.getElementById(id);
      if (!node.length) return;
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass('faded');
      neighborhood.addClass('highlight');
      node.removeClass('highlight').addClass('focus');
    };

    const clearFocus = () => cy.elements().removeClass('highlight focus faded');

    cy.on('tap', 'node', (evt) => {
      const n = evt.target;
      focusNode(n.id());
      onNodeClickRef.current?.({
        id: n.id(),
        label: n.data('fullLabel') ?? n.data('label'),
        type: n.data('type'),
        props: n.data('props'),
      });
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        clearFocus();
        onNodeClickRef.current?.(null);
      }
    });

    cyRef.current = cy;
    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // diff-update on graph change, animate new nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const added: string[] = [];

    cy.batch(() => {
      for (const el of toElements(graph)) {
        if (!cy.getElementById(el.data!.id as string).length) {
          cy.add(el);
          if (el.data && !('source' in el.data)) added.push(el.data.id as string);
        }
      }
    });

    if (added.length) {
      cy.layout(LAYOUT).run();
      added.forEach((id) => {
        const node = cy.getElementById(id);
        node.addClass('new');
        setTimeout(() => node.removeClass('new'), 2200);
      });
    }
  }, [graph]);

  // react to selection driven from outside (e.g. clearing the detail panel)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!selectedId) {
      cy.elements().removeClass('highlight focus faded');
      return;
    }
    const node = cy.getElementById(selectedId);
    if (!node.length) return;
    cy.elements().removeClass('highlight focus faded');
    const neighborhood = node.closedNeighborhood();
    cy.elements().not(neighborhood).addClass('faded');
    neighborhood.addClass('highlight');
    node.removeClass('highlight').addClass('focus');
  }, [selectedId]);

  const fit = () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 60 }, duration: 400 });
  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ zoom: cy.zoom() * factor, center: { eles: cy.elements() } }, { duration: 200 });
  };
  const relayout = () => cyRef.current?.layout(LAYOUT).run();

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <Legend />

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <CtrlButton title="Zoom in" onClick={() => zoomBy(1.3)}>
          +
        </CtrlButton>
        <CtrlButton title="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
          −
        </CtrlButton>
        <CtrlButton title="Fit to screen" onClick={fit}>
          ⤢
        </CtrlButton>
        <CtrlButton title="Re-run layout" onClick={relayout}>
          ↻
        </CtrlButton>
      </div>
    </div>
  );
}

function CtrlButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-base text-slate-600 shadow-sm backdrop-blur transition hover:border-sky-400 hover:text-sky-600"
    >
      {children}
    </button>
  );
}

const LEGEND_TYPES: NodeType[] = [
  'ResearchGoal',
  'Technique',
  'Metric',
  'Finding',
  'Source',
  'ExperimentRun',
  'ResultArtifact',
];

function Legend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-slate-200 bg-white/85 p-2.5 shadow-sm backdrop-blur">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        Node types
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {LEGEND_TYPES.map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: NODE_COLORS[t] }}
            />
            <span className="text-[10px] text-slate-500">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
