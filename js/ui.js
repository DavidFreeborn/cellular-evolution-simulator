// =====================
// UI Functions
// =====================

// Custom organism template (null = use default)
let customOrganismTemplate = null;

function syncSunlightModeControls() {
    const toolbarSelect = document.getElementById('sunlight-mode');
    if (toolbarSelect) {
        toolbarSelect.value = SUNLIGHT_MODE;
    }
    const welcomeSelect = document.getElementById('welcome-sunlight-mode');
    if (welcomeSelect) {
        welcomeSelect.value = SUNLIGHT_MODE;
    }
}

// Initialize welcome screen button on page load
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-sim-btn').addEventListener('click', startSimulation);
    const welcomeSelect = document.getElementById('welcome-sunlight-mode');
    if (welcomeSelect) {
        welcomeSelect.addEventListener('change', (e) => {
            SUNLIGHT_MODE = e.target.value;
            syncSunlightModeControls();
        });
    }
    syncSunlightModeControls();
});

function startSimulation() {
    const welcomeSelect = document.getElementById('welcome-sunlight-mode');
    if (welcomeSelect) {
        SUNLIGHT_MODE = welcomeSelect.value;
    }
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('simulation-screen').classList.add('active');

    simulator = new Simulator();
    simulator.init();

    // Set up simulation event listeners
    setupSimulationEventListeners();
}

