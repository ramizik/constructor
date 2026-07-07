import type { NodeLabel } from '../types/graph'

// Categorical palette, fixed order — validated with the dataviz skill's
// validate_palette.js for both light and dark surfaces. Don't reorder or
// swap hues without re-running the validator.
export const NODE_COLORS: Record<NodeLabel, { light: string; dark: string }> = {
  ResearchGoal: { light: '#2a78d6', dark: '#3987e5' }, // blue
  Technique: { light: '#1baf7a', dark: '#199e70' }, // aqua
  Metric: { light: '#eda100', dark: '#c98500' }, // yellow
  Finding: { light: '#008300', dark: '#008300' }, // green
  Source: { light: '#4a3aa7', dark: '#9085e9' }, // violet
  ExperimentRun: { light: '#e34948', dark: '#e66767' }, // red
  ResultArtifact: { light: '#e87ba4', dark: '#d55181' }, // magenta
}

export const NODE_LABEL_ORDER: NodeLabel[] = [
  'ResearchGoal',
  'Technique',
  'Metric',
  'Finding',
  'Source',
  'ExperimentRun',
  'ResultArtifact',
]

export function isDarkMode(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
