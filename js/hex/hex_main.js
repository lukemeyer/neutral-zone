import { createInitialState } from './hex_state.js';
import { updateUnits, scrambleFighters, recallFighters, COSTS, BUILD_TIMES } from './hex_units.js';
import { updateHexAI } from './hex_ai.js';
import { renderHexGame } from './hex_renderer.js';
import { hexAudio } from './hex_audio.js';

let state = null;
let canvas = null;
let ctx = null;
let lastTime = 0;

export function initHexGame() {
    canvas = document.getElementById('hex-canvas');
    ctx = canvas.getContext('2d');

    // Resize canvas dynamically to match container
    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
    window.addEventListener('resize', resizeCanvas);
    const ro = new ResizeObserver(() => resizeCanvas());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resizeCanvas();

    // Initialize Game State
    state = createInitialState(20, 15, 1.6);

    setupInputHandlers();
    setupUIHandlers();

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function setupInputHandlers() {
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scX = canvas.width / state.grid.width;
        const scY = canvas.height / state.grid.height;
        const wx = (e.clientX - rect.left) * (canvas.width / rect.width) / scX;
        const wy = (e.clientY - rect.top) * (canvas.height / rect.height) / scY;

        // Find nearest vertex
        let closestVertex = null;
        let minDist = 0.55;
        state.grid.vertices.forEach(v => {
            const d = Math.hypot(v.x - wx, v.y - wy);
            if (d < minDist) {
                minDist = d;
                closestVertex = v;
            }
        });
        state.hoveredVertexId = closestVertex ? closestVertex.id : null;

        // Find nearest cell
        let closestCell = null;
        let minCellDist = 1.6;
        state.grid.cells.forEach(c => {
            const d = Math.hypot(c.center.x - wx, c.center.y - wy);
            if (d < minCellDist) {
                minCellDist = d;
                closestCell = c;
            }
        });
        state.hoveredCellId = closestCell ? closestCell.id : null;
    });

    canvas.addEventListener('click', () => {
        if (state.isGameOver) return;
        hexAudio.init();

        const p1 = state.players[0];

        // 1. Click on vertex: build or upgrade station
        if (state.hoveredVertexId !== null) {
            const v = state.grid.vertices[state.hoveredVertexId];
            if (v.owner === null) {
                // Check if connected to friendly network
                const ownedVertexIds = new Set(state.grid.vertices.filter(vx => vx.owner === 0).map(vx => vx.id));
                const isConnected = v.adjacentVertices.some(adjId => ownedVertexIds.has(adjId));

                if (isConnected && p1.energy >= COSTS.stationRelay) {
                    p1.energy -= COSTS.stationRelay;
                    v.owner = 0;
                    v.station = {
                        type: 'relay',
                        health: 200,
                        maxHealth: 200,
                        cooldown: 0,
                        range: 2.2
                    };
                    const prevCaptured = state.grid.cells.filter(c => c.owner === 0).length;
                    state.grid.updateOwnership();
                    const nowCaptured = state.grid.cells.filter(c => c.owner === 0).length;

                    if (nowCaptured > prevCaptured) {
                        hexAudio.playSectorCapture();
                    } else {
                        hexAudio.playNodePlace();
                    }
                }
            } else if (v.owner === 0 && v.station && v.station.type === 'relay') {
                // Upgrade relay to Defense Turret
                if (p1.energy >= COSTS.stationTurret) {
                    p1.energy -= COSTS.stationTurret;
                    v.station.type = 'turret';
                    v.station.health = 300;
                    v.station.maxHealth = 300;
                    v.station.range = 2.6;
                    hexAudio.playNodePlace();
                }
            }
        }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            state.isPaused = !state.isPaused;
            const pauseBtn = document.getElementById('btn-pause');
            if (pauseBtn) pauseBtn.innerText = state.isPaused ? '▶ Resume' : '⏸ Pause';
        }
    });
}

function setupUIHandlers() {
    const p1 = state.players[0];

    // Build Miner
    const btnMiner = document.getElementById('p1-btn-miner');
    if (btnMiner) {
        btnMiner.addEventListener('click', () => {
            if (p1.energy >= COSTS.miner) {
                p1.energy -= COSTS.miner;
                p1.buildQueue.push({ type: 'miner' });
                hexAudio.playNodePlace();
            }
        });
    }

    // Build Fighter
    const btnFighter = document.getElementById('p1-btn-fighter');
    if (btnFighter) {
        btnFighter.addEventListener('click', () => {
            if (p1.energy >= COSTS.fighter) {
                p1.energy -= COSTS.fighter;
                p1.buildQueue.push({ type: 'fighter' });
                hexAudio.playNodePlace();
            }
        });
    }

    // Scramble Fighters
    const btnScramble = document.getElementById('p1-btn-scramble');
    if (btnScramble) {
        btnScramble.addEventListener('click', () => {
            const launched = scrambleFighters(p1, 2);
            if (launched.length > 0) hexAudio.playLaserPulse();
        });
    }

    // Recall Fighters
    const btnRecall = document.getElementById('p1-btn-recall');
    if (btnRecall) {
        btnRecall.addEventListener('click', () => {
            recallFighters(p1);
        });
    }

    // Game Speed buttons
    const btn1x = document.getElementById('btn-speed-1x');
    const btn2x = document.getElementById('btn-speed-2x');
    if (btn1x && btn2x) {
        btn1x.addEventListener('click', () => {
            state.gameSpeed = 1.0;
            btn1x.classList.add('active');
            btn2x.classList.remove('active');
        });
        btn2x.addEventListener('click', () => {
            state.gameSpeed = 2.0;
            btn2x.classList.add('active');
            btn1x.classList.remove('active');
        });
    }

    // Audio toggle
    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
        btnMute.addEventListener('click', () => {
            hexAudio.muted = !hexAudio.muted;
            btnMute.innerText = hexAudio.muted ? '🔇 Unmute' : '🔊 Sound';
        });
    }

    // Restart button
    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
        btnRestart.addEventListener('click', () => {
            state = createInitialState(20, 15, 1.6);
            document.getElementById('game-over-modal').style.display = 'none';
        });
    }
}

