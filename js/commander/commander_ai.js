import { queueBuild, COMMANDER_COSTS } from './commander_units.js';
import { getTerritoryPolygon, isPointInFan, angleRadToDegree, degreeToAngleRad } from './commander_math.js';

export function updateCommanderAI(state, dt) {
    const { players, asteroids } = state;
    const ai = players[1]; // P2 Red is CPU Commander
    if (!ai || !ai.isCPU) return;

    ai.aiTimer = (ai.aiTimer || 0) + dt;
    if (ai.aiTimer < 1.0) return; // Evaluate every 1.0s
    ai.aiTimer = 0;

    const player = players[0];
    const aiPoly = getTerritoryPolygon(ai.homePlanet, ai.borderDistances || ai.stations, true);

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

    // 3. Intelligent Frontier Steering & Sector Expansion
    const uncaptured = asteroids.filter(a => a.resources > 0 && !isPointInFan(a, aiPoly));
    const borderDistances = ai.borderDistances;

    let targetDegree = null;
    if (uncaptured.length > 0) {
        const sorted = [...uncaptured].map(a => {
            const d = Math.hypot(a.x - ai.homePlanet.x, a.y - ai.homePlanet.y);
            const ang = Math.atan2(a.y - ai.homePlanet.y, a.x - ai.homePlanet.x);
            const deg = Math.max(0, Math.min(90, angleRadToDegree(1, ang)));
            const currentR = borderDistances ? borderDistances[deg] : 3.8;
            return { asteroid: a, dist: d, deg, currentR };
        }).sort((a, b) => a.dist - b.dist);

        // Filter for asteroids that aren't already excessively pushed toward or crowded with stations
        const viable = sorted.filter(cand => {
            if (cand.currentR > cand.dist + 1.0) return false;
            const nearbyStations = ai.stations ? ai.stations.filter(s => Math.abs(s.degree - cand.deg) < 9) : [];
            return nearbyStations.length < 2;
        });

        if (viable.length > 0) {
            targetDegree = viable[0].deg;
        }
    }

    // Fallback: balance underdeveloped frontier sectors to maintain a coherent organic front
    if (targetDegree === null && borderDistances) {
        let minR = Infinity;
        let bestDeg = 45;
        const sampleDegrees = [15, 30, 45, 60, 75];
        for (let d of sampleDegrees) {
            const r = borderDistances[d];
            if (r < minR) {
                minR = r;
                bestDeg = d;
            }
        }
        targetDegree = bestDeg;
    }

    if (targetDegree !== null) {
        ai.aimDegree = Math.max(0, Math.min(90, targetDegree));
        ai.launchAngle = degreeToAngleRad(1, ai.aimDegree);
    }
}
