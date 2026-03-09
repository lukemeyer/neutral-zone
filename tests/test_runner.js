import { players, asteroids, projectiles, state } from '../js/state.js';
import { updateUnits, updateProjectiles } from '../js/units.js';
import { getPlayerTerritoryHulls } from '../js/utils.js';
// Configuration
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 800;
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
        p.stationSettleTimer = 0;
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
            if (p.buildCooldowns.station > 0) {
                p.buildCooldowns.station -= TICK_RATE;
                if (p.buildCooldowns.station <= 0) {
                    let qi = p.buildQueue.findIndex(b => b.type === 'stations');
                    if (qi !== -1) { p.units.stations.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
                }
            }
            if (p.buildCooldowns.fighter > 0) {
                p.buildCooldowns.fighter -= TICK_RATE;
                if (p.buildCooldowns.fighter <= 0) {
                    let qi = p.buildQueue.findIndex(b => b.type === 'fighters');
                    if (qi !== -1) { p.units.fighters.push(p.buildQueue[qi].unitData); p.buildQueue.splice(qi, 1); }
                }
            }
            // No selected fighters or drawing paths during headless mode
            const hulls = getPlayerTerritoryHulls(p, [], false);
            if (p.id === 0 && ticks % 60 === 0 && ticks < 1000) {
                console.log(`[DEBUG] p1 ticks=${ticks} hulls=${hulls.length} | currentGraph=${p.units.stations.length} | firstHullSize=${hulls.length > 0 ? hulls[0].length : 0}`);
            }
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
