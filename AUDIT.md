# Correctness and performance audit — 7 October 2026

Repairs are based on commit `988d432e3ccd89fa97e79dc4c6052c68c6a1a6b7` and integrated with the subsequent shared-navigation and typography updates through `2be8253`. The website vendors the same application files; its production deployment is managed separately. The static, dependency-free application and its scientific rules remain recognisable; this is not an attempt to select for complexity by changing fitness rewards.

## Correctness repairs

| Area | Repair |
| --- | --- |
| Neural inheritance | Map input and output axes together for networks without hidden layers. Preserve sensor/emitter cell identities across deletion, replacement, and reordering, including changes with equal input/output counts. New sensory channels receive small nonzero weights. |
| Mutation control | Scale parameter mutation probability with the slider; zero now freezes both body and brain mutation. Default parameter-mutation probability remains 5%. The displayed percentage is the add-cell probability before validity checks, not the probability of every possible mutation. |
| Neural structure | Removing a hidden layer preserves unaffected downstream layers and can remove the final hidden layer. The bridge uses a local linear approximation; deleting a nonlinear layer cannot generally preserve the full function exactly. |
| Predation | Reject dead attackers at both bite entry points. Shuffle the tick order, preserving movement initiative without permanent insertion-order advantage. |
| Reproduction | Charge construction plus reserve for the actual mutated child: 3 + 2.4 energy per cell, with a 2-energy parental buffer. Prepare the child before committing placement and energy. Randomise offspring-placement angular origin. |
| Bodies and seeds | Enforce 4–40 unique, connected cells after mutation and in custom templates. Custom muscle-bearing seeds receive usable default movement outputs. Seed energy respects the existing storage cap. |
| World state | Remove overwritten corpses from tracking. Empty worlds continue their clock, refugia cycle, and decay. |
| Signalling | Convert tanh outputs to the full 0–1 range. All organisms read the previous signal state before the next signals are committed. |
| History | Collect once per tick, independently of display refreshes. Record births at the event, including organisms dying during their birth tick. Manual seeding updates the current sample without inventing elapsed time or replaying births. |
| Inspection and timing | Unwrap bodies crossing either torus seam. Scale click coordinates to canvas resolution. Refresh statistics on Step and Pause. Share elapsed-time scheduling between foreground/background execution. |

Construction transfers reserve energy from parent to child and converts construction energy into body structure. Sunlight and explicit seeding remain energy inputs; metabolism, movement, digestion losses, death, decay, and storage caps remain sinks. “Conserve energy” does not mean making this open ecological system closed.

## Preserved model choices

Movement still pays the existing cargo cost and passes the existing neural threshold and muscle-ratio probability. A successful bite still consumes the whole victim; shield cells still protect contacted locations rather than making every mixed body invulnerable. The eight-tick digestion cooldown, sunlight functions, metabolic coefficients, starting body distribution, 4–40-cell range, and body-composition definition of species are retained.

These can reasonably be the intended abstraction. They also shape which organisms win. Sensors must earn their construction and neural costs through useful behaviour; larger bodies must outperform cheap reproducing bodies. The feed-forward brain has no explicit recurrent memory, and eyes see only the next cell. “More hidden layers,” “more species,” and “more sophisticated behaviour” are different measurements.

The repaired runs still commonly favour four-cell bodies. That observation does not establish that complex life is impossible, or that any preserved rule is a bug. Fitness retuning, developmental biology, longer-range perception, memory, and alternative feeding models would be separate experiments.

## Performance work

Nose sensing now uses precomputed directional stencils and wrapped coordinate tables. The result matches the original equations across every tested location and facing, including seams. The energy-only path evaluates the same Float32 result as full inference; no approximate lookup crosses action thresholds. Cloning avoids randomising parameters that will immediately be overwritten. Movement reuses coordinate buffers, corpse expiry avoids a temporary list, and obsolete code paths were removed.

Statistics are retained every tick while rendering/DOM work is batched and throttled. Cell bars reuse DOM nodes, and species composition no longer requires repeated scans for representative organisms. Long scalar histories retain raw samples but draw bounded buckets with means and extrema; the extinction moving average is computed before bucketing. Existing older cell-distribution compression remains weighted by elapsed span.

