import { queueBuild, COMMANDER_COSTS } from './commander_units.js';
import { getTerritoryPolygon, isPointInFan } from './commander_math.js';

export function updateCommanderAI(state, dt) {
    const { players, asteroids } = state;
    const ai = players[1]; // P2 Red is CPU Commander
    if (!ai || !ai.isCPU) return;

    ai.aiTimer = (ai.aiTimer || 0) + dt;
    if (ai.aiTimer < 1.0) return; // Evaluate every 1.0s
    ai.aiTimer = 0;

    const player = players[0];
    const aiPoly = getTerritoryPolygon(ai.homePlanet, ai.stations, true);

    // 1. Economic Decision Making
    const capturedAsteroids = asteroids.filter(a => a.resources > 0 && isPointInFan(a, aiPoly));
    const totalMiners = ai.units.miners.length + ai.buildQueue.filter(b => b.type === 'miner').length;
    const neededMiners = capturedAsteroids.length * 2;

    if (totalMiners < neededMiners && ai.energy >= COMMANDER_COSTS.miner) {
        queueBuild(ai, 'miner', player);
    } else if (ai.stationCount < 12 && ai.energy >= COMMANDER_COSTS.station) {
        queueBuild(ai, 'station', player);
    } else if (ai.units.fighters.length < 8 && ai.energy >= COMMANDER_COSTS.fighter) {
        queueBuild(ai, 'fighter', player);
    }

    // 2. High-Level Stance Evaluation
    const enemyIntruders = player.units.fighters.filter(f => isPointInFan(f, aiPoly));
    const aiFighterCount = ai.units.fighters.length;
    const playerFighterCount = player.units.fighters.length;

    if (enemyIntruders.length > 0) {
        // High alert: defend territory
        ai.stance = 'defend';
    } else if (aiFighterCount >= 4 && (aiFighterCount > playerFighterCount + 1 || ai.stationCount >= 6)) {
        // Offensive advantage: launch assault push
        ai.stance = 'attack';
    } else {
        // Standard frontier security
        ai.stance = 'patrol';
    }
}
