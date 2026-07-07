import { useEffect, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { NODE_COLORS, type GraphData } from '../types';

interface Props {
  graph: GraphData;
}

function toElements(graph: GraphData): ElementDefinition[] {
  return [
    ...graph.nodes.map((n) => ({
      data: { id: n.id, label: n.label, type: n.type },
    })),
    ...graph.edges.map((e) => ({
      data: { id: e.id, source: e.source, target: e.target, label: e.type },
    })),
  ];
}

export function GraphCanvas({ graph }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const knownNodes = useRef<Set<string>>(new Set());

  // init once
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(graph),
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) =>
              NODE_COLORS[ele.data('type') as keyof typeof NODE_COLORS] ?? '#94a3b8',
            label: 'data(label)',
            color: '#e5e7eb',
            'font-size': 9,
            'text-wrap': 'wrap',
            'text-max-width': '90px',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            width: 26,
            height: 26,
            'border-width': 2,
            'border-color': '#0b0f17',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#334155',
            'target-arrow-color': '#334155',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 6,
            color: '#64748b',
            'text-rotation': 'autorotate',
          },
        },
        {
          selector: '.new',
          style: { 'border-color': '#38bdf8', 'border-width': 4 },
        },
      ],
      layout: { name: 'cose', animate: true, padding: 30 },
    });
    cyRef.current = cy;
    graph.nodes.forEach((n) => knownNodes.current.add(n.id));
    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // diff-update on graph change, animate new nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const currentIds = new Set(cy.nodes().map((n) => n.id()));
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
      cy.layout({ name: 'cose', animate: true, padding: 30 }).run();
      added.forEach((id) => {
        const node = cy.getElementById(id);
        node.addClass('new');
        setTimeout(() => node.removeClass('new'), 2000);
      });
    }
    void currentIds;
  }, [graph]);

  return <div ref={containerRef} className="h-full w-full" />;
}