function formatPercentValue(value) {
    return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function syncParameterControlsFromConstants() {
    syncSunlightModeControls();

    const deathPct = RANDOM_DEATH_PROB * 100;
    const deathSlider = document.getElementById('death-rate');
    const deathValue = document.getElementById('death-rate-value');
    deathSlider.value = deathPct;
    deathValue.textContent = formatPercentValue(deathPct);

    // The UI mutation slider displays the baseline add-cell mutation percent.
    // At the default mutation scale this is 2%, which corresponds to MUT_ADD_CELL_P = 0.02.
    const mutationPct = MUT_ADD_CELL_P * 100;
    const mutationSlider = document.getElementById('mutation-rate');
    const mutationValue = document.getElementById('mutation-rate-value');
    mutationSlider.value = mutationPct;
    mutationValue.textContent = formatPercentValue(mutationPct);

    const refugiaEpochSlider = document.getElementById('refugia-epoch');
    const refugiaEpochValue = document.getElementById('refugia-epoch-value');
    if (refugiaEpochSlider && refugiaEpochValue) {
        refugiaEpochSlider.value = REFUGIA_PHASE_TICKS;
        refugiaEpochValue.textContent = `${REFUGIA_PHASE_TICKS}t`;
    }
}

function setupSimulationEventListeners() {
    syncParameterControlsFromConstants();

    // Canvas click with scroll offset support
    document.getElementById('sim-canvas').addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        simulator.handleCanvasClick(x, y);
    });

    // Speed slider
    document.getElementById('speed-slider').addEventListener('input', (e) => {
        simulator.speed = parseInt(e.target.value);
        document.getElementById('speed-value').textContent = `${simulator.speed}/sec`;
        if (simulator.running && document.hidden) {
            stopSimLoop();
            startSimLoop();
        }
    });

    // Zoom slider
    document.getElementById('zoom-slider').addEventListener('input', (e) => {
        const zoomPercent = parseInt(e.target.value);
        const zoom = zoomPercent / 100;
        document.getElementById('zoom-value').textContent = `${zoomPercent}%`;
        setZoom(zoom);
    });

    // Death rate slider
    document.getElementById('death-rate').addEventListener('input', (e) => {
        const pct = parseFloat(e.target.value);
        RANDOM_DEATH_PROB = pct / 100;
        document.getElementById('death-rate-value').textContent = formatPercentValue(pct);
    });

    // Mutation rate slider
    document.getElementById('mutation-rate').addEventListener('input', (e) => {
        const pct = parseFloat(e.target.value);
        document.getElementById('mutation-rate-value').textContent = formatPercentValue(pct);
        const scale = pct / 5;
        MUT_ADD_CELL_P = 0.05 * scale;
        MUT_DEL_CELL_P = 0.04 * scale;
        MUT_SWAP_CELL_P = 0.04 * scale;
        MUT_JIGGLE_CELL_P = 0.03 * scale;
        MUT_WEIGHT_SIGMA = 0.05 * scale;
    });

    const sunlightSelect = document.getElementById('sunlight-mode');
    if (sunlightSelect) {
        sunlightSelect.addEventListener('change', (e) => {
            SUNLIGHT_MODE = e.target.value;
            syncSunlightModeControls();
            simulator.setSunlightMode(SUNLIGHT_MODE);
            simulator.render();
        });
    }

    const refugiaEpochSlider = document.getElementById('refugia-epoch');
    if (refugiaEpochSlider) {
        refugiaEpochSlider.addEventListener('input', (e) => {
            REFUGIA_PHASE_TICKS = parseInt(e.target.value, 10);
            document.getElementById('refugia-epoch-value').textContent = `${REFUGIA_PHASE_TICKS}t`;
            if (simulator && simulator.world) {
                simulator.world.setSunlightMode(SUNLIGHT_MODE);
                simulator.render();
            }
        });
    }

    // Grid toggle
    document.getElementById('show-grid').addEventListener('change', () => {
        toggleGrid();
    });

    // Button event listeners
    document.getElementById('start-btn').addEventListener('click', toggleRunning);
    document.getElementById('step-btn').addEventListener('click', step);
    document.getElementById('reset-btn').addEventListener('click', reset);
    document.getElementById('spawn-btn').addEventListener('click', () => spawnCustomOrganisms(5));
    document.getElementById('guide-btn').addEventListener('click', showGuideModal);
    document.getElementById('design-btn').addEventListener('click', showOrganismDesigner);
    document.getElementById('history-btn').addEventListener('click', showHistoryPanel);
    document.getElementById('bottom-panel-close-btn').addEventListener('click', () => {
        simulator.hideOrgInspector();
    });

    // Modal close buttons
    document.getElementById('guide-modal-close').addEventListener('click', hideGuideModal);
    document.getElementById('guide-modal-ok').addEventListener('click', hideGuideModal);
    document.getElementById('designer-modal-close').addEventListener('click', hideOrganismDesigner);
    document.getElementById('designer-cancel').addEventListener('click', hideOrganismDesigner);
    document.getElementById('designer-clear').addEventListener('click', clearDesigner);
    document.getElementById('designer-create').addEventListener('click', createCustomOrganism);
    document.getElementById('history-modal-close').addEventListener('click', hideHistoryPanel);
    document.getElementById('history-modal-ok').addEventListener('click', hideHistoryPanel);

    // Designer cell palette
    setupDesignerPalette();

    // Designer grid
    setupDesignerGrid();

    // Handle window resize
    window.addEventListener('resize', () => {
        if (simulator) {
            setZoom(simulator.zoom);
        }
    });
}

// =====================
// Guide Modal (doesn't stop simulation)
// =====================

function showGuideModal() {
    document.getElementById('guide-modal').classList.add('active');
}

function hideGuideModal() {
    document.getElementById('guide-modal').classList.remove('active');
}

// =====================
// Organism Designer
// =====================

let designerSelectedCell = CELL_PHOTO;
let designerGrid = {};  // {x,y} -> cellType

function setupDesignerPalette() {
    const palette = document.getElementById('designer-palette');
    const cellTypes = [
        { type: CELL_PHOTO, name: 'Photo', color: CELL_COLORS[CELL_PHOTO] },
        { type: CELL_MUSCLE, name: 'Muscle', color: CELL_COLORS[CELL_MUSCLE] },
        { type: CELL_MOUTH, name: 'Teeth', color: CELL_COLORS[CELL_MOUTH] },
        { type: CELL_NOSE, name: 'Nose', color: CELL_COLORS[CELL_NOSE] },
        { type: CELL_SENSOR, name: 'Eye', color: CELL_COLORS[CELL_SENSOR] },
        { type: CELL_SHIELD, name: 'Shield', color: CELL_COLORS[CELL_SHIELD] },
        { type: CELL_EMIT, name: 'Emitter', color: CELL_COLORS[CELL_EMIT] },
        { type: -1, name: 'Erase', color: '#333' }
    ];

    palette.innerHTML = '';
    cellTypes.forEach(ct => {
        const btn = document.createElement('button');
        btn.className = 'palette-btn' + (ct.type === designerSelectedCell ? ' selected' : '');
        btn.dataset.cellType = ct.type;
        btn.innerHTML = `<span class="palette-color" style="background: ${ct.color};"></span>${ct.name}`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            designerSelectedCell = ct.type;
        });
        palette.appendChild(btn);
    });
}

