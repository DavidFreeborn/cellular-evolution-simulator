// =====================
// Cell Type Constants
// =====================
const CELL_EMPTY = 0;
const CELL_MUSCLE = 1;   // Movement capability
const CELL_SENSOR = 2;   // Forward eye sensor
const CELL_MOUTH = 3;    // Teeth / eating capability
const CELL_BRAIN = 4;    // (Not used as physical cell)
const CELL_NOSE = 5;     // Directional smell (4 inputs per nose)
const CELL_PHOTO = 6;    // Photosynthesis
const CELL_SHIELD = 7;   // Defense (immune to being eaten)
const CELL_EMIT = 8;     // Signal broadcasting
const CELL_DECAY = 9;    // Dead/decaying cell

// Cell colors for rendering
const CELL_COLORS = {
    [CELL_MUSCLE]: '#7878FF',
    [CELL_SENSOR]: '#FFFF78',
    [CELL_MOUTH]: '#FF7878',
    [CELL_BRAIN]: '#DCB4FF',
    [CELL_NOSE]: '#FFA050',
    [CELL_PHOTO]: '#78FF78',
    [CELL_SHIELD]: '#78DCDC',
    [CELL_EMIT]: '#FFFFFF',
    [CELL_DECAY]: '#966432'
};

// Cell names for UI display
const CELL_NAMES = {
    [CELL_MUSCLE]: 'Muscle',
    [CELL_SENSOR]: 'Eye',
    [CELL_MOUTH]: 'Teeth',
    [CELL_BRAIN]: 'Brain',
    [CELL_NOSE]: 'Nose',
    [CELL_PHOTO]: 'Photo',
    [CELL_SHIELD]: 'Shield',
    [CELL_EMIT]: 'Emitter',
    [CELL_DECAY]: 'Decay'
};

// Cell types used in species signatures (excludes Brain which isn't physical)
const SIG_TYPES = [CELL_MUSCLE, CELL_NOSE, CELL_SENSOR, CELL_MOUTH, CELL_PHOTO, CELL_SHIELD, CELL_EMIT];

// =====================
// Energy Economy Constants
// =====================
const E_LIGHT = 0.2;              // Energy from photosynthesis per photo cell per tick
const E_MOVE_PER_CELL = 0.31;     // Movement cost per non-muscle cell (muscles are free)
const E_METAB = 0.05;             // Metabolism cost per cell per tick
const E_BITE_GAIN_PER_CELL = 1.5; // Energy gained from eating (includes digestion loss)
const REPRO_COST_PER_CELL = 3.0;  // Cost to create one cell in offspring
const ENERGY_CAP_MULTIPLIER = 2.5; // Max energy = reproduction cost × this
const E_BRAIN_PER_NODE = 0.0002;  // Brain cost per network node per tick (reduced 5x to allow sensor evolution)
const E_BRAIN_PER_HIDDEN_LAYER = 0.005; // Small fixed upkeep per hidden layer to discourage gratuitous depth

// =====================
// Organism Constraints
// =====================
const MIN_CELLS = 4;              // Minimum cells for viable organism
const MAX_CELLS = 40;             // Maximum cells per organism
const BITE_DIGEST_COOLDOWN = 8;   // Ticks before another living-organism bite is allowed
const DECAY_TIME = 25;            // Ticks before corpse disappears

// =====================
// Sensor Constants
// =====================
const NOSE_GRID_SIZE = 5;         // 5×5 local neighborhood for directional density smell
const NOSE_GRID_RADIUS = 2;
const SENSOR_INPUTS = 8;          // Ahead cell: 7 one-hot cell kinds + 1 emitter-frequency channel
const EYE_CHANNEL_TYPES = [CELL_MUSCLE, CELL_SENSOR, CELL_MOUTH, CELL_NOSE, CELL_PHOTO, CELL_SHIELD, CELL_DECAY];
const EYE_CHANNEL_INDEX = new Int8Array(10).fill(-1);
for (let i = 0; i < EYE_CHANNEL_TYPES.length; i++) {
    EYE_CHANNEL_INDEX[EYE_CHANNEL_TYPES[i]] = i;
}

// Sensor perception encoding (normalized cell type values)
const SENSE_EMPTY = 0;
const SENSE_MUSCLE = 0.1;
const SENSE_NOSE = 0.15;
const SENSE_SENSOR = 0.2;
const SENSE_MOUTH = 0.3;
const SENSE_PHOTO = 0.6;
const SENSE_SHIELD = 0.7;
const SENSE_DECAY = 0.9;

