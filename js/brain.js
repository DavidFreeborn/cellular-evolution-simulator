// =====================
// Neural Network (MultiLayerBrain) - Evolvable Architecture
// =====================
// Structure: layers = [{weights, biases, size}, ...]
// Layer 0: input -> hidden1, Layer N-1: hiddenN -> output

class MultiLayerBrain {
    constructor(din, hiddenSizes, dout, randomize = true) {
        this.din = din;
        this.dout = dout;
        this.hiddenSizes = hiddenSizes.slice();  // Array of hidden layer sizes
        this.layers = [];
        this.ioLayout = null;

        // Build layers
        let prevSize = din;
        for (let i = 0; i < hiddenSizes.length; i++) {
            const size = hiddenSizes[i];
            this.layers.push({
                weights: randomize ? this.randomMatrix(prevSize, size, 0.5) : new Float32Array(prevSize * size),
                biases: new Float32Array(size),
                size: size,
                activations: new Float32Array(size)
            });
            prevSize = size;
        }

        // Output layer
        this.layers.push({
            weights: randomize ? this.randomMatrix(prevSize, dout, 0.5) : new Float32Array(prevSize * dout),
            biases: new Float32Array(dout),
            size: dout,
            activations: new Float32Array(dout)
        });
    }

    setIOLayout(layout) {
        this.ioLayout = layout ? {
            numNoses: layout.numNoses || 0,
            numSensors: layout.numSensors || 0,
            numEmitters: layout.numEmitters || 0,
            hasMuscles: !!layout.hasMuscles,
            noseIds: layout.noseIds?.slice(),
            sensorIds: layout.sensorIds?.slice(),
            emitterIds: layout.emitterIds?.slice()
        } : null;
        return this;
    }

    cloneIOLayout() {
        return this.ioLayout ? {
            ...this.ioLayout,
            noseIds: this.ioLayout.noseIds?.slice(),
            sensorIds: this.ioLayout.sensorIds?.slice(),
            emitterIds: this.ioLayout.emitterIds?.slice()
        } : null;
    }

    randomMatrix(rows, cols, scale) {
        const mat = new Float32Array(rows * cols);
        for (let i = 0; i < mat.length; i++) {
            mat[i] = (Math.random() - 0.5) * 2 * scale;
        }
        return mat;
    }

    static copyLayerInto(parentLayer, childLayer) {
        childLayer.weights.set(parentLayer.weights);
        childLayer.biases.set(parentLayer.biases);
    }

    static copyOverlapMutating(parentLayer, childLayer, parentPrevSize, childPrevSize) {
        const minPrev = Math.min(parentPrevSize, childPrevSize);
        const minSize = Math.min(parentLayer.size, childLayer.size);
        const mutationProbability = Math.min(1, 0.05 * MUT_WEIGHT_SIGMA / 0.02);

        for (let i = 0; i < minPrev; i++) {
            for (let j = 0; j < minSize; j++) {
                const oldVal = parentLayer.weights[i * parentLayer.size + j];
                if (Math.random() < mutationProbability) {
                    childLayer.weights[i * childLayer.size + j] = oldVal + MultiLayerBrain.sampleMutationDelta();
                } else {
                    childLayer.weights[i * childLayer.size + j] = oldVal;
                }
            }
        }

        for (let i = 0; i < minSize; i++) {
            if (Math.random() < mutationProbability) {
                childLayer.biases[i] = parentLayer.biases[i] + MultiLayerBrain.sampleMutationDelta();
            } else {
                childLayer.biases[i] = parentLayer.biases[i];
            }
        }
    }

    static sampleMutationDelta() {
        // Weighted mixture of small and occasional large jumps.
        // 40%: ±0.01, 30%: ±0.05, 20%: ±0.1, 10%: ±0.5
        const roll = Math.random();
        let maxStep;
        if (roll < 0.4) {
            maxStep = 0.01;
        } else if (roll < 0.7) {
            maxStep = 0.05;
        } else if (roll < 0.9) {
            maxStep = 0.1;
        } else {
            maxStep = 0.5;
        }
        return (Math.random() - 0.5) * 2 * maxStep;
    }

