console.log('main.js loaded');
import { players, state, initGameState, GRID_W, GRID_H } from './state.js';
import { getStationGraph, getPlayerTerritoryHulls } from './utils.js';
import { initInput } from './input.js';
import { updateAI } from './ai.js';
import { updateUnits, updateProjectiles } from './units.js';
import { draw, initRenderer } from './renderer.js';
import { updateUI, updateControlText, showGameOver, setupUIBindings } from './ui.js';

import { pregenerateGraphics, rawGraphics } from './graphics.js';

const canvas = document.getElementById('gameCanvas');

// Set 1:1 hardware pixel resolution from the CSS flex container bounds
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

initGameState(canvas.width, canvas.height);
initRenderer(canvas);
initInput(canvas);
setupUIBindings();

// Inject dynamic SVGs into UI Elements
const injectIcon = (selector, html) => {
    const el = document.querySelector(selector);
    if (el) el.outerHTML = html;
};

// Inject dynamic SVGs into UI Elements
injectIcon('#p1-btn-miner svg', rawGraphics.miner('#1f6feb', false));
injectIcon('#p1-btn-station svg', rawGraphics.station('#1f6feb'));
injectIcon('#p1-btn-fighter svg', rawGraphics.fighter('#1f6feb'));

injectIcon('#p2-btn-miner svg', rawGraphics.miner('#f85149', false));
injectIcon('#p2-btn-station svg', rawGraphics.station('#f85149'));
injectIcon('#p2-btn-fighter svg', rawGraphics.fighter('#f85149'));

let graphicsLoaded = false;
pregenerateGraphics().then(() => {
    graphicsLoaded = true;
});

function endGame(winnerId, reason) {
    if (state.gameOver) return;
    state.gameOver = true;
    showGameOver(winnerId, reason);
}

// Game Loop
function update(time) {
    const dt = (time - state.lastTime) / 1000 || 0;
    state.lastTime = time;

    if (!state.gameStarted || !graphicsLoaded) return;

    updateUI();

    const currentHulls = [];

    // Update Players
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
                    // Finish the one that was building
                    let qi = p.buildQueue.findIndex(b => b.type === bt.type);
                    if (qi !== -1) {
                        p.units[bt.type].push(p.buildQueue[qi].unitData);
                        p.buildQueue.splice(qi, 1);
                    }
                    // Start next if available
                    if (p.buildQueue.some(b => b.type === bt.type)) {
                        p.buildCooldowns[bt.key] = bt.time;
                    }
                }
            } else {
                // Not building, but something in queue? Start it.
                if (p.buildQueue.some(b => b.type === bt.type)) {
                    p.buildCooldowns[bt.key] = bt.time;
                }
            }
        });

        if (p.isCPU) updateAI(p, dt, GRID_W, GRID_H);

        const hulls = getPlayerTerritoryHulls(p, players, false);

        // Control Area Calculation
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

        if (pct >= 55.0 && !state.gameOver) {
            endGame(p.id, 'Domination');
        }

        if (p.id === 0) {
            updateControlText(pct, parseFloat(document.getElementById('p2-control').innerText || 0));
        } else {
            updateControlText(parseFloat(document.getElementById('p1-control').innerText || 0), pct);
        }

        updateUnits(p, dt, null, state.selectedFighters, state.drawingPath);

        // Update Damage Timers for all units/planets
        p.homePlanet.damageTime = Math.max(0, (p.homePlanet.damageTime || 0) - dt);
        ['stations', 'fighters', 'miners'].forEach(type => {
            p.units[type].forEach(u => {
                u.damageTime = Math.max(0, (u.damageTime || 0) - dt);
            });
        });
    });

    updateProjectiles(dt);

    // Cleanup Dead Entities
    players.forEach(p => {
        p.units.stations = p.units.stations.filter(u => u.health > 0);
        p.units.fighters = p.units.fighters.filter(u => u.health > 0);
        p.units.miners = p.units.miners.filter(u => {
            if (u.health <= 0 && u.targetAsteroid) {
                u.targetAsteroid.miners = Math.max(0, u.targetAsteroid.miners - 1);
            }
            return u.health > 0;
        });

        // Keep dead planets around for visual ruin or end game state, but cap at 0
        if (p.homePlanet.health <= 0) p.homePlanet.health = 0;
    });

    if (state.gameOver) return;
    players.forEach(p => {
        // Destruction Loss
        if (p.homePlanet.health <= 0) {
            endGame(players.find(ep => ep.id !== p.id).id, 'Destruction');
        }
        // Bankruptcy Loss
        let totalUnits = p.units.stations.length + p.units.fighters.length + p.units.miners.length;
        if (totalUnits === 0 && p.energy < 25) {
            endGame(players.find(ep => ep.id !== p.id).id, 'Bankruptcy');
        }
    });
}

function gameLoop(t) {
    if (!state.gameOver) {
        update(t);
        draw();
    }
    requestAnimationFrame(gameLoop);
}

// Start
requestAnimationFrame((t) => { state.lastTime = t; gameLoop(t); });
