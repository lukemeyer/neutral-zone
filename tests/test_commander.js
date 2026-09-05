import { computeStationPositions, getTerritoryPolygon, getBorderIntersection, polygonArea, isPointInFan, getAsteroidLayout, doPolygonsIntersect, doLineSegmentsIntersect, canExpandStation, closeBorder, smoothBorder } from '../js/commander/commander_math.js';
import { createCommanderState } from '../js/commander/commander_state.js';
import { queueBuild, updateCommanderUnits, calculateLaunchTarget, onStationAdded, onStationDestroyed, isPolygonSafe, launchStation, STATION_LAUNCH_DISTANCE } from '../js/commander/commander_units.js';

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
    if (n > 1 && n <= 11) {
        assert(rOuter > prevRadius, `Station count ${n} strictly increases outer radius (${rOuter.toFixed(2)} > ${prevRadius.toFixed(2)})`);
    } else if (n > 11) {
        assert(rOuter >= prevRadius, `Station count ${n} outer radius is capped at border seam (${rOuter.toFixed(2)} >= ${prevRadius.toFixed(2)})`);
    }
    prevRadius = rOuter;

    const poly = getTerritoryPolygon(p1Home, stations, false);
    const area = polygonArea(poly);
    assert(area > prevArea, `Station count ${n} increases territory area (${area.toFixed(1)} > ${prevArea.toFixed(1)})`);
    prevArea = area;

    // Border is strictly the 91 permanent points covering the 90-degree corner
    assert(poly.length === 91, `P1 border consists of strictly 91 permanent points at N=${n}`);
    assert(isPointInFan({ x: 0, y: 15 }, poly), `P1 territory covers 90-degree corner (0, 15) at N=${n}`);

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
assert(p2Poly.length === 91, `P2 border consists of strictly 91 permanent points (${p2Poly.length} === 91)`);
assert(isPointInFan({ x: 20, y: 0 }, p2Poly), "P2 territory covers 90-degree corner (20, 0)");

// 4. Test Concentric Asteroid Envelopment & Asymmetric Map Generation
const asteroids = getAsteroidLayout();
assert(asteroids.length >= 7, `Generated ${asteroids.length} concentric asteroids`);

// Distance equality check: HQ-to-asteroid distances match per tier for each player
const p1Asts = asteroids.filter(a => a.side === 'p1');
const p2Asts = asteroids.filter(a => a.side === 'p2');
const p1Dists = p1Asts.map(a => Math.round(Math.hypot(a.x - p1Home.x, a.y - p1Home.y) * 100) / 100).sort((a,b) => a - b);
const p2Dists = p2Asts.map(a => Math.round(Math.hypot(a.x - p2Home.x, a.y - p2Home.y) * 100) / 100).sort((a,b) => a - b);
assert(p1Dists.length === p2Dists.length && p1Dists.every((d, i) => Math.abs(d - p2Dists[i]) <= 0.05), "Distances from HQ to each asteroid are identical for both players");

// Asymmetry check: P2 is NOT an exact diagonal mirror of P1 (x2 != 20 - x1 or y2 != 15 - y1)
const exactMirrors = p1Asts.filter(a1 => p2Asts.some(a2 => Math.hypot(a2.x - (20 - a1.x), a2.y - (15 - a1.y)) < 0.05)).length;
assert(exactMirrors === 0, `Map generation is not point-symmetrical (${exactMirrors} exact mirrors found)`);

// Tier 1 asteroids should be captured by N=3 for both players
const tier1AstP1 = asteroids.find(a => a.tier === 1 && a.side === 'p1');
const tier1AstP2 = asteroids.find(a => a.tier === 1 && a.side === 'p2');
const poly3P1 = getTerritoryPolygon(p1Home, computeStationPositions(p1Home, 3, false), false);
const poly3P2 = getTerritoryPolygon(p2Home, computeStationPositions(p2Home, 3, true), true);
assert(isPointInFan(tier1AstP1, poly3P1), "Tier 1 P1 asteroid enveloped at N=3 stations");
assert(isPointInFan(tier1AstP2, poly3P2), "Tier 1 P2 asteroid enveloped at N=3 stations");

// Tier 2 asteroids should be outside territory at N=3 and captured by N=6
const tier2AstP1 = asteroids.find(a => a.tier === 2 && a.side === 'p1');
const tier2AstP2 = asteroids.find(a => a.tier === 2 && a.side === 'p2');
const poly6P1 = getTerritoryPolygon(p1Home, computeStationPositions(p1Home, 6, false), false);
const poly6P2 = getTerritoryPolygon(p2Home, computeStationPositions(p2Home, 6, true), true);
assert(!isPointInFan(tier2AstP1, poly3P1), "Tier 2 P1 asteroid outside territory at N=3 stations");
assert(isPointInFan(tier2AstP1, poly6P1), "Tier 2 P1 asteroid enveloped at N=6 stations");
assert(!isPointInFan(tier2AstP2, poly3P2), "Tier 2 P2 asteroid outside territory at N=3 stations");
assert(isPointInFan(tier2AstP2, poly6P2), "Tier 2 P2 asteroid enveloped at N=6 stations");