function setupDesignerGrid() {
    const grid = document.getElementById('designer-grid');
    grid.innerHTML = '';

    const gridSize = 12;
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const cell = document.createElement('div');
            cell.className = 'designer-cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.addEventListener('click', () => handleDesignerCellClick(x, y));
            cell.addEventListener('mouseenter', (e) => {
                if (e.buttons === 1) handleDesignerCellClick(x, y);
            });
            grid.appendChild(cell);
        }
    }
}

function handleDesignerCellClick(x, y) {
    const key = `${x},${y}`;

    if (designerSelectedCell === -1) {
        // Erase mode
        delete designerGrid[key];
    } else {
        // Place cell
        designerGrid[key] = designerSelectedCell;
    }

    updateDesignerDisplay();
}

function updateDesignerDisplay() {
    // Update grid visual
    const cells = document.querySelectorAll('.designer-cell');
    cells.forEach(cell => {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const key = `${x},${y}`;

        if (designerGrid[key] !== undefined) {
            cell.style.background = CELL_COLORS[designerGrid[key]];
        } else {
            cell.style.background = '#1a1a2e';
        }
    });

    // Calculate stats
    const cellCount = Object.keys(designerGrid).length;
    const isContiguous = checkDesignerContiguity();
    const isValid = cellCount >= MIN_CELLS && isContiguous;

    // Update info panel
    document.getElementById('designer-cell-count').textContent = cellCount;
    const validityEl = document.getElementById('designer-validity');
    validityEl.textContent = isValid ? '✓ Valid' :
        (cellCount < MIN_CELLS ? `Add at least ${MIN_CELLS} cells` : 'Must be connected');
    validityEl.className = isValid ? 'valid' : 'invalid';

    // Update create button
    document.getElementById('designer-create').disabled = !isValid;

    // Update preview
    updateDesignerPreview();
}

function checkDesignerContiguity() {
    const keys = Object.keys(designerGrid);
    if (keys.length <= 1) return true;

    const visited = new Set();
    const queue = [keys[0]];
    let queueHead = 0;
    visited.add(keys[0]);

    while (queueHead < queue.length) {
        const current = queue[queueHead++];
        const [cx, cy] = current.split(',').map(Number);

        const neighbors = [
            `${cx+1},${cy}`, `${cx-1},${cy}`,
            `${cx},${cy+1}`, `${cx},${cy-1}`
        ];

        for (const neighbor of neighbors) {
            if (designerGrid[neighbor] !== undefined && !visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return visited.size === keys.length;
}

function updateDesignerPreview() {
    const canvas = document.getElementById('designer-preview-canvas');
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const keys = Object.keys(designerGrid);
    if (keys.length === 0) return;

    // Find bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    keys.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });

    const orgW = maxX - minX + 1;
    const orgH = maxY - minY + 1;
    const padding = 10;
    const availW = canvas.width - padding * 2;
    const availH = canvas.height - padding * 2;
    const cellSize = Math.min(availW / orgW, availH / orgH, 15);

    const offsetX = padding + (availW - orgW * cellSize) / 2;
    const offsetY = padding + (availH - orgH * cellSize) / 2;

    keys.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        const px = offsetX + (x - minX) * cellSize;
        const py = offsetY + (y - minY) * cellSize;

        ctx.fillStyle = CELL_COLORS[designerGrid[key]];
        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
    });
}

function showOrganismDesigner() {
    document.getElementById('designer-modal').classList.add('active');
    clearDesigner();
}

function hideOrganismDesigner() {
    document.getElementById('designer-modal').classList.remove('active');
}

function clearDesigner() {
    designerGrid = {};
    updateDesignerDisplay();
}

function createCustomOrganism() {
    const keys = Object.keys(designerGrid);
    if (keys.length < MIN_CELLS) return;
    if (!checkDesignerContiguity()) return;

    // Find center and create normalized template
    let sumX = 0, sumY = 0;
    keys.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        sumX += x;
        sumY += y;
    });
    const cx = Math.round(sumX / keys.length);
    const cy = Math.round(sumY / keys.length);

    // Create template as array of {x, y, type} objects
    customOrganismTemplate = keys.map(key => {
        const [x, y] = key.split(',').map(Number);
        return {x: x - cx, y: y - cy, type: designerGrid[key]};
    });

    // Update spawn button text
    document.getElementById('spawn-btn').textContent = 'Seed organism';

    hideOrganismDesigner();
}

