// =====================
// World Class
// =====================

const CONTACT_DX = [1, -1, 0, 0];
const CONTACT_DY = [0, 0, 1, -1];

class World {
    constructor(size = GRID_SIZE) {
        this.size = size;
        this.owner = new Int32Array(size * size).fill(-1);
        this.ctype = new Int8Array(size * size);
        this.organisms = new Map();
        this.nextId = 1;
        this.corpseTracker = new CorpseTracker();

        // Running totals for O(1) stats queries
        this.runningCellCounts = new Int32Array(10);  // By cell type
        this.runningTotalEnergy = 0;
        this.runningSpeciesCounts = new Map();
        this.runningSpeciesExamples = new Map();
        this.photoNeighborCounts = new Int16Array(size * size);
        this.sunlightMap = new Uint8Array(size * size);
        this.sunlightMode = SUNLIGHT_MODE;
        this.tickCount = 0;
        this._sunlightPhase = -1;
        this._refugiaPatches = [];
        this._tickOrganisms = [];
        this._deadOrganisms = [];
        this._biteMark = 0;
        this.rebuildSunlightMap();
    }

    // Update running totals when organism is added
    addToRunningTotals(org) {
        for (let i = 0; i < org.ts.length; i++) {
            this.runningCellCounts[org.ts[i]]++;
        }
        this.runningTotalEnergy += org.energy;
        const signature = org.getSignature();
        this.runningSpeciesCounts.set(signature, (this.runningSpeciesCounts.get(signature) || 0) + 1);
        if (!this.runningSpeciesExamples.has(signature) || this.runningSpeciesExamples.get(signature) === -1) {
            this.runningSpeciesExamples.set(signature, org.id);
        }
    }

    // Update running totals when organism is removed
    subtractFromRunningTotals(org) {
        for (let i = 0; i < org.ts.length; i++) {
            this.runningCellCounts[org.ts[i]]--;
        }
        this.runningTotalEnergy -= org.energy;
        const signature = org.getSignature();
        const nextCount = (this.runningSpeciesCounts.get(signature) || 0) - 1;
        if (nextCount > 0) {
            this.runningSpeciesCounts.set(signature, nextCount);
            if (this.runningSpeciesExamples.get(signature) === org.id) {
                this.runningSpeciesExamples.set(signature, -1);
            }
        } else {
            this.runningSpeciesCounts.delete(signature);
            this.runningSpeciesExamples.delete(signature);
        }
    }

    // Get current cell counts (O(1) read)
    getRunningCellCounts() {
        return this.runningCellCounts;
    }

    // Get total energy (O(1) read)
    getRunningTotalEnergy() {
        return this.runningTotalEnergy;
    }

    adjustOrganismEnergy(org, delta) {
        org.energy += delta;
        this.runningTotalEnergy += delta;
        return org.energy;
    }

    setOrganismEnergy(org, value) {
        this.runningTotalEnergy += value - org.energy;
        org.energy = value;
        return value;
    }

    getRunningSpeciesCounts() {
        return this.runningSpeciesCounts;
    }

    getExampleOrgForSignature(signature) {
        const exampleId = this.runningSpeciesExamples.get(signature);
        if (exampleId === undefined) return null;

        const existing = exampleId !== -1 ? this.organisms.get(exampleId) : null;
        if (existing && existing.getSignature() === signature) {
            return existing;
        }

        for (const org of this.organisms.values()) {
            if (org.getSignature() === signature) {
                this.runningSpeciesExamples.set(signature, org.id);
                return org;
            }
        }

        this.runningSpeciesExamples.delete(signature);
        return null;
    }

    wrap(val) {
        return ((val % this.size) + this.size) % this.size;
    }

    getIdx(x, y) {
        return y * this.size + x;
    }

    setSunlightMode(mode) {
        const nextMode =
            mode === SUNLIGHT_MODE_CENTRAL || mode === SUNLIGHT_MODE_REFUGIA
                ? mode
                : SUNLIGHT_MODE_DEFAULT;
        this.sunlightMode = nextMode;
        this._sunlightPhase = -1;
        this.rebuildSunlightMap();
    }

    rebuildSunlightMap() {
        const map = this.sunlightMap;
        if (this.sunlightMode === SUNLIGHT_MODE_DEFAULT) {
            this._refugiaPatches = [];
            map.fill(255);
            return;
        }

        if (this.sunlightMode === SUNLIGHT_MODE_CENTRAL) {
            this._refugiaPatches = [];
            this.fillCentralSunlightGradient();
            return;
        }

        const phase = Math.floor(this.tickCount / REFUGIA_PHASE_TICKS);
        this._sunlightPhase = phase;
        if (phase % 2 === 0) {
            map.fill(255);
            this._refugiaPatches = [];
            return;
        }

        map.fill(0);
        this._refugiaPatches = this.getRefugiaPatches(phase);
        for (let i = 0; i < this._refugiaPatches.length; i++) {
            const patch = this._refugiaPatches[i];
            this.fillSunlightCircle(patch.x, patch.y, patch.radius, 255);
        }
    }

    fillCentralSunlightGradient() {
        const map = this.sunlightMap;
        const size = this.size;
        const half = size / 2;
        const sigmaSq2 = 2 * CENTRAL_SUNLIGHT_SIGMA * CENTRAL_SUNLIGHT_SIGMA;
        for (let y = 0; y < size; y++) {
            const rowOffset = y * size;
            let dy = Math.abs(y - half);
            dy = Math.min(dy, size - dy);
            for (let x = 0; x < size; x++) {
                let dx = Math.abs(x - half);
                dx = Math.min(dx, size - dx);
                const gaussian = Math.exp(-(dx * dx + dy * dy) / sigmaSq2);
                const factor = CENTRAL_SUNLIGHT_MIN_FACTOR + (1 - CENTRAL_SUNLIGHT_MIN_FACTOR) * gaussian;
                map[rowOffset + x] = Math.max(0, Math.min(255, Math.round(factor * 255)));
            }
        }
    }

