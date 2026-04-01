// =====================
// Global State
// =====================
let simulator = null;
let animationId = null;

// Note: The following timing globals are defined in ui.js:
// - lastTime
// - stepAccumulator

// Note: The following mutable constants are defined in constants.js
// and modified by UI sliders:
// - MUT_WEIGHT_SIGMA, MUT_ADD_CELL_P, MUT_DEL_CELL_P, MUT_SWAP_CELL_P, MUT_JIGGLE_CELL_P
// - RANDOM_DEATH_PROB
