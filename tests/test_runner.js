import { players, asteroids, projectiles, state, GRID_W, GRID_H } from '../js/state.js';
import { updateUnits, updateProjectiles } from '../js/units.js';
import { getPlayerTerritoryHulls } from '../js/utils.js';
// Configuration
export const MAP_WIDTH = GRID_W;
export const MAP_HEIGHT = GRID_H;
const TICK_RATE = 1 / 60; // 60 FPS representation in `dt`
const MAX_TICKS = 60 * 60 * 10; // Allow tests to run for max 10 minutes (600 seconds) game-time before forcibly killing them

export function resetGameState() {
    players.forEach(p => {
        p.energy = 150;
        p.homePlanet.health = p.homePlanet.maxHealth;
        p.units.stations = [];
        p.units.fighters = [];
        p.units.miners = [];
        p.buildCooldowns = { miner: 0, station: 0, fighter: 0 };
        p.buildQueue = [];
        p.aiTimer = 0;
        p.aiTime = 0;
        p.stationSettleTimer = 0;
        delete p._aiStationTargets;
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
            const buildTypes = [
                { key: 'miner', type: 'miners', time: 5 },
                { key: 'station', type: 'stations', time: 10 },
                { key: 'fighter', type: 'fighters', time: 15 }
            ];
            buildTypes.forEach(bt => {
                if (p.buildCooldowns[bt.key] > 0) {
                    p.buildCooldowns[bt.key] -= TICK_RATE;
                    if (p.buildCooldowns[bt.key] <= 0) {
                        p.buildCooldowns[bt.key] = 0;
                        let qi = p.buildQueue.findIndex(b => b.type === bt.type);
                        if (qi !== -1) {
                            p.units[bt.type].push(p.buildQueue[qi].unitData);
                            p.buildQueue.splice(qi, 1);
                        }
                        if (p.buildQueue.some(b => b.type === bt.type)) {
                            p.buildCooldowns[bt.key] = bt.time;
                        }
                    }
                } else if (p.buildQueue.some(b => b.type === bt.type)) {
                    p.buildCooldowns[bt.key] = bt.time;
                }
            });
            // No selected fighters or drawing paths during headless mode
            const hulls = getPlayerTerritoryHulls(p, [], false);
            updateUnits(p, TICK_RATE, null, [], false);

            if (p.homePlanet.damageTime === undefined) p.homePlanet.damageTime = 0;
            p.homePlanet.damageTime = Math.max(0, p.homePlanet.damageTime - TICK_RATE);

            ['stations', 'fighters', 'miners'].forEach(type => {
                p.units[type].forEach(u => {
                    if (u.damageTime === undefined) u.damageTime = 0;
                    u.damageTime = Math.max(0, u.damageTime - TICK_RATE);
                });
            });
        });

        updateProjectiles(TICK_RATE);

        // Cleanup Dead Entities (mirrors main.js)
        players.forEach(p => {
            p.units.stations = p.units.stations.filter(u => u.health > 0);
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
