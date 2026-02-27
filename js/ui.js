import { players, state } from './state.js';
console.log('ui.js loaded');

export function updateUI() {
    document.getElementById('p1-energy').innerText = Math.floor(players[0].energy);
    document.getElementById('p1-btn-miner').disabled = players[0].energy < 25;
    document.getElementById('p1-btn-scout').disabled = players[0].energy < 50;
    document.getElementById('p1-btn-fighter').disabled = players[0].energy < 100;

    document.getElementById('p2-energy').innerText = Math.floor(players[1].energy);
    document.getElementById('p2-btn-miner').disabled = players[1].energy < 25;
    document.getElementById('p2-btn-scout').disabled = players[1].energy < 50;
    document.getElementById('p2-btn-fighter').disabled = players[1].energy < 100;
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
            players[0].units.miners.push({ x: players[0].homePlanet.x, y: players[0].homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });
        }
    });
    document.getElementById('p1-btn-scout').addEventListener('click', () => {
        if (players[0].energy >= 50) {
            players[0].energy -= 50;
            let tx = players[0].homePlanet.x;
            let ty = players[0].homePlanet.y - 100;
            players[0].units.scouts.push({ x: players[0].homePlanet.x, y: players[0].homePlanet.y, targetX: tx, targetY: ty, health: 50, maxHealth: 50, cooldown: 0 });
        }
    });
    document.getElementById('p1-btn-fighter').addEventListener('click', () => {
        if (players[0].energy >= 100) {
            players[0].energy -= 100;
            let tx = players[0].homePlanet.x + 100;
            let ty = players[0].homePlanet.y;
            players[0].units.fighters.push({ x: players[0].homePlanet.x, y: players[0].homePlanet.y, path: [{ x: tx, y: ty }], pathIndex: 0, pathDir: 1, isLoop: false, health: 100, maxHealth: 100, cooldown: 0 });
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
            players[1].units.miners.push({ x: players[1].homePlanet.x, y: players[1].homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });
        }
    });
    document.getElementById('p2-btn-scout').addEventListener('click', () => {
        if (players[1].energy >= 50) {
            players[1].energy -= 50;
            let tx = players[1].homePlanet.x;
            let ty = players[1].homePlanet.y - 100;
            players[1].units.scouts.push({ x: players[1].homePlanet.x, y: players[1].homePlanet.y, targetX: tx, targetY: ty, health: 50, maxHealth: 50, cooldown: 0 });
        }
    });
    document.getElementById('p2-btn-fighter').addEventListener('click', () => {
        if (players[1].energy >= 100) {
            players[1].energy -= 100;
            let tx = players[1].homePlanet.x - 100;
            let ty = players[1].homePlanet.y;
            players[1].units.fighters.push({ x: players[1].homePlanet.x, y: players[1].homePlanet.y, path: [{ x: tx, y: ty }], pathIndex: 0, pathDir: 1, isLoop: false, health: 100, maxHealth: 100, cooldown: 0 });
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
        players[0].isCPU = document.getElementById('p1-type').value === 'cpu';
        players[1].isCPU = document.getElementById('p2-type').value === 'cpu';

        if (players[0].isCPU) {
            document.getElementById('p1-btn-miner').style.display = 'none';
            document.getElementById('p1-btn-scout').style.display = 'none';
            document.getElementById('p1-btn-fighter').style.display = 'none';
            document.getElementById('p1-btn-sel-all').parentElement.style.display = 'none';
        }
        if (players[1].isCPU) {
            document.getElementById('p2-btn-miner').style.display = 'none';
            document.getElementById('p2-btn-scout').style.display = 'none';
            document.getElementById('p2-btn-fighter').style.display = 'none';
            document.getElementById('p2-btn-sel-all').parentElement.style.display = 'none';
        }

        document.getElementById('start-screen').style.display = 'none';
        state.gameStarted = true;
    });
}
