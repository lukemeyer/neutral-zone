import { resetGameState, createDummyPlayer } from '../test_runner.js';
import { players, asteroids } from '../../js/state.js';
import { isAsteroidInPolygon } from '../../js/utils.js';

let idleTimer = 0;

export default {
    maxDuration: 600, // 10 minutes limit
    setup: () => {
        resetGameState();
        const p1 = createDummyPlayer(0, 2, 7.5);
        p1.isCPU = true;
        p1.type = 'cpu_expansioneer';

        createDummyPlayer(1, 18, 7.5); // dummy

        // Spawn a large amount of resources across the map to ensure a long test
        for (let i = 0; i < 8; i++) {
            // Guarantee the first asteroid is right beside the home planet inside territory
            let ax = i === 0 ? 3.0 : 4 + Math.random() * 12;
            let ay = i === 0 ? 7.2 : 2 + Math.random() * 11;

            asteroids.push({
                x: ax,
                y: ay,
                radius: 0.3, miners: 0,
                resources: 500, variant: 0
            });
        }

        // Give P1 initial setup (Triangle of 3 stations to immediately form a territory)
        p1.units.stations.push({ x: 3.5, y: 7.5, targetX: 3.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 3.0, y: 6.5, targetX: 3.0, targetY: 6.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 3.0, y: 8.5, targetX: 3.0, targetY: 8.5, health: 200, maxHealth: 200, cooldown: 0 });

        global.logMsg("Task: CPU should conquer the map without ever deadlocking (idling with max energy for >30s)");
    },
    tick: (timeSeconds, ticks) => {
        const p1 = players[0];

        // Ensure we never sit idle with completely capped energy and empty queues
        const isIdle = p1.energy >= 150 && p1.buildQueue.length === 0;

        if (isIdle) {
            idleTimer += (1 / 60);
        } else {
            idleTimer = 0;
        }

        if (idleTimer > 30) {
            global.assert(false, `CPU Deadlocked! Sat idle with capped energy for >30 seconds at t=${timeSeconds.toFixed(1)}s.`);
        }

        // Win condition: Build 6 stations and 10 miners to prove it can reliably grow out of its start phase without deadlocking
        const numStations = p1.units.stations.length;
        if (numStations >= 6 && p1.units.miners.length >= 10) {
            global.assertPass(true, "CPU successfully expanded out of the early game and built a stable network without getting stuck.");
        }

        // Add logging to debug 10-min timeouts
        if (Math.floor(timeSeconds) % 60 === 0 && Math.abs(timeSeconds - Math.floor(timeSeconds)) < (1 / 60)) {
            const captured = asteroids.filter(a => isAsteroidInPolygon(a, p1)).length;
            global.logMsg(`State at ${timeSeconds.toFixed(0)}s | E: ${Math.floor(p1.energy)} | Stations: ${p1.units.stations.length} | Miners: ${p1.units.miners.length} | Fighters: ${p1.units.fighters.length} | Captured Asteroids: ${captured}/${asteroids.length}`);
        }
    }
};