    static insertApproxIdentityLayer(parentBrain, childBrain, insertIdx) {
        const identityScale = 0.25;
        const insertedLayer = childBrain.layers[insertIdx];
        const downstreamLayer = childBrain.layers[insertIdx + 1];
        const parentDownstream = parentBrain.layers[insertIdx];
        const width = insertIdx === 0 ? parentBrain.din : parentBrain.layers[insertIdx - 1].size;

        insertedLayer.weights.fill(0);
        insertedLayer.biases.fill(0);
        downstreamLayer.weights.fill(0);

        for (let i = 0; i < width; i++) {
            insertedLayer.weights[i * insertedLayer.size + i] = identityScale;
        }

        for (let i = 0; i < width; i++) {
            for (let j = 0; j < downstreamLayer.size; j++) {
                downstreamLayer.weights[i * downstreamLayer.size + j] =
                    parentDownstream.weights[i * parentDownstream.size + j] / identityScale;
            }
        }
        downstreamLayer.biases.set(parentDownstream.biases);
    }

    forward(input) {
        let current = input;
        for (let l = 0; l < this.layers.length; l++) {
            const layer = this.layers[l];
            const prevSize = l === 0 ? this.din : this.layers[l - 1].size;
            const next = layer.activations;

            for (let i = 0; i < layer.size; i++) {
                let sum = layer.biases[i];
                for (let j = 0; j < prevSize; j++) {
                    sum += current[j] * layer.weights[j * layer.size + i];
                }
                next[i] = Math.tanh(sum);
            }
            current = next;
        }
        return current;
    }

    getTotalNodes() {
        let total = this.din + this.dout;
        for (const size of this.hiddenSizes) {
            total += size;
        }
        return total;
    }

    getEnergyOnlyReproduce(inputValue) {
        // Exact evaluation: a quantised lookup can flip the reproduction threshold.
        if (this.layers.length === 1) {
            const layer = this.layers[0];
            return Math.fround(Math.tanh(layer.biases[0] + inputValue * layer.weights[0]));
        }
        if (!this._energyInput) this._energyInput = new Float32Array(1);
        this._energyInput[0] = inputValue;
        return this.forward(this._energyInput)[0];
    }

    static channelPairs(oldIds, newIds, oldCount, newCount) {
        if (oldIds && newIds) {
            const positions = new Map(newIds.map((id, index) => [id, index]));
            return oldIds.flatMap((id, index) => positions.has(id) ? [[index, positions.get(id)]] : []);
        }
        return Array.from({ length: Math.min(oldCount, newCount) }, (_, i) => [i, i]);
    }

    static sameIOLayout(a, b) {
        if (!a || !b) return false;
        for (const key of ['numNoses', 'numSensors', 'numEmitters', 'hasMuscles']) {
            if (a[key] !== b[key]) return false;
        }
        return ['noseIds', 'sensorIds', 'emitterIds'].every(key =>
            (!a[key] && !b[key]) || (a[key] && b[key] && a[key].length === b[key].length &&
                a[key].every((id, index) => id === b[key][index])));
    }

    static buildInputIndexMap(oldLayout, newLayout) {
        if (!oldLayout || !newLayout) return null;
        const map = [[0, 0]];
        for (const [oldNose, newNose] of this.channelPairs(oldLayout.noseIds, newLayout.noseIds,
            oldLayout.numNoses, newLayout.numNoses)) {
            for (let j = 0; j < 4; j++) map.push([1 + oldNose * 4 + j, 1 + newNose * 4 + j]);
        }
        for (const [oldEye, newEye] of this.channelPairs(oldLayout.sensorIds, newLayout.sensorIds,
            oldLayout.numSensors, newLayout.numSensors)) {
            for (let j = 0; j < SENSOR_INPUTS; j++) {
                map.push([1 + oldLayout.numNoses * 4 + oldEye * SENSOR_INPUTS + j,
                    1 + newLayout.numNoses * 4 + newEye * SENSOR_INPUTS + j]);
            }
        }
        return map;
    }

