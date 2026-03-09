import { resetGameState, createDummyPlayer } from '../test_runner.js';
import { players, asteroids } from '../../js/state.js';
import { isAsteroidInPolygon } from '../../js/utils.js';

let overbuiltStationsTime = 0;
let overbuiltMinersTime = 0;

export default {
    maxDuration: 600, // 10 minutes limit
    setup: () => {
        resetGameState();
        const p1 = createDummyPlayer(0, 2, 7.5);
        p1.isCPU = true;
        p1.type = 'cpu_expansioneer';

        createDummyPlayer(1, 18, 7.5); // dummy

        // Spawn a large amount of resources across the map
        for (let i = 0; i < 10; i++) {
            asteroids.push({
                x: 4 + Math.random() * 12,
                y: 2 + Math.random() * 11,
                radius: 0.3, miners: 0,
                resources: 1000, variant: 0
            });
        }

        // Give P1 initial setup
        p1.units.stations.push({ x: 3.5, y: 7.5, targetX: 3.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 2.0, y: 5.5, targetX: 2.0, targetY: 5.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 0.5, y: 7.5, targetX: 0.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });

        asteroids.push({
            x: 2 + Math.random() * 0.5,
            y: 6.5 + Math.random() * 0.5,
            radius: 0.3, miners: 0,
            resources: 2000, variant: 0
        });

        global.logMsg("Task: CPU should maintain a balanced ratio between economy (miners) and expansion (stations).");
    },
    tick: (timeSeconds, ticks) => {
        const p1 = players[0];

        const numStations = p1.units.stations.length;
        const numMiners = p1.units.miners.length;

        // Condition A: If we have > 5 stations, we must have at least half as many miners.
        if (numStations > 5 && numMiners < (numStations * 0.5)) {
            overbuiltStationsTime += (1 / 60);
        } else {
            overbuiltStationsTime = 0;
        }

        if (overbuiltStationsTime > 15) {
            global.assert(false, `Imbalanced Strategy: CPU aggressively expanded to ${numStations} stations but neglected economy (${numMiners} miners) for >15s.`);
        }

        // Condition B: If we have > 10 miners, we must have at least a few stations (no hyper-turtling)
        if (numMiners > 10 && numStations < 3) {
            overbuiltMinersTime += (1 / 60);
        } else {
            overbuiltMinersTime = 0;
        }

        if (overbuiltMinersTime > 15) {
            global.assert(false, `Imbalanced Strategy: CPU hoarded ${numMiners} miners but refused to expand (${numStations} stations) for >15s.`);
        }

        // End the test early if they prove they can build a large balanced base
        if (numStations >= 8 && numMiners >= 10) {
            global.assertPass(true, `CPU successfully executed a balanced base growth (Stations: ${numStations}, Miners: ${numMiners}).`);
        }
    }
};