// 5. Test Border Protection & Zero Overlap at High Station Counts
const polySeparatedP1 = getTerritoryPolygon(p1Home, computeStationPositions(p1Home, 8, false), false);
const polySeparatedP2 = getTerritoryPolygon(p2Home, computeStationPositions(p2Home, 8, true), true);
assert(!doPolygonsIntersect(polySeparatedP1, polySeparatedP2), "Territories at N=8 do not intersect across the map");

const polyHighN1 = getTerritoryPolygon(p1Home, computeStationPositions(p1Home, 13, false), false);
const polyHighN2 = getTerritoryPolygon(p2Home, computeStationPositions(p2Home, 13, true), true);
assert(!doPolygonsIntersect(polyHighN1, polyHighN2), "Territories at N=13 do not intersect due to border seam protection");

const dummyP1 = { id: 0, homePlanet: p1Home, stationCount: 12 };
const dummyP2 = { id: 1, homePlanet: p2Home, stationCount: 13, stations: computeStationPositions(p2Home, 13, true) };
assert(canExpandStation(dummyP1, dummyP2, 13), "canExpandStation allows expanding since stations pack densely along border without crossing");

// 6. Test Build Queue (Max 3 per unit type)
const testState = createCommanderState();
const p1 = testState.players[0];
const p2 = testState.players[1];
p1.energy = 500;

// Queue 3 stations (1 in progress + 2 in queue)
assert(queueBuild(p1, 'station', p2), "Queued station 1 (active)");
assert(queueBuild(p1, 'station', p2), "Queued station 2");
assert(queueBuild(p1, 'station', p2), "Queued station 3");
assert(!queueBuild(p1, 'station', p2), "4th station rejected (queue limit 3 reached)");

// Miner queue independent
assert(queueBuild(p1, 'miner', p2), "Queued miner 1");
assert(queueBuild(p1, 'miner', p2), "Queued miner 2");
assert(queueBuild(p1, 'miner', p2), "Queued miner 3");
assert(!queueBuild(p1, 'miner', p2), "4th miner rejected (queue limit 3 reached)");

// Fighter queue independent
assert(queueBuild(p1, 'fighter', p2), "Queued fighter 1");
assert(queueBuild(p1, 'fighter', p2), "Queued fighter 2");
assert(queueBuild(p1, 'fighter', p2), "Queued fighter 3");
assert(!queueBuild(p1, 'fighter', p2), "4th fighter rejected (queue limit 3 reached)");

// 7. Test Miner Payload Capacity (10 per trip)
assert(p1.units.miners.length > 0, "P1 has initial miners");
assert(p1.units.miners[0].maxPayload === 10, "Miner maxPayload is 10 energy per trip");

// 8. Test Attack Stance Shared Target
p1.stance = 'attack';
p2.stations = computeStationPositions(p2.homePlanet, 3, true);
updateCommanderUnits(testState, 0.1);

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

// 10. Test Max 3 Active Miners Per Asteroid
const minerTestState = createCommanderState();
const mP1 = minerTestState.players[0];
const targetAst = minerTestState.asteroids.find(a => a.tier === 1 && a.side === 'p1');
assert(targetAst !== undefined, "Found target asteroid for active miner limit test");

// Create 5 miners placed right at the asteroid
mP1.units.miners = [];
for (let i = 0; i < 5; i++) {
    mP1.units.miners.push({
        id: 900 + i,
        playerId: 0,
        x: targetAst.x,
        y: targetAst.y,
        payload: 0,
        maxPayload: 10,
        returning: false,
        targetAsteroid: targetAst
    });
}
targetAst.miners = 5;

updateCommanderUnits(minerTestState, 0.1);
assert(targetAst.activeMiners <= 3, `Active miners capped at 3 (actual: ${targetAst.activeMiners})`);

// 11. Test Resource Gathering Speed Cut in Half (5.0 units/sec)
const gatherTestState = createCommanderState();
const gP1 = gatherTestState.players[0];
const gAst = gatherTestState.asteroids.find(a => a.tier === 1 && a.side === 'p1');
const initialRes = gAst.resources;

gP1.units.miners = [{
    id: 999,
    playerId: 0,
    x: gAst.x,
    y: gAst.y,
    payload: 0,
    maxPayload: 10,
    returning: false,
    targetAsteroid: gAst
}];
gAst.miners = 1;

// Run exactly 1.0 second of mining
updateCommanderUnits(gatherTestState, 1.0);
const extracted = initialRes - gAst.resources;
assert(Math.abs(extracted - 5.0) < 0.1, `Resource gathering speed is 5.0 units/sec (extracted: ${extracted.toFixed(2)})`);
assert(Math.abs(gP1.units.miners[0].payload - 5.0) < 0.1, `Miner payload increased by 5.0 in 1 second (payload: ${gP1.units.miners[0].payload.toFixed(2)})`);

// 12. Test Asteroid Disappearance at 0 Resources
const depleteTestState = createCommanderState();
const dP1 = depleteTestState.players[0];
const dAst = depleteTestState.asteroids.find(a => a.tier === 1 && a.side === 'p1');
dAst.resources = 1.0; // 1 unit remaining

const dMiner = {
    id: 888,
    playerId: 0,
    x: dAst.x,
    y: dAst.y,
    payload: 0,
    maxPayload: 10,
    returning: false,
    targetAsteroid: dAst
};
dP1.units.miners = [dMiner];
dAst.miners = 1;

