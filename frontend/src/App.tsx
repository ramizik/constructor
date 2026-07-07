import { GraphPanel } from './components/GraphPanel'
import seedGraph from './data/seedGraph.json'

const GOAL_TEXT =
  'Find promising techniques for improving TOPS/W under thermal limit and memory constraints for edge inference accelerators.'

function App() {
  const goalNode = seedGraph.nodes.find((n) => n.label === 'ResearchGoal')

  return (
    <div className="grid h-screen grid-cols-[260px_1fr_300px] gap-4 bg-neutral-50 p-4 dark:bg-neutral-950">
      {/* Left: goal + actions (stub — Rohan wires real buttons/task list here) */}
      <aside className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-semibold">Research Goal</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          {goalNode?.props.text ?? GOAL_TEXT}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled
            className="rounded bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800"
          >
            Scout
          </button>
          <button
            type="button"
            disabled
            className="rounded bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800"
          >
            Analyze
          </button>
          <button
            type="button"
            disabled
            className="rounded bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800"
          >
            Plan Next
          </button>
        </div>
      </aside>

      {/* Center: graph viz — Sid's piece, fully wired to the seed fixture */}
      <main className="min-w-0">
        <GraphPanel />
      </main>

      {/* Right: job/findings — stub (Rohan/Logan/Ramis wire real content here) */}
      <aside className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-semibold">Findings / Artifacts</h2>
        <p className="text-xs text-neutral-500">Nothing yet — wire this up to job status + findings feed.</p>
      </aside>
    </div>
  )
}

export default App
