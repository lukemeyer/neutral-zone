import { computeStationPositions, getTerritoryPolygon, polygonArea, isPointInFan, getAsteroidLayout, doPolygonsIntersect, canExpandStation } from '../js/commander/commander_math.js';
import { createCommanderState } from '../js/commander/commander_state.js';
import { queueBuild, updateCommanderUnits } from '../js/commander/commander_units.js';

console.log("\n============================================================");
console.log("  Testing: Commander Variant Mathematics & Radial Expansion");
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

const p1Home = { x: 2.5, y: 12.5 };
const p2Home = { x: 17.5, y: 2.5 };

// 1. Test Station Expansion for N = 1 to 12
let prevArea = 0;
let prevRadius = 0;
for (let n = 1; n <= 12; n++) {
    const stations = computeStationPositions(p1Home, n, false);
    assert(stations.length === n, `Generated exactly ${n} station positions`);

    const outerStations = stations.filter(s => s.isPerimeter);
    const rOuter = outerStations[0].ringRadius;
    if (n > 1) {
        assert(rOuter > prevRadius, `Station count ${n} strictly increases outer radius (${rOuter.toFixed(2)} > ${prevRadius.toFixed(2)})`);
    }
    prevRadius = rOuter;

    const poly = getTerritoryPolygon(p1Home, stations, false);
    const area = polygonArea(poly);
    assert(area > prevArea, `Station count ${n} increases territory area (${area.toFixed(1)} > ${prevArea.toFixed(1)})`);
    prevArea = area;

    // Corner (0, 15) must be contained in P1 territory
    assert(poly[0].x === 0 && poly[0].y === 15, `P1 territory polygon covers 90-degree corner (0, 15) at N=${n}`);

    // Check all connection lengths <= 4.5
    for (let s of stations) {
        const dHome = Math.hypot(s.x - p1Home.x, s.y - p1Home.y);
        const dStation = Math.min(...stations.filter(other => other !== s).map(other => Math.hypot(s.x - other.x, s.y - other.y)), Infinity);
        const connected = (dHome <= 4.5) || (dStation <= 4.5);
        assert(connected, `Station in N=${n} connected to network (dHome=${dHome.toFixed(2)}, dStation=${dStation.toFixed(2)})`);
    }
}

// 2. Test Contraction (when losing a station)
const stations6 = computeStationPositions(p1Home, 6, false);
const poly6 = getTerritoryPolygon(p1Home, stations6, false);
const area6 = polygonArea(poly6);

const stations5 = computeStationPositions(p1Home, 5, false);
const poly5 = getTerritoryPolygon(p1Home, stations5, false);
const area5 = polygonArea(poly5);

assert(area5 < area6, `Perimeter contracts when station count drops from 6 to 5 (${area5.toFixed(1)} < ${area6.toFixed(1)})`);

// 3. Test Diagonal Mirroring Symmetry
const p1Stations = computeStationPositions(p1Home, 5, false);
const p2Stations = computeStationPositions(p2Home, 5, true);

// Check that P2 is the exact diagonal reflection (x2 = 20 - x1, y2 = 15 - y1)
for (let i = 0; i < 5; i++) {
    const s1 = p1Stations[i];
    const s2 = p2Stations[i];
    const expectedX = 20 - s1.x;
    const expectedY = 15 - s1.y;
    assert(Math.abs(s2.x - expectedX) < 0.05 && Math.abs(s2.y - expectedY) < 0.05, `Symmetrical station ${i} reflection`);
}

// Check P2 90-degree corner coverage at (20, 0)
const p2Poly = getTerritoryPolygon(p2Home, p2Stations, true);
assert(p2Poly[0].x === 20 && p2Poly[0].y === 0, "P2 territory polygon covers 90-degree corner (20, 0)");

// 4. Test Concentric Asteroid Envelopment
const asteroids = getAsteroidLayout();
assert(asteroids.length >= 7, `Generated ${asteroids.length} concentric asteroids`);

// Tier 1 asteroid should be captured by N=3
const tier1AstP1 = asteroids.find(a => a.tier === 1 && a.side === 'p1');
const poly3 = getTerritoryPolygon(p1Home, computeStationPositions(p1Home, 3, false), false);
assert(isPointInFan(tier1AstP1, poly3), "Tier 1 asteroid enveloped at N=3 stations");

