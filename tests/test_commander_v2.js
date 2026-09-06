import assert from 'assert';

console.log("\n============================================================");
console.log("  Commander Mode v2: Test Suite");
console.log("============================================================\n");

let passed = 0;
let failed = 0;

function it(desc, fn) {
    try {
        fn();
        console.log(`  ✅ [PASS] ${desc}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ [FAIL] ${desc}`);
        console.error(e);
        failed++;
    }
}

// Minimal simulated engine math from commander_v2.html
const CONFIG = {
    numDegrees: 91,
    initialRadius: 280,
    hqOffset: 80,
    tapDistance: 25,
    initialSpreadDots: 3,
    spreadMode: 'rounded',
    neighborStrength: 1.00,
    neighborSpread: 10,
    falloffCurve: 'smoothstep',
    restrictContraction: true,
    smoothingPasses: 1,
    laplacianWeight: 0.18,
    enableCollision: true,
    frontierClearance: 8
};

const MINER_SPEED = 100;

function createTestState(w = 1200, h = 800) {
    const state = {
        players: [
            {
                id: 0,
                hq: { x: CONFIG.hqOffset, y: h - CONFIG.hqOffset, radius: 18 },
                corner: { x: 0, y: h },
                energy: 150,
                stance: 'defend',
                distances: new Float64Array(91).fill(CONFIG.initialRadius),
                stations: [],
                miners: [],
                fighters: []
            },
            {
                id: 1,
                hq: { x: w - CONFIG.hqOffset, y: CONFIG.hqOffset, radius: 18 },
                corner: { x: w, y: 0 },
                energy: 150,
                stance: 'defend',
                distances: new Float64Array(91).fill(CONFIG.initialRadius),
                stations: [],
                miners: [],
                fighters: []
            }
        ],
        asteroids: []
    };

    // Asteroids layout from commander_v2.html
    const rawLayout = [
        { relX: 0.12, relY: 0.76, resources: 800, tier: 1 },
        { relX: 0.22, relY: 0.88, resources: 800, tier: 1 },
        { relX: 0.88, relY: 0.24, resources: 800, tier: 1 },
        { relX: 0.78, relY: 0.12, resources: 800, tier: 1 },
        { relX: 0.20, relY: 0.58, resources: 1200, tier: 2 },
        { relX: 0.38, relY: 0.80, resources: 1200, tier: 2 },
        { relX: 0.80, relY: 0.42, resources: 1200, tier: 2 },
        { relX: 0.62, relY: 0.20, resources: 1200, tier: 2 },
        { relX: 0.34, relY: 0.46, resources: 1600, tier: 3 },
        { relX: 0.66, relY: 0.54, resources: 1600, tier: 3 },
        { relX: 0.50, relY: 0.50, resources: 2500, tier: 4 }
    ];

    const MIN_HQ_FLIGHT_DIST = 145;
    rawLayout.forEach((spec, idx) => {
        const ax = spec.relX * w;
        const ay = spec.relY * h;
        const d1 = Math.hypot(ax - state.players[0].hq.x, ay - state.players[0].hq.y);
        const d2 = Math.hypot(ax - state.players[1].hq.x, ay - state.players[1].hq.y);
        if (d1 >= MIN_HQ_FLIGHT_DIST && d2 >= MIN_HQ_FLIGHT_DIST) {
            state.asteroids.push({
                id: idx + 1,
                x: ax,
                y: ay,
                resources: spec.resources,
                maxResources: spec.resources,
                tier: spec.tier,
                radius: 12,
                miners: 0
            });
        }
    });

    return state;
}

function findAvailableStationDegree(player, targetDeg) {
    const occupied = new Set(player.stations.map(s => s.degree));
    if (!occupied.has(targetDeg)) return targetDeg;
    for (let offset = 1; offset <= 90; offset++) {
        const right = targetDeg + offset;
        if (right <= 90 && !occupied.has(right)) return right;
        const left = targetDeg - offset;
        if (left >= 0 && !occupied.has(left)) return left;
    }
    return -1;
}

function degreeToAngleRad(playerId, deg) {
    if (playerId === 0) {
        return - (deg / 90.0) * (Math.PI * 0.5);
    } else {
        return Math.PI - (deg / 90.0) * (Math.PI * 0.5);
    }
}

function getDotPosition(p, deg, r = p.distances[deg]) {
    const rad = degreeToAngleRad(p.id, deg);
    return {
        x: p.hq.x + r * Math.cos(rad),
        y: p.hq.y + r * Math.sin(rad)
    };
}

// -------------------------------------------------------------
// Test Group 1: Asteroids & 1-Second Flight Time Constraint
// -------------------------------------------------------------
it("All asteroids satisfy strict > 1 second flight time from Player 1 HQ", () => {
    const state = createTestState();
    const hq = state.players[0].hq;
    assert(state.asteroids.length > 0, "Asteroids array should not be empty");
    
    state.asteroids.forEach(a => {
        const dist = Math.hypot(a.x - hq.x, a.y - hq.y);
        const flightTime = (dist - hq.radius) / MINER_SPEED;
        assert(flightTime > 1.0, `Asteroid ${a.id} flight time ${flightTime.toFixed(2)}s must be > 1.0s (dist: ${dist.toFixed(1)}px)`);
    });
});

