import { resetGameState, createDummyPlayer, runSimulation } from './test_runner.js';
import { players, asteroids } from '../js/state.js';
import { updateAI } from '../js/ai.js';
import { getConvexHull, getPlayerTerritoryHull } from '../js/utils.js';

resetGameState();
const p1 = createDummyPlayer(0, 100, 400);
const p2 = createDummyPlayer(1, 900, 400);

asteroids.push({ x: 200, y: 300, radius: 15, miners: 0, resources: 500, variant: 0 }); // TARGET
p1.isCPU = true;
p1.units.scouts.push({ x: 150, y: 400, targetX: 150, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

let stopCond = false;
let logInterval = 60; // 1 second
let ticks = 0;
runSimulation(() => {
    if (ticks % logInterval === 0 || ticks === 1) {
        console.log(`Tick: ${ticks}`);
        console.log(`Energy: ${p1.energy} | Scouts: ${p1.units.scouts.length} | Miners: ${p1.units.miners.length}`);
        
        let targetHull = getPlayerTerritoryHull(p1, players, true);
        let actualHull = getPlayerTerritoryHull(p1, players, false);
        console.log(`Target Hull Points: ${targetHull.length} | Actual Hull Points: ${actualHull.length}`);
        
        if (p1.units.scouts.length >= 2) {
            let s2 = p1.units.scouts[1];
            console.log(`Scout 2: x=${s2.x}, y=${s2.y} -> tgtX=${s2.targetX}, tgtY=${s2.targetY}`);
        }
        
        if (p1.units.miners.length > 0) {
            let m = p1.units.miners[0];
            console.log(`Miner: x=${m.x}, y=${m.y} | targetAst: ${m.targetAsteroid ? m.targetAsteroid.x : 'null'} | payload: ${m.payload} | returning: ${m.returning}`);
        }
        
        console.log(`Asteroid 0: resources=${asteroids[0].resources}`);
        console.log('---');
    }
    
    if (p1.units.miners.length > 0 && p1.units.miners[0].payload > 0) {
        console.log("SUCCESS: Miner is mining! Stopping test.");
        return true; // Stop test
    }
    
    ticks++;
    if (p1.isCPU) updateAI(p1, 1/60, 1000, 800);
    return false;
});