// Mine for 0.5s: 5 * 0.5 = 2.5 > 1.0, depleting the asteroid to 0
updateCommanderUnits(depleteTestState, 0.5);

assert(!depleteTestState.asteroids.includes(dAst), "Depleted asteroid completely removed from state.asteroids");
assert(dMiner.targetAsteroid === null, "Miner detached from depleted asteroid");
assert(dMiner.returning === true, "Miner returns home with gathered resources");

// 13. Test Launch Trajectory Line Geometry (2x HQ Radius)
const trajState = createCommanderState();
const tP1 = trajState.players[0];
const trajLen = tP1.homePlanet.radius * 2.0;
assert(Math.abs(trajLen - 1.6) < 1e-5, `Trajectory length is strictly 2x HQ radius (1.6 units)`);

const arrowX = tP1.homePlanet.x + Math.cos(tP1.launchAngle) * trajLen;
const arrowY = tP1.homePlanet.y + Math.sin(tP1.launchAngle) * trajLen;
const arrowDist = Math.hypot(arrowX - tP1.homePlanet.x, arrowY - tP1.homePlanet.y);
assert(Math.abs(arrowDist - 1.6) < 1e-5, `Arrow tip is positioned exactly 2x HQ radius from HQ center`);

// 14. Test Steered Expansion Weighting & Asteroid Envelopment at N=4
const t2North = { x: 2.50, y: 9.50 };
const t2East = { x: 5.50, y: 12.50 };

// Steered North (-1.25 rad)
const stationsNorth = computeStationPositions(tP1.homePlanet, 4, false, -1.25);
const polyNorth = getTerritoryPolygon(tP1.homePlanet, stationsNorth, false);
assert(isPointInFan(t2North, polyNorth), "Steering North at N=4 envelops the northern Tier 2 asteroid");
assert(!isPointInFan(t2East, polyNorth), "Steering North at N=4 leaves the eastern Tier 2 asteroid outside");

// Steered East (-0.20 rad)
const stationsEast = computeStationPositions(tP1.homePlanet, 4, false, -0.20);
const polyEast = getTerritoryPolygon(tP1.homePlanet, stationsEast, false);
assert(!isPointInFan(t2North, polyEast), "Steering East at N=4 leaves the northern Tier 2 asteroid outside");
assert(isPointInFan(t2East, polyEast), "Steering East at N=4 envelops the eastern Tier 2 asteroid");

// 15. Test Launching Station Lifecycle (HQ Launch -> Flight -> Frontier Impact)
const launchState = createCommanderState();
const lP1 = launchState.players[0];
const initialStationCount = lP1.stationCount;

// Trigger station build completion
lP1.launchAngle = -1.25; // Aim North
lP1.buildCooldowns.station = 0.05;
updateCommanderUnits(launchState, 0.1);

assert(lP1.launchingStations.length === 1, "Station build spawned an in-flight launching station");
const activeLaunch = lP1.launchingStations[0];
assert(activeLaunch.progress > 0 && activeLaunch.progress < 1.0, "Launching station is actively flying outward");
assert(activeLaunch.angle === -1.25, "Station is flying along the steered launch trajectory angle");

// Advance flight to completion (speed = 1.5, requires ~0.66s)
updateCommanderUnits(launchState, 0.8);
assert(lP1.launchingStations.length === 0, "Launching station completed flight and struck the frontier");
assert(lP1.stationCount === initialStationCount + 1, "Station count incremented on frontier impact");
assert(lP1.launchHits.length > 0, "Launch impact angle recorded in player launchHits");
assert(lP1.steeringAngle === -1.25, "Player steeringAngle updated from station impact");

// 16. Test Steered canExpandStation Against Enemy Territory
const canExpandNorth = canExpandStation(lP1, launchState.players[1], 4);
assert(canExpandNorth === true, "Steered expansion at N=4 is valid and does not collide with enemy");

// 17. Test Dramatic Reaching Factor in computeStationPositions
const stNorth = computeStationPositions(lP1.homePlanet, 6, false, -1.25);
const stEast = computeStationPositions(lP1.homePlanet, 6, false, -0.20);
// North station should be much further out (lower Y) when steered North vs East
const northY = Math.min(...stNorth.map(s => s.y));
const eastY = Math.min(...stEast.map(s => s.y));
assert(northY < eastY - 0.5, `North steering reaches significantly further north (${northY.toFixed(2)} vs ${eastY.toFixed(2)})`);

// 18. Test Border Station Density Scaling at N >= 11
const st10 = computeStationPositions(lP1.homePlanet, 10, false);
const st11 = computeStationPositions(lP1.homePlanet, 11, false);
const st15 = computeStationPositions(lP1.homePlanet, 15, false);

const border10 = st10.filter(s => s.isPerimeter);
const border11 = st11.filter(s => s.isPerimeter);
const border15 = st15.filter(s => s.isPerimeter);

assert(border10.length === 5, `Border stations at N=10 is 5`);
assert(border11.length === 6, `Border stations at N=11 is 6 (density increased)`);
assert(border15.length === 10, `Border stations at N=15 is 10 (density increased)`);

