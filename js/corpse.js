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
        for (const [idx, age] of this.corpses) {
            if (age >= DECAY_TIME) {
                if (world.ctype[idx] === CELL_DECAY) world.ctype[idx] = CELL_EMPTY;
                this.corpses.delete(idx);
            } else {
                this.corpses.set(idx, age + 1);
            }
        }
    }

    removeCorpse(idx) {
        this.corpses.delete(idx);
    }
}
