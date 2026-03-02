import { resetGameState, createDummyPlayer, runSimulation } from './test_runner.js';
import { players, asteroids } from '../js/state.js';
import { updateAI } from '../js/ai.js';
import { isAsteroidInPolygon, getPlayerTerritoryHull } from '../js/utils.js';

resetGameState();
const p1 = createDummyPlayer(0, 100, 400);
const p2 = createDummyPlayer(1, 900, 400);

asteroids.push({ x: 200, y: 300, radius: 15, miners: 0, resources: 500, variant: 0 }); // TARGET
p1.isCPU = true;
p1.units.scouts.push({ x: 150, y: 400, targetX: 150, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

let ticks = 0;
runSimulation(() => {
    if (ticks === 35000) {
        let currentHull = getPlayerTerritoryHull(p1, players, false);
        console.log("Current Hull:");
        console.log(currentHull);
        console.log("Asteroid: x=200, y=300, radius=15");
        console.log("isAsteroidInPolygon?", isAsteroidInPolygon(asteroids[0], currentHull));

        if (p1.units.miners.length > 0) {
            let m = p1.units.miners[0];
            console.log(`Miner state: returning=${m.returning}, payload=${m.payload}, targetAst=${m.targetAsteroid ? m.targetAsteroid.x : null}`);
        } else {
            console.log("No miners existed at tick 35000!");
        }

        return true;
    }
    ticks++;
    if (p1.isCPU) updateAI(p1, 1 / 60, 1000, 800);
    return false;
});