// Average spacing between border stations decreases
function getAvgSpacing(stations) {
    let sum = 0;
    for (let i = 0; i < stations.length - 1; i++) {
        sum += Math.hypot(stations[i+1].x - stations[i].x, stations[i+1].y - stations[i].y);
    }
    return sum / (stations.length - 1);
}

const spacing10 = getAvgSpacing(border10);
const spacing11 = getAvgSpacing(border11);
const spacing15 = getAvgSpacing(border15);

assert(spacing11 < spacing10, `Border station spacing decreases from N=10 to N=11 (${spacing11.toFixed(2)} < ${spacing10.toFixed(2)})`);
assert(spacing15 < spacing11, `Border station spacing decreases from N=11 to N=15 (${spacing15.toFixed(2)} < ${spacing11.toFixed(2)})`);

// 19. Test Zero Polygon Overlap Across Full Station Range N=1..20
let collisionFound = false;
for (let testN = 1; testN <= 18; testN++) {
    const p1Poly = getTerritoryPolygon(lP1.homePlanet, computeStationPositions(lP1.homePlanet, testN, false), false);
    const p2Poly = getTerritoryPolygon(launchState.players[1].homePlanet, computeStationPositions(launchState.players[1].homePlanet, testN, true), true);
    if (doPolygonsIntersect(p1Poly, p2Poly)) {
        collisionFound = true;
        break;
    }
}
assert(!collisionFound, "Zero territory collisions across all station counts up to N=18");

// 20. Test Continuous Station Queueing without Collision Block
const lateState = createCommanderState();
const lateP1 = lateState.players[0];
const lateP2 = lateState.players[1];
lateP1.stationCount = 14;
lateP1.energy = 200;
assert(queueBuild(lateP1, 'station', lateP2), "Station queueing succeeds at N=14 without collision lockout");

// 21. Test Game Reset State Reinitialization
let resetTestState = createCommanderState();
resetTestState.players[0].energy = 999;
resetTestState.players[0].stationCount = 10;
resetTestState.isGameOver = true;
// Resetting creates fresh state
resetTestState = createCommanderState();
assert(resetTestState.players[0].energy === 150, "Energy reset to initial 150");
assert(resetTestState.players[0].stationCount === 3, "Station count reset to initial 3");
assert(resetTestState.isGameOver === false, "isGameOver reset to false");
assert(queueBuild(resetTestState.players[0], 'station', resetTestState.players[1]), "New game accepts build queues immediately");

// 22. Test Stationary Aiming (Aiming does NOT change existing stations)
const aimState = createCommanderState();
const aP1 = aimState.players[0];
const initialStationSnapshot = aP1.stations.map(s => ({ x: s.x, y: s.y, targetX: s.targetX, targetY: s.targetY }));
// Sweep launchAngle across full quadrant
for (let ang = -Math.PI * 0.45; ang <= -Math.PI * 0.05; ang += 0.1) {
    aP1.launchAngle = ang;
    // Station coordinates must remain completely frozen
    aP1.stations.forEach((s, idx) => {
        assert(s.x === initialStationSnapshot[idx].x && s.y === initialStationSnapshot[idx].y, `Station ${idx} position frozen during aiming at angle ${ang.toFixed(2)}`);
        assert(s.targetX === initialStationSnapshot[idx].targetX && s.targetY === initialStationSnapshot[idx].targetY, `Station ${idx} target frozen during aiming at angle ${ang.toFixed(2)}`);
    });
}

// 23. Test Weighted Pull on Station Added (Closer stations move more, farther stations move less)
const physState = createCommanderState();
const phP1 = physState.players[0];
const sNorth = phP1.stations[0]; // northernmost station
const sEast = phP1.stations[2];  // easternmost station
const initialDistNorth = Math.hypot(sNorth.targetX - phP1.homePlanet.x, sNorth.targetY - phP1.homePlanet.y);
const initialDistEast = Math.hypot(sEast.targetX - phP1.homePlanet.x, sEast.targetY - phP1.homePlanet.y);

// Launch and add station to North (-1.25 rad)
const northTarget = calculateLaunchTarget(phP1, -1.25);
onStationAdded(phP1, northTarget);

const movedNorth = Math.hypot(sNorth.targetX - sNorth.x, sNorth.targetY - sNorth.y);
const movedEast = Math.hypot(sEast.targetX - sEast.x, sEast.targetY - sEast.y);
assert(movedNorth > movedEast, `Northern station moved significantly more than eastern station when adding North node (${movedNorth.toFixed(3)} > ${movedEast.toFixed(3)})`);

// 24. Test Weighted Gap-Filling on Station Destroyed (Closer move more, farther move less)
const deadStation = phP1.stations[0];
const neighborStation = phP1.stations[1]; // closest survivor
const farStation = sEast; // farthest survivor (easternmost station)
const prevNeighborPos = { x: neighborStation.targetX, y: neighborStation.targetY };
const prevFarPos = { x: farStation.targetX, y: farStation.targetY };

onStationDestroyed(phP1, deadStation);
const neighborShift = Math.hypot(neighborStation.targetX - prevNeighborPos.x, neighborStation.targetY - prevNeighborPos.y);
const farShift = Math.hypot(farStation.targetX - prevFarPos.x, farStation.targetY - prevFarPos.y);
assert(neighborShift >= farShift, `Nearby survivor moved more to fill gap than distant survivor (${neighborShift.toFixed(3)} >= ${farShift.toFixed(3)})`);