function updateHUD() {
    const p1 = state.players[0];
    const p2 = state.players[1];

    // Energy
    document.getElementById('p1-energy').innerText = Math.floor(p1.energy);
    document.getElementById('p2-energy').innerText = Math.floor(p2.energy);

    // Hangar stats
    document.getElementById('p1-miners-docked').innerText = p1.hangars.miner.dockedUnits.length;
    document.getElementById('p1-miners-active').innerText = p1.units.miners.filter(m => m.state !== 'docked').length;
    document.getElementById('p1-fighters-docked').innerText = p1.hangars.fighter.dockedUnits.length;
    document.getElementById('p1-fighters-active').innerText = p1.units.fighters.filter(f => f.state !== 'docked').length;

    document.getElementById('p2-miners-docked').innerText = p2.hangars.miner.dockedUnits.length;
    document.getElementById('p2-fighters-docked').innerText = p2.hangars.fighter.dockedUnits.length;

    // Sector Domination
    const totalCells = state.grid.cells.length;
    const p1Cells = state.grid.cells.filter(c => c.owner === 0).length;
    const p2Cells = state.grid.cells.filter(c => c.owner === 1).length;

    const p1Pct = ((p1Cells / totalCells) * 100).toFixed(1);
    const p2Pct = ((p2Cells / totalCells) * 100).toFixed(1);

    document.getElementById('p1-sectors').innerText = `${p1Cells} (${p1Pct}%)`;
    document.getElementById('p2-sectors').innerText = `${p2Cells} (${p2Pct}%)`;

    const domBarP1 = document.getElementById('dom-bar-p1');
    const domBarP2 = document.getElementById('dom-bar-p2');
    if (domBarP1 && domBarP2) {
        domBarP1.style.width = `${p1Pct}%`;
        domBarP2.style.width = `${p2Pct}%`;
    }

    // Build progress bars
    const progMiner = document.getElementById('p1-prog-miner');
    if (progMiner) {
        const r = p1.buildCooldowns.miner > 0 ? (1 - p1.buildCooldowns.miner / BUILD_TIMES.miner) : 0;
        progMiner.style.width = `${r * 100}%`;
    }
    const progFighter = document.getElementById('p1-prog-fighter');
    if (progFighter) {
        const r = p1.buildCooldowns.fighter > 0 ? (1 - p1.buildCooldowns.fighter / BUILD_TIMES.fighter) : 0;
        progFighter.style.width = `${r * 100}%`;
    }
}

function checkWinConditions() {
    if (state.isGameOver) return;

    const totalCells = state.grid.cells.length;
    const p1Cells = state.grid.cells.filter(c => c.owner === 0).length;
    const p2Cells = state.grid.cells.filter(c => c.owner === 1).length;

    const p1 = state.players[0];
    const p2 = state.players[1];

    let winner = null;
    let reason = '';

    if (p1Cells >= Math.ceil(totalCells * 0.50)) {
        winner = p1;
        reason = 'Sector Domination (50% controlled)';
    } else if (p2Cells >= Math.ceil(totalCells * 0.50)) {
        winner = p2;
        reason = 'Sector Domination (50% controlled)';
    } else if (p2.homePlanet.health <= 0) {
        winner = p1;
        reason = 'Enemy Base Destroyed';
    } else if (p1.homePlanet.health <= 0) {
        winner = p2;
        reason = 'Friendly Base Destroyed';
    }

    if (winner) {
        state.isGameOver = true;
        state.winner = winner;
        const modal = document.getElementById('game-over-modal');
        const text = document.getElementById('game-over-text');
        if (modal && text) {
            text.innerHTML = `<span style="color:${winner.color}">${winner.name} Wins!</span><br><small style="font-size:14px;color:#8b949e">${reason}</small>`;
            modal.style.display = 'flex';
        }
    }
}

function gameLoop(time) {
    const rawDt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    if (!state.isPaused && !state.isGameOver) {
        const dt = rawDt * state.gameSpeed;
        updateUnits(state, dt);
        updateHexAI(state, dt);
        checkWinConditions();
    }

    renderHexGame(ctx, canvas, state);
    updateHUD();

    requestAnimationFrame(gameLoop);
}

// Auto-boot if loaded in browser
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initHexGame);
}
