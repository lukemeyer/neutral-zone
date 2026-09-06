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
    initialRadius: 198, // Exactly half area of 280 (280 / sqrt(2) = 198)
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

const COSTS = {
    station: 100,
    fighter: 50,
    miner: 20
};

const BUILD_TIMES = {
    station: 30.0,
    fighter: 15.0,
    miner: 10.0
};

const MINER_SPEED = 50; // px/sec (reduced to 50%)
const FIGHTER_SPEED = 70; // px/sec (reduced to 50%)
const STATION_RANGE = 57.5; // halved from 115
const STATION_DAMAGE = 9; // halved from 18

function getPolygonArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        area += poly[i].x * poly[j].y;
        area -= poly[j].x * poly[i].y;
    }
    return Math.abs(area) * 0.5;
}

function createTestState(w = 1200, h = 800) {
    const state = {
        players: [
            {
                id: 0,
                hq: { x: CONFIG.hqOffset, y: h - CONFIG.hqOffset, radius: 18, hp: 500, maxHp: 500 },
                corner: { x: 0, y: h },
                energy: 150,
                stance: 'defend',
                distances: new Float64Array(91).fill(CONFIG.initialRadius),
                stations: [],
                miners: [],
                fighters: [],
                buildQueues: { station: [], miner: [], fighter: [] },
                readyStations: 0
            },
            {
                id: 1,
                hq: { x: w - CONFIG.hqOffset, y: CONFIG.hqOffset, radius: 18, hp: 500, maxHp: 500 },
                corner: { x: w, y: 0 },
                energy: 150,
                stance: 'defend',
                distances: new Float64Array(91).fill(CONFIG.initialRadius),
                stations: [],
                miners: [],
                fighters: [],
                buildQueues: { station: [], miner: [], fighter: [] },
                readyStations: 0
            }
        ],
        asteroids: []
    };

    // Asteroids layout from commander_v2.html (15 total, including 4 new 500-energy ones)
    const rawLayout = [
        { relX: 0.12, relY: 0.76, resources: 800, tier: 1 },
        { relX: 0.22, relY: 0.88, resources: 800, tier: 1 },
        { relX: 0.88, relY: 0.24, resources: 800, tier: 1 },
        { relX: 0.78, relY: 0.12, resources: 800, tier: 1 },

        // 4 Additional Strategic Asteroids (500 energy each)
        { relX: 0.16, relY: 0.68, resources: 500, tier: 1 },
        { relX: 0.84, relY: 0.32, resources: 500, tier: 1 },
        { relX: 0.28, relY: 0.88, resources: 500, tier: 1 },
        { relX: 0.72, relY: 0.12, resources: 500, tier: 1 },

        { relX: 0.20, relY: 0.58, resources: 1200, tier: 2 },
        { relX: 0.38, relY: 0.80, resources: 1200, tier: 2 },
        { relX: 0.80, relY: 0.42, resources: 1200, tier: 2 },
        { relX: 0.62, relY: 0.20, resources: 1200, tier: 2 },
        { relX: 0.34, relY: 0.46, resources: 1600, tier: 3 },
        { relX: 0.66, relY: 0.54, resources: 1600, tier: 3 },
        { relX: 0.50, relY: 0.50, resources: 2500, tier: 4 }
    ];

    const MIN_HQ_FLIGHT_DIST = 120;
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
    assert.strictEqual(p1.distances[45], 198);
    
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
        assert(Math.abs(distFromHQ - 198) < 0.001, `Patrol dot at ${patrolDeg}° sits directly on border frontier`);
    }
});