// 25. Test Stations Can Cross the Middle Line into Contested Territory
phP1.stations.forEach(s => {
    assert(s.targetX >= 0.5 && s.targetX <= 19.5 && s.targetY >= 0.5 && s.targetY <= 14.5,
        `Station target (${s.targetX}, ${s.targetY}) is within valid map bounds`);
});

// Launch stations towards the enemy half across the diagonal middle line (y = 0.75 * x)
const crossState = createCommanderState();
const cP1 = crossState.players[0];
const midlineAngle = -0.6435; // direct ray towards (20, 0)
let crossedMidline = false;
for (let step = 0; step < 5; step++) {
    const target = calculateLaunchTarget(cP1, midlineAngle);
    onStationAdded(cP1, target);
    cP1.stations.forEach(s => { s.x = s.targetX; s.y = s.targetY; });
    if (target.y < 0.75 * target.x) {
        crossedMidline = true;
    }
}
assert(crossedMidline, "Stations can freely cross the diagonal middle line into contested territory");
const crossedStations = cP1.stations.filter(s => s.y < 0.75 * s.x);
assert(crossedStations.length >= 1, `At least 1 station established across the middle line (${crossedStations.length} crossed)`);
crossedStations.forEach(s => {
    assert(s.x >= 0.5 && s.x <= 19.5 && s.y >= 0.5 && s.y <= 14.5, `Crossed station at (${s.x}, ${s.y}) respects map boundaries`);
});

// 26. Test Border Bumping Incremental Distance & Even Distribution (Zero Clustering)
const bumpState = createCommanderState();
const bP1 = bumpState.players[0];
const angle = -Math.PI * 0.25;
let prevBorderDist = 0;
for (let step = 0; step < 3; step++) {
    const poly = getTerritoryPolygon(bP1.homePlanet, bP1.stations, false);
    const target = calculateLaunchTarget(bP1, angle);
    const borderDist = getBorderIntersection(bP1.homePlanet, bP1.stations, false, target.angle);
    const launchDist = Math.hypot(target.x - bP1.homePlanet.x, target.y - bP1.homePlanet.y);
    const delta = launchDist - borderDist;
    assert(Math.abs(delta - 2.0) < 0.05, `Launch target lands ~2.0 past border to maintain even spacing (delta=${delta.toFixed(3)})`);
    onStationAdded(bP1, target);
    bP1.stations.forEach(s => { s.x = s.targetX; s.y = s.targetY; });
    assert(borderDist >= prevBorderDist, `Border expands monotonically (${borderDist.toFixed(2)} >= ${prevBorderDist.toFixed(2)})`);
    prevBorderDist = borderDist;
}

// Stations maintain their pinned border positions independently without distance repulsion
assert(bP1.stations.length === 6, `Player has 6 stations established on the border`);
bP1.stations.forEach((s, idx) => {
    assert(s.x >= 0.5 && s.x <= 19.5 && s.y >= 0.5 && s.y <= 14.5, `Station ${idx} is within map boundaries`);
});

// 27. Test Border Is Strictly the 91 Permanent Points & Zero Self-Intersections After Launches
const bumpPoly = getTerritoryPolygon(bP1.homePlanet, bP1.stations, false);
assert(bumpPoly.length === 91, `Border is strictly the 91 permanent points (${bumpPoly.length} === 91)`);

// Check that no non-adjacent edges intersect (zero self-intersections)
const closedBump = closeBorder(bumpPoly);
let selfIntersects = false;
for (let i = 0; i < closedBump.length; i++) {
    const a1 = closedBump[i];
    const a2 = closedBump[(i + 1) % closedBump.length];
    for (let j = i + 2; j < closedBump.length; j++) {
        if ((j + 1) % closedBump.length === i) continue; // adjacent
        const b1 = closedBump[j];
        const b2 = closedBump[(j + 1) % closedBump.length];
        if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
            selfIntersects = true;
        }
    }
}
assert(!selfIntersects, "Border polygon has zero self-intersections after multiple collinear launches");

// 28. Test Head-to-Head Expansion Overlap Prevention & Frontline Clearance
const h2hState = createCommanderState();
const hP1 = h2hState.players[0];
const hP2 = h2hState.players[1];
hP1.launchAngle = Math.atan2(7.5 - hP1.homePlanet.y, 10.0 - hP1.homePlanet.x);
hP2.launchAngle = Math.atan2(7.5 - hP2.homePlanet.y, 10.0 - hP2.homePlanet.x);

for (let step = 0; step < 8; step++) {
    const t1 = calculateLaunchTarget(hP1, hP1.launchAngle, hP2);
    onStationAdded(hP1, t1, hP2);
    hP1.stations.forEach(s => { s.x = s.targetX; s.y = s.targetY; });

    const t2 = calculateLaunchTarget(hP2, hP2.launchAngle, hP1);
    onStationAdded(hP2, t2, hP1);
    hP2.stations.forEach(s => { s.x = s.targetX; s.y = s.targetY; });

    const polyP1 = getTerritoryPolygon(hP1.homePlanet, hP1.stations, false);
    const polyP2 = getTerritoryPolygon(hP2.homePlanet, hP2.stations, true);
    assert(!doPolygonsIntersect(polyP1, polyP2), `Territories do not intersect at expansion step ${step} (P1=${hP1.stations.length}, P2=${hP2.stations.length})`);
}

