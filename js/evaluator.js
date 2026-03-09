import { players, asteroids, projectiles, state, initGameState, GRID_W, GRID_H } from './state.js';
import { getPlayerTerritoryHulls } from './utils.js';
import { initInput } from './input.js';
import { updateAI, } from './ai.js';
import { updateUnits, updateProjectiles } from './units.js';
import { draw, initRenderer } from './renderer.js';
import { pregenerateGraphics, rawGraphics } from './graphics.js';

// ---- Evaluator State & Framework ----

let currentScenario = null;
let tickCount = 0;
let timeSeconds = 0;
let isPlaying = true;
let speedMultiplier = 1;
let lastTime = performance.now();
const LOG_TYPES = { INFO: 'log-info', SUCCESS: 'log-success', ERROR: 'log-error' };

const canvas = document.getElementById('gameCanvas');

// Resize observer to ensure the canvas takes up the flex area properly before rendering
const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        if (entry.target === canvas.parentElement) {
            canvas.width = entry.contentRect.width;
            canvas.height = entry.contentRect.height;
            initGameState(canvas.width, canvas.height); // Needed to fix aspect ratio
        }
    }
});
resizeObserver.observe(canvas.parentElement);
canvas.width = canvas.parentElement.clientWidth;
canvas.height = canvas.parentElement.clientHeight;

initGameState(canvas.width, canvas.height);
initRenderer(canvas);
initInput(canvas); // To allow user to inspect/click

// Inject dynamic SVGs into UI Elements
const injectIcon = (selector, html) => {
    const el = document.querySelector(selector);
    if (el) el.outerHTML = html;
};

injectIcon('#p1-btn-miner svg', rawGraphics.miner('#1f6feb', false));
injectIcon('#p1-btn-station svg', rawGraphics.station('#1f6feb'));
injectIcon('#p1-btn-fighter svg', rawGraphics.fighter('#1f6feb'));

injectIcon('#p2-btn-miner svg', rawGraphics.miner('#f85149', false));
injectIcon('#p2-btn-station svg', rawGraphics.station('#f85149'));
injectIcon('#p2-btn-fighter svg', rawGraphics.fighter('#f85149'));

function logMsg(msg, type = LOG_TYPES.INFO) {
    const logEl = document.getElementById('evaluator-log');
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerText = `[${timeSeconds.toFixed(1)}s] ${msg}`;
    logEl.prepend(div);
}

function clearLog() {
    document.getElementById('evaluator-log').innerHTML = '';
}

function assert(condition, message) {
    if (!condition) {
        logMsg(`ASSERT FAILED: ${message}`, LOG_TYPES.ERROR);
        isPlaying = false;
        document.getElementById('btn-play-pause').innerText = 'Play';
        throw new Error("Assertion Failed: " + message);
    }
}

function assertPass(condition, message) {
    if (condition) {
        logMsg(`SCENARIO PASSED: ${message}`, LOG_TYPES.SUCCESS);
        isPlaying = false;
        document.getElementById('btn-play-pause').innerText = 'Play';
    }
}

// Reset minimal game state for scenarios
function resetScenarioState() {
    players.forEach(p => {
        p.energy = 150;
        p.homePlanet.health = p.homePlanet.maxHealth;
        p.homePlanet.x = p.id === 0 ? 2 : 18;
        p.homePlanet.y = 7.5;
        p.homePlanet.radius = 0.6;
        p.units.stations = [];
        p.units.fighters = [];
        p.units.miners = [];
        p.buildCooldowns = { miner: 0, station: 0, fighter: 0 };
        p.buildQueue = [];
        p.aiTimer = 0;
        p.stationSettleTimer = 0;
    });
    asteroids.length = 0;
    projectiles.length = 0;
    state.gameStarted = true;
    state.gameOver = false;
    tickCount = 0;
    timeSeconds = 0;
    isPlaying = true;
    document.getElementById('btn-play-pause').innerText = 'Pause';
    clearLog();
    logMsg("Scenario loaded.", LOG_TYPES.INFO);
}

// ---- Scenarios Definition ----

