import { getStationGraph, getPlayerTerritoryHulls, isAsteroidInPolygon, isPointInTerritory, isValidStationPlacement, polygonArea } from '../js/utils.js';
import { resetGameState, createDummyPlayer } from './test_runner.js';
import { players, asteroids } from '../js/state.js';
import { updateUnits } from '../js/units.js';

console.log("\n============================================================");
console.log("  Testing: Planar Territory Filling & Anti-Theft Mining Rules");
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

// -------------------------------------------------------------
// TEST 1: Multi-station connected mesh leaves NO empty areas
// -------------------------------------------------------------
console.log("--- Suite 1: No Empty Areas in Connected Territories ---");
{
    const player = createDummyPlayer(0, 2.0, 7.5);
    // 5 nodes forming two adjacent triangles sharing an edge (1-2)
    player.units.stations = [
        { x: 2.3, y: 4.4, health: 200 },
        { x: 3.6, y: 8.8, health: 200 },
        { x: 6.0, y: 4.0, health: 200 },
        { x: 6.6, y: 8.8, health: 200 }
    ];

    const graph = getStationGraph(player, false);
    assert(graph.hulls.length === 2, `Extracted all adjacent planar faces (expected 2, got ${graph.hulls.length})`);
    
    let totalArea = graph.hulls.reduce((sum, h) => sum + polygonArea(h), 0);
    assert(totalArea > 18.0 && totalArea < 19.0, `Total filled area covers the entire polygon (area: ${totalArea.toFixed(2)})`);

    // Asteroid positioned inside the second face must be enclosed
    const ast = { x: 4.8, y: 6.2 };
    assert(isPointInTerritory(ast, player, false, 0), "Asteroid inside the interior face is captured");

    // Perimeter edges must exclude the internal shared chord
    assert(graph.perimeterEdges.length === 5, `Perimeter edges count is 5 (excludes internal chord, got ${graph.perimeterEdges.length})`);
    assert(graph.validEdges.length === 6, `Total valid connection lines is 6 (includes internal chord, got ${graph.validEdges.length})`);
}

// -------------------------------------------------------------
// TEST 2: 10-Station Grid Mesh has every closed cell filled
// -------------------------------------------------------------
{
    const player = createDummyPlayer(0, 2.0, 7.5);
    player.units.stations = [
        { x: 2.3, y: 4.4, health: 200 },
        { x: 3.6, y: 8.8, health: 200 },
        { x: 5.5, y: 4.0, health: 200 },
        { x: 5.8, y: 7.2, health: 200 },
        { x: 6.6, y: 9.8, health: 200 },
        { x: 8.5, y: 4.5, health: 200 },
        { x: 9.0, y: 7.5, health: 200 },
        { x: 8.8, y: 10.5, health: 200 },
        { x: 11.0, y: 7.0, health: 200 }
    ];

    const graph = getStationGraph(player, false);
    assert(graph.hulls.length >= 8, `10-station mesh forms multiple non-overlapping filled cells (got ${graph.hulls.length} faces)`);
    assert(graph.perimeterEdges.length < graph.validEdges.length, "Perimeter edges strictly less than valid edges (internal chords discounted)");
}

// -------------------------------------------------------------
// TEST 3: Enemy Territory Mining Prevention
// -------------------------------------------------------------
console.log("\n--- Suite 2: Mining Forbidden Inside Enemy Territory ---");
{
    resetGameState();
    const p1 = createDummyPlayer(0, 2.0, 7.5);
    const p2 = createDummyPlayer(1, 18.0, 7.5);

    // Give P2 an enclosed territory enclosing an asteroid at (15, 7.5)
    p2.units.stations = [
        { x: 17.0, y: 5.5, targetX: 17.0, targetY: 5.5, health: 200 },
        { x: 17.0, y: 9.5, targetX: 17.0, targetY: 9.5, health: 200 },
        { x: 14.0, y: 7.5, targetX: 14.0, targetY: 7.5, health: 200 }
    ];
    const enemyAst = { x: 15.0, y: 7.5, radius: 0.3, miners: 0, resources: 500 };
    asteroids.push(enemyAst);

    // Place a P1 miner and a P1 station nearby at (12.5, 7.5)
    p1.units.stations = [
        { x: 5.0, y: 7.5, targetX: 5.0, targetY: 7.5, health: 200 },
        { x: 8.0, y: 7.5, targetX: 8.0, targetY: 7.5, health: 200 },
        { x: 12.5, y: 7.5, targetX: 12.5, targetY: 7.5, health: 200 }
    ];
    const p1Miner = { x: 12.0, y: 7.5, payload: 0, returning: false, health: 100, targetAsteroid: null };
    p1.units.miners.push(p1Miner);

    // P2 has captured the asteroid
    assert(isPointInTerritory(enemyAst, p2, false, 0), "Asteroid is enclosed in P2 territory");

    // P1 must NOT be allowed to capture or mine this asteroid
    assert(!isAsteroidInPolygon(enemyAst, p1, [p1, p2]), "isAsteroidInPolygon returns false for P1 targeting P2 asteroid");

    // Tick P1 units: P1 miner must NOT target P2's asteroid
    updateUnits(p1, 0.1, null, [], false);
    assert(p1Miner.targetAsteroid === null, "P1 miner refuses to target asteroid in P2 territory");

    // If P1 miner was somehow assigned the enemy asteroid, updateUnits must immediately disengage
    p1Miner.returning = false;
    p1Miner.targetAsteroid = enemyAst;
    enemyAst.miners = 1;
    updateUnits(p1, 0.1, null, [], false);
    assert(p1Miner.targetAsteroid === null, "P1 miner drops target asteroid immediately upon entering enemy territory");
    assert(p1Miner.returning === true, "P1 miner recalled home after target dropped");
    assert(enemyAst.miners === 0, "Enemy asteroid miner count decremented");

    // P1 cannot place a station inside P2 territory
    const canPlaceInsideEnemy = isValidStationPlacement(15.0, 7.5, p1.units.stations[0], p1, [p1, p2], 20, 15);
    assert(!canPlaceInsideEnemy, "isValidStationPlacement forbids dragging station into enemy territory");
}

console.log(`\n------------------------------------------------------------`);
console.log(`  Summary: ${passed} Passed, ${failed} Failed`);
console.log(`------------------------------------------------------------\n`);

if (failed > 0) process.exit(1);
else process.exit(0);