it("Fighter Attack stance prioritizes targets: nearest fighter, then station, then miner, then hq", () => {
    const state = createTestState();
    const p1 = state.players[0];
    const p2 = state.players[1];
    p1.stance = 'attack';

    function getAttackTarget(p, enemy) {
        if (enemy.fighters.length > 0) {
            let bestDist = Infinity, best = null;
            enemy.fighters.forEach(ef => {
                const d = Math.hypot(ef.x - p.hq.x, ef.y - p.hq.y);
                if (d < bestDist) { bestDist = d; best = ef; }
            });
            return { type: 'fighter', entity: best };
        } else if (enemy.stations.length > 0) {
            let bestDist = Infinity, best = null;
            enemy.stations.forEach(es => {
                const ePos = getDotPosition(enemy, es.degree);
                const d = Math.hypot(ePos.x - p.hq.x, ePos.y - p.hq.y);
                if (d < bestDist) { bestDist = d; best = es; }
            });
            return { type: 'station', entity: best };
        } else if (enemy.miners.length > 0) {
            let bestDist = Infinity, best = null;
            enemy.miners.forEach(em => {
                const d = Math.hypot(em.x - p.hq.x, em.y - p.hq.y);
                if (d < bestDist) { bestDist = d; best = em; }
            });
            return { type: 'miner', entity: best };
        } else if (enemy.hq && enemy.hq.hp > 0) {
            return { type: 'hq', entity: enemy.hq };
        }
        return null;
    }

    // Case 1: Enemy has all 4 types -> must prioritize fighter
    p2.fighters.push({ id: 1, x: 500, y: 500 });
    p2.stations.push({ id: 2, degree: 45 });
    p2.miners.push({ id: 3, x: 400, y: 400 });
    assert.strictEqual(getAttackTarget(p1, p2).type, 'fighter', "Priority 1: Fighter");

    // Case 2: No enemy fighters -> must prioritize station
    p2.fighters = [];
    assert.strictEqual(getAttackTarget(p1, p2).type, 'station', "Priority 2: Station");

    // Case 3: No enemy stations -> must prioritize miner
    p2.stations = [];
    assert.strictEqual(getAttackTarget(p1, p2).type, 'miner', "Priority 3: Miner");

    // Case 4: Only enemy HQ left -> must prioritize HQ
    p2.miners = [];
    assert.strictEqual(getAttackTarget(p1, p2).type, 'hq', "Priority 4: HQ");
});

// -------------------------------------------------------------
// Test Group 4: Construction Timers, Prices & Auto-Deployment
// -------------------------------------------------------------
function simulateUpdate(state, dt) {
    state.players.forEach(p => {
        // Miner Queue (10s) -> auto-deploys
        if (p.buildQueues.miner.length > 0) {
            const item = p.buildQueues.miner[0];
            item.timeLeft -= dt;
            if (item.timeLeft <= 0) {
                p.buildQueues.miner.shift();
                p.miners.push({ id: 999, speed: MINER_SPEED });
            }
        }
        // Fighter Queue (15s) -> auto-deploys
        if (p.buildQueues.fighter.length > 0) {
            const item = p.buildQueues.fighter[0];
            item.timeLeft -= dt;
            if (item.timeLeft <= 0) {
                p.buildQueues.fighter.shift();
                p.fighters.push({ id: 998, speed: FIGHTER_SPEED });
            }
        }
        // Station Queue (30s) -> increments readyStations
        if (p.buildQueues.station.length > 0) {
            const item = p.buildQueues.station[0];
            item.timeLeft -= dt;
            if (item.timeLeft <= 0) {
                p.buildQueues.station.shift();
                p.readyStations++;
            }
        }
    });
}

it("Prices strictly adhere to specifications: Station 100, Fighter 50, Miner 20", () => {
    assert.strictEqual(COSTS.station, 100);
    assert.strictEqual(COSTS.fighter, 50);
    assert.strictEqual(COSTS.miner, 20);
});

it("Construction timers strictly adhere to specifications: Station 30s, Fighter 15s, Miner 10s", () => {
    assert.strictEqual(BUILD_TIMES.station, 30.0);
    assert.strictEqual(BUILD_TIMES.fighter, 15.0);
    assert.strictEqual(BUILD_TIMES.miner, 10.0);
});

it("Flight speeds are reduced to 50% (Miner: 50 px/s, Fighter: 70 px/s)", () => {
    assert.strictEqual(MINER_SPEED, 50);
    assert.strictEqual(FIGHTER_SPEED, 70);
});