// =====================
// Spawn Custom Organisms
// =====================

function spawnCustomOrganisms(n) {
    if (!simulator) return;

    if (customOrganismTemplate && customOrganismTemplate.length >= MIN_CELLS) {
        simulator.spawnCustomOrganisms(n, customOrganismTemplate);
    } else {
        simulator.spawnRandom(n);
    }
}

// =====================
// History Panel
// =====================

function showHistoryPanel() {
    document.getElementById('history-modal').classList.add('active');
    renderFullHistoryCharts();
    renderHistoricalStats();
}

function hideHistoryPanel() {
    document.getElementById('history-modal').classList.remove('active');
}

function renderFullHistoryCharts() {
    if (!simulator) return;

    // Get combined history (recent + compressed)
    const popData = simulator.getFullPopulationHistory();
    const divData = simulator.getFullDiversityHistory();
    const cellData = simulator.getFullCellDistHistory();
    const extinctionData = computeMovingAverageSeries(simulator.getFullExtinctionHistory(), 100);

    renderFullChart('history-pop-chart', popData, '#3498db', 'Population');
    renderFullChart('history-div-chart', divData, '#9b59b6', 'Species');
    renderFullChart('history-extinction-chart', extinctionData, '#e67e22', 'Extinctions / tick');
    renderFullCellDistChart('history-cell-chart', cellData);
}

function getHistoryGeometry(data, width) {
    let totalSpan = 0;
    for (let i = 0; i < data.length; i++) {
        totalSpan += Math.max(1, data[i].span || 1);
    }

    if (totalSpan <= 1) {
        return {
            totalSpan,
            xPositions: data.map(() => width * 0.5)
        };
    }

    const xPositions = new Array(data.length);
    let elapsed = 0;
    for (let i = 0; i < data.length; i++) {
        const span = Math.max(1, data[i].span || 1);
        const midpoint = elapsed + span * 0.5;
        xPositions[i] = ((midpoint - 0.5) / (totalSpan - 1)) * width;
        elapsed += span;
    }

    return { totalSpan, xPositions };
}

function computeMovingAverageSeries(data, windowSize) {
    if (!data || data.length === 0) return [];

    const result = new Array(data.length);
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        sum += data[i].value || 0;
        if (i >= windowSize) {
            sum -= data[i - windowSize].value || 0;
        }

        result[i] = {
            value: sum / Math.min(windowSize, i + 1),
            span: Math.max(1, data[i].span || 1),
            isCompressed: data[i].isCompressed || false
        };
    }

    return result;
}

