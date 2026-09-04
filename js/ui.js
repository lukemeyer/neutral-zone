import { players, state } from './state.js';
import { getStationGraph } from './utils.js';
console.log('ui.js loaded');

export function updateUI() {
    players.forEach(p => {
        const id = p.id + 1;
        document.getElementById(`p${id}-energy`).innerText = Math.floor(p.energy);
        document.getElementById(`p${id}-fighters`).innerText = p.units.fighters.length;
        document.getElementById(`p${id}-stations`).innerText = p.units.stations.length;
        document.getElementById(`p${id}-miners`).innerText = p.units.miners.length;

        // Border Power calculation
        const graph = getStationGraph(p, false);
        let usedBorder = 0;
        graph.validEdges.forEach(e => usedBorder += e.dist);

        const maxPerimeter = (p.units.stations.length + 1) * 3.5;

        // Update UI Text
        document.getElementById(`p${id}-border`).innerText = Math.floor(usedBorder);
        document.getElementById(`p${id}-mborder`).innerText = Math.floor(maxPerimeter);

        // Change color based on ratio?
        const borderEl = document.getElementById(`p${id}-border`);
        if (usedBorder > maxPerimeter) {
            borderEl.style.color = '#f85149'; // red if overloaded
        } else {
            borderEl.style.color = ''; // default
        }

        const buildTypes = [
            { key: 'miner', type: 'miners', time: 5 },
            { key: 'station', type: 'stations', time: 10 },
            { key: 'fighter', type: 'fighters', time: 15 }
        ];

        buildTypes.forEach(bt => {
            const btn = document.getElementById(`p${id}-btn-${bt.key}`);
            const prog = document.getElementById(`p${id}-prog-${bt.key}`);
            const queue = document.getElementById(`p${id}-queue-${bt.key}`);

            btn.disabled = p.energy < (bt.key === 'miner' ? 25 : bt.key === 'station' ? 50 : 100);

            // Progress Bar
            if (p.buildCooldowns[bt.key] > 0) {
                const pct = ((bt.time - p.buildCooldowns[bt.key]) / bt.time) * 100;
                prog.style.width = `${pct}%`;
            } else {
                prog.style.width = '0%';
            }

            // Queue Dots
            const inQueue = p.buildQueue.filter(b => b.type === bt.type).length;
            // Subtract 1 if we are currently building this type (since the buildCooldown logic handles it)
            // Wait, buildCooldowns[bt.key] > 0 means ONE is building.
            // If p.buildQueue has 3 items, and one is building, we should show 2 dots?
            // Actually, my main.js logic:
            // If building, we don't pop from queue until finished.
            // So if buildQueue length is 3, and cooldown > 0, it means 1 is in progress (still in queue) and 2 are waiting.
            // So we show length - 1 dots.
            let dotCount = p.buildCooldowns[bt.key] > 0 ? inQueue - 1 : inQueue;
            dotCount = Math.min(3, dotCount); // Max 3 dots

            queue.innerHTML = '';
            for (let i = 0; i < dotCount; i++) {
                const dot = document.createElement('div');
                dot.className = 'dot';
                queue.appendChild(dot);
            }
        });
    });
}

export function updateControlText(p1pct, p2pct) {
    document.getElementById('p1-control').innerText = p1pct.toFixed(1);
    document.getElementById('p2-control').innerText = p2pct.toFixed(1);
}

export function showGameOver(winnerId, reason) {
    document.getElementById('game-over-screen').style.display = 'flex';
    const winnerName = winnerId === 0 ? "Player 1 (Blue)" : "Player 2 (Red)";
    document.getElementById('game-result-text').innerText = `${winnerName} Wins via ${reason}!`;
    document.getElementById('game-result-text').style.color = winnerId === 0 ? '#1f6feb' : '#f85149';
}