    static buildOutputIndexMap(oldBrain, newBrain) {
        const a = oldBrain.ioLayout, b = newBrain.ioLayout;
        if (!a || !b) return null;
        const map = [[0, 0]];
        for (const [oldEmitter, newEmitter] of this.channelPairs(a.emitterIds, b.emitterIds,
            a.numEmitters, b.numEmitters)) map.push([1 + oldEmitter, 1 + newEmitter]);
        if (a.hasMuscles && b.hasMuscles) {
            for (let j = 0; j < 4; j++) map.push([oldBrain.dout - 4 + j, newBrain.dout - 4 + j]);
        }
        return map;
    }

    static applyDefaultOutputBiases(brain, mappedNewOutputs) {
        const mapped = mappedNewOutputs || new Set();
        const layout = brain.ioLayout || { hasMuscles: false };
        const outputLayer = brain.layers[brain.layers.length - 1];

        for (let i = 0; i < brain.dout; i++) {
            if (mapped.has(i)) continue;

            const isMovementOutput = layout.hasMuscles && i >= brain.dout - 4;
            if (isMovementOutput) {
                const movementIdx = i - (brain.dout - 4);
                outputLayer.biases[i] = movementIdx === 0 ? 0.5 : -0.3;
            } else {
                outputLayer.biases[i] = 0.5;
            }
        }
    }

    // Map both axes together when the first and last layers are the same matrix.
    static resizeIO(oldBrain, newDims) {
        const child = new MultiLayerBrain(newDims.inputs, oldBrain.hiddenSizes, newDims.outputs, false)
            .setIOLayout(newDims);
        const inputMap = this.buildInputIndexMap(oldBrain.ioLayout, child.ioLayout) ||
            Array.from({ length: Math.min(oldBrain.din, child.din) }, (_, i) => [i, i]);
        const outputMap = this.buildOutputIndexMap(oldBrain, child) ||
            Array.from({ length: Math.min(oldBrain.dout, child.dout) }, (_, i) => [i, i]);
        const mappedInputs = new Set(inputMap.map(pair => pair[1]));
        const mappedOutputs = new Set(outputMap.map(pair => pair[1]));
        const first = child.layers[0], oldFirst = oldBrain.layers[0];
        first.weights.fill(0);
        const firstOutputs = oldBrain.hiddenSizes.length ?
            Array.from({ length: first.size }, (_, i) => [i, i]) : outputMap;
        for (const [oldIn, newIn] of inputMap) {
            for (const [oldOut, newOut] of firstOutputs) {
                first.weights[newIn * first.size + newOut] = oldFirst.weights[oldIn * oldFirst.size + oldOut];
            }
        }
        for (let i = 0; i < child.din; i++) {
            if (mappedInputs.has(i)) continue;
            for (let j = 0; j < first.size; j++) first.weights[i * first.size + j] = (Math.random() - .5) * .1;
        }
        for (const [oldOut, newOut] of firstOutputs) first.biases[newOut] = oldFirst.biases[oldOut];
        if (oldBrain.hiddenSizes.length) {
            for (let l = 1; l < child.layers.length - 1; l++) this.copyLayerInto(oldBrain.layers[l], child.layers[l]);
            const last = child.layers.at(-1), oldLast = oldBrain.layers.at(-1);
            last.weights.fill(0);
            const width = oldBrain.hiddenSizes.at(-1);
            for (const [oldOut, newOut] of outputMap) {
                for (let i = 0; i < width; i++) last.weights[i * last.size + newOut] = oldLast.weights[i * oldLast.size + oldOut];
                last.biases[newOut] = oldLast.biases[oldOut];
            }
        }
        this.applyDefaultOutputBiases(child, mappedOutputs);
        return child;
    }

