import seedGraph from '../data/seedGraph.json'
import type { GraphData } from '../types/graph'

// Today this returns the local seed fixture. Swap the body for a real
// call to Rohan's Butterbase read endpoint once it exists — the return
// shape (GraphData) is the agreed contract, don't change it unilaterally.
export async function fetchGraph(): Promise<GraphData> {
  return seedGraph as unknown as GraphData
}