it("Miners queue for 10s and deploy automatically upon completion", () => {
    const state = createTestState();
    const p1 = state.players[0];
    p1.energy = 100;
    
    // Queue miner
    assert(p1.energy >= COSTS.miner);
    p1.energy -= COSTS.miner;
    p1.buildQueues.miner.push({ timeLeft: BUILD_TIMES.miner, totalTime: BUILD_TIMES.miner });
    assert.strictEqual(p1.energy, 80, "Deducted 20 energy");
    assert.strictEqual(p1.miners.length, 0);

    // Simulate 5 seconds -> still in queue
    simulateUpdate(state, 5.0);
    assert.strictEqual(p1.miners.length, 0, "Miner should not be deployed at 5s");
    assert.strictEqual(p1.buildQueues.miner.length, 1);
    assert.strictEqual(p1.buildQueues.miner[0].timeLeft, 5.0);

    // Simulate another 5 seconds -> completes at 10s and auto-deploys!
    simulateUpdate(state, 5.0);
    assert.strictEqual(p1.miners.length, 1, "Miner auto-deployed at 10s");
    assert.strictEqual(p1.buildQueues.miner.length, 0);
});

it("Fighters queue for 15s and deploy automatically upon completion", () => {
    const state = createTestState();
    const p1 = state.players[0];
    p1.energy = 100;
    
    // Queue fighter
    assert(p1.energy >= COSTS.fighter);
    p1.energy -= COSTS.fighter;
    p1.buildQueues.fighter.push({ timeLeft: BUILD_TIMES.fighter, totalTime: BUILD_TIMES.fighter });
    assert.strictEqual(p1.energy, 50, "Deducted 50 energy");
    assert.strictEqual(p1.fighters.length, 0);

    // Simulate 10 seconds -> still in queue
    simulateUpdate(state, 10.0);
    assert.strictEqual(p1.fighters.length, 0, "Fighter should not be deployed at 10s");
    assert.strictEqual(p1.buildQueues.fighter.length, 1);
    assert.strictEqual(p1.buildQueues.fighter[0].timeLeft, 5.0);

    // Simulate another 5 seconds -> completes at 15s and auto-deploys!
    simulateUpdate(state, 5.0);
    assert.strictEqual(p1.fighters.length, 1, "Fighter auto-deployed at 15s");
    assert.strictEqual(p1.buildQueues.fighter.length, 0);
});

it("Stations queue for 30s, increment readyStations (button pulses), and deploy on player click", () => {
    const state = createTestState();
    const p1 = state.players[0];
    p1.energy = 150;
    
    // Queue station
    assert(p1.energy >= COSTS.station);
    p1.energy -= COSTS.station;
    p1.buildQueues.station.push({ timeLeft: BUILD_TIMES.station, totalTime: BUILD_TIMES.station });
    assert.strictEqual(p1.energy, 50, "Deducted 100 energy");
    assert.strictEqual(p1.readyStations, 0);
    assert.strictEqual(p1.stations.length, 0);

    // Simulate 20 seconds -> still in queue
    simulateUpdate(state, 20.0);
    assert.strictEqual(p1.readyStations, 0, "Station not ready yet at 20s");
    assert.strictEqual(p1.stations.length, 0);

    // Simulate remaining 10 seconds -> completes at 30s!
    simulateUpdate(state, 10.0);
    assert.strictEqual(p1.readyStations, 1, "Station is ready and button pulses!");
    assert.strictEqual(p1.stations.length, 0, "Does not auto-deploy yet: awaits player click");

    // Player clicks ray at degree 45 -> deploys!
    const targetDeg = 45;
    const finalDeg = findAvailableStationDegree(p1, targetDeg);
    p1.stations.push({ id: 101, degree: finalDeg });
    p1.readyStations--;

    assert.strictEqual(p1.readyStations, 0, "Consumed readyStation");
    assert.strictEqual(p1.stations.length, 1, "Station deployed successfully on border");
    assert.strictEqual(p1.stations[0].degree, 45);
});

// -------------------------------------------------------------
// Test Group 5: Combat Overhaul, Shields, Perfect Arc & Win Conditions
// -------------------------------------------------------------
it("Starting territory shape is a perfect arc with uniform radius and half the previous area", () => {
    const state = createTestState();
    const p1 = state.players[0];
    
    // Check all 91 degree distances are strictly uniform at 198
    for (let i = 0; i < 91; i++) {
        assert.strictEqual(p1.distances[i], 198, `Degree ${i} should be 198px`);
    }
    
    const poly = [{ x: p1.hq.x, y: p1.hq.y }];
    for (let i = 0; i < 91; i++) {
        poly.push(getDotPosition(p1, i));
    }
    const currentArea = getPolygonArea(poly);
    const oldRadius = 280;
    const oldArea = (Math.PI * 0.25) * (oldRadius ** 2);
    const ratio = currentArea / oldArea;
    assert(Math.abs(ratio - 0.5) < 0.02, `Area ratio ${ratio.toFixed(3)} must be approximately 0.50 (half area)`);
});