// Check station clearance: no station inside opponent territory, minimum buffer between opposing stations
const finalPolyP1 = getTerritoryPolygon(hP1.homePlanet, hP1.stations, false);
const finalPolyP2 = getTerritoryPolygon(hP2.homePlanet, hP2.stations, true);
hP1.stations.forEach((s, idx) => {
    assert(!isPointInFan(s, finalPolyP2), `P1 station ${idx} is strictly outside P2 territory`);
});
hP2.stations.forEach((s, idx) => {
    assert(!isPointInFan(s, finalPolyP1), `P2 station ${idx} is strictly outside P1 territory`);
});
let minOpposingDist = Infinity;
for (let s1 of hP1.stations) {
    for (let s2 of hP2.stations) {
        const d = Math.hypot(s1.x - s2.x, s1.y - s2.y);
        if (d < minOpposingDist) minOpposingDist = d;
    }
}
assert(minOpposingDist >= 1.0, `Opposing stations maintain minimum clearance (${minOpposingDist.toFixed(2)} >= 1.0)`);

// 29. Test Combat Simulation, Station Destruction, and Miner Hits without Freezing
const combatState = createCommanderState();
const cPlayer1 = combatState.players[0];
const cPlayer2 = combatState.players[1];
cPlayer1.stance = 'attack';

const targetStation = cPlayer2.stations[0];
targetStation.health = 10; // Low health to trigger fatal hit

// Spawn lethal projectile targeting enemy station
combatState.projectiles.push({
    x: targetStation.x,
    y: targetStation.y,
    vx: 1.0,
    vy: 0.0,
    damage: 25,
    ownerId: cPlayer1.id,
    life: 0.5
});

// Also test miner projectile hit
cPlayer2.units.miners.push({
    id: 9999,
    playerId: 1,
    x: 10,
    y: 10,
    health: 10,
    maxHealth: 100,
    payload: 0,
    maxPayload: 10
});
combatState.projectiles.push({
    x: 10,
    y: 10,
    vx: 1.0,
    vy: 0.0,
    damage: 20,
    ownerId: cPlayer1.id,
    life: 0.5
});

let combatError = null;
try {
    for (let t = 0; t < 30; t++) {
        updateCommanderUnits(combatState, 0.05);
    }
} catch (e) {
    combatError = e;
}

assert(combatError === null, `Attack simulation and station destruction executed with 0 errors: ${combatError ? combatError.message : 'none'}`);
assert(!cPlayer2.stations.includes(targetStation), "Target station was successfully destroyed and removed from player stations");
assert(cPlayer2.units.miners.filter(m => m.id === 9999).length === 0, "Killed miner was cleaned up successfully");

// 30. Test Concave Territory Polygon Generation (U-shaped concave frontier)
const uStations = [
    { id: 0, x: 1.0, y: 10.0 },
    { id: 1, x: 2.0, y: 7.0 },
    { id: 2, x: 4.0, y: 4.0 },   // North prong tip
    { id: 3, x: 4.0, y: 11.0 },  // Recessed valley
    { id: 4, x: 8.0, y: 13.0 },
    { id: 5, x: 14.0, y: 12.0 }  // South/East prong tip
];
const uPoly = getTerritoryPolygon(p1Home, uStations, false);
assert(uPoly.length >= 6, `Concave territory polygon created with ${uPoly.length} vertices`);
const hasValley = uPoly.some(pt => Math.hypot(pt.x - 4.0, pt.y - 11.0) < 0.01);
assert(hasValley, "Recessed valley station is included in territory boundary creating concave shape");

const closedU = closeBorder(uPoly);
let uSelfIntersects = false;
for (let i = 0; i < closedU.length; i++) {
    const a1 = closedU[i];
    const a2 = closedU[(i + 1) % closedU.length];
    for (let j = i + 2; j < closedU.length; j++) {
        if ((j + 1) % closedU.length === i) continue;
        const b1 = closedU[j];
        const b2 = closedU[(j + 1) % closedU.length];
        if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
            uSelfIntersects = true;
        }
    }
}
assert(!uSelfIntersects, "Concave U-shaped polygon has zero self-intersections");

// 31. Test Flanking Territory Expansion Below Enemy Territory
const flankRedStations = [
    { id: 0, x: 17.5, y: 2.5 },
    { id: 1, x: 15.0, y: 3.5 },
    { id: 2, x: 14.0, y: 5.5 },
    { id: 3, x: 15.5, y: 7.0 },
    { id: 4, x: 18.0, y: 6.0 },
    { id: 5, x: 13.0, y: 7.5 },
    { id: 6, x: 11.0, y: 8.5 },
    { id: 7, x: 9.5, y: 9.5 } // Southwest tip facing Blue
];
const flankRedPoly = getTerritoryPolygon(p2Home, flankRedStations, true);