function renderFullChart(canvasId, data, color, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Set canvas size based on container
    canvas.width = canvas.parentElement.clientWidth - 30 || 800;
    canvas.height = 120;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (data.length < 2) return;

    const values = new Array(data.length);
    let maxVal = 1;
    for (let i = 0; i < data.length; i++) {
        const value = data[i].value || 0;
        values[i] = value;
        if (value > maxVal) maxVal = value;
    }

    const geometry = getHistoryGeometry(data, w);
    const xPositions = geometry.xPositions;

    ctx.save();
    ctx.strokeStyle = 'rgba(44, 62, 80, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < data.length; i++) {
        if (!data[i].isCompressed || typeof data[i].min !== 'number' || typeof data[i].max !== 'number') continue;
        const x = xPositions[i];
        const yMin = h - (data[i].min / maxVal) * (h - 20) - 10;
        const yMax = h - (data[i].max / maxVal) * (h - 20) - 10;
        ctx.beginPath();
        ctx.moveTo(x, yMin);
        ctx.lineTo(x, yMax);
        ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
        const x = xPositions[i];
        const y = h - (values[i] / maxVal) * (h - 20) - 10;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Max: ${Math.round(maxVal)}`, 5, 12);
    ctx.fillText(label, Math.max(5, w - 90), 12);
    ctx.fillText(`Span: ${formatNumber(geometry.totalSpan)} ticks`, 5, h - 6);

    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
}

function renderFullCellDistChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Set canvas size based on container
    canvas.width = canvas.parentElement.clientWidth - 30 || 800;
    canvas.height = 120;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (data.length < 2) return;

    const geometry = getHistoryGeometry(data, w);
    const xPositions = geometry.xPositions;

    // Pre-calculate totals at each time point for percentage normalization
    const totals = data.map(d =>
        (d.muscle || 0) + (d.nose || 0) + (d.sensor || 0) + (d.mouth || 0) + (d.photo || 0) +
        (d.shield || 0) + (d.emit || 0) + (d.decay || 0) || 1);

    const cellTypes = ['photo', 'mouth', 'muscle', 'nose', 'shield', 'sensor', 'emit', 'decay'];
    const colors = {
        muscle: '#7878FF', nose: '#FFA050', sensor: '#FFFF78', mouth: '#FF7878',
        photo: '#78FF78', shield: '#78DCDC', emit: '#CCCCCC', decay: '#966432'
    };

    // Draw stacked area chart (as percentages)
    for (let typeIdx = 0; typeIdx < cellTypes.length; typeIdx++) {
        const type = cellTypes[typeIdx];
        ctx.fillStyle = colors[type];
        ctx.globalAlpha = 0.7;
        ctx.beginPath();

        for (let i = 0; i < data.length; i++) {
            const x = xPositions[i];
            let cumulative = 0;
            for (let j = 0; j <= typeIdx; j++) {
                cumulative += data[i][cellTypes[j]] || 0;
            }
            // Normalize to percentage
            const y = h - (cumulative / totals[i]) * (h - 10) - 5;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        for (let i = data.length - 1; i >= 0; i--) {
            const x = xPositions[i];
            let cumulative = 0;
            for (let j = 0; j < typeIdx; j++) {
                cumulative += data[i][cellTypes[j]] || 0;
            }
            const y = h - (cumulative / totals[i]) * (h - 10) - 5;
            ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fill();
    }

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Span: ${formatNumber(geometry.totalSpan)} ticks`, 5, h - 6);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
}