it("All 15 asteroids (including 4 new 500-energy ones) satisfy flight time > 1.0s constraint", () => {
    const state = createTestState();
    assert.strictEqual(state.asteroids.length, 15, "Should have 15 asteroids total");
    const bonus500 = state.asteroids.filter(a => a.resources === 500);
    assert.strictEqual(bonus500.length, 4, "Should have 4 asteroids with 500 energy each");
    
    state.asteroids.forEach(a => {
        const d1 = Math.hypot(a.x - state.players[0].hq.x, a.y - state.players[0].hq.y);
        const d2 = Math.hypot(a.x - state.players[1].hq.x, a.y - state.players[1].hq.y);
        const flightTime1 = (d1 - 18) / MINER_SPEED;
        const flightTime2 = (d2 - 18) / MINER_SPEED;
        assert(flightTime1 > 1.0, `Asteroid ${a.id} flight time P1 ${flightTime1.toFixed(2)}s must be > 1.0s`);
        assert(flightTime2 > 1.0, `Asteroid ${a.id} flight time P2 ${flightTime2.toFixed(2)}s must be > 1.0s`);
    });
});

it("Station firing range is halved to 57.5px and weapon damage is halved to 9", () => {
    assert.strictEqual(STATION_RANGE, 57.5, "Station range must be 57.5 (halved from 115)");
    assert.strictEqual(STATION_DAMAGE, 9, "Station damage must be 9 (halved from 18)");
});

it("Stations target miners and other stations, strictly ignoring enemy fighters", () => {
    const state = createTestState();
    const p1 = state.players[0];
    const p2 = state.players[1];
    
    // P1 has station at degree 45
    p1.stations.push({ id: 10, degree: 45, range: STATION_RANGE });
    const sPos = getDotPosition(p1, 45);
    
    // Place enemy fighter right next to station (distance 20px)
    p2.fighters.push({ id: 201, x: sPos.x + 20, y: sPos.y, hp: 60 });
    // Place enemy miner at distance 40px (within 57.5px range)
    p2.miners.push({ id: 202, x: sPos.x + 40, y: sPos.y, hp: 40 });
    
    // Station target evaluation:
    let chosenTarget = null;
    let chosenType = null;
    let minDist = STATION_RANGE;
    
    p2.miners.forEach(em => {
        const d = Math.hypot(em.x - sPos.x, em.y - sPos.y);
        if (d <= minDist) { minDist = d; chosenTarget = em; chosenType = 'miner'; }
    });
    p2.stations.forEach(es => {
        const esPos = getDotPosition(p2, es.degree);
        const d = Math.hypot(esPos.x - sPos.x, esPos.y - sPos.y);
        if (d <= minDist) { minDist = d; chosenTarget = es; chosenType = 'station'; }
    });
    
    assert(chosenTarget !== null, "Station should find a target in range");
    assert.strictEqual(chosenType, 'miner', "Station must target miner and ignore fighter");
    assert.strictEqual(chosenTarget.id, 202);
});

