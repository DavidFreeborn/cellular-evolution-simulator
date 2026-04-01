# Cellular Evolution Simulator

An interactive browser-based artificial life sandbox where multicellular organisms evolve under mutation, competition, predation, and changing sunlight regimes.

This project is intentionally lightweight: it runs as a static HTML/JavaScript app with no build step and no framework. The aim is to create a world simple enough for body plans, sensing, signaling, and ecological structure to emerge without scripting individual behaviors.

## What It Simulates

Organisms live on a `224 x 224` toroidal grid and are built from functional cell types:

- `Photo` cells harvest energy from sunlight.
- `Teeth` cells eat living tissue and decay.
- `Muscle` cells enable movement.
- `Shield` cells provide protection from being eaten.
- `Nose` cells measure local density in four directions.
- `Eye` cells read the single cell directly ahead plus emitter signal strength there.
- `Emitter` cells broadcast a signal that eyes can detect.
- `Decay` represents dead tissue that can still be scavenged for a while.

Each organism also carries a small neural network whose inputs and outputs depend on its body.

## Key Mechanics

- Photosynthesis depends on sunlight availability and local shade.
- Movement, metabolism, neural processing, and reproduction all cost energy.
- Predation happens through contact biting rather than projectile attacks.
- Brains begin simple and can evolve more structure over time.
- Sensors and emitters are part of the same evolutionary process as body shape and behavior.

## Sunlight Modes

- `Default`: sunlight is available everywhere.
- `Central`: light is strongest near the center and falls off smoothly toward the edges.
- `Refugia`: the world alternates between uniform light and concentrated bright refugia. The refugia epoch length can be adjusted in the UI.

These modes create different ecological landscapes for photosynthesizers, specialists, and mobile predators.

## What To Watch For

- Punctuated dynamics: relatively stable intervals interrupted by extinction pulses
- Adaptive radiations and ecological reorganization following extinction events
- Refugia potentially supporting higher biodiversity and longer coexistence
- Oscillatory predator-prey dynamics, including overshoot, collapse, and transient shifts in trophic dominance
- Coevolutionary arms races between predators, prey, and defensive forms
- Attractor-like regimes in evolutionary space, with convergent evolution toward similar body plans in independent lineages
- Historical contingency and path dependence, with different runs settling into different long-lived regimes
- Possible evolution of sensory systems, especially noses and eyes, within mobile lineages
- Possible evolution of signaling through emitters and signal-responsive eyes
- Trade-offs between local specialists and generalists in variable sunlight regimes

## Running It

Because this is a static app, you can run it in either of these ways:

1. Open [index.html](index.html) directly in a modern browser.
2. Serve the folder locally with any simple static server and open the served URL.

No install or build step is required.

## Controls

- `Start`, `Step`, `Reset`
- `Speed`
- `Zoom`
- `Death`
- `Mutation`
- `Sunlight`
- `Epoch` for refugia mode
- `Design organism`
- `Seed organism`
- `History`
- `Guide`

You can also click organisms in the world to inspect their body plan, energy, age, species abundance, and neural network.

## Project Structure

- [index.html](index.html): app shell and UI structure
- [css/styles.css](css/styles.css): styling
- [js/constants.js](js/constants.js): simulation constants and derived network dimensions
- [js/brain.js](js/brain.js): neural-network implementation and mutation logic
- [js/organism.js](js/organism.js): organism state and cached species signatures
- [js/world.js](js/world.js): core simulation rules
- [js/simulator.js](js/simulator.js): controller, rendering, charts, and species history
- [js/ui.js](js/ui.js): UI wiring and modal/chart helpers

## Notes

- The simulation is intentionally exploratory and path-dependent. Different runs can settle into very different long-lived regimes.
- The history panel groups organisms by body-composition signature, not by exact genealogical lineage.
- Local analysis scripts and experiment outputs are kept out of version control for the public repo.