    removeHiddenLayer(index) {
        const sizes = this.hiddenSizes.slice();
        sizes.splice(index, 1);
        const child = new MultiLayerBrain(this.din, sizes, this.dout, false).setIOLayout(this.ioLayout);
        for (let l = 0; l < child.layers.length; l++) {
            if (l !== index) {
                MultiLayerBrain.copyLayerInto(this.layers[l < index ? l : l + 1], child.layers[l]);
                continue;
            }
            // Compose a local linearisation of the removed tanh layer at zero input.
            // Exact equivalence is impossible in general; unaffected layers retain their parameters.
            const incoming = this.layers[index], outgoing = this.layers[index + 1], bridge = child.layers[l];
            const width = index === 0 ? this.din : this.hiddenSizes[index - 1];
            bridge.weights.fill(0);
            bridge.biases.set(outgoing.biases);
            for (let k = 0; k < incoming.size; k++) {
                const activation = Math.tanh(incoming.biases[k]);
                const slope = 1 - activation * activation;
                for (let j = 0; j < outgoing.size; j++) {
                    const weight = outgoing.weights[k * outgoing.size + j];
                    bridge.biases[j] += activation * weight;
                    for (let i = 0; i < width; i++) {
                        bridge.weights[i * bridge.size + j] += incoming.weights[i * incoming.size + k] * slope * weight;
                    }
                }
            }
        }
        return child;
    }

    cloneMutate() {
        // Deep copy hidden sizes
        let newHiddenSizes = this.hiddenSizes.slice();

        // Structural mutations (probabilities scaled by MUT_WEIGHT_SIGMA)
        const structScale = MUT_WEIGHT_SIGMA / 0.05;  // Normalize to baseline
        let insertedLayerIdx = -1;

        // Add hidden layer (very rare: 0.5%)
        if (Math.random() < 0.005 * structScale) {
            const insertIdx = Math.floor(Math.random() * (newHiddenSizes.length + 1));
            const newSize = insertIdx === 0 ? this.din : newHiddenSizes[insertIdx - 1];
            newHiddenSizes.splice(insertIdx, 0, newSize);
            insertedLayerIdx = insertIdx;
        } else if (newHiddenSizes.length > 0 && Math.random() < 0.003 * structScale) {
            return this.removeHiddenLayer(Math.floor(Math.random() * newHiddenSizes.length));
        }

        // Add node to random layer (2%)
        if (insertedLayerIdx === -1 && newHiddenSizes.length > 0 && Math.random() < 0.02 * structScale) {
            const layerIdx = Math.floor(Math.random() * newHiddenSizes.length);
            newHiddenSizes[layerIdx]++;
        }

        // Remove node from random layer (1.5%, only if layer has >1 node)
        if (insertedLayerIdx === -1 && newHiddenSizes.length > 0 && Math.random() < 0.015 * structScale) {
            const layerIdx = Math.floor(Math.random() * newHiddenSizes.length);
            if (newHiddenSizes[layerIdx] > 1) {
                newHiddenSizes[layerIdx]--;
            }
        }

        // Create new brain with potentially modified structure
        const shapeChanged = newHiddenSizes.length !== this.hiddenSizes.length ||
            newHiddenSizes.some((size, i) => size !== this.hiddenSizes[i]);
        const child = new MultiLayerBrain(this.din, newHiddenSizes, this.dout, shapeChanged && insertedLayerIdx === -1);
        child.setIOLayout(this.cloneIOLayout());

        if (insertedLayerIdx !== -1) {
            for (let l = 0; l < insertedLayerIdx; l++) {
                MultiLayerBrain.copyLayerInto(this.layers[l], child.layers[l]);
            }

            MultiLayerBrain.insertApproxIdentityLayer(this, child, insertedLayerIdx);

            for (let l = insertedLayerIdx + 1; l < this.layers.length; l++) {
                MultiLayerBrain.copyLayerInto(this.layers[l], child.layers[l + 1]);
            }
        } else {
            // Copy and mutate weights from parent
            const numLayers = Math.min(this.layers.length, child.layers.length);
            for (let l = 0; l < numLayers; l++) {
                const parentLayer = this.layers[l];
                const childLayer = child.layers[l];
                const parentPrevSize = l === 0 ? this.din : this.layers[l - 1].size;
                const childPrevSize = l === 0 ? child.din : child.layers[l - 1].size;
                MultiLayerBrain.copyOverlapMutating(parentLayer, childLayer, parentPrevSize, childPrevSize);
            }
        }

        return child;
    }
}