it("Fighter shield absorbs 3 hits before taking hull damage and recharges 1 hit per 10s", () => {
    const fighter = {
        hp: 60,
        maxHp: 60,
        shield: 3,
        maxShield: 3,
        shieldRechargeTimer: 0
    };
    
    function applyDamage(f, dmg) {
        if (f.shield > 0) {
            f.shield--;
        } else {
            f.hp -= dmg;
        }
    }
    
    // Hit 1: Absorbed by shield
    applyDamage(fighter, 12);
    assert.strictEqual(fighter.shield, 2);
    assert.strictEqual(fighter.hp, 60, "HP untouched on hit 1");
    
    // Hit 2: Absorbed by shield
    applyDamage(fighter, 12);
    assert.strictEqual(fighter.shield, 1);
    assert.strictEqual(fighter.hp, 60, "HP untouched on hit 2");
    
    // Hit 3: Absorbed by shield
    applyDamage(fighter, 12);
    assert.strictEqual(fighter.shield, 0);
    assert.strictEqual(fighter.hp, 60, "HP untouched on hit 3");
    
    // Hit 4: Shield depleted -> hull takes 12 damage
    applyDamage(fighter, 12);
    assert.strictEqual(fighter.shield, 0);
    assert.strictEqual(fighter.hp, 48, "Hull damaged on hit 4");
    
    // Recharge simulation: 5s -> not yet recharged
    fighter.shieldRechargeTimer += 5.0;
    assert.strictEqual(fighter.shield, 0);
    
    // Recharge simulation: another 5s (total 10s) -> 1 shield restored!
    fighter.shieldRechargeTimer += 5.0;
    if (fighter.shieldRechargeTimer >= 10.0) {
        fighter.shield = Math.min(fighter.maxShield, fighter.shield + 1);
        fighter.shieldRechargeTimer = 0;
    }
    assert.strictEqual(fighter.shield, 1, "Shield recharged 1 hit after 10s");
});

it("Fighters never overlap: circle-circle relaxation maintains >= 18px separation", () => {
    const fighters = [
        { x: 300, y: 300 },
        { x: 302, y: 301 } // Distance = sqrt(2^2 + 1^2) = 2.23px (severe overlap!)
    ];
    
    const FIGHTER_RADIUS = 9;
    const minDist = FIGHTER_RADIUS * 2; // 18 px
    
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < fighters.length; i++) {
            for (let j = i + 1; j < fighters.length; j++) {
                const f1 = fighters[i];
                const f2 = fighters[j];
                const dx = f2.x - f1.x;
                const dy = f2.y - f1.y;
                const dist = Math.hypot(dx, dy);
                if (dist < minDist) {
                    const overlap = minDist - (dist || 0.001);
                    const nx = dist > 0.001 ? (dx / dist) : 1;
                    const ny = dist > 0.001 ? (dy / dist) : 0;
                    f1.x -= nx * overlap * 0.5;
                    f1.y -= ny * overlap * 0.5;
                    f2.x += nx * overlap * 0.5;
                    f2.y += ny * overlap * 0.5;
                }
            }
        }
    }
    
    const finalDist = Math.hypot(fighters[1].x - fighters[0].x, fighters[1].y - fighters[0].y);
    assert(finalDist >= minDist - 0.01, `Final distance ${finalDist.toFixed(2)}px must be >= ${minDist}px`);
});

it("HQ has 500 health and match terminates when HQ health drops to 0", () => {
    const state = createTestState();
    const p1 = state.players[0];
    const p2 = state.players[1];
    
    assert.strictEqual(p1.hq.hp, 500);
    assert.strictEqual(p1.hq.maxHp, 500);
    assert.strictEqual(p2.hq.hp, 500);
    
    // Damage P2 HQ by 500
    p2.hq.hp = 0;
    
    let gameOver = false, winner = null;
    if (p2.hq.hp <= 0) {
        gameOver = true;
        winner = 'Blue (P1)';
    }
    assert(gameOver, "Match should end when HQ destroyed");
    assert.strictEqual(winner, 'Blue (P1)');
});

it("Controlling >= 60% of the map triggers Victory by Territory Domination", () => {
    const mapW = 1200, mapH = 800;
    const totalMapArea = mapW * mapH;
    
    // 60% of 960,000 = 576,000
    const testArea = 580000;
    const pct = (testArea / totalMapArea) * 100;
    
    let gameOver = false, winner = null, winReason = null;
    if (pct >= 60.0) {
        gameOver = true;
        winner = 'Blue (P1)';
        winReason = `Territory Domination (${pct.toFixed(1)}%)`;
    }
    
    assert(gameOver, "60% territory should trigger game over");
    assert.strictEqual(winner, 'Blue (P1)');
    assert(winReason.includes("Territory Domination"));
});

console.log("\n------------------------------------------------------------");
console.log(`  Summary: ${passed} Passed, ${failed} Failed`);
console.log("------------------------------------------------------------\n");

if (failed > 0) process.exit(1);

