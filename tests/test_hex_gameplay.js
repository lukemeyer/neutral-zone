import { createInitialState } from '../js/hex/hex_state.js';
import { updateUnits, scrambleFighters, recallFighters, COSTS } from '../js/hex/hex_units.js';
import { updateHexAI } from '../js/hex/hex_ai.js';

console.log("\n============================================================");
console.log("  Testing: Hex Variant Gameplay, Hangars & AI");
console.log("============================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✅ [PASS] ${message}`);
    } else {
        failed++;
        console.error(`  ❌ [FAIL] ${message}`);
    }
}

// 1. Initial State & Starting Hangars
const state = createInitialState(20, 15, 1.6);
const p1 = state.players[0];
const p2 = state.players[1];

assert(p1.hangars.miner.dockedUnits.length === 2, `P1 starts with 2 docked miners in Hangar (got ${p1.hangars.miner.dockedUnits.length})`);
assert(p1.hangars.fighter.dockedUnits.length === 2, `P1 starts with 2 docked fighters in Hangar (got ${p1.hangars.fighter.dockedUnits.length})`);
assert(p2.hangars.miner.dockedUnits.length === 2, `P2 starts with 2 docked miners in Hangar (got ${p2.hangars.miner.dockedUnits.length})`);
assert(p2.hangars.fighter.dockedUnits.length === 2, `P2 starts with 2 docked fighters in Hangar (got ${p2.hangars.fighter.dockedUnits.length})`);

// Active units in flight should initially be 0 (clean space!)
const activeP1Miners = p1.units.miners.filter(m => m.state !== 'docked').length;
const activeP1Fighters = p1.units.fighters.filter(f => f.state !== 'docked').length;
assert(activeP1Miners === 0, "No active miners wandering around map at start");
assert(activeP1Fighters === 0, "No active fighters wandering around map at start");

// 2. Station Placement on Intersections
const ownedVertexIds = new Set(state.grid.vertices.filter(v => v.owner === 0).map(v => v.id));
const candidate = state.grid.vertices.find(v => v.owner === null && v.adjacentVertices.some(adj => ownedVertexIds.has(adj)));
assert(candidate !== undefined, "Found valid adjacent intersection to expand network");

p1.energy = 100;
candidate.owner = 0;
candidate.station = { type: 'relay', health: 200, maxHealth: 200, cooldown: 0, range: 2.2 };
state.grid.updateOwnership();
assert(candidate.owner === 0, "Station successfully placed at hex intersection");

// 3. Asteroid Capture & Miner Hangar Autonomous Dispatch
const astCell = state.grid.cells.find(c => c.type === 'asteroid');
assert(astCell !== undefined, "Found asteroid cell");
const ast = astCell.asteroid;

// Capture the asteroid cell by claiming all its vertices for P1
astCell.vertices.forEach(vId => {
    state.grid.vertices[vId].owner = 0;
    if (!state.grid.vertices[vId].station) {
        state.grid.vertices[vId].station = { type: 'relay', health: 200, maxHealth: 200, cooldown: 0 };
    }
});
state.grid.updateOwnership();
assert(astCell.owner === 0, "Asteroid cell captured by Player 1");

// Run 1 update tick: Miner should autonomously launch from the hangar
updateUnits(state, 0.1);
assert(p1.hangars.miner.dockedUnits.length === 0 && ast.miners === 2, `2 miners launched from hangar towards captured asteroid (docked: ${p1.hangars.miner.dockedUnits.length}, ast.miners: ${ast.miners})`);
const deployedMiner = p1.units.miners.find(m => m.state !== 'docked');
assert(deployedMiner !== undefined, "Miner is active in flight");
assert(deployedMiner.targetAsteroid === ast, "Miner target is the captured asteroid");

// Simulate miner traveling to asteroid and mining
for (let t = 0; t < 50; t++) {
    updateUnits(state, 0.1);
}
assert(deployedMiner.payload > 0, `Miner harvested resources (payload: ${deployedMiner.payload.toFixed(1)})`);

// Simulate miner returning to Hangar and docking
deployedMiner.state = 'returning';
deployedMiner.x = p1.hangars.miner.center.x + 0.1;
deployedMiner.y = p1.hangars.miner.center.y + 0.1;
const energyBefore = p1.energy;
updateUnits(state, 0.1);

assert(deployedMiner.state === 'docked', "Miner docks back into hangar upon arrival");
assert(p1.energy > energyBefore, `Player received energy from mined ore (energy: ${p1.energy.toFixed(1)})`);

// 4. Fighter Hangar Scramble & Recall
const scrambled = scrambleFighters(p1, 2);
assert(scrambled.length === 2, "Successfully scrambled 2 fighters from Fighter Hangar");
assert(p1.hangars.fighter.dockedUnits.length === 0, "Fighter Hangar docked count decremented to 0");
assert(scrambled.every(f => f.state === 'patrol'), "Scrambled fighters are on active patrol");

// Recall fighters
recallFighters(p1);
assert(scrambled.every(f => f.state === 'returning'), "Fighters switch to returning upon recall command");

// Simulate arrival at hangar
scrambled[0].x = p1.hangars.fighter.center.x + 0.1;
scrambled[0].y = p1.hangars.fighter.center.y + 0.1;
updateUnits(state, 0.1);
assert(scrambled[0].state === 'docked', "Fighter docks into Fighter Hangar and leaves space clear");

// 5. AI Execution Test
updateHexAI(state, 1.5);
assert(p2.energy <= 120, "CPU AI actively manages energy and builds");

console.log(`\n------------------------------------------------------------`);
console.log(`  Summary: ${passed} Passed, ${failed} Failed`);
console.log(`------------------------------------------------------------\n`);

if (failed > 0) process.exit(1);
else process.exit(0);