function renderHistoricalStats() {
    if (!simulator) return;

    const stats = simulator.getHistoricalStats();

    // Top species (styled like sidebar with body preview)
    const topSpeciesHtml = stats.topSpecies.map((sp, i) =>
        renderSpeciesCard(sp, `Peak: ${sp.peakPop} at tick ${formatNumber(sp.peakTick)}`, i)
    ).join('');
    document.getElementById('history-top-species').innerHTML =
        topSpeciesHtml || '<em>No data yet</em>';

    // Extinctions (styled with body preview)
    const extinctionsHtml = stats.dramaticExtinctions.map((sp, i) =>
        renderSpeciesCard(sp, `Peak: ${sp.peakPop}, last seen: tick ${formatNumber(sp.lastSeen)}`, i)
    ).join('');
    document.getElementById('history-extinctions').innerHTML =
        extinctionsHtml || '<em>No extinctions yet</em>';

    // Most predatory (styled with body preview)
    const predatoryHtml = stats.mostPredatory.map((sp, i) => {
        const killsPerOrg = sp.totalOrgs > 0 ? (sp.totalKills / sp.totalOrgs).toFixed(1) : '0';
        return renderSpeciesCard(sp, `${sp.totalKills} kills (${killsPerOrg}/org)`, i);
    }).join('');
    document.getElementById('history-predatory').innerHTML =
        predatoryHtml || '<em>No killers yet</em>';

    // Overall stats
    document.getElementById('history-total-gens').textContent = formatNumber(simulator.generation);
    document.getElementById('history-total-births').textContent = formatNumber(simulator.stats.births);
    document.getElementById('history-total-deaths').textContent = formatNumber(simulator.stats.deaths);
    document.getElementById('history-total-predations').textContent = formatNumber(simulator.stats.predations);

    // Draw all species body previews after DOM is updated
    requestAnimationFrame(() => {
        document.querySelectorAll('.species-body-preview').forEach(canvas => {
            const bodyData = canvas.dataset.body;
            if (bodyData) {
                drawSpeciesBodyPreview(canvas, JSON.parse(bodyData));
            }
        });
    });
}

// Render a species card with colored cell types and body preview
function renderSpeciesCard(species, detailText, index) {
    const bodyJson = species.exampleBody ? JSON.stringify(species.exampleBody) : '';
    const cellComposition = formatSpeciesComposition(species.signature);

    return `<div class="species-card">
        <div class="species-card-body">
            <canvas class="species-body-preview" width="50" height="50" data-body='${bodyJson}'></canvas>
        </div>
        <div class="species-card-info">
            <div class="species-composition">${cellComposition}</div>
            <div class="species-detail">${detailText}</div>
        </div>
    </div>`;
}

// Format species composition with colored cell type names (like sidebar)
function formatSpeciesComposition(signature) {
    const counts = signature.split(',').map(Number);
    // Must match SIG_TYPES order: MUSCLE, NOSE, SENSOR, MOUTH, PHOTO, SHIELD, EMIT
    const typeInfo = [
        {name: 'Muscle', color: '#7878FF'},
        {name: 'Nose', color: '#FFA050'},
        {name: 'Eye', color: '#FFFF78'},
        {name: 'Teeth', color: '#FF7878'},
        {name: 'Photo', color: '#78FF78'},
        {name: 'Shield', color: '#78DCDC'},
        {name: 'Emitter', color: '#FFFFFF'}
    ];

    const parts = [];
    SIG_TYPES.forEach((type, i) => {
        if (counts[i] > 0) {
            parts.push(`<span style="color: ${typeInfo[i].color}; font-weight: 500;">${typeInfo[i].name}: ${counts[i]}</span>`);
        }
    });
    return parts.join(' | ') || 'Empty';
}

// Draw a small body preview on a canvas
function drawSpeciesBodyPreview(canvas, body) {
    if (!body || !body.xs || body.xs.length === 0) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Find bounds
    let maxX = 0, maxY = 0;
    for (let i = 0; i < body.xs.length; i++) {
        if (body.xs[i] > maxX) maxX = body.xs[i];
        if (body.ys[i] > maxY) maxY = body.ys[i];
    }

    const orgW = maxX + 1;
    const orgH = maxY + 1;
    const padding = 4;
    const cellSize = Math.min((w - padding * 2) / orgW, (h - padding * 2) / orgH, 12);

    const offsetX = (w - orgW * cellSize) / 2;
    const offsetY = (h - orgH * cellSize) / 2;

    // Draw cells
    for (let i = 0; i < body.xs.length; i++) {
        const px = offsetX + body.xs[i] * cellSize;
        const py = offsetY + body.ys[i] * cellSize;
        ctx.fillStyle = CELL_COLORS[body.ts[i]];
        ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
    }
}