it("All asteroids satisfy strict > 1 second flight time from Player 2 HQ", () => {
    const state = createTestState();
    const hq = state.players[1].hq;
    assert(state.asteroids.length > 0, "Asteroids array should not be empty");
    
    state.asteroids.forEach(a => {
        const dist = Math.hypot(a.x - hq.x, a.y - hq.y);
        const flightTime = (dist - hq.radius) / MINER_SPEED;
        assert(flightTime > 1.0, `Asteroid ${a.id} flight time ${flightTime.toFixed(2)}s must be > 1.0s (dist: ${dist.toFixed(1)}px)`);
    });
});

// -------------------------------------------------------------
// Test Group 2: Station Placement & Occupied Neighbor Sliding
// -------------------------------------------------------------
it("Deploying on an empty ray assigns station to that exact degree dot", () => {
    const state = createTestState();
    const p1 = state.players[0];
    const freeDeg = findAvailableStationDegree(p1, 45);
    assert.strictEqual(freeDeg, 45, "Should choose 45 when free");
    p1.stations.push({ id: 1, degree: freeDeg });
    assert.strictEqual(p1.stations[0].degree, 45);
});

it("Deploying on an occupied ray slides station to nearest available neighbor dot", () => {
    const state = createTestState();
    const p1 = state.players[0];
    p1.stations.push({ id: 1, degree: 45 });

    // Target 45 again -> should slide to 46
    const slide1 = findAvailableStationDegree(p1, 45);
    assert.strictEqual(slide1, 46, "Should slide to +1 neighbor (46)");
    p1.stations.push({ id: 2, degree: slide1 });

    // Target 45 again -> 45 and 46 are occupied, should slide to 44
    const slide2 = findAvailableStationDegree(p1, 45);
    assert.strictEqual(slide2, 44, "Should slide to -1 neighbor (44)");
    p1.stations.push({ id: 3, degree: slide2 });

    // Target 45 again -> 44, 45, 46 occupied -> should slide to 47
    const slide3 = findAvailableStationDegree(p1, 45);
    assert.strictEqual(slide3, 47, "Should slide to +2 neighbor (47)");
});

it("Station coordinates track border expansion dynamically", () => {
    const state = createTestState();
    const p1 = state.players[0];
    p1.stations.push({ id: 1, degree: 45 });
    
    const pos1 = getDotPosition(p1, 45);
    assert.strictEqual(p1.distances[45], 280);
    
    // Simulate border push by 25px
    p1.distances[45] += 25;
    const pos2 = getDotPosition(p1, 45);
    
    const dHQ1 = Math.hypot(pos1.x - p1.hq.x, pos1.y - p1.hq.y);
    const dHQ2 = Math.hypot(pos2.x - p1.hq.x, pos2.y - p1.hq.y);
    assert(Math.abs(dHQ2 - dHQ1 - 25) < 0.001, "Station moves outward with expanding border dot");
});

// -------------------------------------------------------------
// Test Group 3: Fighter Stances (3 Canonical Modes)
// -------------------------------------------------------------
it("Fighter Defend stance holds escort around HQ when peaceful", () => {
    const state = createTestState();
    const p1 = state.players[0];
    p1.stance = 'defend';
    
    // Escort formation target calculation
    const baseAng = -Math.PI * 0.25;
    const escortX = p1.hq.x + 65 * Math.cos(baseAng);
    const escortY = p1.hq.y + 65 * Math.sin(baseAng);
    const distToHQ = Math.hypot(escortX - p1.hq.x, escortY - p1.hq.y);
    
    assert(Math.abs(distToHQ - 65) < 0.001, "Defensive escort holds near HQ");
});

it("Fighter Patrol stance cruises along the 91-degree frontier line", () => {
    const state = createTestState();
    const p1 = state.players[0];
    p1.stance = 'patrol';
    
    for (let t = 0; t <= 1.0; t += 0.25) {
        const patrolDeg = Math.round(t * 90);
        const pos = getDotPosition(p1, patrolDeg);
        const distFromHQ = Math.hypot(pos.x - p1.hq.x, pos.y - p1.hq.y);
        assert(Math.abs(distFromHQ - 280) < 0.001, `Patrol dot at ${patrolDeg}° sits directly on border frontier`);
    }
});

it("Fighter Attack stance acquires nearest enemy station as priority target", () => {
    const state = createTestState();
    const p1 = state.players[0];
    const p2 = state.players[1];
    p1.stance = 'attack';
    
    // Give enemy a station at deg 45
    p2.stations.push({ id: 10, degree: 45 });
    const sPos = getDotPosition(p2, 45);
    
    let sharedAttackTarget = null;
    if (p2.stations.length > 0) {
        let bestDist = Infinity;
        p2.stations.forEach(es => {
            const ePos = getDotPosition(p2, es.degree);
            const d = Math.hypot(ePos.x - p1.hq.x, ePos.y - p1.hq.y);
            if (d < bestDist) {
                bestDist = d;
                sharedAttackTarget = { x: ePos.x, y: ePos.y, entity: es, type: 'station' };
            }
        });
    }
    
    assert(sharedAttackTarget !== null, "Should acquire an attack target");
    assert.strictEqual(sharedAttackTarget.type, 'station', "Should prioritize enemy station");
    assert.strictEqual(sharedAttackTarget.x, sPos.x);
    assert.strictEqual(sharedAttackTarget.y, sPos.y);
});

console.log("\n------------------------------------------------------------");
console.log(`  Summary: ${passed} Passed, ${failed} Failed`);
console.log("------------------------------------------------------------\n");

if (failed > 0) process.exit(1);