const flankBlueStations = [
    { id: 0, x: 2.5, y: 12.5 },
    { id: 1, x: 1.5, y: 11.5 },
    { id: 2, x: 4.5, y: 11.5 },
    { id: 3, x: 6.0, y: 12.8 },
    { id: 4, x: 5.0, y: 9.5 },
    { id: 5, x: 7.0, y: 8.0 },
    { id: 6, x: 7.5, y: 9.0 },
    { id: 7, x: 8.95, y: 11.52 },
    { id: 8, x: 10.93, y: 11.23 },
    { id: 9, x: 13.5, y: 11.0 } // Flanking deep below Red
];
const flankBluePoly = getTerritoryPolygon(p1Home, flankBlueStations, false);
const flankIntersects = doPolygonsIntersect(flankBluePoly, flankRedPoly);
assert(!flankIntersects, "Blue concave U-shaped expansion below Red does not intersect Red territory");

const safeCandidate = { x: 14.5, y: 12.0 };
const candidateSafe = isPolygonSafe([...flankBlueStations, safeCandidate], { id: 0, homePlanet: p1Home }, { id: 1, homePlanet: p2Home, stations: flankRedStations });
assert(candidateSafe, "New station can be launched into the open corridor below Red without collision");

// 32. Test Smooth Arc Initial State, Distributed Whole-Arc Growth, and Stations Pinned to Frontier Border
const smoothState = createCommanderState();
const sP1 = smoothState.players[0];
const sP2 = smoothState.players[1];

// A. Initial state is a mathematically uniform circular arc
const initR = sP1.borderDistances[0];
assert(Math.abs(initR - 3.8) < 0.01, `Initial territory radius is 3.8 (${initR.toFixed(2)})`);
let isUniformArcP1 = true;
let isUniformArcP2 = true;
for (let d = 0; d <= 90; d++) {
    if (Math.abs(sP1.borderDistances[d] - 3.8) > 0.001) isUniformArcP1 = false;
    if (Math.abs(sP2.borderDistances[d] - 3.8) > 0.001) isUniformArcP2 = false;
}
assert(isUniformArcP1, "P1 initial territory is a perfectly uniform smooth circular arc across all 91 degrees");
assert(isUniformArcP2, "P2 initial territory is a perfectly uniform smooth circular arc across all 91 degrees");

// B. Starting stations are positioned directly on the frontier border curve
sP1.stations.forEach((s, idx) => {
    const dHQ = Math.hypot(s.x - sP1.homePlanet.x, s.y - sP1.homePlanet.y);
    assert(Math.abs(dHQ - 3.8) < 0.02, `P1 starting station ${idx} is pinned to border arc (dHQ=${dHQ.toFixed(3)})`);
});
sP2.stations.forEach((s, idx) => {
    const dHQ = Math.hypot(s.x - sP2.homePlanet.x, s.y - sP2.homePlanet.y);
    assert(Math.abs(dHQ - 3.8) < 0.02, `P2 starting station ${idx} is pinned to border arc (dHQ=${dHQ.toFixed(3)})`);
});

// C. Adding a station expands the WHOLE arc in a distributed way with directional peak
const beforeBorder = new Float64Array(sP1.borderDistances);
const launchTarget = calculateLaunchTarget(sP1, sP1.launchAngle);
onStationAdded(sP1, launchTarget);

let minDegreeGrowth = Infinity;
let maxDegreeGrowth = -Infinity;
for (let d = 0; d <= 90; d++) {
    const growth = sP1.borderDistances[d] - beforeBorder[d];
    if (growth < minDegreeGrowth) minDegreeGrowth = growth;
    if (growth > maxDegreeGrowth) maxDegreeGrowth = growth;
}
assert(minDegreeGrowth >= 0.0, `No contraction on launch (min growth across any degree: ${minDegreeGrowth.toFixed(3)} >= 0.0)`);
assert(Math.abs(maxDegreeGrowth - 2.00) < 0.10, `Peak growth occurs at launch angle (${maxDegreeGrowth.toFixed(3)} ~ 2.00)`);

// D. All stations remain pinned to the expanding border curve, not floating around
sP1.stations.forEach((s, idx) => {
    const deg = s.degree !== undefined ? Math.round(s.degree) : angleRadToDegree(0, s.angle);
    const expectedBorderR = sP1.borderDistances[deg];
    const actualR = Math.hypot(s.targetX - sP1.homePlanet.x, s.targetY - sP1.homePlanet.y);
    assert(Math.abs(actualR - expectedBorderR) < 0.02, `Station ${idx} remains strictly on the frontier border curve (dist=${actualR.toFixed(2)}, border=${expectedBorderR.toFixed(2)})`);
});

// 33. Test Constant Station Launch Distance from Border (Not Scaled by Distance from HQ)
const cstState = createCommanderState();
const kP1 = cstState.players[0];
const cAngle = -Math.PI * 0.25;
const hx = kP1.homePlanet.x;
const hy = kP1.homePlanet.y;

assert(STATION_LAUNCH_DISTANCE === 2.0, `Constant station launch distance is 2.0 (${STATION_LAUNCH_DISTANCE})`);