export function setupUIBindings() {
    // UI Buttons 
    document.getElementById('p1-btn-miner').addEventListener('click', () => {
        if (players[0].energy >= 25) {
            players[0].energy -= 25;
            players[0].buildQueue.push({ type: 'miners', unitData: { x: players[0].homePlanet.x, y: players[0].homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60, damageTime: 0 } });
        }
    });
    document.getElementById('p1-btn-station').addEventListener('click', () => {
        if (players[0].energy >= 50) {
            players[0].energy -= 50;
            let tx = players[0].homePlanet.x;
            let ty = Math.max(0.4, players[0].homePlanet.y - 2.0);
            players[0].buildQueue.push({ type: 'stations', unitData: { x: players[0].homePlanet.x, y: players[0].homePlanet.y, targetX: tx, targetY: ty, health: 200, maxHealth: 200, cooldown: 0, damageTime: 0 } });
        }
    });
    document.getElementById('p1-btn-fighter').addEventListener('click', () => {
        if (players[0].energy >= 100) {
            players[0].energy -= 100;
            let tx = players[0].homePlanet.x + 2.0;
            let ty = players[0].homePlanet.y;
            const newFighter = { x: players[0].homePlanet.x, y: players[0].homePlanet.y, path: [{ x: tx, y: ty }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0, damageTime: 0 };
            players[0].buildQueue.push({ type: 'fighters', unitData: newFighter });
        }
    });
    document.getElementById('p1-btn-sel-all').addEventListener('click', () => {
        state.selectedFighters = [...players[0].units.fighters];
    });
    document.getElementById('p1-btn-sel-none').addEventListener('click', () => {
        state.selectedFighters = [];
    });

    document.getElementById('p2-btn-miner').addEventListener('click', () => {
        if (players[1].energy >= 25) {
            players[1].energy -= 25;
            players[1].buildQueue.push({ type: 'miners', unitData: { x: players[1].homePlanet.x, y: players[1].homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60, damageTime: 0 } });
        }
    });
    document.getElementById('p2-btn-station').addEventListener('click', () => {
        if (players[1].energy >= 50) {
            players[1].energy -= 50;
            let tx = players[1].homePlanet.x;
            let ty = Math.max(0.4, players[1].homePlanet.y - 2.0);
            players[1].buildQueue.push({ type: 'stations', unitData: { x: players[1].homePlanet.x, y: players[1].homePlanet.y, targetX: tx, targetY: ty, health: 200, maxHealth: 200, cooldown: 0, damageTime: 0 } });
        }
    });
    document.getElementById('p2-btn-fighter').addEventListener('click', () => {
        if (players[1].energy >= 100) {
            players[1].energy -= 100;
            let tx = players[1].homePlanet.x - 2.0;
            let ty = players[1].homePlanet.y;
            const newFighter = { x: players[1].homePlanet.x, y: players[1].homePlanet.y, path: [{ x: tx, y: ty }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0, damageTime: 0 };
            players[1].buildQueue.push({ type: 'fighters', unitData: newFighter });
        }
    });
    document.getElementById('p2-btn-sel-all').addEventListener('click', () => {
        state.selectedFighters = [...players[1].units.fighters];
    });
    document.getElementById('p2-btn-sel-none').addEventListener('click', () => {
        state.selectedFighters = [];
    });

    document.getElementById('btn-restart-game').addEventListener('click', () => {
        window.location.reload();
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
        players[0].type = document.getElementById('p1-type').value;
        players[1].type = document.getElementById('p2-type').value;

        players[0].isCPU = players[0].type !== 'human';
        players[1].isCPU = players[1].type !== 'human';

        if (players[0].isCPU) {
            document.querySelectorAll('#ui-p1 .ui-group').forEach(el => el.style.display = 'none');
        }
        if (players[1].isCPU) {
            document.querySelectorAll('#ui-p2 .ui-group').forEach(el => el.style.display = 'none');
        }

        document.getElementById('start-screen').style.display = 'none';
        state.gameStarted = true;
    });
}
