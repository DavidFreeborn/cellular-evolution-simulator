// =====================
// Simulator Controller
// =====================

class Simulator {
    constructor() {
        this.world = null;
        this.canvas = null;
        this.ctx = null;
        this.running = false;
        this.generation = 0;
        this.speed = 15;
        this.popCap = 0;  // No limit by default
        this.selectedOrg = null;
        this.showGrid = false;
        this.zoom = 0.40;  // Default to 40%

        // OPTIMIZATION: Reusable render buffers (avoid GC pressure)
        this._worldCanvas = null;
        this._worldCtx = null;
        this._worldImageData = null;
        this._worldPixels = null;
        this._renderPalettes = null;

        // Recent history (full resolution, last 2000 ticks)
        this.popHistory = [];
        this.energyHistory = [];
        this.diversityHistory = [];
        this.cellDistHistory = [];  // Array of {muscle, sensor, mouth, photo, shield, emit, decay} objects
        this.extinctionHistory = [];
        this.maxHistoryLength = 2000;  // Recent history window
        this.sidebarChartWindow = 500; // Sidebar charts show only last N ticks

        // Compressed history (older data in chunks)
        this.compressedPopHistory = [];      // [{min, max, avg, final}, ...]
        this.compressedDivHistory = [];
        this.compressedCellDistHistory = []; // [{muscle: {min,max,avg,final}, ...}, ...]
        this.activeSpeciesSignatures = new Set();
        this.ticksPerChunk = 1000;
        this.recentHistoryStartTick = 0;     // Tick number of first entry in recent history

        // Species history tracking (signature -> stats)
        this.speciesHistory = new Map();     // Map<signature, {firstSeen, lastSeen, peakPop, peakTick, totalOrgs, totalKills}>

        // Statistics
        this.stats = {
            births: 0,
            deaths: 0,
            predations: 0,
            predatorSignatures: [],
            birthSignatures: []
        };
    }

