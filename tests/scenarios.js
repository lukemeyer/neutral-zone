import { resetGameState, createDummyPlayer, runSimulation } from './test_runner.js';
import { players, asteroids } from '../js/state.js';
import { updateAI } from '../js/ai.js';
import { isAsteroidInPolygon } from '../js/utils.js';
import fs from 'fs';
import path from 'path';

const results = [];

function recordResult(name, category, data) {
    results.push({ name, category, ...data });
}

// --- Combat Scenarios ---

function testFighterVsStation() {
    resetGameState();
    const p1 = createDummyPlayer(0, 100, 400);
    const p2 = createDummyPlayer(1, 900, 400);

    // Give P1 a fighter
    p1.units.fighters.push({ x: 400, y: 400, path: [{ x: 600, y: 400 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 a defensive station (stationary)
    p2.units.stations.push({ x: 600, y: 400, targetX: 600, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

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
    const p1 = createDummyPlayer(0, 100, 400);
    const p2 = createDummyPlayer(1, 900, 400);

    // Give P1 a fighter pointing to loop over the stations
    p1.units.fighters.push({ x: 300, y: 400, path: [{ x: 300, y: 400 }, { x: 750, y: 400 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 two defensive stations
    p2.units.stations.push({ x: 600, y: 380, targetX: 600, targetY: 380, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 600, y: 420, targetX: 600, targetY: 420, health: 200, maxHealth: 200, cooldown: 0 });

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
    const p1 = createDummyPlayer(0, 100, 400);
    const p2 = createDummyPlayer(1, 900, 400);

    // Give P1 two fighters
    p1.units.fighters.push({ x: 400, y: 380, path: [{ x: 600, y: 380 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p1.units.fighters.push({ x: 400, y: 420, path: [{ x: 600, y: 420 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 a defensive station (stationary)
    p2.units.stations.push({ x: 600, y: 400, targetX: 600, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

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
    const p1 = createDummyPlayer(0, 100, 400);
    createDummyPlayer(1, 900, 400); // Unused dummy to prevent global AI errors

    // Generate deterministic asteroids on P1's side
    asteroids.push({ x: 180, y: 400, radius: 15, miners: 0, resources: 200, variant: 0 });
    asteroids.push({ x: 300, y: 200, radius: 15, miners: 0, resources: 350, variant: 1 });
    asteroids.push({ x: 300, y: 600, radius: 15, miners: 0, resources: 400, variant: 2 });

    // For economic test, we will actually let `updateAI` run for Player 1 directly inside the main loop wrapper
    // We override runSimulation's step momentarily via a custom tick approach
    p1.isCPU = true;
    // Start with 1 station (to capture) and 1 miner
    p1.units.stations.push({ x: 100, y: 400, targetX: 100, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.miners.push({ x: 100, y: 400, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });

    // End when all resources are drained
    const stopCondition = () => asteroids.every(a => a.resources <= 0);

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) {
            updateAI(p1, 1 / 60, 1000, 800);
        }
    });

    recordResult("Time to mine all asteroids on one side", "Economy", {
        timeSeconds: res.timeSeconds,
        asteroidsMined: true,
        p1Energy: p1.energy,
        p1MinersBuilt: p1.units.miners.length
    });
}

function testUncontestedMapTakeover() {
    resetGameState();
    const p1 = createDummyPlayer(0, 100, 400);
    createDummyPlayer(1, 900, 400);

    // Generate symmetrical board so P1 has targets to expand to
    asteroids.push({ x: 200, y: 400, radius: 15, miners: 0, resources: 200, variant: 0 });
    asteroids.push({ x: 800, y: 400, radius: 15, miners: 0, resources: 200, variant: 0 });

    asteroids.push({ x: 500, y: 200, radius: 15, miners: 0, resources: 400, variant: 0 });
    asteroids.push({ x: 500, y: 600, radius: 15, miners: 0, resources: 400, variant: 0 });

    p1.isCPU = true;
    // Just start with a single station to begin the expansion
    p1.units.stations.push({ x: 150, y: 400, targetX: 150, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

    // We consider "takeover" when all asteroids are captured by P1
    function checkTakeover() {
        return asteroids.every(a => isAsteroidInPolygon(a, p1));
    }

    const stopCondition = (ticks) => checkTakeover();

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) {
            updateAI(p1, 1 / 60, 1000, 800);
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
    const p1 = createDummyPlayer(0, 100, 400);
    const p2 = createDummyPlayer(1, 900, 400); // Dummy target to encourage fighter build logic

    // Give P1 a healthy start of asteroids to build an economy fast
    asteroids.push({ x: 200, y: 300, radius: 15, miners: 0, resources: 500, variant: 0 });
    asteroids.push({ x: 200, y: 500, radius: 15, miners: 0, resources: 500, variant: 1 });
    asteroids.push({ x: 300, y: 400, radius: 15, miners: 0, resources: 800, variant: 2 });

    p1.isCPU = true;
    p1.units.stations.push({ x: 150, y: 400, targetX: 150, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

    // Dummy P2 needs some fighters to trigger P1's defensive fighter build logic
    p2.units.fighters.push({ x: 800, y: 400, path: [{ x: 800, y: 400 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p2.units.fighters.push({ x: 800, y: 420, path: [{ x: 800, y: 420 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p2.units.fighters.push({ x: 800, y: 380, path: [{ x: 800, y: 380 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p2.units.fighters.push({ x: 850, y: 400, path: [{ x: 850, y: 400 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p2.units.fighters.push({ x: 850, y: 420, path: [{ x: 850, y: 420 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    const stopCondition = () => p1.units.fighters.length >= 5;

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) updateAI(p1, 1 / 60, 1000, 800);
    });

    recordResult("Economy to Military (Build 5 Fighters)", "Economy", {
        timeSeconds: res.timeSeconds,
        p1Energy: p1.energy,
        p1MinersBuilt: p1.units.miners.length,
        p1FightersBuilt: p1.units.fighters.length
    });
}

function testThreeFightersVsCombo() {
    resetGameState();
    const p1 = createDummyPlayer(0, 100, 400);
    const p2 = createDummyPlayer(1, 900, 400);

    // Give P1 three fighters
    p1.units.fighters.push({ x: 400, y: 380, path: [{ x: 600, y: 380 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p1.units.fighters.push({ x: 400, y: 400, path: [{ x: 600, y: 400 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p1.units.fighters.push({ x: 400, y: 420, path: [{ x: 600, y: 420 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });

    // Give P2 one fighter and two stations
    p2.units.fighters.push({ x: 600, y: 400, path: [{ x: 400, y: 400 }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    p2.units.stations.push({ x: 600, y: 370, targetX: 600, targetY: 370, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 600, y: 430, targetX: 600, targetY: 430, health: 200, maxHealth: 200, cooldown: 0 });

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

function testFullMapResourceDrain() {
    resetGameState();
    const p1 = createDummyPlayer(0, 100, 400);
    createDummyPlayer(1, 900, 400);

    // Create a scattered map of asteroids
    for (let i = 0; i < 10; i++) {
        asteroids.push({
            x: 200 + Math.random() * 600,
            y: 100 + Math.random() * 600,
            radius: 15, miners: 0,
            resources: 300, variant: 0
        });
    }

    p1.isCPU = true;
    p1.units.stations.push({ x: 150, y: 400, targetX: 150, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = () => asteroids.every(a => a.resources <= 0);

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) updateAI(p1, 1 / 60, 1000, 800);
    });

    recordResult("Full map resource drain time", "Economy", {
        timeSeconds: res.timeSeconds,
        asteroidsMined: true,
        p1Energy: p1.energy,
        p1MinersBuilt: p1.units.miners.length
    });
}

function testCPUvsCPU() {
    resetGameState();
    const p1 = createDummyPlayer(0, 100, 400);
    const p2 = createDummyPlayer(1, 900, 400);

    // Full standard symmetrical map setup
    asteroids.push({ x: 200, y: 300, radius: 15, miners: 0, resources: 400, variant: 0 });
    asteroids.push({ x: 200, y: 500, radius: 15, miners: 0, resources: 400, variant: 1 });
    asteroids.push({ x: 800, y: 300, radius: 15, miners: 0, resources: 400, variant: 2 });
    asteroids.push({ x: 800, y: 500, radius: 15, miners: 0, resources: 400, variant: 0 });

    asteroids.push({ x: 500, y: 400, radius: 15, miners: 0, resources: 800, variant: 1 }); // Center contested

    p1.isCPU = true;
    p2.isCPU = true;

    // Standard starting stations
    p1.units.stations.push({ x: 150, y: 400, targetX: 150, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 850, y: 400, targetX: 850, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

    // End when someone's home planet is destroyed or total unit wipes
    const stopCondition = () => p1.homePlanet.health <= 0 || p2.homePlanet.health <= 0 ||
        (p1.units.stations.length + p1.units.fighters.length + p1.units.miners.length === 0 && p1.energy < 25) ||
        (p2.units.stations.length + p2.units.fighters.length + p2.units.miners.length === 0 && p2.energy < 25);

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) updateAI(p1, 1 / 60, 1000, 800);
        if (p2.isCPU) updateAI(p2, 1 / 60, 1000, 800);
    });

    recordResult("Standard game (CPU vs CPU)", "Full Game", {
        timeSeconds: res.timeSeconds,
        winner: p1.homePlanet.health > 0 && p2.homePlanet.health <= 0 ? "Player 1" : "Player 2",
        p1RemainingPlanetHP: p1.homePlanet.health,
        p2RemainingPlanetHP: p2.homePlanet.health,
        p1TotalUnitsLeft: p1.units.stations.length + p1.units.fighters.length + p1.units.miners.length,
        p2TotalUnitsLeft: p2.units.stations.length + p2.units.fighters.length + p2.units.miners.length,
    });
}

function testCPUvsCPU_Expansioneer() {
    resetGameState();
    const p1 = createDummyPlayer(0, 100, 400); // Expansioneer
    const p2 = createDummyPlayer(1, 900, 400); // Legacy

    asteroids.push({ x: 200, y: 300, radius: 15, miners: 0, resources: 400, variant: 0 });
    asteroids.push({ x: 200, y: 500, radius: 15, miners: 0, resources: 400, variant: 1 });
    asteroids.push({ x: 800, y: 300, radius: 15, miners: 0, resources: 400, variant: 2 });
    asteroids.push({ x: 800, y: 500, radius: 15, miners: 0, resources: 400, variant: 0 });
    asteroids.push({ x: 500, y: 400, radius: 15, miners: 0, resources: 800, variant: 1 });

    p1.isCPU = true;
    p1.type = 'cpu_expansioneer';
    p2.isCPU = true;
    p2.type = 'cpu_legacy';

    p1.units.stations.push({ x: 150, y: 400, targetX: 150, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 850, y: 400, targetX: 850, targetY: 400, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = () => p1.homePlanet.health <= 0 || p2.homePlanet.health <= 0 ||
        (p1.units.stations.length + p1.units.fighters.length + p1.units.miners.length === 0 && p1.energy < 25) ||
        (p2.units.stations.length + p2.units.fighters.length + p2.units.miners.length === 0 && p2.energy < 25);

    const res = runSimulation(stopCondition, (ticks) => {
        if (p1.isCPU) updateAI(p1, 1 / 60, 1000, 800);
        if (p2.isCPU) updateAI(p2, 1 / 60, 1000, 800);
    });

    recordResult("Expansioneer vs Legacy (CPU vs CPU)", "Full Game", {
        timeSeconds: res.timeSeconds,
        winner: p1.homePlanet.health > 0 && p2.homePlanet.health <= 0 ? "Player 1 (Expansioneer)" : "Player 2 (Legacy)",
        p1RemainingPlanetHP: p1.homePlanet.health,
        p2RemainingPlanetHP: p2.homePlanet.health,
        p1TotalUnitsLeft: p1.units.stations.length + p1.units.fighters.length + p1.units.miners.length,
        p2TotalUnitsLeft: p2.units.stations.length + p2.units.fighters.length + p2.units.miners.length,
    });
}

// --- Bug Fix Scenarios ---

function testStationMovementWhenTerritoriesIntersect() {
    resetGameState();
    const p1 = createDummyPlayer(0, 100, 400);
    const p2 = createDummyPlayer(1, 900, 400);

    // Create an intersection between P1 and P2
    p1.units.stations.push({ x: 500, y: 350, targetX: 500, targetY: 350, health: 200, maxHealth: 200, cooldown: 0 });
    p1.units.stations.push({ x: 500, y: 450, targetX: 500, targetY: 450, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 450, y: 350, targetX: 450, targetY: 350, health: 200, maxHealth: 200, cooldown: 0 });
    p2.units.stations.push({ x: 450, y: 450, targetX: 450, targetY: 450, health: 200, maxHealth: 200, cooldown: 0 });

    // P1 has a FREE station far away, trying to move.
    p1.units.stations.push({ x: 200, y: 400, targetX: 200, targetY: 200, health: 200, maxHealth: 200, cooldown: 0 });

    const stopCondition = (ticks) => ticks >= 60; // Run for 1 second (60 frames)

    runSimulation(stopCondition);

    const testStation = p1.units.stations[2]; // The free station

    recordResult("Station movement when territories overlap", "Pathfinding", {
        timeSeconds: 1,
        stationMoved: testStation.y < 390, // It should have moved towards y:200
        finalY: testStation.y
    });
}

// Run existing tests
testStationMovementWhenTerritoriesIntersect();
testFighterVsStation();
testFighterVsTwoStations();
testTwoFightersVsStation();
testEconomyMiningSpeed();
testUncontestedMapTakeover();
testEconomyToMilitaryPipeline();
testThreeFightersVsCombo();
testFullMapResourceDrain();
testCPUvsCPU();
testCPUvsCPU_Expansioneer();

// --- Save Results ---

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = path.join(process.cwd(), 'tests', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, `test_results_${timestamp}.json`);

// Baseline definitions to include in metadata
const metadata = {
    units: {
        station: { health: 200, damage: 5, firerate_cd: 0.3 },
        fighter: { health: 150, damage: 10, firerate_cd: 0.5 },
        miner: { health: 20, payload_capacity: 25, mine_rate_per_sec: 10 }
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
console.log(`Saved test results to ${logFile}`);
