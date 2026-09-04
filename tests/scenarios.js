import { resetGameState, createDummyPlayer, runSimulation } from './test_runner.js';
import { players, asteroids, GRID_W, GRID_H } from '../js/state.js';
import { updateAI } from '../js/ai.js';
import { isAsteroidInPolygon, getStationGraph } from '../js/utils.js';
import fs from 'fs';
import path from 'path';

const results = [];

function recordResult(name, category, data) {
    results.push({ name, category, ...data });
}

// --- Combat Scenarios ---

function testFighterVsStation() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    const p2 = createDummyPlayer(1, 18, 7.5);

    // Give P1 a fighter
    p1.units.fighters.push({ x: 9.5, y: 7.5, path: [{ x: 10.5, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 a defensive station (stationary)
    p2.units.stations.push({ x: 10.5, y: 7.5, targetX: 10.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = () => p1.units.fighters.length === 0 || p2.units.stations.length === 0;

    const res = runSimulation(stopCondition);

    recordResult("1 Fighter vs 1 Station (Head-on)", "Combat", {
        timeSeconds: res.timeSeconds,
        p1FightersLeft: p1.units.fighters.length,
        p1FightersHP: p1.units.fighters.reduce((acc, f) => acc + f.health, 0),
        p2StationsLeft: p2.units.stations.length,
        p2StationsHP: p2.units.stations.reduce((acc, s) => acc + s.health, 0),
    });
}

function testFighterVsTwoStations() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    const p2 = createDummyPlayer(1, 18, 7.5);

    // Give P1 a fighter pointing to loop over the stations
    p1.units.fighters.push({ x: 8.5, y: 7.5, path: [{ x: 8.5, y: 7.5 }, { x: 12.5, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 two defensive stations
    p2.units.stations.push({ x: 10.5, y: 7.0, targetX: 10.5, targetY: 7.0, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 10.5, y: 8.0, targetX: 10.5, targetY: 8.0, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = () => p1.units.fighters.length === 0 || p2.units.stations.length === 0;

    const res = runSimulation(stopCondition);

    recordResult("1 Fighter vs 2 Stations", "Combat", {
        timeSeconds: res.timeSeconds,
        p1FightersLeft: p1.units.fighters.length,
        p1FightersHP: p1.units.fighters.reduce((acc, f) => acc + f.health, 0),
        p2StationsLeft: p2.units.stations.length,
        p2StationsHP: p2.units.stations.reduce((acc, s) => acc + s.health, 0),
    });
}

function testTwoFightersVsStation() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    const p2 = createDummyPlayer(1, 18, 7.5);

    // Give P1 two fighters
    p1.units.fighters.push({ x: 9.5, y: 7.0, path: [{ x: 10.5, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p1.units.fighters.push({ x: 9.5, y: 8.0, path: [{ x: 10.5, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 a defensive station (stationary)
    p2.units.stations.push({ x: 10.5, y: 7.5, targetX: 10.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = () => p1.units.fighters.length === 0 || p2.units.stations.length === 0;

    const res = runSimulation(stopCondition);

    recordResult("2 Fighters vs 1 Station", "Combat", {
        timeSeconds: res.timeSeconds,
        p1FightersLeft: p1.units.fighters.length,
        p1FightersHP: p1.units.fighters.reduce((acc, f) => acc + f.health, 0),
        p2StationsLeft: p2.units.stations.length,
        p2StationsHP: p2.units.stations.reduce((acc, s) => acc + s.health, 0),
    });
}

// --- Economy / AI Scenarios ---

function testEconomyMiningSpeed() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    createDummyPlayer(1, 18, 7.5);

    // Generate deterministic asteroids on P1's side
    asteroids.push({ x: 3.5, y: 7.5, radius: 0.3, miners: 0, resources: 200, variant: 0 });
    asteroids.push({ x: 5.0, y: 5.5, radius: 0.3, miners: 0, resources: 350, variant: 1 });

    p1.isCPU = true;
    p1.type = 'cpu_expansioneer';

    // Start with 3 stations in a triangle to form initial territory enclosing the first asteroid
    p1.units.stations.push({ x: 3.5, y: 7.5, targetX: 3.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 3.0, y: 6.5, targetX: 3.0, targetY: 6.5, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 3.0, y: 8.5, targetX: 3.0, targetY: 8.5, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.miners.push({ x: 2.0, y: 7.5, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60 });

    // End when all resources are drained or 120s
    const stopCondition = (ticks) => asteroids.every(a => a.resources <= 0) || ticks >= 60 * 120;

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) {
            updateAI(p1, 1 / 60, GRID_W, GRID_H);
        }
    });

    recordResult("Time to mine all asteroids on one side", "Economy", {
        timeSeconds: res.timeSeconds,
        asteroidsMined: asteroids.every(a => a.resources <= 0),
        p1Energy: p1.energy,
        p1MinersBuilt: p1.units.miners.length
    });
}

function testUncontestedMapTakeover() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    createDummyPlayer(1, 18, 7.5);

    asteroids.push({ x: 4.0, y: 7.5, radius: 0.3, miners: 0, resources: 200, variant: 0 });
    asteroids.push({ x: 6.0, y: 5.5, radius: 0.3, miners: 0, resources: 200, variant: 0 });

    p1.isCPU = true;
    p1.type = 'cpu_expansioneer';
    p1.units.stations.push({ x: 3.0, y: 7.5, targetX: 3.0, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 2.5, y: 6.0, targetX: 2.5, targetY: 6.0, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 2.5, y: 9.0, targetX: 2.5, targetY: 9.0, health: 200, maxHealth: 200, cooldown: 0 });

    function checkTakeover() {
        return asteroids.every(a => isAsteroidInPolygon(a, p1));
    }

    const stopCondition = (ticks) => checkTakeover() || ticks >= 60 * 120;

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) {
            updateAI(p1, 1 / 60, GRID_W, GRID_H);
        }
    });

    recordResult("Time to takeover gameboard with no combat", "Economy", {
        timeSeconds: res.timeSeconds,
        p1Energy: p1.energy,
        p1StationsBuilt: p1.units.stations.length
    });
}

// --- Advanced Scenarios ---

function testEconomyToMilitaryPipeline() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    const p2 = createDummyPlayer(1, 18, 7.5);

    asteroids.push({ x: 4.0, y: 6.5, radius: 0.3, miners: 0, resources: 500, variant: 0 });
    asteroids.push({ x: 4.0, y: 8.5, radius: 0.3, miners: 0, resources: 500, variant: 1 });

    p1.isCPU = true;
    p1.type = 'cpu_expansioneer';
    p1.units.stations.push({ x: 3.5, y: 7.5, targetX: 3.5, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 3.0, y: 6.0, targetX: 3.0, targetY: 6.0, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 3.0, y: 9.0, targetX: 3.0, targetY: 9.0, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.miners.push({ x: 2.5, y: 7.5, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60 });

    // Dummy P2 needs some fighters to trigger P1's defensive fighter build logic
    for (let i = 0; i < 3; i++) {
        p2.units.fighters.push({ x: 16.0, y: 7.0 + i * 0.5, path: [{ x: 16.0, y: 7.0 + i * 0.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    }

    const stopCondition = (ticks) => p1.units.fighters.length >= 3 || ticks >= 60 * 180;

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) updateAI(p1, 1 / 60, GRID_W, GRID_H);
    });

    recordResult("Economy to Military (Build 3 Fighters)", "Economy", {
        timeSeconds: res.timeSeconds,
        p1Energy: p1.energy,
        p1MinersBuilt: p1.units.miners.length,
        p1FightersBuilt: p1.units.fighters.length
    });
}

function testThreeFightersVsCombo() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    const p2 = createDummyPlayer(1, 18, 7.5);

    // Give P1 three fighters
    p1.units.fighters.push({ x: 9.5, y: 7.0, path: [{ x: 10.5, y: 7.0 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p1.units.fighters.push({ x: 9.5, y: 7.5, path: [{ x: 10.5, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p1.units.fighters.push({ x: 9.5, y: 8.0, path: [{ x: 10.5, y: 8.0 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 one fighter and two stations
    p2.units.fighters.push({ x: 10.5, y: 7.5, path: [{ x: 9.5, y: 7.5 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p2.units.stations.push({ x: 10.5, y: 6.8, targetX: 10.5, targetY: 6.8, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 10.5, y: 8.2, targetX: 10.5, targetY: 8.2, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = () => p1.units.fighters.length === 0 || (p2.units.fighters.length === 0 && p2.units.stations.length === 0);

    const res = runSimulation(stopCondition);

    recordResult("3 Fighters vs 1 Fighter + 2 Stations", "Combat", {
        timeSeconds: res.timeSeconds,
        p1FightersLeft: p1.units.fighters.length,
        p1FightersHP: p1.units.fighters.reduce((acc, f) => acc + f.health, 0),
        p2DefendersLeft: p2.units.fighters.length + p2.units.stations.length,
        p2DefendersHP: p2.units.fighters.reduce((acc, f) => acc + f.health, 0) + p2.units.stations.reduce((acc, s) => acc + s.health, 0),
    });
}

function testCPUvsCPU_Expansioneer() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    const p2 = createDummyPlayer(1, 18, 7.5);

    asteroids.push({ x: 4.0, y: 6.0, radius: 0.3, miners: 0, resources: 400, variant: 0 });
    asteroids.push({ x: 4.0, y: 9.0, radius: 0.3, miners: 0, resources: 400, variant: 1 });
    asteroids.push({ x: 16.0, y: 6.0, radius: 0.3, miners: 0, resources: 400, variant: 2 });
    asteroids.push({ x: 16.0, y: 9.0, radius: 0.3, miners: 0, resources: 400, variant: 0 });
    asteroids.push({ x: 10.0, y: 7.5, radius: 0.3, miners: 0, resources: 800, variant: 1 });

    p1.isCPU = true;
    p1.type = 'cpu_expansioneer';
    p2.isCPU = true;
    p2.type = 'cpu_expansioneer';

    p1.units.stations.push({ x: 3.0, y: 7.5, targetX: 3.0, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 2.5, y: 6.0, targetX: 2.5, targetY: 6.0, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 2.5, y: 9.0, targetX: 2.5, targetY: 9.0, health: 200, maxHealth: 200, cooldown: 0 });

    p2.units.stations.push({ x: 17.0, y: 7.5, targetX: 17.0, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 17.5, y: 6.0, targetX: 17.5, targetY: 6.0, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 17.5, y: 9.0, targetX: 17.5, targetY: 9.0, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = (ticks) => p1.homePlanet.health <= 0 || p2.homePlanet.health <= 0 ||
        (p1.units.stations.length + p1.units.fighters.length + p1.units.miners.length === 0 && p1.energy < 25) ||
        (p2.units.stations.length + p2.units.fighters.length + p2.units.miners.length === 0 && p2.energy < 25) ||
        ticks >= 60 * 300;

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) updateAI(p1, 1 / 60, GRID_W, GRID_H);
        if (p2.isCPU) updateAI(p2, 1 / 60, GRID_W, GRID_H);
    });

    recordResult("Expansioneer vs Expansioneer (CPU vs CPU)", "Full Game", {
        timeSeconds: res.timeSeconds,
        winner: p1.homePlanet.health > 0 && p2.homePlanet.health <= 0 ? "Player 1" : (p2.homePlanet.health > 0 && p1.homePlanet.health <= 0 ? "Player 2" : "In Progress / Stalemate"),
        p1RemainingPlanetHP: p1.homePlanet.health,
        p2RemainingPlanetHP: p2.homePlanet.health,
        p1TotalUnitsLeft: p1.units.stations.length + p1.units.fighters.length + p1.units.miners.length,
        p2TotalUnitsLeft: p2.units.stations.length + p2.units.fighters.length + p2.units.miners.length,
    });
}

// --- Bug Fix Scenarios ---

function testStationMovementWhenTerritoriesIntersect() {
    resetGameState();
    const p1 = createDummyPlayer(0, 2, 7.5);
    const p2 = createDummyPlayer(1, 18, 7.5);

    // Create an intersection between P1 and P2 in center
    p1.units.stations.push({ x: 9.0, y: 7.0, targetX: 9.0, targetY: 7.0, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 9.0, y: 8.0, targetX: 9.0, targetY: 8.0, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 10.0, y: 7.0, targetX: 10.0, targetY: 7.0, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 10.0, y: 8.0, targetX: 10.0, targetY: 8.0, health: 200, maxHealth: 200, cooldown: 0 });

    // P1 has a FREE station far away, trying to move.
    p1.units.stations.push({ x: 4.0, y: 7.5, targetX: 4.0, targetY: 4.0, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = (ticks) => ticks >= 60; // Run for 1 second (60 frames)

    runSimulation(stopCondition);

    const testStation = p1.units.stations[2]; // The free station

    recordResult("Station movement when territories overlap", "Pathfinding", {
        timeSeconds: 1,
        stationMoved: testStation.y < 7.4, // It should have moved towards y:4.0
        finalY: testStation.y
    });
}

function testProceduralTerritoryEnvelopment() {
    let splitCount = 0;
    const trials = 10;
    let totalCaptured = 0;
    let totalAsteroids = 0;

    for (let t = 0; t < trials; t++) {
        resetGameState();
        const p1 = createDummyPlayer(0, 2, 7.5);
        p1.isCPU = true;
        p1.type = 'cpu_expansioneer';

        // 6 random asteroids on left half
        for (let i = 0; i < 6; i++) {
            asteroids.push({
                x: Math.random() * (10 - 4) + 4,
                y: Math.random() * (GRID_H - 2) + 1,
                radius: 0.3, miners: 0, resources: 400, variant: 0
            });
        }

        // Give 12 stations to build a mature network
        while (p1.units.stations.length < 12) {
            p1.units.stations.push({
                x: 2, y: 7.5, targetX: 2, targetY: 7.5,
                health: 200, maxHealth: 200, cooldown: 0
            });
        }

        // Run simulation for 20 seconds of game-time (1200 ticks) so stations move to positions
        runSimulation((ticks) => ticks >= 1200, () => {
            if (p1.isCPU) updateAI(p1, 1 / 60, GRID_W, GRID_H);
        });

        const graph = getStationGraph(p1, false);
        if (graph.components.length > 1) {
            splitCount++;
        }

        const myAsteroids = asteroids.filter(a => a.x <= 10.5);
        const captured = myAsteroids.filter(a => isAsteroidInPolygon(a, p1));
        totalCaptured += captured.length;
        totalAsteroids += myAsteroids.length;
    }

    recordResult("Procedural Random Map Territory Envelopment", "Territory", {
        trials: trials,
        splitNetworks: splitCount,
        splitRatePercent: (splitCount / trials) * 100,
        capturedAsteroids: totalCaptured,
        totalAsteroids: totalAsteroids,
        captureRatePercent: (totalCaptured / totalAsteroids) * 100
    });
}

// Run scenarios
console.log("Running scaled scenario tests...");
testProceduralTerritoryEnvelopment();
testStationMovementWhenTerritoriesIntersect();
testFighterVsStation();
testFighterVsTwoStations();
testTwoFightersVsStation();
testThreeFightersVsCombo();
testEconomyMiningSpeed();
testUncontestedMapTakeover();
testEconomyToMilitaryPipeline();
testCPUvsCPU_Expansioneer();

// --- Save Results ---
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = path.join(process.cwd(), 'tests', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, `test_results_${timestamp}.json`);

const metadata = {
    units: {
        station: { health: 200, damage: 5, firerate_cd: 0.3 },
        fighter: { health: 150, damage: 10, firerate_cd: 0.5 },
        miner: { health: 60, payload_capacity: 25, mine_rate_per_sec: 10 }
    },
    planet: { health: 1000 },
    asteroid: { starting_resources: "Varies (200-800 per scenario test)" }
};

const logData = {
    timestamp: timestamp,
    date: new Date().toLocaleString(),
    metadata: metadata,
    results: results
};

fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
console.log(`Saved scenario test results to ${logFile}`);
