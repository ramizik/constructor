import type { SourceMeta } from "./types.ts";

// The 2-3 fixed Scout sources (Decision Q-sources: hardcoded pasted text, no live
// crawling). Numbers are chosen to make a clean Pareto story on TOPS/W (higher better)
// vs Memory_MB (lower better):
//   - sparsity-dataflow: efficiency leader, memory-hungry   -> on the frontier
//   - int4-quant:        memory leader, modest efficiency    -> on the frontier
//   - magnitude-pruning: mediocre on both, dominated by int4 -> off the frontier
// Demo takeaway: "two techniques dominate the efficiency/memory tradeoff; pruning is
// dominated." The prose is written so regex extraction (extract.ts) pulls the technique
// name + both figures without a lookup table.

export const SOURCES: SourceMeta[] = [
  {
    id: "src_sparsity-dataflow",
    url: "https://example.org/papers/sparsity-dataflow",
    title: "Structured sparsity dataflow for edge inference",
    type: "pasted",
    text:
      "Structured sparsity dataflow achieves 9.8 TOPS/W on our 16nm edge inference " +
      "accelerator by skipping zero-valued MAC operations directly at the dataflow " +
      "level. The design keeps the full activation working set resident on chip, " +
      "requiring 4.0 MB of on-chip SRAM, which becomes the dominant area cost under " +
      "the target thermal envelope.",
  },
  {
    id: "src_int4-quant",
    url: "https://example.org/papers/int4-quant",
    title: "Mixed-precision INT4 quantization for accelerators",
    type: "pasted",
    text:
      "Mixed-precision INT4 quantization delivers 5.1 TOPS/W while compressing weights " +
      "and activations aggressively. Because most tensors are stored at 4-bit " +
      "precision, the accelerator fits within just 0.5 MB of on-chip SRAM, making it " +
      "attractive when memory is the binding constraint for edge deployment.",
  },
  {
    id: "src_magnitude-pruning",
    url: "https://example.org/papers/magnitude-pruning",
    title: "Unstructured magnitude pruning under memory limits",
    type: "pasted",
    text:
      "Unstructured magnitude pruning reports 3.2 TOPS/W after removing 70% of the " +
      "weights, but irregular sparsity patterns limit hardware utilization. The pruned " +
      "model still requires 2.5 MB of on-chip SRAM because index metadata offsets much " +
      "of the nominal footprint saving.",
  },
];