Five-replicate, seeded, fixed-workload medians on the same Windows computer, Node v24.12.0:

| Workload | Original | Correctness repairs, before optimisations | Final |
| --- | ---: | ---: | ---: |
| 1,936 passive bodies, 1,000 ticks | 381 ms | 408 ms | 403 ms |
| 1,936 sensory bodies, 1,000 ticks | 8,348 ms | 4,669 ms | 1,476 ms |
| 20,000 brain clone/mutation calls | 115 ms | 122 ms | 77 ms |

The final sensory workload takes about 68% less time than the correctness-only snapshot, and cloning about 36% less. Passive throughput is effectively unchanged within timing variation. Relative to the original, sensory time falls about 82%; that comparison also includes correctness changes. These are headless workloads, not promises of browser frame rate or identical evolutionary trajectories. Final samples ranged 365–479 ms (passive), 1,287–1,974 ms (sensory), and 55–80 ms (cloning).

Preparing a 1,000,001-sample population history for a 1,600-point display budget fell from 13.05 ms to 3.98 ms (five measured repetitions after warm-up). Drawing objects fell from 1,000,001 to 1,598, while all original samples remain available. This measurement excludes canvas painting.

A CPU profile of the optimised fixed workloads put most execution time in world stepping, sensing, and neural inference; garbage collection was a small share. The profile and unprofiled benchmark runs are separate evidence.

## Verification

- 28 automated regression tests pass. They cover identity-preserving wiring, zero mutation, structural changes, dead attackers, fair fights, preserved predation/shields, conserved reproduction, placement failure, 3,000 body mutations, corpse tracking, empty-world progression, signalling, history, nose equivalence, movement buffers, and both clock paths.
- The mixed-population stress test runs 1,500 ticks in each sunlight mode at 25% mutation, periodically reseeding mobile predators with eyes, noses, and emitters. Repeated reseeding prevents extinction from making the stress test vacuous.
- A separate final-model run executes 5,000 ticks per sunlight mode, seed 1, checking invariants every 100 ticks. All 150 checks passed; dead attackers made zero successful bites. Largest difference between incremental and recomputed stored-energy totals was 0.00000352 energy, consistent with accumulated floating-point rounding.
- Those final runs recorded 194,064 births in Default, 827 in Central, and 109,204 in Refugia. Final populations were 5,891, 18, and 4,294 respectively, all with mean body size 4. Default had two sensor-bearing mobile organisms at the final snapshot; this is not evidence of adaptive sophisticated behaviour.
- Nine additional 10,000-tick development runs (three seeds per sunlight mode) found no sampled grid/cell-count failures. They ran before the last placement-search cleanup; keep their results separate from the final source-hashed run.
- Browser checks covered Start/Pause/Step/Reset, speeds through 128/sec, simulation zoom through 200%, rate controls, all sunlight modes, epoch, grid, custom design/seeding, history, guide, pointer inspection, keyboard selection, modal focus/Escape, and errors in the console. Phone (390 px), tablet (768 px), and desktop layouts were inspected.
- The designer supports keyboard editing. Species/statistics panels remain present on narrow screens; the inspector wraps instead of clipping. Modal content scrolls, text labels retain readable contrast, and the footer no longer covers content in flowing layouts. Reduced-motion CSS disables decorative transitions; simulation remains controlled by Pause/Step.

## Practical limits

Full population/diversity/extinction histories still grow with run length, as required by their existing full-history behaviour. Display decimation limits painting work, not raw-history memory, and preparation still scans the samples. Brain architecture and species-history maps can also grow over very long runs. There is no new worker or persistence layer in this repair.

Browser timer throttling can reduce background throughput; the scheduler caps catch-up work to keep the app responsive. A requested 128 ticks/sec is a target, not a guarantee during browser suspension or heavy workloads. The world remains a simplified artificial-life model, and body-composition statistics do not establish genealogical diversity or behavioural intelligence.

The canvas remains a visual view. Keyboard selection exposes organism data and neural dimensions through HTML, but the drawn world and individual neural weights are not fully reproduced as a nonvisual data table. Browser-level 200% text zoom and OS reduced-motion emulation were not separately exercised; simulation zoom, responsive layouts, keyboard interaction, and the reduced-motion stylesheet were checked.
