import { resetGameState, createDummyPlayer } from '../test_runner.js';
import { players, asteroids } from '../../js/state.js';
import { isAsteroidInPolygon } from '../../js/utils.js';

let offensiveThreatDetected = false;

export default {
    maxDuration: 600, // 10m
    setup: () => {
        resetGameState();
        const p1 = createDummyPlayer(0, 2, 7.5);
        p1.isCPU = true;
        p1.type = 'cpu_expansioneer';

        // P1 has strong economy
        p1.units.stations.push({ x: 3.5, y: 7.5, targetX: 3.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 2.0, y: 5.5, targetX: 2.0, targetY: 5.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 0.5, y: 7.5, targetX: 0.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
        for (let i = 0; i < 3; i++) {
            p1.units.miners.push({ x: 3, y: 7.5, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60 });
        }
        for (let i = 0; i < 3; i++) {
            asteroids.push({ x: 4, y: 6 + i, radius: 0.3, miners: 0, resources: 800, variant: i });
        }

        const p2 = createDummyPlayer(1, 18, 7.5);
        p2.isCPU = false; // Brain-dead dummy enemy
        p2.units.stations.push({ x: 16.5, y: 7.5, targetX: 16.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });

        global.logMsg("Task: CPU should eventually build an offensive force and attack the brain-dead enemy.");
    },
    tick: (timeSeconds, ticks) => {
        const p1 = players[0];
        const p2 = players[1];

        // Fail condition: 10 minutes pass and P2's station/planet is untouched
        if (timeSeconds > 590) {
            global.assert(p2.homePlanet.health < p2.homePlanet.maxHealth || p2.units.stations.length === 0, `Offense Failed: CPU sat back for 10 minutes without attacking a defenseless enemy.`);
        }

        // Pass condition A: The enemy's station is destroyed
        if (p2.units.stations.length === 0) {
            global.assertPass(true, `Offense Success: CPU successfully destroyed the enemy station at t=${timeSeconds.toFixed(1)}s.`);
        }

        // Pass condition B: At least 3 fighters cross the halfway mark towards the enemy
        const offensiveFighters = p1.units.fighters.filter(f => f.x > 10);
        if (offensiveFighters.length >= 3 && !offensiveThreatDetected) {
            offensiveThreatDetected = true;
            global.logMsg(`[INFO] CPU launched offensive wave of ${offensiveFighters.length} fighters across map centerline at t=${timeSeconds.toFixed(1)}s.`);
        }
    }
};