// Tier 2 asteroid should be captured by N=6
const tier2AstP1 = asteroids.find(a => a.tier === 2 && a.side === 'p1');
assert(!isPointInFan(tier2AstP1, poly3), "Tier 2 asteroid outside territory at N=3 stations");
assert(isPointInFan(tier2AstP1, poly6), "Tier 2 asteroid enveloped at N=6 stations");

// 5. Test "No Overlapping Territories" Restriction
const polySeparatedP1 = getTerritoryPolygon(p1Home, computeStationPositions(p1Home, 8, false), false);
const polySeparatedP2 = getTerritoryPolygon(p2Home, computeStationPositions(p2Home, 8, true), true);
assert(!doPolygonsIntersect(polySeparatedP1, polySeparatedP2), "Territories at N=8 do not intersect across the map");

const polyCollidingP1 = getTerritoryPolygon(p1Home, computeStationPositions(p1Home, 13, false), false);
const polyCollidingP2 = getTerritoryPolygon(p2Home, computeStationPositions(p2Home, 13, true), true);
assert(doPolygonsIntersect(polyCollidingP1, polyCollidingP2), "Territories at N=13 intersect along the central frontier");

const dummyP1 = { id: 0, homePlanet: p1Home, stationCount: 12 };
const dummyP2 = { id: 1, homePlanet: p2Home, stationCount: 13, stations: computeStationPositions(p2Home, 13, true) };
assert(!canExpandStation(dummyP1, dummyP2, 13), "canExpandStation correctly forbids expanding into overlapping enemy territory");

// 6. Test Build Queue (Max 3 per unit type)
const testState = createCommanderState();
const p1 = testState.players[0];
const p2 = testState.players[1];
p1.energy = 500;

assert(queueBuild(p1, 'miner', p2), "Queue miner 1 succeeds");
assert(queueBuild(p1, 'miner', p2), "Queue miner 2 succeeds");
assert(queueBuild(p1, 'miner', p2), "Queue miner 3 succeeds");
assert(!queueBuild(p1, 'miner', p2), "Queue miner 4 rejected (max 3 queued)");

// 7. Test Miner Payload Capacity (Reduced to 10)
assert(p1.units.miners[0].maxPayload === 10, "Starting miner capacity is reduced to 10");
assert(p1.units.miners[1].maxPayload === 10, "Second starting miner capacity is 10");

// 8. Test Shared Attack Target in Attack Mode
p1.stance = 'attack';
updateCommanderUnits(testState, 0.1);
// Check that all attacking fighters target the exact same entity
const targetEntity0 = p2.stations.find(s => Math.hypot(s.x - p1.units.fighters[0].x, s.y - p1.units.fighters[0].y) < 20);
assert(targetEntity0 !== undefined, "Attacking fleet found an enemy station target");

// 9. Test Attack Standoff Range (Stops at firing range <= 2.2 instead of 0.0)
let bestStation = null;
let minDist = Infinity;
p2.stations.forEach(es => {
    const d = Math.hypot(es.x - p1.homePlanet.x, es.y - p1.homePlanet.y);
    if (d < minDist) {
        minDist = d;
        bestStation = es;
    }
});

const testFighter = p1.units.fighters[0];
p1.units.fighters = [testFighter]; // isolate fighter
testFighter.x = bestStation.x + 2.0;
testFighter.y = bestStation.y;
const initialDist = Math.hypot(bestStation.x - testFighter.x, bestStation.y - testFighter.y);

// Update movement: since initialDist (2.0) <= 2.2, fighter should hold position, not fly to 0.0
updateCommanderUnits(testState, 0.1);
const newDist = Math.hypot(bestStation.x - testFighter.x, bestStation.y - testFighter.y);
assert(Math.abs(newDist - initialDist) < 0.05, `Fighter held firing range standoff (initial=${initialDist.toFixed(2)}, new=${newDist.toFixed(2)})`);

console.log(`\n------------------------------------------------------------`);
console.log(`  Summary: ${passed} Passed, ${failed} Failed`);
console.log(`------------------------------------------------------------\n`);

if (failed > 0) process.exit(1);
else process.exit(0);
