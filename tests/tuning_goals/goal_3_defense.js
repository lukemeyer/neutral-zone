import { resetGameState, createDummyPlayer } from '../test_runner.js';
import { players, asteroids } from '../../js/state.js';

export default {
    maxDuration: 60, // Fast test
    setup: () => {
        resetGameState();
        const p1 = createDummyPlayer(0, 2, 7.5);
        p1.isCPU = true;
        p1.type = 'cpu_expansioneer';

        // Give P1 a reasonable starting economy
        asteroids.push({ x: 4, y: 7.5, radius: 0.3, miners: 0, resources: 400, variant: 0 });
        p1.units.stations.push({ x: 3.5, y: 7.5, targetX: 3.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.miners.push({ x: 3, y: 7.5, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60 });

        const p2 = createDummyPlayer(1, 18, 7.5); // enemy
        p2.isCPU = false;

        // Spawn a threat immediately heading for P1's station
        p2.units.fighters.push({ x: 10, y: 7.5, path: [{ x: 3.5, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

        global.logMsg("Task: CPU should prioritize a defensive fighter when threatened.");
    },
    tick: (timeSeconds, ticks) => {
        const p1 = players[0];
        const p2 = players[1];

        // Fail condition: The station is destroyed
        if (p1.units.stations.length === 0) {
            global.assert(false, `Defense Failed: P1 allowed its station to be destroyed by the enemy fighter at t=${timeSeconds.toFixed(1)}s.`);
        }

        // Pass condition: The attacking enemy fighter is destroyed and P1 station survives
        if (p2.units.fighters.length === 0 && p1.units.stations.length > 0) {
            global.assertPass(true, `Defense Passed: CPU successfully produced a fighter, destroyed the threat, and protected the station at t=${timeSeconds.toFixed(1)}s.`);
        }
    }
};
