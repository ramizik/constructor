import { useEffect, useMemo, useState } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import type { ElementDefinition, StylesheetStyle } from 'cytoscape'
import { fetchGraph } from '../lib/fetchGraph'
import { NODE_COLORS, NODE_LABEL_ORDER, isDarkMode } from '../lib/nodeColors'
import type { GraphData } from '../types/graph'

function toElements(graph: GraphData, dark: boolean): ElementDefinition[] {
  const nodes = graph.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label,
      name: String(n.props.name ?? n.props.title ?? n.props.text ?? n.id),
      color: dark ? NODE_COLORS[n.label].dark : NODE_COLORS[n.label].light,
    },
  }))
  const edges = graph.edges.map((e) => ({
    data: { id: e.id, source: e.source, target: e.target, type: e.type },
  }))
  return [...nodes, ...edges]
}

const stylesheet: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      label: 'data(name)',
      color: '#0b0b0b',
      'font-size': 9,
      'text-wrap': 'wrap',
      'text-max-width': '80px',
      'text-valign': 'bottom',
      'text-margin-y': 4,
      width: 28,
      height: 28,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#c3c2b7',
      'target-arrow-color': '#c3c2b7',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: 'data(type)',
      'font-size': 7,
      color: '#898781',
    },
  },
]

export function GraphPanel() {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const dark = useMemo(() => isDarkMode(), [])

  useEffect(() => {
    fetchGraph().then(setGraph)
  }, [])

  if (!graph) {
    return <div className="p-4 text-sm text-neutral-500">Loading graph…</div>
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex-1 min-h-0 rounded border border-neutral-200 dark:border-neutral-800">
        <CytoscapeComponent
          elements={toElements(graph, dark)}
          stylesheet={stylesheet}
          layout={{
            name: 'cose',
            animate: false,
            padding: 40,
            nodeRepulsion: () => 900000,
            idealEdgeLength: () => 160,
            componentSpacing: 120,
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-neutral-600 dark:text-neutral-400">
        {NODE_LABEL_ORDER.map((label) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: dark ? NODE_COLORS[label].dark : NODE_COLORS[label].light }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