// Sensor grid transform coefficients
// Converts organism-relative coords (ox, oy) to world coords based on facing direction
// world_dx = ox * SENSE_XX[facing] + oy * SENSE_XY[facing]
// world_dy = ox * SENSE_YX[facing] + oy * SENSE_YY[facing]
//
// Grid layout (organism-relative):
//   oy=-2 = "ahead" row (top of sensor input)
//   oy=+2 = "behind" row (bottom of sensor input)
//   ox=-2 = "left" column, ox=+2 = "right" column
//
// Verified transforms:
//   North (f=0): ahead=-Y → oy=-2 maps to worldDy=-2 ✓
//   East  (f=1): ahead=+X → oy=-2 maps to worldDx=+2 ✓
//   South (f=2): ahead=+Y → oy=-2 maps to worldDy=+2 ✓
//   West  (f=3): ahead=-X → oy=-2 maps to worldDx=-2 ✓
const SENSE_XX = [1, 0, -1, 0];   // North, East, South, West
const SENSE_XY = [0, -1, 0, 1];
const SENSE_YX = [0, 1, 0, -1];
const SENSE_YY = [1, 0, -1, 0];

// =====================
// Direction Constants
// =====================
const DIR_N = 0, DIR_E = 1, DIR_S = 2, DIR_W = 3;
const DIR_DX = [0, 1, 0, -1];     // dx for each direction
const DIR_DY = [-1, 0, 1, 0];     // dy for each direction

// =====================
// World/Grid Constants
// =====================
const GRID_SIZE = 224;            // World size (224×224 cells)
const CELL_SIZE = 8;              // Base pixel size per cell
const LIGHT_COMPETITION_FACTOR = 0.08; // Light reduction for nearby photo cells
const SUNLIGHT_MODE_DEFAULT = 'default';
const SUNLIGHT_MODE_CENTRAL = 'central';
const SUNLIGHT_MODE_REFUGIA = 'refugia';
const CENTRAL_SUNLIGHT_MIN_FACTOR = 0.5;
const CENTRAL_SUNLIGHT_SIGMA = GRID_SIZE * 0.23;
let REFUGIA_PHASE_TICKS = 1000;
const REFUGIA_PATCH_RADIUS = 40;    // Each refugium covers about 10% of the world
const REFUGIA_PATCH_COUNT = 5;
const REFUGIA_PATCH_JITTER = 4;

// =====================
// Mutation Rates (mutable - adjusted by UI)
// =====================
let MUT_WEIGHT_SIGMA = 0.02;      // Neural network weight mutation magnitude
let MUT_ADD_CELL_P = 0.02;        // Probability of adding a cell
let MUT_DEL_CELL_P = 0.016;       // Probability of deleting a cell
let MUT_SWAP_CELL_P = 0.016;      // Probability of swapping cell type
let MUT_JIGGLE_CELL_P = 0.012;    // Probability of moving a cell

// =====================
// Environmental Parameters (mutable - adjusted by UI)
// =====================
let RANDOM_DEATH_PROB = 0.014;    // Random death probability per tick (1.4%)
let SUNLIGHT_MODE = SUNLIGHT_MODE_DEFAULT;

// =====================
// UI Update Throttling
// =====================
const UI_UPDATE_INTERVAL = 10;    // Update DOM/charts every N ticks

// =====================
// Helper Functions
// =====================

/**
 * Calculate neural network input/output dimensions based on organism body composition
 * @param {Int32Array} typeCounts - Array of cell type counts
 * @returns {Object} {inputs, hidden, outputs, numEmitters, numNoses}
 */
function calculateNNDimensions(typeCounts) {
    const numSensors = typeCounts[CELL_SENSOR];
    const numNoses = typeCounts[CELL_NOSE] || 0;
    const numEmitters = typeCounts[CELL_EMIT];
    const hasMuscles = typeCounts[CELL_MUSCLE] > 0;

    // Inputs: 1 energy + (noses × 4) + (sensors × SENSOR_INPUTS)
    const inputs = 1 + (numNoses * 4) + (numSensors * SENSOR_INPUTS);

    // Outputs: reproduce, per-emitter emit, movement (4 if muscles)
    const outputs = 1 + numEmitters + (hasMuscles ? 4 : 0);

    // Initial hidden layer size (only used for brand new organisms in seeding)
    const hidden = 0;

    return { inputs, hidden, outputs, numEmitters, numNoses, numSensors, hasMuscles };
}