    createSeededRng(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    torusDistanceSq(ax, ay, bx, by) {
        const size = this.size;
        let dx = Math.abs(ax - bx);
        let dy = Math.abs(ay - by);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        return dx * dx + dy * dy;
    }

    getRefugiaPatches(phase) {
        const rng = this.createSeededRng((phase + 1) * 2654435761);
        const size = this.size;
        const anchors = [
            { x: size * 0.50, y: size * 0.50 },
            { x: size * 0.20, y: size * 0.20 },
            { x: size * 0.20, y: size * 0.80 },
            { x: size * 0.80, y: size * 0.20 },
            { x: size * 0.80, y: size * 0.80 }
        ];

        return anchors.slice(0, REFUGIA_PATCH_COUNT).map(anchor => ({
            x: this.wrap(Math.round(anchor.x + (rng() * 2 - 1) * REFUGIA_PATCH_JITTER)),
            y: this.wrap(Math.round(anchor.y + (rng() * 2 - 1) * REFUGIA_PATCH_JITTER)),
            radius: REFUGIA_PATCH_RADIUS
        }));
    }

    fillSunlightCircle(cx, cy, radius, strength = 255) {
        const map = this.sunlightMap;
        const size = this.size;
        const radiusSq = radius * radius;
        for (let y = 0; y < size; y++) {
            let dy = Math.abs(y - cy);
            dy = Math.min(dy, size - dy);
            const dySq = dy * dy;
            if (dySq > radiusSq) continue;
            const rowOffset = y * size;
            for (let x = 0; x < size; x++) {
                let dx = Math.abs(x - cx);
                dx = Math.min(dx, size - dx);
                if (dx * dx + dySq <= radiusSq) {
                    map[rowOffset + x] = strength;
                }
            }
        }
    }

    updatePhotoNeighborhood(x, y, delta) {
        for (let dy = -1; dy <= 1; dy++) {
            const ny = this.wrap(y + dy);
            const rowOffset = ny * this.size;
            for (let dx = -1; dx <= 1; dx++) {
                const nx = this.wrap(x + dx);
                this.photoNeighborCounts[rowOffset + nx] += delta;
            }
        }
    }

    clearCells(oid) {
        // Use organism's known positions instead of scanning entire grid
        const org = this.organisms.get(oid);
        if (org) {
            const size = this.size;
            for (let i = 0; i < org.xs.length; i++) {
                if (org.ts[i] === CELL_PHOTO) {
                    this.updatePhotoNeighborhood(org.xs[i], org.ys[i], -1);
                }
                const idx = org.ys[i] * size + org.xs[i];
                this.owner[idx] = -1;
                this.ctype[idx] = CELL_EMPTY;
            }
        }
    }

    placeCells(oid, xs, ys, ts) {
        for (let i = 0; i < xs.length; i++) {
            const idx = this.getIdx(xs[i], ys[i]);
            if (this.owner[idx] !== -1) {
                return false;
            }
        }

        for (let i = 0; i < xs.length; i++) {
            const idx = this.getIdx(xs[i], ys[i]);
            this.owner[idx] = oid;
            this.ctype[idx] = ts[i];
            if (ts[i] === CELL_PHOTO) {
                this.updatePhotoNeighborhood(xs[i], ys[i], 1);
            }
        }

        return true;
    }

    initCaches(org) {
        const n = org.xs.length;
        const size = this.size;

        if (n === 0) {
            org.cx = 0;
            org.cy = 0;
            org.photoCount = 0;
            org.muscleCount = 0;
            org.mouthIdx = [];
            org.typeCounts = new Int32Array(10);
            org.emitCellMap = new Map();
            org.occupiedSet = new Set();
            org.sensorPositions = [];
            org.energyOnlyPassive = true;
            return;
        }

        // Torus-aware center-of-mass using anchor-relative coordinates
        // This correctly handles organisms spanning the world boundary
        const anchorX = org.xs[0];
        const anchorY = org.ys[0];
        const halfSize = size / 2;
        let sumDx = 0, sumDy = 0;

        for (let i = 0; i < n; i++) {
            // Calculate shortest-path offset from anchor
            let dx = org.xs[i] - anchorX;
            let dy = org.ys[i] - anchorY;

            // Adjust for wraparound (take shorter path)
            if (dx > halfSize) dx -= size;
            else if (dx < -halfSize) dx += size;
            if (dy > halfSize) dy -= size;
            else if (dy < -halfSize) dy += size;

            sumDx += dx;
            sumDy += dy;
        }

        // Average relative position, then add back anchor and wrap
        org.cx = this.wrap(Math.round(anchorX + sumDx / n));
        org.cy = this.wrap(Math.round(anchorY + sumDy / n));

        const tc = new Int32Array(10);
        const mouthIdx = [];
        const emitCellMap = new Map();
        const occupiedSet = new Set();
        const sensorPositions = [];  // Flat array: [x1,y1,x2,y2,...] for speed
        let emitIdx = 0;

        for (let i = 0; i < n; i++) {
            const t = org.ts[i];
            const x = org.xs[i];
            const y = org.ys[i];
            tc[t]++;

            // Build occupied cell set for O(1) collision/sensing (numeric key)
            occupiedSet.add(y * size + x);

            if (t === CELL_MOUTH) {
                mouthIdx.push(i);
            } else if (t === CELL_EMIT) {
                // Numeric key for speed: y * size + x
                emitCellMap.set(y * size + x, emitIdx);
                emitIdx++;
            } else if (t === CELL_SENSOR) {
                // Flat array for cache efficiency
                sensorPositions.push(x, y);
            }
        }

        org.typeCounts = tc;
        org.invalidateSignature();  // Clear cached signature when body changes
        org.mouthIdx = mouthIdx;
        org.photoCount = tc[CELL_PHOTO];
        org.muscleCount = tc[CELL_MUSCLE];
        org.emitCellMap = emitCellMap;       // O(1) lookup: y*size+x -> emitter index
        org.occupiedSet = occupiedSet;        // O(1) lookup: y*size+x -> boolean
        org.sensorPositions = sensorPositions; // Flat [x1,y1,x2,y2,...] for each sensor
        org.energyOnlyPassive =
            tc[CELL_MOUTH] === 0 &&
            tc[CELL_MUSCLE] === 0 &&
            tc[CELL_EMIT] === 0 &&
            tc[CELL_SENSOR] === 0 &&
            (tc[CELL_NOSE] || 0) === 0 &&
            org.brain.din === 1 &&
            org.brain.dout === 2;

        // Initialize emitSignals array (one per emitter cell)
        const numEmitters = tc[CELL_EMIT];
        if (numEmitters > 0 && org.emitSignals.length !== numEmitters) {
            org.emitSignals = new Array(numEmitters).fill(0.5);
        }
    }

    addOrganism(bodyTemplate, energy, brain) {
        const oid = this.nextId++;

        // Generate random facing direction
        const facing = Math.floor(Math.random() * 4);

        for (let attempt = 0; attempt < 50; attempt++) {
            const dx = Math.floor(Math.random() * this.size);
            const dy = Math.floor(Math.random() * this.size);

            // Get body coordinates
            const bodyXs = bodyTemplate.map(b => b[0]);
            const bodyYs = bodyTemplate.map(b => b[1]);
            const ts = bodyTemplate.map(b => b[2]);

            // Rotate body coordinates to match facing direction
            const [rotatedXs, rotatedYs] = this.rotateCoordsCW(bodyXs, bodyYs, facing);

            const xs = rotatedXs.map(x => this.wrap(x + dx));
            const ys = rotatedYs.map(y => this.wrap(y + dy));

            if (this.placeCells(oid, xs, ys, ts)) {
                const org = new Organism(oid, xs, ys, ts, energy, brain, facing);
                this.initCaches(org);
                this.organisms.set(oid, org);
                this.addToRunningTotals(org);
                return oid;
            }
        }

        return null;
    }

    sense(org) {
        // Calculate input size: 1 energy + (noses × 4) + (sensors × SENSOR_INPUTS)
        const numSensors = org.typeCounts[CELL_SENSOR];
        const numNoses = org.typeCounts[CELL_NOSE] || 0;
        const inputSize = 1 + (numNoses * 4) + (numSensors * SENSOR_INPUTS);

        // OPTIMIZATION: Reuse cached input array if size matches (avoids allocation every tick)
        let input = org._senseInput;
        if (!input || input.length !== inputSize) {
            input = new Float32Array(inputSize);
            org._senseInput = input;
        }

        // Energy level (normalized 0-1)
        input[0] = Math.min(1.0, Math.max(0.0, org.energy / (MAX_CELLS * REPRO_COST_PER_CELL)));

        // Use cached occupiedSet (built in initCaches, updated on move)
        const ownCells = org.occupiedSet;

        // Nose inputs (4 per nose cell) - placed before sensor inputs
        let noseIdx = 0;
        for (let i = 0; i < org.xs.length; i++) {
            if (org.ts[i] === CELL_NOSE) {
                const baseIdx = 1 + (noseIdx * 4);
                this.senseNoseInto(org, org.xs[i], org.ys[i], ownCells, input, baseIdx);
                noseIdx++;
            }
        }

        // Eye inputs (SENSOR_INPUTS per eye cell) - placed after nose inputs
        const noseOffset = 1 + (numNoses * 4);
        const sensorPos = org.sensorPositions;
        const numSensorCoords = sensorPos.length;
        for (let i = 0, sensorIdx = 0; i < numSensorCoords; i += 2, sensorIdx++) {
            const sx = sensorPos[i];
            const sy = sensorPos[i + 1];
            this.senseEyeInto(org, sx, sy, ownCells, input, noseOffset + (sensorIdx * SENSOR_INPUTS));
        }

        return input;
    }

    // Eye sensing: single cell directly ahead, encoded as one-hot cell type plus emitter frequency
    senseEyeInto(org, sensorX, sensorY, ownCells, targetArray, offset) {
        for (let i = 0; i < SENSOR_INPUTS; i++) {
            targetArray[offset + i] = 0;
        }

        const targetX = this.wrap(sensorX + DIR_DX[org.facing]);
        const targetY = this.wrap(sensorY + DIR_DY[org.facing]);
        const idx = this.getIdx(targetX, targetY);
        if (ownCells.has(idx)) return;

        const ct = this.ctype[idx];
        const oid = this.owner[idx];
        if (ct === CELL_EMPTY) return;

        if (ct === CELL_EMIT && oid !== -1 && oid !== org.id) {
            const otherOrg = this.organisms.get(oid);
            if (otherOrg && otherOrg.emitSignals.length > 0) {
                const emitIdx = this.getEmitterIndex(otherOrg, targetX, targetY);
                if (emitIdx >= 0 && emitIdx < otherOrg.emitSignals.length) {
                    targetArray[offset + SENSOR_INPUTS - 1] = otherOrg.emitSignals[emitIdx];
                }
            }
            return;
        }

        const channelIdx = EYE_CHANNEL_INDEX[ct];
        if (channelIdx >= 0) {
            targetArray[offset + channelIdx] = 1;
        }
    }

    // Nose sensing: writes 4 floats for density of organic matter in each relative direction
    // [ahead, right, behind, left] relative to organism's facing
    senseNoseInto(org, noseX, noseY, ownCells, targetArray, offset) {
        const size = this.size;
        let totalForward = 0, occupiedForward = 0;
        let totalLeft = 0, occupiedLeft = 0;
        let totalRight = 0, occupiedRight = 0;
        let totalBack = 0, occupiedBack = 0;

        for (let oy = -NOSE_GRID_RADIUS; oy <= NOSE_GRID_RADIUS; oy++) {
            for (let ox = -NOSE_GRID_RADIUS; ox <= NOSE_GRID_RADIUS; ox++) {
                if (ox === 0 && oy === 0) continue;

                const localX = ox;
                const localY = oy;
                const worldDx = localX * SENSE_XX[org.facing] + localY * SENSE_XY[org.facing];
                const worldDy = localX * SENSE_YX[org.facing] + localY * SENSE_YY[org.facing];
                const tx = this.wrap(noseX + worldDx);
                const ty = this.wrap(noseY + worldDy);
                const idx = ty * size + tx;
                const occupied = !ownCells.has(idx) && this.ctype[idx] !== CELL_EMPTY;

                if (oy < 0 && ox <= 1) {
                    totalForward++;
                    if (occupied) occupiedForward++;
                }
                if (ox < 0 && oy >= -1) {
                    totalLeft++;
                    if (occupied) occupiedLeft++;
                }
                if (ox > 0 && oy <= 1) {
                    totalRight++;
                    if (occupied) occupiedRight++;
                }
                if (oy > 0 && ox >= -1) {
                    totalBack++;
                    if (occupied) occupiedBack++;
                }
            }
        }

        targetArray[offset] = totalForward > 0 ? occupiedForward / totalForward : 0;
        targetArray[offset + 1] = totalRight > 0 ? occupiedRight / totalRight : 0;
        targetArray[offset + 2] = totalBack > 0 ? occupiedBack / totalBack : 0;
        targetArray[offset + 3] = totalLeft > 0 ? occupiedLeft / totalLeft : 0;
    }

    // Nose sensing: returns 4 floats for density of organic matter in each relative direction
    // [ahead, right, behind, left] relative to organism's facing
    senseNose(org, noseX, noseY, ownCells) {
        const result = new Float32Array(4);
        this.senseNoseInto(org, noseX, noseY, ownCells, result, 0);
        return result;
    }

    isBlocked(sensorX, sensorY, targetX, targetY, ownCells) {
        // Line-of-sight check on toroidal grid using Bresenham-style grid stepping
        // This avoids rounding artifacts and directional bias
        if (sensorX === targetX && sensorY === targetY) return false;

        const size = this.size;
        const halfSize = size / 2;

        // Calculate shortest path dx/dy considering wraparound
        let dx = targetX - sensorX;
        let dy = targetY - sensorY;

        // Adjust for wraparound (take shorter path across boundary if applicable)
        if (dx > halfSize) dx -= size;
        else if (dx < -halfSize) dx += size;
        if (dy > halfSize) dy -= size;
        else if (dy < -halfSize) dy += size;

        // Bresenham-style line stepping (no floating point, no rounding bias)
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const sx = dx > 0 ? 1 : -1;  // Step direction x
        const sy = dy > 0 ? 1 : -1;  // Step direction y

        let x = sensorX;
        let y = sensorY;
        let err = absDx - absDy;

        // Step through all cells between sensor and target (exclusive of both endpoints)
        const totalSteps = absDx + absDy;
        for (let step = 0; step < totalSteps; step++) {
            const e2 = 2 * err;

            if (e2 > -absDy) {
                err -= absDy;
                x += sx;
            }
            if (e2 < absDx) {
                err += absDx;
                y += sy;
            }

            // Wrap coordinates for torus
            const checkX = this.wrap(x);
            const checkY = this.wrap(y);

            // Stop before reaching target
            if (checkX === targetX && checkY === targetY) break;

            if (ownCells.has(checkY * size + checkX)) {
                return true;  // Blocked by own body
            }
        }

        return false;
    }

    getEmitterIndex(org, x, y) {
        // O(1) lookup using cached emitter cell map (numeric key)
        const idx = org.emitCellMap.get(y * this.size + x);
        return idx !== undefined ? idx : -1;
    }

    consumeBiteTarget(org, tx, ty, stats) {
        const tidx = this.getIdx(tx, ty);
        const ct = this.ctype[tidx];
        const targetOwner = this.owner[tidx];

        // Skip empty cells, shields, and own cells
        if (ct === CELL_EMPTY || ct === CELL_SHIELD || targetOwner === org.id) return false;

        if (ct === CELL_DECAY) {
            this.ctype[tidx] = CELL_EMPTY;
            this.corpseTracker.removeCorpse(tidx);
            const energyCap = REPRO_COST_PER_CELL * org.xs.length * ENERGY_CAP_MULTIPLIER;
            const nextEnergy = Math.min(energyCap, org.energy + E_BITE_GAIN_PER_CELL);
            this.setOrganismEnergy(org, nextEnergy);
            return true;
        }

        if (targetOwner !== -1) {
            const victim = this.organisms.get(targetOwner);
            if (!victim) return false;

            // Consume entire organism at once
            const cellCount = victim.xs.length;
            // Apply digestion loss to BOTH structural and stored energy
            const structuralEnergy = E_BITE_GAIN_PER_CELL * cellCount;
            const storedEnergy = victim.energy * (E_BITE_GAIN_PER_CELL / REPRO_COST_PER_CELL);
            const energyGain = structuralEnergy + storedEnergy;
            const energyCap = REPRO_COST_PER_CELL * org.xs.length * ENERGY_CAP_MULTIPLIER;
            const nextEnergy = Math.min(energyCap, org.energy + energyGain);
            this.setOrganismEnergy(org, nextEnergy);

            // Clear all cells of victim
            this.clearCells(targetOwner);
            this.subtractFromRunningTotals(victim);
            this.organisms.delete(targetOwner);

            stats.deaths++;
            stats.predations++;
            if (stats.predatorSignatures) {
                stats.predatorSignatures.push(org.getSignature());
            }

            if (BITE_DIGEST_COOLDOWN > 0) {
                org._digestCooldown = BITE_DIGEST_COOLDOWN;
            }
            return true;
        }

        return false;
    }

    tryContactBite(org, stats, biteMark) {
        if (org.mouthIdx.length === 0 || org._digestCooldown > 0) return false;

        const mouthStart = org.mouthIdx.length > 1 ? Math.floor(Math.random() * org.mouthIdx.length) : 0;
        const dirStart = Math.floor(Math.random() * 4);

        for (let m = 0; m < org.mouthIdx.length; m++) {
            const mi = org.mouthIdx[(mouthStart + m) % org.mouthIdx.length];
            const mouthX = org.xs[mi];
            const mouthY = org.ys[mi];

            for (let d = 0; d < 4; d++) {
                const dir = (dirStart + d) % 4;
                const tx = this.wrap(mouthX + CONTACT_DX[dir]);
                const ty = this.wrap(mouthY + CONTACT_DY[dir]);

                if (this.consumeBiteTarget(org, tx, ty, stats)) {
                    if (biteMark !== undefined) {
                        org._lastAutoBiteMark = biteMark;
                    }
                    return true;
                }
            }
        }

        return false;
    }

    autoBiteContact(stats) {
        const biteMark = ++this._biteMark;
        const movedFirst = [];
        const stationary = [];

        for (const org of this.organisms.values()) {
            if (org._lastAutoBiteMark === biteMark || org.mouthIdx.length === 0) continue;
            if (org._movedRecently) {
                movedFirst.push(org);
            } else {
                stationary.push(org);
            }
        }

        for (const org of movedFirst) {
            this.tryContactBite(org, stats, biteMark);
        }
        for (const org of stationary) {
            this.tryContactBite(org, stats, biteMark);
        }
    }

    removeCellFromOrg(org, x, y) {
        let idx = -1;
        for (let i = 0; i < org.xs.length; i++) {
            if (org.xs[i] === x && org.ys[i] === y) {
                idx = i;
                break;
            }
        }

        if (idx === -1) return;

        const last = org.xs.length - 1;
        if (idx !== last) {
            org.xs[idx] = org.xs[last];
            org.ys[idx] = org.ys[last];
            org.ts[idx] = org.ts[last];
        }

        org.xs = org.xs.slice(0, -1);
        org.ys = org.ys.slice(0, -1);
        org.ts = org.ts.slice(0, -1);

        if (org.xs.length > 0) {
            this.initCaches(org);
        }
    }

    tryShiftOrg(org, sx, sy) {
        const xs = new Int16Array(org.xs.length);
        const ys = new Int16Array(org.ys.length);

        for (let i = 0; i < org.xs.length; i++) {
            xs[i] = this.wrap(org.xs[i] + sx);
            ys[i] = this.wrap(org.ys[i] + sy);
        }

        for (let i = 0; i < xs.length; i++) {
            const idx = this.getIdx(xs[i], ys[i]);
            const owner = this.owner[idx];
            if (owner !== -1 && owner !== org.id) {
                return false;
            }
        }

        this.clearCells(org.id);
        for (let i = 0; i < xs.length; i++) {
            const idx = this.getIdx(xs[i], ys[i]);
            this.owner[idx] = org.id;
            this.ctype[idx] = org.ts[i];
            if (org.ts[i] === CELL_PHOTO) {
                this.updatePhotoNeighborhood(xs[i], ys[i], 1);
            }
        }

        org.xs = xs;
        org.ys = ys;
        org.cx = this.wrap(org.cx + sx);
        org.cy = this.wrap(org.cy + sy);

        // Update position-related caches after move
        this.updatePositionCaches(org);

        // Note: energy cost is handled by the caller (tick function)
        return true;
    }

    // Update only position-related caches (faster than full initCaches)
    // Reuses existing objects to minimize GC pressure
    updatePositionCaches(org) {
        const size = this.size;
        const n = org.xs.length;

        // Clear and rebuild occupiedSet (reuse the Set object)
        org.occupiedSet.clear();
        for (let i = 0; i < n; i++) {
            org.occupiedSet.add(org.ys[i] * size + org.xs[i]);
        }

        // Rebuild sensorPositions (reuse array, adjust length)
        org.sensorPositions.length = 0;
        for (let i = 0; i < n; i++) {
            if (org.ts[i] === CELL_SENSOR) {
                org.sensorPositions.push(org.xs[i], org.ys[i]);  // Flat array: [x1,y1,x2,y2,...]
            }
        }

        // Clear and rebuild emitCellMap (use numeric key for speed)
        org.emitCellMap.clear();
        let emitIdx = 0;
        for (let i = 0; i < n; i++) {
            if (org.ts[i] === CELL_EMIT) {
                org.emitCellMap.set(org.ys[i] * size + org.xs[i], emitIdx);
                emitIdx++;
            }
        }
    }

    tryRotateOrg(org, clockwise) {
        // Rotate all cells 90° around the organism's center
        const cx = org.cx;
        const cy = org.cy;
        const xs = new Int16Array(org.xs.length);
        const ys = new Int16Array(org.ys.length);

        for (let i = 0; i < org.xs.length; i++) {
            const dx = org.xs[i] - cx;
            const dy = org.ys[i] - cy;

            if (clockwise) {
                // 90° clockwise: (x,y) -> (-y, x) relative to center
                xs[i] = this.wrap(cx - dy);
                ys[i] = this.wrap(cy + dx);
            } else {
                // 90° counter-clockwise: (x,y) -> (y, -x) relative to center
                xs[i] = this.wrap(cx + dy);
                ys[i] = this.wrap(cy - dx);
            }
        }

        // Check if all new positions are free
        for (let i = 0; i < xs.length; i++) {
            const idx = this.getIdx(xs[i], ys[i]);
            const owner = this.owner[idx];
            if (owner !== -1 && owner !== org.id) {
                return false;  // Blocked, can't rotate
            }
        }

        // Clear old positions and place at new positions
        this.clearCells(org.id);
        for (let i = 0; i < xs.length; i++) {
            const idx = this.getIdx(xs[i], ys[i]);
            this.owner[idx] = org.id;
            this.ctype[idx] = org.ts[i];
            if (org.ts[i] === CELL_PHOTO) {
                this.updatePhotoNeighborhood(xs[i], ys[i], 1);
            }
        }

        org.xs = xs;
        org.ys = ys;
        // Center stays the same for rotation

        // Update facing direction
        if (clockwise) {
            org.facing = (org.facing + 1) % 4;
        } else {
            org.facing = (org.facing + 3) % 4;
        }

        // Update position-related caches after rotation
        this.updatePositionCaches(org);

        return true;
    }

    // OPTIMIZATION: O(n) flood fill using position Set for neighbor lookup
    // Torus-aware: cells at opposite edges are considered adjacent
    isContiguous(xs, ys) {
        if (xs.length === 0) return true;
        if (xs.length === 1) return true;

        const size = this.size;

        // Build position Set for O(1) neighbor lookup (using numeric key for speed)
        const positions = new Set();
        for (let i = 0; i < xs.length; i++) {
            // Wrap coordinates to handle organisms that span boundary
            const wx = this.wrap(xs[i]);
            const wy = this.wrap(ys[i]);
            positions.add(wy * size + wx);
        }

        // Flood fill using BFS with index pointer (no shift())
        const visited = new Set();
        const startX = this.wrap(xs[0]);
        const startY = this.wrap(ys[0]);
        const startKey = startY * size + startX;
        const queue = [[startX, startY]];
        let queueHead = 0;
        visited.add(startKey);

        // Direction offsets for 4-connectivity
        const DX = [1, -1, 0, 0];
        const DY = [0, 0, 1, -1];

        while (queueHead < queue.length) {
            const [x, y] = queue[queueHead++];

            // Check 4 neighbors with torus wrapping
            for (let d = 0; d < 4; d++) {
                const nx = this.wrap(x + DX[d]);
                const ny = this.wrap(y + DY[d]);
                const nkey = ny * size + nx;

                if (positions.has(nkey) && !visited.has(nkey)) {
                    visited.add(nkey);
                    queue.push([nx, ny]);
                }
            }
        }

        return visited.size === xs.length;
    }

    mutateBody(xs, ys, ts) {
        // Try multiple times to get a valid contiguous mutation
        for (let attempt = 0; attempt < 10; attempt++) {
            let mxs = Array.from(xs);
            let mys = Array.from(ys);
            let mts = Array.from(ts);
            let n = mxs.length;

            if (n < MAX_CELLS && Math.random() < MUT_ADD_CELL_P) {
                const i = Math.floor(Math.random() * n);
                const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
                const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
                const tnew = [CELL_MUSCLE, CELL_NOSE, CELL_SENSOR, CELL_MOUTH, CELL_PHOTO, CELL_SHIELD, CELL_EMIT][Math.floor(Math.random() * 7)];
                mxs.push(mxs[i] + dx);
                mys.push(mys[i] + dy);
                mts.push(tnew);
                n++;
            }

            if (n > MIN_CELLS && Math.random() < MUT_DEL_CELL_P) {
                // Try deleting each cell and check if result is still contiguous
                const candidates = [];
                for (let j = 0; j < n; j++) {
                    const testXs = mxs.filter((_, idx) => idx !== j);
                    const testYs = mys.filter((_, idx) => idx !== j);
                    if (this.isContiguous(testXs, testYs)) {
                        candidates.push(j);
                    }
                }
                if (candidates.length > 0) {
                    const j = candidates[Math.floor(Math.random() * candidates.length)];
                    mxs.splice(j, 1);
                    mys.splice(j, 1);
                    mts.splice(j, 1);
                    n--;
                }
            }

            if (Math.random() < MUT_SWAP_CELL_P && n > 0) {
                const k = Math.floor(Math.random() * n);
                mts[k] = [CELL_MUSCLE, CELL_NOSE, CELL_SENSOR, CELL_MOUTH, CELL_PHOTO, CELL_SHIELD, CELL_EMIT][Math.floor(Math.random() * 7)];
            }

            if (Math.random() < MUT_JIGGLE_CELL_P && n > 0) {
                const q = Math.floor(Math.random() * n);
                const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
                const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
                mxs[q] += dx;
                mys[q] += dy;
            }

            // Deduplicate cells at the same position (keep first occurrence)
            const seen = new Set();
            const uniqueXs = [];
            const uniqueYs = [];
            const uniqueTs = [];

            for (let i = 0; i < mxs.length; i++) {
                const key = `${mxs[i]},${mys[i]}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueXs.push(mxs[i]);
                    uniqueYs.push(mys[i]);
                    uniqueTs.push(mts[i]);
                }
            }

            // Check if result is contiguous
            if (this.isContiguous(uniqueXs, uniqueYs) && uniqueXs.length > 0) {
                return [uniqueXs, uniqueYs, uniqueTs];
            }
        }

        // If all attempts failed, return unchanged organism
        return [Array.from(xs), Array.from(ys), Array.from(ts)];
    }

    // Rotate coordinates around origin by a number of 90° clockwise steps
    rotateCoordsCW(xs, ys, steps) {
        let rx = xs.slice();
        let ry = ys.slice();
        for (let s = 0; s < steps; s++) {
            const newRx = new Array(rx.length);
            const newRy = new Array(ry.length);
            for (let i = 0; i < rx.length; i++) {
                // 90° clockwise in screen coords: (x, y) -> (-y, x)
                newRx[i] = -ry[i];
                newRy[i] = rx[i];
            }
            rx = newRx;
            ry = newRy;
        }
        return [rx, ry];
    }

    tryReproduce(org, popCap, stats) {
        if (popCap > 0 && this.organisms.size >= popCap) return false;

        const n = org.xs.length;
        if (n < MIN_CELLS) return false;

        const cost = REPRO_COST_PER_CELL * n;
        // Need enough energy for reproduction + small buffer
        if (org.energy < cost + 2) return false;

        // Reserve child ID first to prevent orphaned cells if anything fails partway
        const cid = this.nextId++;

        // Torus-aware centroid calculation for normalizing child body shape
        const anchorX = org.xs[0];
        const anchorY = org.ys[0];
        const halfSize = this.size / 2;
        let sumDx = 0, sumDy = 0;

        for (let i = 0; i < n; i++) {
            let dx = org.xs[i] - anchorX;
            let dy = org.ys[i] - anchorY;
            if (dx > halfSize) dx -= this.size;
            else if (dx < -halfSize) dx += this.size;
            if (dy > halfSize) dy -= this.size;
            else if (dy < -halfSize) dy += this.size;
            sumDx += dx;
            sumDy += dy;
        }

        const cx = Math.round(anchorX + sumDx / n);
        const cy = Math.round(anchorY + sumDy / n);

        // Normalize coordinates relative to centroid (using shortest path)
        const rx = new Array(n);
        const ry = new Array(n);
        for (let i = 0; i < n; i++) {
            let dx = org.xs[i] - cx;
            let dy = org.ys[i] - cy;
            if (dx > halfSize) dx -= this.size;
            else if (dx < -halfSize) dx += this.size;
            if (dy > halfSize) dy -= this.size;
            else if (dy < -halfSize) dy += this.size;
            rx[i] = dx;
            ry[i] = dy;
        }
        const rt = Array.from(org.ts);

        const [mx, my, mt] = this.mutateBody(rx, ry, rt);

        // Determine child's facing - 20% chance of random, otherwise inherit
        const childFacing = Math.random() < 0.2 ? Math.floor(Math.random() * 4) : org.facing;

        // Calculate rotation needed: from parent's facing to child's facing
        const rotationSteps = (childFacing - org.facing + 4) % 4;
        const [rotatedMx, rotatedMy] = this.rotateCoordsCW(mx, my, rotationSteps);

        // Try to find empty space for offspring, starting close and moving outward
        // This prevents overcrowding and allows organisms to spread out
        let placed = false;
        let ox = 0, oy = 0;

        // Try locations at increasing distances from parent center
        // Maximum radius: 8 cells (enough to escape crowding, not too far to be unrealistic)
        for (let radius = 2; radius <= 8 && !placed; radius++) {
            // Generate random angles to try (up to 12 attempts per radius)
            const attempts = Math.min(12, radius * 4);
            const angleStep = (2 * Math.PI) / attempts;

            // Shuffle attempt order to avoid bias
            const angles = [];
            for (let i = 0; i < attempts; i++) {
                angles.push(angleStep * i + Math.random() * angleStep);
            }

            for (const angle of angles) {
                const dx = Math.round(Math.cos(angle) * radius);
                const dy = Math.round(Math.sin(angle) * radius);

                ox = cx + dx;
                oy = cy + dy;

                const xs = rotatedMx.map(x => this.wrap(x + ox));
                const ys = rotatedMy.map(y => this.wrap(y + oy));

                if (this.placeCells(cid, xs, ys, mt)) {
                    placed = true;
                    break;
                }
            }
        }

        if (!placed) {
            return false;  // Couldn't find suitable space
        }

        // Already placed by placeCells call above
        const xs = rotatedMx.map(x => this.wrap(x + ox));
        const ys = rotatedMy.map(y => this.wrap(y + oy));

        // Child gets enough energy to survive for a bit
        const childEnergy = cost * 0.8;

        // Calculate child's body composition to determine NN dimensions
        const childTypeCounts = new Int32Array(10);
        for (let i = 0; i < mt.length; i++) {
            childTypeCounts[mt[i]]++;
        }

        // Get required NN dimensions for child based on its body
        const childDims = calculateNNDimensions(childTypeCounts);

        // Resize parent brain I/O if needed, then mutate
        let childBrain;
        if (childDims.inputs !== org.brain.din || childDims.outputs !== org.brain.dout) {
            // Child has different body composition, resize brain I/O
            childBrain = MultiLayerBrain.resizeIO(org.brain, childDims);
            childBrain = childBrain.cloneMutate();
        } else {
            // Same I/O dimensions, just mutate (hidden layers may still change)
            childBrain = org.brain.cloneMutate();
        }
        childBrain.setIOLayout(childDims);

        // childFacing was already calculated above with body rotation
        const child = new Organism(cid, xs, ys, mt, childEnergy, childBrain, childFacing);
        this.initCaches(child);
        this.organisms.set(cid, child);
        this.addToRunningTotals(child);
        this.adjustOrganismEnergy(org, -cost);

        stats.births++;
        if (stats.birthSignatures) {
            stats.birthSignatures.push(child.getSignature());
        }

        return true;
    }

    tick(popCap, stats) {
        if (this.organisms.size === 0) return;
        this.tickCount++;
        if (this.sunlightMode === SUNLIGHT_MODE_REFUGIA) {
            const phase = Math.floor(this.tickCount / REFUGIA_PHASE_TICKS);
            if (phase !== this._sunlightPhase) {
                this.rebuildSunlightMap();
            }
        }

        const orgs = this._tickOrganisms;
        orgs.length = 0;
        for (const org of this.organisms.values()) {
            if (org._digestCooldown > 0) {
                org._digestCooldown--;
            }
            orgs.push(org);
        }

        // Sense, think, parse outputs, and update emit signals in one pass.
        for (let i = 0; i < orgs.length; i++) {
            const org = orgs[i];
            let parsed = org._parsedAction;
            if (!parsed) {
                parsed = org._parsedAction = {
                    reproduce: 0,
                    forward: 0,
                    backward: 0,
                    rotateCW: 0,
                    rotateCCW: 0
                };
            }

            if (org.energyOnlyPassive) {
                const energyInput = Math.min(1.0, Math.max(0.0, org.energy / (MAX_CELLS * REPRO_COST_PER_CELL)));
                parsed.reproduce = org.brain.getEnergyOnlyReproduce(energyInput);
                parsed.forward = 0;
                parsed.backward = 0;
                parsed.rotateCW = 0;
                parsed.rotateCCW = 0;
                if (org.emitSignals.length > 0) {
                    org.emitSignals.length = 0;
                }
                continue;
            }

            const act = org.brain.forward(this.sense(org));
            let outputIdx = 0;
            parsed.reproduce = act[outputIdx++];

            const numEmitters = org.typeCounts[CELL_EMIT];
            if (numEmitters > 0) {
                if (org.emitSignals.length !== numEmitters) {
                    org.emitSignals = new Array(numEmitters).fill(0.5);
                }
                for (let e = 0; e < numEmitters; e++) {
                    org.emitSignals[e] = 1.0 / (1.0 + Math.exp(-act[outputIdx++]));
                }
            } else if (org.emitSignals.length > 0) {
                org.emitSignals.length = 0;
            }

            if (org.muscleCount > 0) {
                parsed.forward = act[outputIdx++];
                parsed.backward = act[outputIdx++];
                parsed.rotateCW = act[outputIdx++];
                parsed.rotateCCW = act[outputIdx++];
            } else {
                parsed.forward = 0;
                parsed.backward = 0;
                parsed.rotateCW = 0;
                parsed.rotateCCW = 0;
            }
        }

        this.autoBiteContact(stats);

        for (let i = 0; i < orgs.length; i++) {
            orgs[i]._movedRecently = false;
        }

        // Movement (probability-based on muscle ratio)
        for (let i = 0; i < orgs.length; i++) {
            const org = orgs[i];
            if (!this.organisms.has(org.id)) continue;
            if (org.muscleCount === 0) continue;

            const parsed = org._parsedAction;
            const forward = parsed.forward;
            const backward = parsed.backward;
            const rotateCW = parsed.rotateCW;
            const rotateCCW = parsed.rotateCCW;
            const muscleRatio = org.getMuscleRatio();
            const moveWeights = [
                Math.max(0, forward),
                Math.max(0, backward),
                Math.max(0, rotateCW),
                Math.max(0, rotateCCW)
            ];
            const bestVal = Math.max(moveWeights[0], moveWeights[1], moveWeights[2], moveWeights[3]);

            // Only act if there is at least one strong enough movement signal (>0.3)
            // and the organism passes its muscle-ratio movement chance.
            if (bestVal > 0.3 && Math.random() < muscleRatio) {
                let totalWeight = moveWeights[0] + moveWeights[1] + moveWeights[2] + moveWeights[3];
                if (totalWeight <= 0) continue;

                let roll = Math.random() * totalWeight;
                let chosenType = 0; // 0=forward, 1=backward, 2=rotateCW, 3=rotateCCW
                for (let actionIdx = 0; actionIdx < moveWeights.length; actionIdx++) {
                    roll -= moveWeights[actionIdx];
                    if (roll <= 0) {
                        chosenType = actionIdx;
                        break;
                    }
                }

                // Movement cost: pay only for "heavy" cargo cells.
                // Muscles are the engine, and sensory/signaling appendages are treated as lightweight.
                const freeMoveCells =
                    org.muscleCount +
                    org.typeCounts[CELL_SENSOR] +
                    (org.typeCounts[CELL_NOSE] || 0) +
                    org.typeCounts[CELL_EMIT];
                const moveCargoCells = Math.max(0, org.xs.length - freeMoveCells);
                const moveCost = E_MOVE_PER_CELL * moveCargoCells;

                if (chosenType === 0) {
                    const dx = DIR_DX[org.facing];
                    const dy = DIR_DY[org.facing];
                    if (this.tryShiftOrg(org, dx, dy)) {
                        org._movedRecently = true;
                        this.tryContactBite(org, stats);
                        this.adjustOrganismEnergy(org, -moveCost);
                    }
                } else if (chosenType === 1) {
                    const dx = -DIR_DX[org.facing];
                    const dy = -DIR_DY[org.facing];
                    if (this.tryShiftOrg(org, dx, dy)) {
                        org._movedRecently = true;
                        this.tryContactBite(org, stats);
                        this.adjustOrganismEnergy(org, -moveCost);
                    }
                } else if (chosenType === 2) {
                    if (this.tryRotateOrg(org, true)) {
                        org._movedRecently = true;
                        this.tryContactBite(org, stats);
                        this.adjustOrganismEnergy(org, -moveCost);
                    }
                } else if (chosenType === 3) {
                    if (this.tryRotateOrg(org, false)) {
                        org._movedRecently = true;
                        this.tryContactBite(org, stats);
                        this.adjustOrganismEnergy(org, -moveCost);
                    }
                }
            }
        }

        // Reproduction
        for (let i = 0; i < orgs.length; i++) {
            const org = orgs[i];
            if (!this.organisms.has(org.id)) continue;

            const brainWantsRepro = org._parsedAction.reproduce > 0.2;
            const highEnergy = org.energy > (REPRO_COST_PER_CELL * org.xs.length) * 1.8;

            if (brainWantsRepro || highEnergy) {
                this.tryReproduce(org, popCap, stats);
            }
        }

        const dead = this._deadOrganisms;
        const sunlightMap = this.sunlightMap;
        dead.length = 0;
        for (const [oid, org] of this.organisms) {
            // Calculate photosynthesis with light competition
            let photoEnergy = 0;
            for (let i = 0; i < org.xs.length; i++) {
                if (org.ts[i] === CELL_PHOTO) {
                    const x = org.xs[i];
                    const y = org.ys[i];
                    const idx = this.getIdx(x, y);
                    const sunlightFactor = sunlightMap[idx] / 255;
                    if (sunlightFactor <= 0) continue;

                    // Count photo cells in 3×3 neighborhood (including self)
                    let nearbyPhotoCount = this.photoNeighborCounts[idx];
                    for (let dy = 1; dy <= 0; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = this.wrap(x + dx);
                            const ny = this.wrap(y + dy);
                            const nidx = this.getIdx(nx, ny);
                            if (this.ctype[nidx] === CELL_PHOTO) {
                                nearbyPhotoCount++;
                            }
                        }
                    }

                    // Light availability with diminishing returns: 1 / (1 + factor × (N - 1))
                    // Always positive, but decreases as neighbors increase
                    const lightAvailability = 1.0 / (1.0 + LIGHT_COMPETITION_FACTOR * (nearbyPhotoCount - 1));
                    photoEnergy += E_LIGHT * lightAvailability * sunlightFactor;
                }
            }
            // Calculate metabolism.
            // Eyes and noses are treated as passive sensory appendages here, so they
            // do not add baseline upkeep while we are trying to make sensor evolution viable.
            const zeroMetabCells =
                org.typeCounts[CELL_SENSOR] +
                (org.typeCounts[CELL_NOSE] || 0);
            let metabolismCost = E_METAB * Math.max(0, org.xs.length - zeroMetabCells);

            // Brain cost scales with network size
            const brainNodes = org.brain.getTotalNodes();
            metabolismCost += E_BRAIN_PER_NODE * brainNodes;
            metabolismCost += E_BRAIN_PER_HIDDEN_LAYER * org.brain.hiddenSizes.length;

            // Cap energy at a reasonable maximum
            const nextEnergy = org.energy + photoEnergy - metabolismCost;
            const energyCap = REPRO_COST_PER_CELL * org.xs.length * ENERGY_CAP_MULTIPLIER;
            this.setOrganismEnergy(org, Math.min(nextEnergy, energyCap));

            org.age++;

            // Random death
            if (Math.random() < RANDOM_DEATH_PROB) {
                dead.push(org);
            } else if (org.energy <= 0) {
                dead.push(org);
            }
        }

        for (let i = 0; i < dead.length; i++) {
            const org = dead[i];
            if (!this.organisms.has(org.id)) continue;  // Skip if already deleted by predation

            this.subtractFromRunningTotals(org);
            this.organisms.delete(org.id);
            stats.deaths++;

            for (let i = 0; i < org.xs.length; i++) {
                if (org.ts[i] === CELL_PHOTO) {
                    this.updatePhotoNeighborhood(org.xs[i], org.ys[i], -1);
                }
                const idx = this.getIdx(org.xs[i], org.ys[i]);
                this.owner[idx] = -1;
                this.ctype[idx] = CELL_DECAY;
                this.corpseTracker.addCorpse(idx);
            }
        }

        // Decay corpses
        this.corpseTracker.tick(this);
    }

    seedRandomOrganisms(n) {
        console.log(`seedRandomOrganisms called with n=${n}`);
        let successCount = 0;
        for (let i = 0; i < n; i++) {
            const positions = [
                [0, 0], [1, 0], [0, 1], [1, 1], [2, 0]
            ];
            const maxStartCells = Math.min(positions.length, MIN_CELLS + 1);
            const numPhotoCells = MIN_CELLS + Math.floor(Math.random() * (maxStartCells - MIN_CELLS + 1));
            const body = [];

            for (let j = 0; j < numPhotoCells; j++) {
                body.push([positions[j][0], positions[j][1], CELL_PHOTO]);
            }

            try {
                const startEnergy = REPRO_COST_PER_CELL * body.length * 3.0;  // Start with 3x reproduction cost

                // Calculate NN dimensions based on body composition
                const typeCounts = new Int32Array(10);
                for (const [x, y, type] of body) {
                    typeCounts[type]++;
                }
                const dims = calculateNNDimensions(typeCounts);

                const brain = new MultiLayerBrain(dims.inputs, [], dims.outputs).setIOLayout(dims);
                const result = this.addOrganism(body, startEnergy, brain);
                if (result !== null) successCount++;
            } catch (e) {
                console.error(`Error creating organism ${i}:`, e);
            }
        }
        console.log(`Successfully spawned ${successCount}/${n} organisms. Total organisms: ${this.organisms.size}`);
    }

    // Spawn organism from custom template (array of {x, y, type})
    spawnFromTemplate(template) {
        if (!template || template.length < MIN_CELLS) {
            console.warn(`Template must have at least ${MIN_CELLS} cells`);
            return null;
        }

        // Convert template to body format [[x, y, type], ...]
        const body = template.map(cell => [cell.x, cell.y, cell.type]);

        try {
            const startEnergy = REPRO_COST_PER_CELL * body.length * 3.0;

            // Calculate NN dimensions based on body composition
            const typeCounts = new Int32Array(10);
            for (const [x, y, type] of body) {
                typeCounts[type]++;
            }
            const dims = calculateNNDimensions(typeCounts);

            const brain = new MultiLayerBrain(dims.inputs, [], dims.outputs).setIOLayout(dims);
            return this.addOrganism(body, startEnergy, brain);
        } catch (e) {
            console.error('Error spawning from template:', e);
            return null;
        }
    }

    getCellTypeCounts() {
        const counts = new Int32Array(10);
        for (const org of this.organisms.values()) {
            for (let i = 0; i < org.typeCounts.length; i++) {
                counts[i] += org.typeCounts[i];
            }
        }
        return counts;
    }
}