const scenarios = {
    expansioneer_opening: {
        name: "Expansioneer CPU - First 60s Opening",
        setup: () => {
            resetScenarioState();
            const p1 = players[0];
            p1.isCPU = true;
            p1.type = 'cpu_expansioneer';

            asteroids.push({ x: 4, y: 5.6, radius: 0.3, miners: 0, resources: 400, variant: 0 });
            asteroids.push({ x: 4, y: 9.3, radius: 0.3, miners: 0, resources: 400, variant: 1 });

            // Dummy P2
            players[1].isCPU = false;

            logMsg("Task: P1 should build a station and a miner within 60s.");
        },
        tick: () => {
            const p1 = players[0];
            // Stop if they do nothing for 60 seconds
            if (timeSeconds > 60) {
                assert(p1.units.stations.length > 0, "Failed to build any stations in 60s!");
                assert(p1.units.miners.length > 0, "Failed to build any miners in 60s!");
                assertPass(true, "Successfully built station and miner within 60 seconds.");
            }
        }
    },

    economy_expansion: {
        name: "Expansioneer CPU - Expansion on free board",
        setup: () => {
            resetScenarioState();
            const p1 = players[0];
            p1.isCPU = true;
            p1.type = 'cpu_expansioneer';

            asteroids.push({ x: 4, y: 5.6, radius: 0.3, miners: 0, resources: 500, variant: 0 });
            asteroids.push({ x: 4, y: 9.3, radius: 0.3, miners: 0, resources: 500, variant: 1 });
            asteroids.push({ x: 6, y: 7.5, radius: 0.3, miners: 0, resources: 500, variant: 2 });

            players[1].isCPU = false;

            logMsg("Task: P1 should expand to 3 stations within 120s.");
        },
        tick: () => {
            const p1 = players[0];
            if (timeSeconds > 120) {
                assert(p1.units.stations.length >= 3, "Failed to expand to 3 stations in 120s.");
            } else if (p1.units.stations.length >= 3) {
                assertPass(true, `Successfully built 3 stations in ${timeSeconds.toFixed(1)}s.`);
            }
        }
    },

    fighter_response: {
        name: "Expansioneer CPU - Fighter Defense Response",
        setup: () => {
            resetScenarioState();
            const p1 = players[0];
            p1.isCPU = true;
            p1.type = 'cpu_expansioneer';

            asteroids.push({ x: 4, y: 5.6, radius: 0.3, miners: 0, resources: 400, variant: 0 });
            asteroids.push({ x: 4, y: 9.3, radius: 0.3, miners: 0, resources: 400, variant: 1 });

            // Give P1 a station and a miner to avoid getting stuck early
            p1.units.stations.push({ x: 3, y: 7.5, targetX: 3, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
            p1.units.miners.push({ x: 2, y: 7.5, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });

            const p2 = players[1];
            p2.isCPU = false;

            // Give P2 an attacking fighter
            p2.units.fighters.push({ x: 10, y: 7.5, path: [{ x: 3, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

            logMsg("Task: P1 should build a defensive fighter when threatened.");
        },
        tick: () => {
            const p1 = players[0];

            if (p1.units.fighters.length > 0 || p1.buildQueue.some(q => q.type === 'fighters')) {
                assertPass(true, `P1 started building a fighter to defend in ${timeSeconds.toFixed(1)}s.`);
            }
            if (timeSeconds > 45) {
                assert(p1.units.fighters.length > 0, "P1 failed to build a fighter to defend against the threat in 45s.");
            }
        }
    }
};

// ---- UI Bindings ----

const scenarioSelector = document.getElementById('scenario-selector');
Object.keys(scenarios).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.innerText = scenarios[key].name;
    scenarioSelector.appendChild(opt);
});

scenarioSelector.addEventListener('change', (e) => {
    if (scenarios[e.target.value]) {
        currentScenario = scenarios[e.target.value];
        currentScenario.setup();
    }
});

document.getElementById('btn-restart-scenario').addEventListener('click', () => {
    if (currentScenario) {
        currentScenario.setup();
    }
});

document.getElementById('btn-play-pause').addEventListener('click', (e) => {
    isPlaying = !isPlaying;
    e.target.innerText = isPlaying ? 'Pause' : 'Play';
});

document.getElementById('speed-selector').addEventListener('change', (e) => {
    speedMultiplier = parseInt(e.target.value);
});

// Helper from main.js (for UI updates, although we may skip most UI in evaluator)
function updateUI() {
    ['p1', 'p2'].forEach((pid, i) => {
        const p = players[i];
        document.getElementById(`${pid}-energy`).innerText = Math.floor(p.energy);
        document.getElementById(`${pid}-fighters`).innerText = p.units.fighters.length;
        document.getElementById(`${pid}-stations`).innerText = p.units.stations.length;
        document.getElementById(`${pid}-miners`).innerText = p.units.miners.length;
    });

    document.getElementById('tick-counter').innerText = tickCount;
    document.getElementById('time-counter').innerText = timeSeconds.toFixed(1) + 's';
}

// ---- Evaluator Engine Loop ----

function emulatorTick(dt) {
    if (!state.gameStarted) return;

    players.forEach(p => {
        // Handle Build Queue and Cooldowns
        const buildTypes = [
            { key: 'miner', type: 'miners', time: 5 },
            { key: 'station', type: 'stations', time: 10 },
            { key: 'fighter', type: 'fighters', time: 15 }
        ];

        buildTypes.forEach(bt => {
            if (p.buildCooldowns[bt.key] > 0) {
                p.buildCooldowns[bt.key] -= dt;
                if (p.buildCooldowns[bt.key] <= 0) {
                    p.buildCooldowns[bt.key] = 0;
                    let qi = p.buildQueue.findIndex(b => b.type === bt.type);
                    if (qi !== -1) {
                        p.units[bt.type].push(p.buildQueue[qi].unitData);
                        p.buildQueue.splice(qi, 1);
                    }
                    if (p.buildQueue.some(b => b.type === bt.type)) {
                        p.buildCooldowns[bt.key] = bt.time;
                    }
                }
            } else {
                if (p.buildQueue.some(b => b.type === bt.type)) {
                    p.buildCooldowns[bt.key] = bt.time;
                }
            }
        });

        if (p.isCPU) updateAI(p, dt, GRID_W, GRID_H);

        // Control Area Calculation
        const hulls = getPlayerTerritoryHulls(p, players, false);
        let area = 0;
        for (let hull of hulls) {
            let subArea = 0;
            for (let i = 0; i < hull.length; i++) {
                let j = (i + 1) % hull.length;
                subArea += hull[i].x * hull[j].y;
                subArea -= hull[j].x * hull[i].y;
            }
            area += Math.abs(subArea / 2);
        }

        const totalArea = GRID_W * GRID_H;
        const pct = (area / totalArea) * 100;
        document.getElementById(`p${p.id + 1}-control`).innerText = pct.toFixed(1);

        updateUnits(p, dt, null, state.selectedFighters, state.drawingPath);

        p.homePlanet.damageTime = Math.max(0, (p.homePlanet.damageTime || 0) - dt);
        ['stations', 'fighters', 'miners'].forEach(type => {
            p.units[type].forEach(u => {
                u.damageTime = Math.max(0, (u.damageTime || 0) - dt);
            });
        });
    });

    updateProjectiles(dt);

    players.forEach(p => {
        p.units.stations = p.units.stations.filter(u => u.health > 0);
        p.units.fighters = p.units.fighters.filter(u => u.health > 0);
        p.units.miners = p.units.miners.filter(u => {
            if (u.health <= 0 && u.targetAsteroid) {
                u.targetAsteroid.miners = Math.max(0, u.targetAsteroid.miners - 1);
            }
            return u.health > 0;
        });

        if (p.homePlanet.health <= 0) p.homePlanet.health = 0;
    });

    tickCount++;
    timeSeconds += dt;

    if (currentScenario && currentScenario.tick) {
        try {
            currentScenario.tick();
        } catch (e) {
            console.error(e);
        }
    }
}

let graphicsLoaded = false;
pregenerateGraphics().then(() => {
    graphicsLoaded = true;
});


function evaluatorLoop(time) {
    const dt = (time - lastTime) / 1000 || 0;
    lastTime = time;

    if (graphicsLoaded && isPlaying && currentScenario) {
        // Update physics steps according to speed multiplier
        const baseDt = 1 / 60;
        // Emulate higher speeds by running multiple fixed time steps
        const ticksThisFrame = speedMultiplier;

        for (let i = 0; i < ticksThisFrame; i++) {
            if (isPlaying) {
                emulatorTick(baseDt);
            }
        }
    }

    if (graphicsLoaded) {
        updateUI();
        draw();
    }

    requestAnimationFrame(evaluatorLoop);
}

// Ensure first scenario starts or load empty board
requestAnimationFrame((t) => { lastTime = t; evaluatorLoop(t); });