    init() {
        try {
            console.log('Initializing simulator...');
            this.world = new World(GRID_SIZE);
            this.world.setSunlightMode(SUNLIGHT_MODE);
            this.canvas = document.getElementById('sim-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.generation = 0;

            // Reset recent history
            this.popHistory = [];
            this.energyHistory = [];
            this.diversityHistory = [];
            this.cellDistHistory = [];
            this.extinctionHistory = [];

            // Reset compressed history
            this.compressedPopHistory = [];
            this.compressedDivHistory = [];
            this.compressedCellDistHistory = [];
            this.activeSpeciesSignatures = new Set();
            this.recentHistoryStartTick = 0;

            // Reset species history
            this.speciesHistory = new Map();

            this.selectedOrg = null;
            this.hideOrgInspector();

            this.stats = {
                births: 0,
                deaths: 0,
                predations: 0,
                predatorSignatures: [],
                birthSignatures: []
            };

            // Set canvas size based on zoom (use rounded cell size for pixel-perfect rendering)
            const cellSize = Math.round(CELL_SIZE * this.zoom);
            const canvasSize = cellSize * this.world.size;
            this.canvas.width = canvasSize;
            this.canvas.height = canvasSize;
            this.initRenderBuffers();

            this.world.seedRandomOrganisms(30);
            this.updateStats(true);  // Force initial UI update
            this.render();
            console.log('Simulator initialized successfully');
        } catch (e) {
            console.error('Error during initialization:', e);
            alert('Error starting simulation: ' + e.message);
        }
    }

    step(shouldRender = true) {
        // Track predation by species (array of predator signatures)
        this.stats.predatorSignatures.length = 0;
        this.stats.birthSignatures.length = 0;
        this.world.tick(this.popCap, this.stats);

        // Record each predation for species history
        for (const sig of this.stats.predatorSignatures) {
            this.recordPredation(sig);
        }
        this.generation++;
        this.updateStats();

        // OPTIMIZATION: Skip rendering when tab is hidden (background mode)
        // The simulation still runs, but we don't waste CPU on invisible frames
        if (shouldRender && !document.hidden) {
            this.render();
        }
    }

    stepBatch(stepCount) {
        if (stepCount <= 0) return;

        for (let i = 0; i < stepCount; i++) {
            this.step(false);
        }

        if (!document.hidden) {
            this.render();
        }
    }

    // OPTIMIZATION: Separate data collection from UI rendering
    // Always collect data, but only update DOM every UI_UPDATE_INTERVAL ticks
    updateStats(forceUpdate = false) {
        const pop = this.world.organisms.size;

        // Track cell distribution using running totals (O(1) instead of O(n*cells))
        const counts = this.world.getRunningCellCounts();
        const cellDist = {
            muscle: counts[CELL_MUSCLE],
            nose: counts[CELL_NOSE] || 0,
            sensor: counts[CELL_SENSOR],
            mouth: counts[CELL_MOUTH],
            photo: counts[CELL_PHOTO],
            shield: counts[CELL_SHIELD],
            emit: counts[CELL_EMIT],
            decay: this.world.corpseTracker.corpses.size
        };

        // Running total energy is maintained incrementally inside the world.
        const totalEnergy = this.world.getRunningTotalEnergy();
        const speciesCounts = this.world.getRunningSpeciesCounts();
        const birthCounts = new Map();
        for (const sig of this.stats.birthSignatures || []) {
            birthCounts.set(sig, (birthCounts.get(sig) || 0) + 1);
        }
        let extinctionsThisTick = 0;
        for (const sig of this.activeSpeciesSignatures) {
            if (!speciesCounts.has(sig)) {
                extinctionsThisTick++;
            }
        }
        this.activeSpeciesSignatures = new Set(speciesCounts.keys());

        // Diversity is simply the number of unique species
        const diversity = speciesCounts.size;

        // Update species history
        for (const [sig, count] of speciesCounts) {
            if (!this.speciesHistory.has(sig)) {
                // Store example body shape (normalized coordinates)
                const exampleOrg = this.world.getExampleOrgForSignature(sig);
                const exampleBody = this.extractBodyShape(exampleOrg);
                this.speciesHistory.set(sig, {
                    firstSeen: this.generation,
                    lastSeen: this.generation,
                    peakPop: count,
                    peakTick: this.generation,
                    totalOrgs: birthCounts.get(sig) || count,
                    totalKills: 0,
                    exampleBody: exampleBody  // {xs, ys, ts} normalized to origin
                });
            } else {
                const stats = this.speciesHistory.get(sig);
                stats.lastSeen = this.generation;
                if (count > stats.peakPop) {
                    stats.peakPop = count;
                    stats.peakTick = this.generation;
                }
                if (birthCounts.has(sig)) {
                    stats.totalOrgs += birthCounts.get(sig);
                }
            }
            birthCounts.delete(sig);
        }

        for (const [sig, births] of birthCounts) {
            if (this.speciesHistory.has(sig)) {
                this.speciesHistory.get(sig).totalOrgs += births;
            }
        }

        // Always collect history data
        this.popHistory.push(pop);
        this.energyHistory.push(totalEnergy);
        this.diversityHistory.push(diversity);
        this.cellDistHistory.push(cellDist);
        this.extinctionHistory.push(extinctionsThisTick);

        // Compress old data when recent history exceeds maxHistoryLength
        if (this.popHistory.length > this.maxHistoryLength) {
            this.compressOldHistory();
        }

        // OPTIMIZATION: Only update DOM every UI_UPDATE_INTERVAL ticks
        const shouldUpdateUI = forceUpdate || (this.generation % UI_UPDATE_INTERVAL === 0);

        if (shouldUpdateUI) {
            document.getElementById('stat-generation').textContent = this.generation;
            document.getElementById('stat-population').textContent = pop;
            document.getElementById('stat-energy').textContent = Math.round(totalEnergy);
            document.getElementById('stat-diversity').textContent = diversity;
            document.getElementById('stat-births').textContent = this.stats.births;
            document.getElementById('stat-deaths').textContent = this.stats.deaths;
            document.getElementById('stat-predations').textContent = this.stats.predations;

            this.renderPopChart();
            this.renderDiversityChart();
            this.renderCellDistChart();
            this.updateCellDistribution();
            this.updateTopSpeciesDetail();
        }

        // Always update organism inspector if one is selected (it's for a single organism, not expensive)
        if (this.selectedOrg && this.world.organisms.has(this.selectedOrg)) {
            if (shouldUpdateUI) {
                this.updateOrgInspector(this.world.organisms.get(this.selectedOrg));
            }
        } else if (this.selectedOrg) {
            this.selectedOrg = null;
            this.hideOrgInspector();
        }
    }

    getDiversity() {
        const signatures = new Set();
        for (const org of this.world.organisms.values()) {
            signatures.add(org.getSignature());
        }
        return signatures.size;
    }

    updateCellDistribution() {
        const counts = this.world.getRunningCellCounts();
        const decayCount = this.world.corpseTracker.corpses.size;
        let total = decayCount;
        for (const ctype of SIG_TYPES) {
            total += counts[ctype];
        }

        const container = document.getElementById('cell-dist-bars');
        container.innerHTML = '';

        if (total === 0) return;

        for (const ctype of SIG_TYPES) {
            const count = counts[ctype];
            const pct = (count / total) * 100;

            const bar = document.createElement('div');
            bar.className = 'cell-bar';
            bar.innerHTML = `
                <div class="cell-bar-label">${CELL_NAMES[ctype]}</div>
                <div class="cell-bar-bg">
                    <div class="cell-bar-fill" style="width: ${pct}%; background: ${CELL_COLORS[ctype]};"></div>
                </div>
                <div class="cell-bar-count">${count}</div>
            `;
            container.appendChild(bar);
        }

        // Add decay cells
        const decayPct = (decayCount / total) * 100;
        const decayBar = document.createElement('div');
        decayBar.className = 'cell-bar';
        decayBar.innerHTML = `
            <div class="cell-bar-label">${CELL_NAMES[CELL_DECAY]}</div>
            <div class="cell-bar-bg">
                <div class="cell-bar-fill" style="width: ${decayPct}%; background: ${CELL_COLORS[CELL_DECAY]};"></div>
            </div>
            <div class="cell-bar-count">${decayCount}</div>
        `;
        container.appendChild(decayBar);
    }

    getTopSpecies(topN = 10) {
        const species = [];
        const speciesCounts = this.world.getRunningSpeciesCounts();

        for (const [signature, count] of speciesCounts) {
            const exampleOrg = this.world.getExampleOrgForSignature(signature);
            if (!exampleOrg) continue;

            const typeCounts = {};
            for (const ctype of SIG_TYPES) {
                typeCounts[ctype] = exampleOrg.typeCounts[ctype] * count;
            }

            species.push({
                signature,
                count,
                typeCounts,
                brain: exampleOrg.brain,
                avgCells: exampleOrg.xs.length
            });
        }

        // Sort by population count
        species.sort((a, b) => b.count - a.count);

        return species.slice(0, topN);
    }

    updateTopSpeciesDetail() {
        const topSpecies = this.getTopSpecies(5);  // Top 5 for left panel
        const container = document.getElementById('top-species-detail');

        if (topSpecies.length === 0) {
            container.innerHTML = '<p style="color: #888; font-style: italic;">No organisms yet</p>';
            return;
        }

        const totalPop = this.world.organisms.size;
        let html = '';

        for (let i = 0; i < Math.min(5, topSpecies.length); i++) {
            const sp = topSpecies[i];
            const pct = ((sp.count / totalPop) * 100).toFixed(1);

            html += `<div style="margin-bottom: 12px; padding: 10px; background: #f8f8f8; border-radius: 4px; border-left: 3px solid #3498db;">`;
            html += `<div style="font-weight: bold; margin-bottom: 6px; color: #2c3e50;">#${i + 1}: ${sp.count} organisms (${pct}%)</div>`;

            // Cell composition with color coding
            html += `<div style="font-size: 0.85em; line-height: 1.6;">`;
            const cellCounts = [];
            for (const ctype of SIG_TYPES) {
                if (sp.typeCounts[ctype] > 0) {
                    const avgPerOrg = (sp.typeCounts[ctype] / sp.count).toFixed(1);
                    cellCounts.push(`<span style="color: ${CELL_COLORS[ctype]}; font-weight: 500;">${CELL_NAMES[ctype]}: ${avgPerOrg}</span>`);
                }
            }
            html += cellCounts.join(' | ');
            html += `</div>`;

            html += `</div>`;
        }

        container.innerHTML = html;
    }

    initRenderBuffers() {
        const worldSize = this.world.size;
        this._worldCanvas = document.createElement('canvas');
        this._worldCanvas.width = worldSize;
        this._worldCanvas.height = worldSize;
        this._worldCtx = this._worldCanvas.getContext('2d', { willReadFrequently: false });
        this._worldImageData = this._worldCtx.createImageData(worldSize, worldSize);
        this._worldPixels = new Uint32Array(this._worldImageData.data.buffer);
        this._renderPalettes = this.buildRenderPalettes();
    }

    buildRenderPalettes() {
        const normal = new Uint32Array(10);
        const subtleLevels = new Array(256);
        const centralLevels = new Array(256);
        const hexToRgb = (hex) => ({
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        });
        const toUint32 = ({ r, g, b }) => (255 << 24) | (b << 16) | (g << 8) | r;
        const blend = (base, overlay, amount) => ({
            r: Math.round(base.r + (overlay.r - base.r) * amount),
            g: Math.round(base.g + (overlay.g - base.g) * amount),
            b: Math.round(base.b + (overlay.b - base.b) * amount)
        });
        const buildLevels = (emptyDarkHex, emptyLitHex, tintHex, dimStrength, tintStrength) => {
            const levels = new Array(256);
            const emptyDark = hexToRgb(emptyDarkHex);
            const emptyLit = hexToRgb(emptyLitHex);
            const sunlightTint = hexToRgb(tintHex);
            for (let level = 0; level < 256; level++) {
                const factor = level / 255;
                const palette = new Uint32Array(10);
                palette[CELL_EMPTY] = toUint32(blend(emptyDark, emptyLit, factor));
                for (const [cellType, color] of Object.entries(CELL_COLORS)) {
                    const rgb = hexToRgb(color);
                    const dimmed = blend(rgb, { r: 0, g: 0, b: 0 }, dimStrength * (1 - factor));
                    palette[cellType | 0] = toUint32(blend(dimmed, sunlightTint, tintStrength * factor));
                }
                levels[level] = palette;
            }
            return levels;
        };

        normal[CELL_EMPTY] = toUint32(hexToRgb('#000000'));
        for (const [cellType, color] of Object.entries(CELL_COLORS)) {
            normal[cellType | 0] = toUint32(hexToRgb(color));
        }

        return {
            normal,
            refugia: buildLevels('#03060a', '#171207', '#f3d26b', 0.24, 0.12),
            central: buildLevels('#02050b', '#2d230b', '#f3d26b', 0.22, 0.10)
        };
    }

    setSunlightMode(mode) {
        SUNLIGHT_MODE = mode;
        if (this.world) {
            this.world.setSunlightMode(mode);
        }
    }

    render() {
        const ctx = this.ctx;
        // Round cell size to avoid sub-pixel anti-aliasing artifacts
        const cellSize = Math.round(CELL_SIZE * this.zoom);
        const worldSize = this.world.size;
        const ctype = this.world.ctype;
        const owner = this.world.owner;

        const pixels = this._worldPixels;
        const sunlight = this.world.sunlightMap;
        const palettes = this._renderPalettes;
        const mode = this.world.sunlightMode;
        if (mode === SUNLIGHT_MODE_DEFAULT) {
            const palette = palettes.normal;
            for (let i = 0; i < ctype.length; i++) {
                pixels[i] = palette[ctype[i]];
            }
        } else if (mode === SUNLIGHT_MODE_REFUGIA) {
            const paletteLevels = palettes.refugia;
            for (let i = 0; i < ctype.length; i++) {
                pixels[i] = paletteLevels[sunlight[i]][ctype[i]];
            }
        } else {
            const paletteLevels = palettes.central;
            const minSunlight = Math.round(CENTRAL_SUNLIGHT_MIN_FACTOR * 255);
            const scaleDenom = Math.max(1, 255 - minSunlight);
            for (let i = 0; i < ctype.length; i++) {
                const visualLevel = Math.max(0, Math.min(255, Math.round(((sunlight[i] - minSunlight) * 255) / scaleDenom)));
                pixels[i] = paletteLevels[visualLevel][ctype[i]];
            }
        }
        this._worldCtx.putImageData(this._worldImageData, 0, 0);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._worldCanvas, 0, 0, this.canvas.width, this.canvas.height);

        // Draw organism boundaries by scanning cell-to-cell transitions once.
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const maxCoord = worldSize * cellSize;

        // Interior vertical boundaries plus wrap seam.
        for (let y = 0; y < worldSize; y++) {
            const yOffset = y * worldSize;
            const py = y * cellSize;
            for (let x = 0; x < worldSize - 1; x++) {
                const leftOwner = owner[yOffset + x];
                const rightOwner = owner[yOffset + x + 1];
                if (leftOwner === rightOwner || (leftOwner === -1 && rightOwner === -1)) continue;
                const px = (x + 1) * cellSize;
                ctx.moveTo(px, py);
                ctx.lineTo(px, py + cellSize);
            }

            const seamLeftOwner = owner[yOffset + worldSize - 1];
            const seamRightOwner = owner[yOffset];
            if (seamLeftOwner !== seamRightOwner && (seamLeftOwner !== -1 || seamRightOwner !== -1)) {
                ctx.moveTo(0, py);
                ctx.lineTo(0, py + cellSize);
                ctx.moveTo(maxCoord, py);
                ctx.lineTo(maxCoord, py + cellSize);
            }
        }

        // Interior horizontal boundaries plus wrap seam.
        for (let y = 0; y < worldSize - 1; y++) {
            const yOffset = y * worldSize;
            const nextOffset = (y + 1) * worldSize;
            const py = (y + 1) * cellSize;
            for (let x = 0; x < worldSize; x++) {
                const topOwner = owner[yOffset + x];
                const bottomOwner = owner[nextOffset + x];
                if (topOwner === bottomOwner || (topOwner === -1 && bottomOwner === -1)) continue;
                const px = x * cellSize;
                ctx.moveTo(px, py);
                ctx.lineTo(px + cellSize, py);
            }
        }

        const seamTopOffset = (worldSize - 1) * worldSize;
        for (let x = 0; x < worldSize; x++) {
            const topOwner = owner[x];
            const bottomOwner = owner[seamTopOffset + x];
            if (topOwner === bottomOwner || (topOwner === -1 && bottomOwner === -1)) continue;
            const px = x * cellSize;
            ctx.moveTo(px, 0);
            ctx.lineTo(px + cellSize, 0);
            ctx.moveTo(px, maxCoord);
            ctx.lineTo(px + cellSize, maxCoord);
        }

        ctx.stroke();

        // Grid lines (single path for all lines) - subtle when enabled
        if (this.showGrid && this.zoom >= 0.5) {
            ctx.strokeStyle = 'rgba(128,128,128,0.05)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let i = 0; i <= worldSize; i++) {
                const coord = i * cellSize;
                ctx.moveTo(coord, 0);
                ctx.lineTo(coord, maxCoord);
                ctx.moveTo(0, coord);
                ctx.lineTo(maxCoord, coord);
            }
            ctx.stroke();
        }

