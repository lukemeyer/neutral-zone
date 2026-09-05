import { createCommanderState } from './commander_state.js';
import { updateCommanderUnits, queueBuild, COMMANDER_COSTS, COMMANDER_BUILD_TIMES } from './commander_units.js';
import { updateCommanderAI } from './commander_ai.js';
import { renderCommanderGame } from './commander_renderer.js';
import { polygonArea, getTerritoryPolygon, canExpandStation } from './commander_math.js';

let state = null;
let canvas = null;
let ctx = null;
let lastTime = 0;

export function initCommander() {
    canvas = document.getElementById('commander-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
    window.addEventListener('resize', resizeCanvas);
    const ro = new ResizeObserver(() => resizeCanvas());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resizeCanvas();

    state = createCommanderState();

    setupUIHandlers();

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function setupUIHandlers() {
    const p1 = state.players[0];

    // Build buttons
    const btnStation = document.getElementById('btn-build-station');
    if (btnStation) {
        btnStation.addEventListener('click', () => queueBuild(p1, 'station', state.players[1]));
    }

    const btnMiner = document.getElementById('btn-build-miner');
    if (btnMiner) {
        btnMiner.addEventListener('click', () => queueBuild(p1, 'miner', state.players[1]));
    }

    const btnFighter = document.getElementById('btn-build-fighter');
    if (btnFighter) {
        btnFighter.addEventListener('click', () => queueBuild(p1, 'fighter', state.players[1]));
    }

    // Fleet Stance buttons
    const btnPatrol = document.getElementById('btn-stance-patrol');
    const btnDefend = document.getElementById('btn-stance-defend');
    const btnAttack = document.getElementById('btn-stance-attack');

    function setStance(newStance) {
        p1.stance = newStance;
        [btnPatrol, btnDefend, btnAttack].forEach(b => b && b.classList.remove('active'));
        if (newStance === 'patrol' && btnPatrol) btnPatrol.classList.add('active');
        if (newStance === 'defend' && btnDefend) btnDefend.classList.add('active');
        if (newStance === 'attack' && btnAttack) btnAttack.classList.add('active');
    }

    if (btnPatrol) btnPatrol.addEventListener('click', () => setStance('patrol'));
    if (btnDefend) btnDefend.addEventListener('click', () => setStance('defend'));
    if (btnAttack) btnAttack.addEventListener('click', () => setStance('attack'));

    // Keyboard Hotkeys
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Digit1' || e.code === 'KeyP') setStance('patrol');
        if (e.code === 'Digit2' || e.code === 'KeyD') setStance('defend');
        if (e.code === 'Digit3' || e.code === 'KeyA') setStance('attack');
        if (e.code === 'Space') {
            state.isPaused = !state.isPaused;
            const pBtn = document.getElementById('btn-pause');
            if (pBtn) pBtn.innerText = state.isPaused ? '▶ Resume' : '⏸ Pause';
        }
    });

    // Speed buttons
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

    // Pause button
    const pBtn = document.getElementById('btn-pause');
    if (pBtn) {
        pBtn.addEventListener('click', () => {
            state.isPaused = !state.isPaused;
            pBtn.innerText = state.isPaused ? '▶ Resume' : '⏸ Pause';
        });
    }

    // Restart button
    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
        btnRestart.addEventListener('click', () => {
            state = createCommanderState();
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

    // Units
    document.getElementById('p1-miners').innerText = p1.units.miners.length;
    document.getElementById('p1-fighters').innerText = p1.units.fighters.length;
    document.getElementById('p1-stations').innerText = p1.stationCount;

    document.getElementById('p2-miners').innerText = p2.units.miners.length;
    document.getElementById('p2-fighters').innerText = p2.units.fighters.length;
    document.getElementById('p2-stations').innerText = p2.stationCount;
    document.getElementById('p2-stance').innerText = p2.stance.toUpperCase();

    // Territory Domination %
    const totalMapArea = 20 * 15;
    const p1Area = polygonArea(getTerritoryPolygon(p1.homePlanet, p1.stations, false));
    const p2Area = polygonArea(getTerritoryPolygon(p2.homePlanet, p2.stations, true));

    const p1Pct = ((p1Area / totalMapArea) * 100).toFixed(1);
    const p2Pct = ((p2Area / totalMapArea) * 100).toFixed(1);

    document.getElementById('p1-control').innerText = `${p1Area.toFixed(1)} (${p1Pct}%)`;
    document.getElementById('p2-control').innerText = `${p2Area.toFixed(1)} (${p2Pct}%)`;

    const domBarP1 = document.getElementById('dom-bar-p1');
    const domBarP2 = document.getElementById('dom-bar-p2');
    if (domBarP1 && domBarP2) {
        domBarP1.style.width = `${p1Pct}%`;
        domBarP2.style.width = `${p2Pct}%`;
    }

    // Progress Bars & Build Queue (Max 3 per unit type)
    ['station', 'miner', 'fighter'].forEach(t => {
        const prog = document.getElementById(`p1-prog-${t}`);
        if (prog) {
            const cd = p1.buildCooldowns[t];
            const maxCd = COMMANDER_BUILD_TIMES[t];
            const r = cd > 0 ? (1 - cd / maxCd) : 0;
            prog.style.width = `${r * 100}%`;
        }

        const inProgress = p1.buildCooldowns[t] > 0 ? 1 : 0;
        const queuedCount = p1.buildQueue.filter(b => b.type === t).length;
        const totalQueued = inProgress + queuedCount;

        const queueContainer = document.getElementById(`p1-queue-${t}`);
        if (queueContainer) {
            const pips = queueContainer.querySelectorAll('.pip');
            pips.forEach((pip, idx) => {
                pip.classList.remove('active', 'waiting');
                if (idx === 0 && inProgress) {
                    pip.classList.add('active');
                } else if (idx < totalQueued) {
                    pip.classList.add('waiting');
                }
            });
        }

        // Button states: full queue / blocked expansion
        const btn = document.getElementById(`btn-build-${t}`);
        if (btn) {
            if (t === 'station') {
                const canExpand = canExpandStation(p1, p2, p1.stationCount + totalQueued + 1);
                if (!canExpand) {
                    btn.classList.add('blocked');
                    btn.title = 'Frontier Blocked: Cannot overlap enemy territory!';
                } else {
                    btn.classList.remove('blocked');
                    btn.title = `Expand Station Perimeter (50 Energy) [${totalQueued}/3 queued]`;
                }
            } else {
                btn.title = `Build ${t} (${COMMANDER_COSTS[t]} Energy) [${totalQueued}/3 queued]`;
            }
        }
    });
}

function checkWinConditions() {
    if (state.isGameOver) return;

    const p1 = state.players[0];
    const p2 = state.players[1];

    const totalMapArea = 20 * 15;
    const p1Area = polygonArea(getTerritoryPolygon(p1.homePlanet, p1.stations, false));
    const p2Area = polygonArea(getTerritoryPolygon(p2.homePlanet, p2.stations, true));

    let winner = null;
    let reason = '';

    if (p1Area >= totalMapArea * 0.50) {
        winner = p1;
        reason = 'Territorial Domination (50% controlled)';
    } else if (p2Area >= totalMapArea * 0.50) {
        winner = p2;
        reason = 'Territorial Domination (50% controlled)';
    } else if (p2.homePlanet.health <= 0) {
        winner = p1;
        reason = 'Enemy Command Citadel Destroyed';
    } else if (p1.homePlanet.health <= 0) {
        winner = p2;
        reason = 'Friendly Command Citadel Destroyed';
    }

    if (winner) {
        state.isGameOver = true;
        state.winner = winner;
        state.winReason = reason;

        const modal = document.getElementById('game-over-modal');
        const text = document.getElementById('game-over-text');
        if (modal && text) {
            text.innerHTML = `<span style="color:${winner.color}">${winner.name} Victorious!</span><br><small style="font-size:14px;color:#8b949e">${reason}</small>`;
            modal.style.display = 'flex';
        }
    }
}

function gameLoop(time) {
    const rawDt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    if (!state.isPaused && !state.isGameOver) {
        const dt = rawDt * state.gameSpeed;
        state.gameTime += dt;
        updateCommanderUnits(state, dt);
        updateCommanderAI(state, dt);
        checkWinConditions();
    }

    renderCommanderGame(ctx, canvas, state);
    updateHUD();

    requestAnimationFrame(gameLoop);
}

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initCommander);
    } else {
        initCommander();
    }
}

