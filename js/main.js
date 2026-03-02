console.log('main.js loaded');
import { players, state, initGameState } from './state.js';
import { getConvexHull } from './utils.js';
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
document.querySelector('#p1-btn-miner svg').outerHTML = rawGraphics.miner('#1f6feb', false);
document.querySelector('#p1-btn-scout svg').outerHTML = rawGraphics.scout('#1f6feb');
document.querySelector('#p1-btn-fighter svg').outerHTML = rawGraphics.fighter('#1f6feb');

document.querySelector('#p2-btn-miner svg').outerHTML = rawGraphics.miner('#f85149', false);
document.querySelector('#p2-btn-scout svg').outerHTML = rawGraphics.scout('#f85149');
document.querySelector('#p2-btn-fighter svg').outerHTML = rawGraphics.fighter('#f85149');

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
        if (p.buildCooldowns.miner > 0) {
            p.buildCooldowns.miner -= dt;
            if (p.buildCooldowns.miner <= 0) {
                let qi = p.buildQueue.findIndex(b => b.type === 'miners');
                if (qi !== -1) { p.units.miners.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
            }
        }
        if (p.buildCooldowns.scout > 0) {
            p.buildCooldowns.scout -= dt;
            if (p.buildCooldowns.scout <= 0) {
                let qi = p.buildQueue.findIndex(b => b.type === 'scouts');
                if (qi !== -1) { p.units.scouts.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
            }
        }
        if (p.buildCooldowns.fighter > 0) {
            p.buildCooldowns.fighter -= dt;
            if (p.buildCooldowns.fighter <= 0) {
                let qi = p.buildQueue.findIndex(b => b.type === 'fighters');
                if (qi !== -1) { p.units.fighters.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
            }
        }

        if (p.isCPU) updateAI(p, dt, canvas.width, canvas.height);

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
        const totalArea = canvas.width * canvas.height;
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
