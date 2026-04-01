// =====================
// Neural Network (MultiLayerBrain) - Evolvable Architecture
// =====================
// Structure: layers = [{weights, biases, size}, ...]
// Layer 0: input -> hidden1, Layer N-1: hiddenN -> output

class MultiLayerBrain {
    constructor(din, hiddenSizes, dout) {
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
                weights: this.randomMatrix(prevSize, size, 0.5),
                biases: new Float32Array(size),
                size: size,
                activations: new Float32Array(size)
            });
            prevSize = size;
        }

        // Output layer
        this.layers.push({
            weights: this.randomMatrix(prevSize, dout, 0.5),
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
            hasMuscles: !!layout.hasMuscles
        } : null;
        return this;
    }

    cloneIOLayout() {
        return this.ioLayout ? { ...this.ioLayout } : null;
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

        for (let i = 0; i < minPrev; i++) {
            for (let j = 0; j < minSize; j++) {
                const oldVal = parentLayer.weights[i * parentLayer.size + j];
                if (Math.random() < 0.05) {
                    childLayer.weights[i * childLayer.size + j] = oldVal + MultiLayerBrain.sampleMutationDelta();
                } else {
                    childLayer.weights[i * childLayer.size + j] = oldVal;
                }
            }
        }

        for (let i = 0; i < minSize; i++) {
            if (Math.random() < 0.05) {
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
        if (!this._energyOnlyReproduceLUT) {
            const buckets = 256;
            const lut = new Float32Array(buckets + 1);
            const input = new Float32Array(1);
            for (let i = 0; i <= buckets; i++) {
                input[0] = i / buckets;
                lut[i] = this.forward(input)[0];
            }
            this._energyOnlyReproduceLUT = lut;
        }

        const lut = this._energyOnlyReproduceLUT;
        const maxIdx = lut.length - 1;
        const idx = Math.max(0, Math.min(maxIdx, Math.round(inputValue * maxIdx)));
        return lut[idx];
    }

    static buildInputIndexMap(oldLayout, newLayout) {
        if (!oldLayout || !newLayout) return null;

        const map = [[0, 0]];  // Energy always stays first
        const sharedNoses = Math.min(oldLayout.numNoses, newLayout.numNoses);
        for (let nose = 0; nose < sharedNoses; nose++) {
            const oldBase = 1 + nose * 4;
            const newBase = 1 + nose * 4;
            for (let j = 0; j < 4; j++) {
                map.push([oldBase + j, newBase + j]);
            }
        }

        const sharedSensors = Math.min(oldLayout.numSensors, newLayout.numSensors);
        const oldSensorBase = 1 + oldLayout.numNoses * 4;
        const newSensorBase = 1 + newLayout.numNoses * 4;
        for (let sensor = 0; sensor < sharedSensors; sensor++) {
            const oldBase = oldSensorBase + sensor * SENSOR_INPUTS;
            const newBase = newSensorBase + sensor * SENSOR_INPUTS;
            for (let j = 0; j < SENSOR_INPUTS; j++) {
                map.push([oldBase + j, newBase + j]);
            }
        }

        return map;
    }

    static buildOutputIndexMap(oldBrain, newBrain) {
        const oldLayout = oldBrain.ioLayout;
        const newLayout = newBrain.ioLayout;
        if (!oldLayout || !newLayout) return null;

        const oldHasBiteOutput =
            oldBrain.dout === 2 + oldLayout.numEmitters + (oldLayout.hasMuscles ? 4 : 0);
        const newHasBiteOutput =
            newBrain.dout === 2 + newLayout.numEmitters + (newLayout.hasMuscles ? 4 : 0);
        const oldReproduceIdx = oldHasBiteOutput ? 1 : 0;
        const newReproduceIdx = newHasBiteOutput ? 1 : 0;
        const oldEmitterBase = oldReproduceIdx + 1;
        const newEmitterBase = newReproduceIdx + 1;

        const map = [
            [oldReproduceIdx, newReproduceIdx]
        ];

        const sharedEmitters = Math.min(oldLayout.numEmitters, newLayout.numEmitters);
        for (let emitter = 0; emitter < sharedEmitters; emitter++) {
            map.push([oldEmitterBase + emitter, newEmitterBase + emitter]);
        }

        if (oldLayout.hasMuscles && newLayout.hasMuscles) {
            const oldMoveBase = oldBrain.dout - 4;
            const newMoveBase = newBrain.dout - 4;
            for (let j = 0; j < 4; j++) {
                map.push([oldMoveBase + j, newMoveBase + j]);
            }
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

    // Resize for new input/output dimensions (when body changes)
    static resizeIO(oldBrain, newDims) {
        const newBrain = new MultiLayerBrain(newDims.inputs, oldBrain.hiddenSizes, newDims.outputs)
            .setIOLayout(newDims);

        // Copy first-layer weights using semantic input positions rather than raw indices.
        if (oldBrain.layers.length > 0 && newBrain.layers.length > 0) {
            const oldL = oldBrain.layers[0];
            const newL = newBrain.layers[0];
            const minOut = Math.min(oldL.size, newL.size);
            const inputMap = MultiLayerBrain.buildInputIndexMap(oldBrain.ioLayout, newBrain.ioLayout);
            const mappedNewInputs = new Set();

            newL.weights.fill(0);

            if (inputMap) {
                for (const [oldIdx, newIdx] of inputMap) {
                    if (oldIdx >= oldBrain.din || newIdx >= newBrain.din) continue;
                    mappedNewInputs.add(newIdx);
                    for (let j = 0; j < minOut; j++) {
                        newL.weights[newIdx * newL.size + j] = oldL.weights[oldIdx * oldL.size + j];
                    }
                }
            } else {
                const minIn = Math.min(oldBrain.din, newBrain.din);
                for (let i = 0; i < minIn; i++) {
                    mappedNewInputs.add(i);
                    for (let j = 0; j < minOut; j++) {
                        newL.weights[i * newL.size + j] = oldL.weights[i * oldL.size + j];
                    }
                }
            }

            // Give brand-new sensory channels a weak initial influence instead of starting inert.
            for (let i = 0; i < newBrain.din; i++) {
                if (mappedNewInputs.has(i)) continue;
                for (let j = 0; j < minOut; j++) {
                    newL.weights[i * newL.size + j] = (Math.random() - 0.5) * 0.1;
                }
            }

            for (let i = 0; i < minOut; i++) {
                newL.biases[i] = oldL.biases[i];
            }
        }

        // Copy middle layers entirely.
        for (let l = 1; l < oldBrain.layers.length - 1 && l < newBrain.layers.length - 1; l++) {
            newBrain.layers[l] = {
                weights: oldBrain.layers[l].weights.slice(),
                biases: oldBrain.layers[l].biases.slice(),
                size: oldBrain.layers[l].size,
                activations: new Float32Array(oldBrain.layers[l].size)
            };
        }

        // Copy last-layer weights using semantic output positions.
        const oldLast = oldBrain.layers[oldBrain.layers.length - 1];
        const newLast = newBrain.layers[newBrain.layers.length - 1];
        const prevSize = oldBrain.hiddenSizes.length > 0 ?
            oldBrain.hiddenSizes[oldBrain.hiddenSizes.length - 1] : oldBrain.din;
        const newPrevSize = newBrain.hiddenSizes.length > 0 ?
            newBrain.hiddenSizes[newBrain.hiddenSizes.length - 1] : newBrain.din;
        const minPrev = Math.min(prevSize, newPrevSize);
        const outputMap = MultiLayerBrain.buildOutputIndexMap(oldBrain, newBrain);
        const mappedNewOutputs = new Set();

        newLast.weights.fill(0);

        if (outputMap) {
            for (const [oldIdx, newIdx] of outputMap) {
                if (oldIdx >= oldBrain.dout || newIdx >= newBrain.dout) continue;
                mappedNewOutputs.add(newIdx);
                for (let i = 0; i < minPrev; i++) {
                    newLast.weights[i * newLast.size + newIdx] = oldLast.weights[i * oldLast.size + oldIdx];
                }
                newLast.biases[newIdx] = oldLast.biases[oldIdx];
            }
        } else {
            const minOut = Math.min(oldBrain.dout, newBrain.dout);
            for (let i = 0; i < minPrev; i++) {
                for (let j = 0; j < minOut; j++) {
                    newLast.weights[i * newLast.size + j] = oldLast.weights[i * oldLast.size + j];
                    mappedNewOutputs.add(j);
                }
            }
            for (let i = 0; i < minOut; i++) {
                newLast.biases[i] = oldLast.biases[i];
            }
        }

        MultiLayerBrain.applyDefaultOutputBiases(newBrain, mappedNewOutputs);
        return newBrain;
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
        } else if (newHiddenSizes.length > 1 && Math.random() < 0.003 * structScale) {
            // Remove hidden layer (very rare: 0.3%, only if >1 layer)
            const removeIdx = Math.floor(Math.random() * newHiddenSizes.length);
            newHiddenSizes.splice(removeIdx, 1);
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
        const child = new MultiLayerBrain(this.din, newHiddenSizes, this.dout);
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
