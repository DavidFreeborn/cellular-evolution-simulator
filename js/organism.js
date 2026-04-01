// =====================
// Organism Class
// =====================

class Organism {
    constructor(id, xs, ys, ts, energy, brain, facing) {
        this.id = id;
        this.xs = new Int16Array(xs);
        this.ys = new Int16Array(ys);
        this.ts = new Int8Array(ts);
        this.energy = energy;
        this.brain = brain;
        this.age = 0;

        // Facing direction (0=N, 1=E, 2=S, 3=W), random if not specified
        if (typeof facing === 'number') {
            this.facing = facing;
        } else {
            this.facing = Math.floor(Math.random() * 4);
        }

        this.cx = 0;
        this.cy = 0;
        this.photoCount = 0;
        this.muscleCount = 0;
        this.mouthIdx = [];
        this.typeCounts = new Int32Array(10);

        // Emit signals - one per emitter cell, controlled by neural network (0-1)
        this.emitSignals = [];  // Will be populated based on emitter count

        // Cached signature - invalidated when typeCounts changes
        this._signature = null;
        this._digestCooldown = 0;
        this._movedRecently = false;
    }

    getSignature() {
        // Return cached signature if available
        if (this._signature !== null) return this._signature;
        // Compute and cache - avoid .map().join() allocation
        let sig = '';
        for (let i = 0; i < SIG_TYPES.length; i++) {
            if (i > 0) sig += ',';
            sig += this.typeCounts[SIG_TYPES[i]];
        }
        this._signature = sig;
        return sig;
    }

    // Called when body composition changes (mutation, etc.)
    invalidateSignature() {
        this._signature = null;
    }

    // Get movement probability based on muscle count
    // Saturating curve: first muscle gives substantial movement probability
    // muscles/(muscles+k) with k=2: 1 muscle → 0.33, 2 → 0.5, 3 → 0.6, 5 → 0.71
    getMuscleRatio() {
        if (this.muscleCount === 0) return 0;
        return this.muscleCount / (this.muscleCount + 2);
    }
}
