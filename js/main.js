console.log('main.js loaded');
import { players, state, initGameState } from './state.js';
import { getConvexHull } from './utils.js';
import { initInput } from './input.js';
import { updateAI } from './ai.js';
import { updateUnits, updateProjectiles } from './units.js';
import { draw, initRenderer } from './renderer.js';
import { updateUI, updateControlText, showGameOver, setupUIBindings } from './ui.js';

const canvas = document.getElementById('gameCanvas');

initGameState();
initRenderer(canvas);
initInput(canvas);
setupUIBindings();

function endGame(winnerId, reason) {
    if (state.gameOver) return;
    state.gameOver = true;
    showGameOver(winnerId, reason);
}

// Game Loop
function update(time) {
    const dt = (time - state.lastTime) / 1000 || 0;
    state.lastTime = time;

    if (!state.gameStarted) return;

    updateUI();

    const currentHulls = [];

    // Update Players
    players.forEach(p => {
        if (p.isCPU) updateAI(p, dt);

        const currentPoints = [p.homePlanet, ...p.units.scouts.map(s => ({ x: s.x, y: s.y }))];
        const currentHull = getConvexHull(currentPoints);
        currentHulls.push(currentHull);

        // Control Area Calculation
        let area = 0;
        for (let i = 0; i < currentHull.length; i++) {
            let j = (i + 1) % currentHull.length;
            area += currentHull[i].x * currentHull[j].y;
            area -= currentHull[j].x * currentHull[i].y;
        }
        area = Math.abs(area / 2);
        const totalArea = 1280 * 720;
        const pct = (area / totalArea) * 100;

        if (pct >= 70.0 && !state.gameOver) {
            endGame(p.id, 'Domination');
        }

        if (p.id === 0) {
            updateControlText(pct, parseFloat(document.getElementById('p2-control').innerText || 0));
        } else {
            updateControlText(parseFloat(document.getElementById('p1-control').innerText || 0), pct);
        }

        updateUnits(p, dt, currentHull, state.selectedFighters, state.drawingPath);
    });

    updateProjectiles(dt);

    // Cleanup Dead Entities
    players.forEach(p => {
        p.units.scouts = p.units.scouts.filter(u => u.health > 0);
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
        let totalUnits = p.units.scouts.length + p.units.fighters.length + p.units.miners.length;
        if (totalUnits === 0 && p.energy < 25) {
            endGame(players.find(ep => ep.id !== p.id).id, 'Bankruptcy');
        }
    });
}

function gameLoop(t) {
    update(t);
    draw();
    requestAnimationFrame(gameLoop);
}

// Start
requestAnimationFrame((t) => { state.lastTime = t; gameLoop(t); });
