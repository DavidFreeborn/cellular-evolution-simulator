// =====================
// Corpse Tracking
// =====================

class CorpseTracker {
    constructor() {
        this.corpses = new Map();  // idx -> age
    }

    addCorpse(idx) {
        this.corpses.set(idx, 0);
    }

    tick(world) {
        const toRemove = [];
        for (const [idx, age] of this.corpses) {
            this.corpses.set(idx, age + 1);

            if (age >= DECAY_TIME) {
                toRemove.push(idx);
            }
        }

        // Remove decayed corpses
        for (const idx of toRemove) {
            if (world.ctype[idx] === CELL_DECAY) {
                world.ctype[idx] = CELL_EMPTY;
            }
            this.corpses.delete(idx);
        }
    }

    removeCorpse(idx) {
        this.corpses.delete(idx);
    }
}