        // Highlight selected organism
        if (this.selectedOrg && this.world.organisms.has(this.selectedOrg)) {
            const org = this.world.organisms.get(this.selectedOrg);
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            for (let i = 0; i < org.xs.length; i++) {
                ctx.strokeRect(
                    org.xs[i] * cellSize,
                    org.ys[i] * cellSize,
                    cellSize,
                    cellSize
                );
            }
        }
    }

    renderPopChart() {
        const canvas = document.getElementById('pop-chart');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const fullLen = this.popHistory.length;
        if (fullLen < 2) return;

        // Show only the last sidebarChartWindow ticks (recent history)
        const startIdx = Math.max(0, fullLen - this.sidebarChartWindow);
        const len = fullLen - startIdx;

        // Find max within the visible window
        let maxPop = 1;
        for (let i = startIdx; i < fullLen; i++) {
            if (this.popHistory[i] > maxPop) maxPop = this.popHistory[i];
        }

        const xScale = w / (len - 1 || 1);

        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < len; i++) {
            const x = i * xScale;
            const y = h - (this.popHistory[startIdx + i] / maxPop) * h;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();

        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);
    }

    renderDiversityChart() {
        const canvas = document.getElementById('diversity-chart');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const fullLen = this.diversityHistory.length;
        if (fullLen < 2) return;

        // Show only the last sidebarChartWindow ticks (recent history)
        const startIdx = Math.max(0, fullLen - this.sidebarChartWindow);
        const len = fullLen - startIdx;

        // Find max within the visible window
        let maxDiv = 1;
        for (let i = startIdx; i < fullLen; i++) {
            if (this.diversityHistory[i] > maxDiv) maxDiv = this.diversityHistory[i];
        }

        const xScale = w / (len - 1 || 1);

        ctx.strokeStyle = '#9b59b6';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < len; i++) {
            const x = i * xScale;
            const y = h - (this.diversityHistory[startIdx + i] / maxDiv) * h;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();

        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);
    }

    renderCellDistChart() {
        const canvas = document.getElementById('cell-dist-chart');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const fullLen = this.cellDistHistory.length;
        if (fullLen < 2) return;

        // Show only the last sidebarChartWindow ticks (recent history)
        const startIdx = Math.max(0, fullLen - this.sidebarChartWindow);
        const len = fullLen - startIdx;

        const cellTypes = ['photo', 'mouth', 'muscle', 'nose', 'shield', 'sensor', 'emit', 'decay'];
        const colors = {
            muscle: '#7878FF',
            nose: '#FFA050',
            sensor: '#FFFF78',
            mouth: '#FF7878',
            photo: '#78FF78',
            shield: '#78DCDC',
            emit: '#FFFFFF',
            decay: '#966432'
        };

        // Pre-calculate totals for percentage normalization (within window)
        const totals = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            const d = this.cellDistHistory[startIdx + i];
            totals[i] = d.muscle + (d.nose || 0) + d.sensor + d.mouth + d.photo + d.shield + d.emit + d.decay || 1;
        }

        // Use window length for x-scale
        const xScale = w / (len - 1 || 1);

        // Draw stacked area chart (as percentages)
        for (let typeIdx = 0; typeIdx < cellTypes.length; typeIdx++) {
            const type = cellTypes[typeIdx];

            ctx.fillStyle = colors[type];
            ctx.globalAlpha = 0.7;
            ctx.beginPath();

            // Forward pass - top edge of this layer
            for (let i = 0; i < len; i++) {
                const x = i * xScale;
                let cumulative = 0;
                for (let j = 0; j <= typeIdx; j++) {
                    cumulative += this.cellDistHistory[startIdx + i][cellTypes[j]];
                }
                const y = h - (cumulative / totals[i]) * h;

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }

            // Backward pass - bottom edge (previous layer's top)
            for (let i = len - 1; i >= 0; i--) {
                const x = i * xScale;
                let cumulative = 0;
                for (let j = 0; j < typeIdx; j++) {
                    cumulative += this.cellDistHistory[startIdx + i][cellTypes[j]];
                }
                const y = h - (cumulative / totals[i]) * h;
                ctx.lineTo(x, y);
            }

            ctx.closePath();
            ctx.fill();
        }

        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);
    }

    handleCanvasClick(x, y) {
        const cellSize = Math.round(CELL_SIZE * this.zoom);
        const gx = Math.floor(x / cellSize);
        const gy = Math.floor(y / cellSize);

        if (gx < 0 || gx >= this.world.size || gy < 0 || gy >= this.world.size) return;

        const idx = this.world.getIdx(gx, gy);
        const oid = this.world.owner[idx];

        if (oid !== -1 && this.world.organisms.has(oid)) {
            this.selectedOrg = oid;
            this.updateOrgInspector(this.world.organisms.get(oid));
            this.render();
        }
    }

    updateOrgInspector(org) {
        // Show bottom panel
        const wasHidden = !document.getElementById('bottom-panel').classList.contains('active');
        document.getElementById('bottom-panel').classList.add('active');

        // Re-apply zoom to adjust for changed container size
        if (wasHidden) {
            requestAnimationFrame(() => setZoom(this.zoom));
        }

        document.getElementById('org-title').textContent = `Organism #${org.id}`;
        document.getElementById('org-energy').textContent = org.energy.toFixed(1);
        document.getElementById('org-age').textContent = `${org.age} ticks`;
        document.getElementById('org-size').textContent = `${org.xs.length} cells`;
        document.getElementById('org-facing').textContent = ['North', 'East', 'South', 'West'][org.facing];
        document.getElementById('org-speed').textContent = `${(org.getMuscleRatio() * 100).toFixed(0)}%`;

        // Count organisms of the same species
        const signature = org.getSignature();
        const speciesCount = this.world.getRunningSpeciesCounts().get(signature) || 0;
        document.getElementById('org-species-count').textContent =
            speciesCount === 1 ? '1 of this species' : `${speciesCount} of this species`;

        // Draw organism shape
        this.drawOrganismShape(org);

        const compDiv = document.getElementById('org-composition');
        compDiv.innerHTML = '';

        for (const ctype of SIG_TYPES) {
            const count = org.typeCounts[ctype];
            if (count > 0) {
                const item = document.createElement('div');
                item.className = 'comp-item';
                item.innerHTML = `
                    <div class="comp-color" style="background: ${CELL_COLORS[ctype]};"></div>
                    <span>${CELL_NAMES[ctype]}: ${count}</span>
                `;
                compDiv.appendChild(item);
            }
        }

        // Neural network info
        const brain = org.brain;
        const hiddenStr = brain.hiddenSizes.length > 0 ? brain.hiddenSizes.join('→') : 'none';
        document.getElementById('nn-info').textContent =
            `${brain.din} → [${hiddenStr}] → ${brain.dout} (${brain.getTotalNodes()} nodes)`;

        // Draw neural network visualization
        this.drawNeuralNetwork(org);
    }

    drawOrganismShape(org) {
        const canvas = document.getElementById('organism-shape-canvas');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);

        // Find bounding box of organism
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < org.xs.length; i++) {
            minX = Math.min(minX, org.xs[i]);
            maxX = Math.max(maxX, org.xs[i]);
            minY = Math.min(minY, org.ys[i]);
            maxY = Math.max(maxY, org.ys[i]);
        }

        const orgW = maxX - minX + 1;
        const orgH = maxY - minY + 1;
        const padding = 10;
        const availW = w - padding * 2;
        const availH = h - padding * 2;

        // Calculate cell size to fit organism in canvas
        const cellSize = Math.min(availW / orgW, availH / orgH, 20);

        // Center the organism
        const offsetX = padding + (availW - orgW * cellSize) / 2;
        const offsetY = padding + (availH - orgH * cellSize) / 2;

        // Draw cells
        for (let i = 0; i < org.xs.length; i++) {
            const lx = org.xs[i] - minX;
            const ly = org.ys[i] - minY;
            const px = offsetX + lx * cellSize;
            const py = offsetY + ly * cellSize;

            ctx.fillStyle = CELL_COLORS[org.ts[i]];
            ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
        }

        // Draw facing indicator
        const facingLabels = ['N', 'E', 'S', 'W'];
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`Facing: ${facingLabels[org.facing]}`, w - 5, 12);
    }

    hideOrgInspector() {
        this.selectedOrg = null;  // Clear selection to prevent re-opening
        document.getElementById('bottom-panel').classList.remove('active');
        // Re-apply zoom to adjust for changed container size
        requestAnimationFrame(() => setZoom(this.zoom));
    }

    drawNeuralNetwork(org) {
        const canvas = document.getElementById('nn-canvas');
        const ctx = canvas.getContext('2d');
        const brain = org.brain;

        // Set canvas size based on container
        const container = canvas.parentElement;
        canvas.width = container.clientWidth || 400;
        canvas.height = container.clientHeight - 30 || 140;  // Leave space for header

        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Calculate layer positions
        const numLayers = brain.hiddenSizes.length + 2; // input + hidden + output
        const layerSpacing = width / (numLayers + 1);
        const padding = 15;

        // Build layer info: [{size, x, label}]
        const layers = [];

        // Input layer - group sensors
        const numSensors = org.typeCounts[CELL_SENSOR];
        const numNoses = org.typeCounts[CELL_NOSE] || 0;
        const inputGroups = [{name: 'Energy', size: 1}];
        for (let i = 0; i < numNoses; i++) {
            inputGroups.push({name: `Nose ${i+1}`, size: 4});
        }
        for (let i = 0; i < numSensors; i++) {
            inputGroups.push({name: `Eye ${i+1}`, size: SENSOR_INPUTS});
        }
        layers.push({groups: inputGroups, x: layerSpacing, isInput: true});

        // Hidden layers
        for (let i = 0; i < brain.hiddenSizes.length; i++) {
            layers.push({size: brain.hiddenSizes[i], x: layerSpacing * (i + 2)});
        }

        // Output layer
        const hasMuscles = org.typeCounts[CELL_MUSCLE] > 0;
        const numEmitters = org.typeCounts[CELL_EMIT];
        const outputLabels = ['Repro'];
        for (let i = 0; i < numEmitters; i++) outputLabels.push(`Emit${i+1}`);
        if (hasMuscles) outputLabels.push('Fwd', 'Back', 'RotCW', 'RotCC');
        layers.push({labels: outputLabels, size: brain.dout, x: layerSpacing * (numLayers), isOutput: true});

        // Draw connections first (behind nodes)
        ctx.lineWidth = 0.5;
        for (let l = 0; l < brain.layers.length; l++) {
            const layer = brain.layers[l];
            const fromLayer = l === 0 ? layers[0] : layers[l];
            const toLayer = layers[l + 1];

            const fromSize = l === 0 ? brain.din : brain.hiddenSizes[l - 1];
            const toSize = layer.size;

            // Sample connections (don't draw all for large layers)
            const maxConnections = 50;
            const sampleRate = Math.max(1, Math.floor((fromSize * toSize) / maxConnections));

            for (let i = 0; i < fromSize; i++) {
                for (let j = 0; j < toSize; j++) {
                    if ((i * toSize + j) % sampleRate !== 0) continue;

                    const weight = layer.weights[i * toSize + j];
                    const absWeight = Math.abs(weight);
                    if (absWeight < 0.1) continue; // Skip weak connections

                    const alpha = Math.min(0.8, absWeight * 0.8);
                    ctx.strokeStyle = weight > 0 ?
                        `rgba(100, 200, 100, ${alpha})` :
                        `rgba(200, 100, 100, ${alpha})`;

                    const fromY = this.getNodeY(i, fromSize, height, padding);
                    const toY = this.getNodeY(j, toSize, height, padding);

                    ctx.beginPath();
                    ctx.moveTo(fromLayer.x || layerSpacing, fromY);
                    ctx.lineTo(toLayer.x, toY);
                    ctx.stroke();
                }
            }
        }

        // Draw nodes
        for (let l = 0; l < layers.length; l++) {
            const layer = layers[l];

            if (layer.isInput) {
                // Draw grouped input nodes
                let yOffset = padding;
                const groupHeight = (height - 2 * padding) / layer.groups.length;
                for (let g = 0; g < layer.groups.length; g++) {
                    const group = layer.groups[g];
                    const y = yOffset + groupHeight / 2;

                    ctx.fillStyle = '#4a90d9';
                    ctx.fillRect(layer.x - 25, y - 8, 50, 16);

                    ctx.fillStyle = '#fff';
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(group.name, layer.x, y + 3);

                    yOffset += groupHeight;
                }
            } else if (layer.isOutput) {
                // Draw labeled output nodes
                for (let i = 0; i < layer.size; i++) {
                    const y = this.getNodeY(i, layer.size, height, padding);

                    ctx.fillStyle = '#d94a4a';
                    ctx.beginPath();
                    ctx.arc(layer.x, y, 6, 0, Math.PI * 2);
                    ctx.fill();

                    if (layer.labels && layer.labels[i]) {
                        ctx.fillStyle = '#aaa';
                        ctx.font = '8px sans-serif';
                        ctx.textAlign = 'left';
                        ctx.fillText(layer.labels[i], layer.x + 10, y + 3);
                    }
                }
            } else {
                // Draw hidden layer nodes
                const maxNodes = 12;
                const displaySize = Math.min(layer.size, maxNodes);
                for (let i = 0; i < displaySize; i++) {
                    const y = this.getNodeY(i, displaySize, height, padding);

                    ctx.fillStyle = '#9b59b6';
                    ctx.beginPath();
                    ctx.arc(layer.x, y, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
                if (layer.size > maxNodes) {
                    ctx.fillStyle = '#666';
                    ctx.font = '8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`+${layer.size - maxNodes}`, layer.x, height - 5);
                }
            }
        }
    }

    getNodeY(index, total, height, padding) {
        if (total === 1) return height / 2;
        return padding + (index / (total - 1)) * (height - 2 * padding);
    }

    spawnRandom(n) {
        this.world.seedRandomOrganisms(n);
        this.updateStats(true);  // Force UI update
        this.render();
    }

    // Spawn custom organisms from a template
    // template: array of {x, y, type} relative coordinates
    spawnCustomOrganisms(n, template) {
        for (let i = 0; i < n; i++) {
            this.world.spawnFromTemplate(template);
        }
        this.updateStats(true);
        this.render();
    }

    // Compress oldest chunk of history into summary
    compressOldHistory() {
        const chunkSize = this.ticksPerChunk;
        if (this.popHistory.length < chunkSize) return;

        // Take first chunk
        const popChunk = this.popHistory.splice(0, chunkSize);
        const divChunk = this.diversityHistory.splice(0, chunkSize);
        const cellChunk = this.cellDistHistory.splice(0, chunkSize);
        this.energyHistory.splice(0, chunkSize);  // We don't compress energy, just discard

        // Helper function to compute min/max/avg without spread operator (avoids stack overflow)
        const computeStats = (arr) => {
            let min = arr[0], max = arr[0], sum = 0;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] < min) min = arr[i];
                if (arr[i] > max) max = arr[i];
                sum += arr[i];
            }
            return { min, max, avg: sum / arr.length, final: arr[arr.length - 1], span: arr.length };
        };

        // Compress population
        this.compressedPopHistory.push(computeStats(popChunk));

        // Compress diversity
        this.compressedDivHistory.push(computeStats(divChunk));

        // Compress cell distribution
        const cellTypes = ['muscle', 'nose', 'sensor', 'mouth', 'photo', 'shield', 'emit', 'decay'];
        const compressedCell = { span: cellChunk.length };
        for (const type of cellTypes) {
            // Extract values without creating intermediate array
            let min = cellChunk[0][type], max = min, sum = 0;
            for (let i = 0; i < cellChunk.length; i++) {
                const v = cellChunk[i][type];
                if (v < min) min = v;
                if (v > max) max = v;
                sum += v;
            }
            compressedCell[type] = {
                min, max,
                avg: sum / cellChunk.length,
                final: cellChunk[cellChunk.length - 1][type]
            };
        }
        this.compressedCellDistHistory.push(compressedCell);

        // Update start tick
        this.recentHistoryStartTick += chunkSize;
    }

    // Get full population history for rendering (combines compressed + recent)
    getFullPopulationHistory() {
        const result = [];

        // Add compressed chunks (use average value for each chunk)
        for (const chunk of this.compressedPopHistory) {
            result.push({
                value: chunk.avg,
                min: chunk.min,
                max: chunk.max,
                span: chunk.span || this.ticksPerChunk,
                isCompressed: true
            });
        }

        // Add recent data
        for (const val of this.popHistory) {
            result.push({value: val, span: 1, isCompressed: false});
        }

        return result;
    }

    // Get full diversity history
    getFullDiversityHistory() {
        const result = [];

        for (const chunk of this.compressedDivHistory) {
            result.push({
                value: chunk.avg,
                min: chunk.min,
                max: chunk.max,
                span: chunk.span || this.ticksPerChunk,
                isCompressed: true
            });
        }

        for (const val of this.diversityHistory) {
            result.push({value: val, span: 1, isCompressed: false});
        }

        return result;
    }

    // Get full cell distribution history
    getFullCellDistHistory() {
        const result = [];
        const cellTypes = ['muscle', 'nose', 'sensor', 'mouth', 'photo', 'shield', 'emit', 'decay'];

        for (const chunk of this.compressedCellDistHistory) {
            const entry = {isCompressed: true, span: chunk.span || this.ticksPerChunk};
            for (const type of cellTypes) {
                entry[type] = chunk[type].avg;
            }
            result.push(entry);
        }

        for (const dist of this.cellDistHistory) {
            result.push({...dist, span: 1, isCompressed: false});
        }

        return result;
    }

    getFullExtinctionHistory() {
        return this.extinctionHistory.map(val => ({ value: val, span: 1, isCompressed: false }));
    }

    // Get historical statistics for the history panel
    getHistoricalStats() {
        const result = {
            totalGenerations: this.generation,
            totalBirths: this.stats.births,
            totalDeaths: this.stats.deaths,
            totalPredations: this.stats.predations,
            topSpecies: [],
            dramaticExtinctions: [],
            mostPredatory: []
        };

        // Convert species history to array for sorting
        const speciesArr = [];
        for (const [sig, stats] of this.speciesHistory) {
            speciesArr.push({
                signature: sig,
                ...stats,
                isExtinct: stats.lastSeen < this.generation - 100  // Consider extinct if not seen for 100 ticks
            });
        }

        // Top 5 species by peak population
        result.topSpecies = [...speciesArr]
            .sort((a, b) => b.peakPop - a.peakPop)
            .slice(0, 5);

        // Most dramatic extinctions (high peak but now extinct)
        result.dramaticExtinctions = speciesArr
            .filter(sp => sp.isExtinct && sp.peakPop >= 10)
            .sort((a, b) => b.peakPop - a.peakPop)
            .slice(0, 5);

        // Most predatory species (by total kills)
        result.mostPredatory = [...speciesArr]
            .filter(sp => sp.totalKills > 0)
            .sort((a, b) => b.totalKills - a.totalKills)
            .slice(0, 5);

        return result;
    }

    // Record a predation event for a species
    recordPredation(predatorSignature) {
        if (this.speciesHistory.has(predatorSignature)) {
            this.speciesHistory.get(predatorSignature).totalKills++;
        }
    }

    // Extract normalized body shape from an organism (for species history)
    extractBodyShape(org) {
        if (!org || org.xs.length === 0) return null;

        // Find bounding box
        let minX = org.xs[0], minY = org.ys[0];
        for (let i = 1; i < org.xs.length; i++) {
            if (org.xs[i] < minX) minX = org.xs[i];
            if (org.ys[i] < minY) minY = org.ys[i];
        }

        // Normalize to origin (0,0)
        const xs = [], ys = [], ts = [];
        for (let i = 0; i < org.xs.length; i++) {
            xs.push(org.xs[i] - minX);
            ys.push(org.ys[i] - minY);
            ts.push(org.ts[i]);
        }

        return {xs, ys, ts};
    }
}
