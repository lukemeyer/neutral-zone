import { players, asteroids, projectiles, state } from '../js/state.js';
import { updateUnits, updateProjectiles } from '../js/units.js';
import { getConvexHull } from '../js/utils.js';

// Configuration
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 800;
const TICK_RATE = 1 / 60; // 60 FPS representation in `dt`
const MAX_TICKS = 60 * 60 * 10; // Allow tests to run for max 10 minutes (600 seconds) game-time before forcibly killing them

export function resetGameState() {
    players.forEach(p => {
        p.energy = 100;
        p.homePlanet.health = p.homePlanet.maxHealth;
        p.units.scouts = [];
        p.units.fighters = [];
        p.units.miners = [];
        p.buildCooldowns = { miner: 0, scout: 0, fighter: 0 };
        p.buildQueue = [];
        p.aiTimer = 0;
        p.scoutSettleTimer = 0;
    });
    asteroids.length = 0;
    projectiles.length = 0;
    state.gameStarted = true;
    state.gameOver = false;
}

export function createDummyPlayer(id, x, y) {
    const p = players.find(pl => pl.id === id);
    p.homePlanet.x = x;
    p.homePlanet.y = y;
    return p;
}

export function runSimulation(conditionToStop, onTick = () => { }) {
    let ticks = 0;

    while (!conditionToStop(ticks) && ticks < MAX_TICKS) {
        players.forEach(p => {
            if (p.buildCooldowns.miner > 0) {
                p.buildCooldowns.miner -= TICK_RATE;
                if (p.buildCooldowns.miner <= 0) {
                    let qi = p.buildQueue.findIndex(b => b.type === 'miners');
                    if (qi !== -1) { p.units.miners.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
                }
            }
            if (p.buildCooldowns.scout > 0) {
                p.buildCooldowns.scout -= TICK_RATE;
                if (p.buildCooldowns.scout <= 0) {
                    let qi = p.buildQueue.findIndex(b => b.type === 'scouts');
                    if (qi !== -1) { p.units.scouts.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
                }
            }
            if (p.buildCooldowns.fighter > 0) {
                p.buildCooldowns.fighter -= TICK_RATE;
                if (p.buildCooldowns.fighter <= 0) {
                    let qi = p.buildQueue.findIndex(b => b.type === 'fighters');
                    if (qi !== -1) { p.units.fighters.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
                }
            }

            const currentPoints = [p.homePlanet, ...p.units.scouts.map(s => ({ x: s.x, y: s.y }))];
            const currentHull = getConvexHull(currentPoints);
            // No selected fighters or drawing paths during headless mode
            updateUnits(p, TICK_RATE, currentHull, [], false);
        });

        updateProjectiles(TICK_RATE);

        // Cleanup Dead Entities (mirrors main.js)
        players.forEach(p => {
            p.units.scouts = p.units.scouts.filter(u => u.health > 0);
            p.units.fighters = p.units.fighters.filter(u => u.health > 0);
            p.units.miners = p.units.miners.filter(u => {
                if (u.health <= 0 && u.targetAsteroid) {
                    u.targetAsteroid.miners = Math.max(0, u.targetAsteroid.miners - 1);
                }
                return u.health > 0;
            });
            if (p.homePlanet.health <= 0) p.homePlanet.health = 0;
        });

        onTick(ticks);
        ticks++;
    }

    const timeSeconds = ticks * TICK_RATE;
    return { ticks, timeSeconds, timeout: ticks >= MAX_TICKS };
}
