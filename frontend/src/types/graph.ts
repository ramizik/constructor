export type NodeLabel =
  | 'ResearchGoal'
  | 'Technique'
  | 'Metric'
  | 'Finding'
  | 'Source'
  | 'ExperimentRun'
  | 'ResultArtifact'

export interface GraphNode {
  id: string
  label: NodeLabel
  props: Record<string, string | number>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