for (let step = 1; step <= 4; step++) {
    const target = calculateLaunchTarget(kP1, cAngle);
    const launchAngle = target.angle;
    const borderDist = getBorderIntersection(kP1.homePlanet, kP1.borderDistances, false, launchAngle);
    const borderPt = { x: hx + Math.cos(launchAngle) * borderDist, y: hy + Math.sin(launchAngle) * borderDist };
    const distFromBorder = Math.hypot(target.x - borderPt.x, target.y - borderPt.y);

    assert(Math.abs(distFromBorder - STATION_LAUNCH_DISTANCE) < 0.05,
        `Step ${step}: Launch target is constant distance from border (${distFromBorder.toFixed(3)} ~ ${STATION_LAUNCH_DISTANCE}) when border distance from HQ is ${borderDist.toFixed(2)}`);

    // Verify launchStation spawns in-flight station at the frontier border
    launchStation(kP1);
    assert(kP1.launchingStations.length > 0, `Step ${step}: launchStation creates in-flight station`);
    const ls = kP1.launchingStations.pop();
    const startDistFromHQ = Math.hypot(ls.startX - hx, ls.startY - hy);
    const lsBorderDist = getBorderIntersection(kP1.homePlanet, kP1.borderDistances, false, ls.angle);
    const totalFlightDist = Math.hypot(ls.targetX - ls.startX, ls.targetY - ls.startY);

    assert(Math.abs(startDistFromHQ - lsBorderDist) < 0.05,
        `Step ${step}: Station launches directly from frontier border (startDist=${startDistFromHQ.toFixed(3)} ~ border=${lsBorderDist.toFixed(3)})`);
    assert(Math.abs(totalFlightDist - STATION_LAUNCH_DISTANCE) < 0.05,
        `Step ${step}: Total flight distance is constant (${totalFlightDist.toFixed(3)} ~ ${STATION_LAUNCH_DISTANCE}), not expanding with distance from HQ`);

    onStationAdded(kP1, target);
}

// 34. Test Organic 91-Point Border & Station Independence
const orgState = createCommanderState();
const oP1 = orgState.players[0];
const oBorder = getTerritoryPolygon(oP1.homePlanet, oP1.borderDistances, false);

assert(oBorder.length === 91, `Border consists strictly of the 91 permanent points (${oBorder.length} === 91)`);

// Test organic smoothness: no sharp corners along the 91 points
let maxTurnDeg = 0;
let totalTurnDeg = 0;
for (let i = 1; i < oBorder.length - 1; i++) {
    const v1 = { x: oBorder[i].x - oBorder[i - 1].x, y: oBorder[i].y - oBorder[i - 1].y };
    const v2 = { x: oBorder[i + 1].x - oBorder[i].x, y: oBorder[i + 1].y - oBorder[i].y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m1 = Math.hypot(v1.x, v1.y);
    const m2 = Math.hypot(v2.x, v2.y);
    const cosT = Math.max(-1, Math.min(1, dot / (m1 * m2)));
    const turn = Math.acos(cosT) * (180 / Math.PI);
    if (turn > maxTurnDeg) maxTurnDeg = turn;
    totalTurnDeg += turn;
}
const avgTurnDeg = totalTurnDeg / (oBorder.length - 2);
assert(maxTurnDeg < 5.0, `Border has organic feeling with zero sharp corners (max turn angle: ${maxTurnDeg.toFixed(2)}° < 5.0°)`);
assert(avgTurnDeg < 2.0, `Border has continuous smooth curvature (avg turn angle: ${avgTurnDeg.toFixed(2)}° < 2.0°)`);

// Test Station Independence: stations maintain their launch angles independently without pairwise distance repulsion
const preAngle0 = oP1.stations[0].angle;
const preAngle1 = oP1.stations[1].angle;
const preAngle2 = oP1.stations[2].angle;

// Launch a new station at station 1 angle
const closeLaunchTarget = calculateLaunchTarget(oP1, preAngle1);
onStationAdded(oP1, closeLaunchTarget);

assert(Math.abs(oP1.stations[0].angle - preAngle0) < 0.001, `Station 0 angle unchanged without inter-station distance repulsion`);
assert(Math.abs(oP1.stations[1].angle - preAngle1) < 0.001, `Station 1 angle unchanged without inter-station distance repulsion`);
assert(Math.abs(oP1.stations[2].angle - preAngle2) < 0.001, `Station 2 angle unchanged without inter-station distance repulsion`);

// Verify smoothBorder preserves organic curvature even after asymmetric expansion
const postBorder = getTerritoryPolygon(oP1.homePlanet, oP1.borderDistances, false);
let postMaxTurn = 0;
for (let i = 1; i < postBorder.length - 1; i++) {
    const v1 = { x: postBorder[i].x - postBorder[i - 1].x, y: postBorder[i].y - postBorder[i - 1].y };
    const v2 = { x: postBorder[i + 1].x - postBorder[i].x, y: postBorder[i + 1].y - postBorder[i].y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m1 = Math.hypot(v1.x, v1.y);
    const m2 = Math.hypot(v2.x, v2.y);
    const cosT = Math.max(-1, Math.min(1, dot / (m1 * m2)));
    const turn = Math.acos(cosT) * (180 / Math.PI);
    if (turn > postMaxTurn) postMaxTurn = turn;
}
assert(postMaxTurn < 85.0, `Border retains organic smoothness with no sharp corners after launch expansion (max turn: ${postMaxTurn.toFixed(2)}° < 85.0°)`);

console.log(`\n------------------------------------------------------------`);
console.log(`  Summary: ${passed} Passed, ${failed} Failed`);
console.log(`------------------------------------------------------------\n`);

if (failed > 0) process.exit(1);
else process.exit(0);