function formatSpeciesName(signature) {
    const counts = signature.split(',').map(Number);
    // Must match SIG_TYPES order: MUSCLE, NOSE, SENSOR, MOUTH, PHOTO, SHIELD, EMIT
    const names = ['Mu', 'No', 'Ey', 'Te', 'Ph', 'Sh', 'Em'];
    const parts = [];
    SIG_TYPES.forEach((type, i) => {
        if (counts[i] > 0) {
            parts.push(`${names[i]}×${counts[i]}`);
        }
    });
    return parts.join(', ') || 'Empty';
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

// =====================
// Core UI Functions
// =====================

// Background tab handling
let backgroundIntervalId = null;
let lastTime = 0;
let stepAccumulator = 0;

function resetFrameTiming() {
    lastTime = 0;
    stepAccumulator = 0;
}

function toggleRunning() {
    if (!simulator) return;

    simulator.running = !simulator.running;
    document.getElementById('start-btn').textContent = simulator.running ? 'Pause' : 'Start';

    if (simulator.running) {
        startSimLoop();
    } else {
        stopSimLoop();
    }
}

function startSimLoop() {
    resetFrameTiming();
    if (document.hidden) {
        // Tab is hidden, use setInterval
        startBackgroundLoop();
    } else {
        // Tab is visible, use requestAnimationFrame
        animationId = requestAnimationFrame(runLoop);
    }
}

function stopSimLoop() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (backgroundIntervalId) {
        clearInterval(backgroundIntervalId);
        backgroundIntervalId = null;
    }
    resetFrameTiming();
}

function startBackgroundLoop() {
    if (backgroundIntervalId) return;

    const interval = Math.max(1000 / simulator.speed, 10);  // Min 10ms
    backgroundIntervalId = setInterval(() => {
        if (!simulator || !simulator.running) {
            clearInterval(backgroundIntervalId);
            backgroundIntervalId = null;
            return;
        }
        simulator.step();
    }, interval);
}

// Handle visibility change to switch between RAF and setInterval
document.addEventListener('visibilitychange', () => {
    if (!simulator || !simulator.running) return;

    if (document.hidden) {
        // Tab became hidden - switch to setInterval
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        startBackgroundLoop();
    } else {
        // Tab became visible - switch to requestAnimationFrame
        if (backgroundIntervalId) {
            clearInterval(backgroundIntervalId);
            backgroundIntervalId = null;
        }
        resetFrameTiming();
        animationId = requestAnimationFrame(runLoop);
    }
});

function step() {
    if (!simulator) return;
    simulator.stepBatch(1);
}

function reset() {
    if (!simulator) return;

    if (simulator.running) {
        toggleRunning();
    }

    simulator.init();
}

function setZoom(zoom) {
    if (!simulator) return;
    simulator.zoom = zoom;

    const cellSize = Math.round(CELL_SIZE * zoom);
    const canvasSize = cellSize * simulator.world.size;

    simulator.canvas.width = canvasSize;
    simulator.canvas.height = canvasSize;

    const container = document.getElementById('canvas-container');
    const panel = document.querySelector('.canvas-panel');
    const fitsWidth = canvasSize <= panel.clientWidth;
    const fitsHeight = canvasSize <= panel.clientHeight;

    if (fitsWidth && fitsHeight) {
        container.classList.remove('zoomed-in');
    } else {
        container.classList.add('zoomed-in');
    }

    simulator.render();
}

function toggleGrid() {
    if (!simulator) return;
    simulator.showGrid = document.getElementById('show-grid').checked;
    simulator.render();
}

function runLoop(timestamp) {
    if (!simulator || !simulator.running) return;

    if (lastTime === 0) {
        lastTime = timestamp;
    }

    const frameDelta = Math.min(timestamp - lastTime, 250);
    lastTime = timestamp;

    const interval = 1000 / simulator.speed;
    stepAccumulator += frameDelta;

    let stepsToRun = Math.floor(stepAccumulator / interval);
    if (stepsToRun > 0) {
        const maxStepsPerFrame = 8;
        if (stepsToRun > maxStepsPerFrame) {
            stepsToRun = maxStepsPerFrame;
        }
        stepAccumulator -= stepsToRun * interval;
        simulator.stepBatch(stepsToRun);
    }

    animationId = requestAnimationFrame(runLoop);
}
