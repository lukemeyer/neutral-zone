import { players, asteroids } from './state.js';
import { isValidStationPlacement, isAsteroidInPolygon, getStationGraph, isPointInTerritory } from './utils.js';

console.log('ai_expansioneer.js loaded');

export function updateExpansioneerAI(p, dt, mapWidth, mapHeight) {
    p.aiTime = (p.aiTime || 0) + dt;

    const enemy = players.find(ep => ep.id !== p.id);
    const pDir = p.homePlanet.x < mapWidth / 2 ? 1 : -1;

    // --- Station Movement (Simulated Deliberate Drag) ---
    p.units.stations.forEach(s => {
        if (s.desiredTargetX !== undefined && s.desiredTargetY !== undefined) {
            let dx = s.desiredTargetX - s.targetX;
            let dy = s.desiredTargetY - s.targetY;
            let dist = Math.hypot(dx, dy);
            if (dist > 0.02) {
                let dragSpeed = 6.0 * dt;
                let moveDist = Math.min(dragSpeed, dist);
                let proposedX = s.targetX + (dx / dist) * moveDist;
                let proposedY = s.targetY + (dy / dist) * moveDist;

                if (isValidStationPlacement(proposedX, proposedY, s, p, players, mapWidth, mapHeight)) {
                    s.targetX = proposedX;
                    s.targetY = proposedY;
                } else {
                    s.desiredTargetX = s.targetX;
                    s.desiredTargetY = s.targetY;
                }
            } else {
                s.targetX = s.desiredTargetX;
                s.targetY = s.desiredTargetY;
            }
        }
    });

    // --- Territory & Station Target Generation ---
    const activeCaptured = asteroids.filter(a => a.resources > 0 && isAsteroidInPolygon(a, p));
    const uncaptured = asteroids.filter(a => a.resources > 0 && !isAsteroidInPolygon(a, p) && (!enemy || !isAsteroidInPolygon(a, enemy)));

    const numStations = p.units.stations.length;

    // Generate stable, graph-verified network targets for all stations
    function computeStationTargets(totalCount) {
        if (totalCount <= 0) return [];

        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        const hx = p.homePlanet.x;
        const hy = p.homePlanet.y;

        if (!p._aiStationTargets) {
            p._aiStationTargets = [
                { x: clamp(hx + 2.2 * pDir, 1.5, mapWidth - 1.5), y: hy },
                { x: clamp(hx + 1.2 * pDir, 1.5, mapWidth - 1.5), y: clamp(hy - 2.0, 1.5, mapHeight - 1.5) },
                { x: clamp(hx + 1.2 * pDir, 1.5, mapWidth - 1.5), y: clamp(hy + 2.0, 1.5, mapHeight - 1.5) }
            ];
        }

        const myAsteroids = asteroids
            .filter(a => a.resources > 0 && (pDir > 0 ? a.x <= mapWidth / 2 + 1.5 : a.x >= mapWidth / 2 - 1.5))
            .sort((a, b) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy));

        function isConnected(tList) {
            const origStations = p.units.stations;
            p.units.stations = tList.map(t => ({ x: t.x, y: t.y, targetX: t.x, targetY: t.y }));
            const g = getStationGraph(p, false);
            p.units.stations = origStations;
            return g.components.length === 1 && g.connectedNodes.length === (tList.length + 1);
        }

        while (p._aiStationTargets.length < totalCount) {
            const targets = p._aiStationTargets;
            const origStations = p.units.stations;
            p.units.stations = targets.map(t => ({ x: t.x, y: t.y, targetX: t.x, targetY: t.y }));
            const uncapturedOnMySide = myAsteroids.filter(a => !isAsteroidInPolygon(a, p));
            p.units.stations = origStations;

            const targetAst = uncapturedOnMySide[0] || { x: mapWidth / 2, y: hy };

            let bestCand = null;
            let bestScore = -Infinity;

            for (let existing of targets) {
                for (let angleDeg = 0; angleDeg < 360; angleDeg += 30) {
                    let rad = (angleDeg * Math.PI) / 180;
                    for (let dist of [2.4, 3.2]) {
                        let cx = clamp(existing.x + Math.cos(rad) * dist, 1.5, mapWidth - 1.5);
                        let cy = clamp(existing.y + Math.sin(rad) * dist, 1.5, mapHeight - 1.5);

                        if (targets.some(t => Math.hypot(t.x - cx, t.y - cy) < 1.7)) continue;
                        if (enemy && isPointInTerritory({ x: cx, y: cy }, enemy)) continue;

                        const testList = [...targets, { x: cx, y: cy }];
                        if (!isConnected(testList)) continue;

                        p.units.stations = testList.map(t => ({ x: t.x, y: t.y, targetX: t.x, targetY: t.y }));
                        let capCount = myAsteroids.filter(a => isAsteroidInPolygon(a, p)).length;
                        p.units.stations = origStations;

                        let dAst = Math.hypot(cx - targetAst.x, cy - targetAst.y);
                        let fwd = (cx - hx) * pDir;

                        let score = capCount * 2000 - dAst * 15 + fwd * 2;
                        if (score > bestScore) {
                            bestScore = score;
                            bestCand = { x: cx, y: cy };
                        }
                    }
                }
            }

            if (bestCand) {
                p._aiStationTargets.push(bestCand);
            } else {
                const sorted = [...p._aiStationTargets].sort((a, b) => (pDir > 0 ? b.x - a.x : a.x - b.x));
                let cx = clamp(sorted[0].x + 2.0 * pDir, 1.5, mapWidth - 1.5);
                let cy = clamp(sorted[0].y + (p._aiStationTargets.length % 2 === 0 ? 1.5 : -1.5), 1.5, mapHeight - 1.5);
                p._aiStationTargets.push({ x: cx, y: cy });
            }
        }

        return p._aiStationTargets.slice(0, totalCount);
    }

    const networkTargets = computeStationTargets(numStations);

    // Stable 1-to-1 assignment: each station keeps its designated node to avoid criss-crossing
    p.units.stations.forEach((s, idx) => {
        if (idx < networkTargets.length) {
            const target = networkTargets[idx];
            let currentTargetX = s.desiredTargetX !== undefined ? s.desiredTargetX : s.targetX;
            let currentTargetY = s.desiredTargetY !== undefined ? s.desiredTargetY : s.targetY;
            if (Math.hypot(currentTargetX - target.x, currentTargetY - target.y) > 0.3) {
                let hasArrived = Math.hypot(s.x - s.targetX, s.y - s.targetY) < 0.1;
                if (hasArrived || !s.aiLastMoveTime || (p.aiTime - s.aiLastMoveTime) > 3.0) {
                    s.desiredTargetX = target.x;
                    s.desiredTargetY = target.y;
                    s.aiLastMoveTime = p.aiTime;
                }
            }
        }
    });

    let buildActionTaken = false;

    // --- Strategic Production Management ---
    const queuedFighters = p.buildQueue.filter(b => b.type === 'fighters').length;
    const totalFighters = p.units.fighters.length + queuedFighters;
    const enemyFighters = enemy ? (enemy.units.fighters.length + enemy.buildQueue.filter(b => b.type === 'fighters').length) : 0;
    let desiredFighters = enemyFighters > 0 ? Math.max(2, enemyFighters + 1) : 1;

    // Scale fleet as economy matures
    if (enemyFighters > 0 && p.units.stations.length >= 3 && p.units.miners.length >= 2) {
        desiredFighters = Math.max(desiredFighters, 3);
    }
    if (activeCaptured.length >= 2 && enemyFighters > 0) {
        desiredFighters = Math.max(desiredFighters, 4);
    }
    if (activeCaptured.length >= 3 || p.energy >= 140) {
        desiredFighters = Math.max(desiredFighters, 5);
    }
    if (p.energy >= 190) {
        desiredFighters = Math.max(desiredFighters, 8);
    }

    // Never buy a fighter before having at least 1 station and at least 1 miner
    if (p.units.stations.length === 0 || p.units.miners.length === 0) {
        desiredFighters = 0;
    }

    // Build Miners (Capacity: 3 miners per active captured asteroid, min 2, up to 10-12 if economy supports)
    let desiredMiners = Math.min(12, Math.max(2, activeCaptured.length * 3));
    if (p.energy > 100 && activeCaptured.length > 0) {
        desiredMiners = Math.min(12, Math.max(desiredMiners, 10));
    }
    if (activeCaptured.length === 0 && uncaptured.length > 0) {
        desiredMiners = 2; // Be ready for when first asteroid is enveloped
    }

    // Build Stations (Limits)
    let maxStations = Math.max(3, activeCaptured.length * 2 + 1);
    if (uncaptured.length > 0) {
        maxStations = Math.max(maxStations, 14);
    }
    if (p.energy > 120) {
        maxStations = Math.max(maxStations, 16);
    }

    // Float Dump: If we have excess floating energy (>= 140) and an empty queue,
    // keep producing! An RTS player never floats idle cash.
    if (p.energy >= 140 && p.buildQueue.length === 0) {
        if (p.units.miners.length < 12 && activeCaptured.length > 0) {
            desiredMiners = Math.max(desiredMiners, p.units.miners.length + 1);
        }
        if (p.units.fighters.length < 15) {
            desiredFighters = Math.max(desiredFighters, p.units.fighters.length + 1);
        }
        if (p.units.stations.length < 20) {
            maxStations = Math.max(maxStations, p.units.stations.length + 1);
        }
    }

    const economyCritical = p.units.miners.length < desiredMiners;
    const needsFighters = totalFighters < desiredFighters;
    const energyReservedForFighters = (needsFighters && !economyCritical && activeCaptured.length > 0) ? 100 : 0;

    // 1. Build Miners (Top Priority if starved)
    if (economyCritical && p.energy >= 25 && p.buildCooldowns.miner <= 0 && !buildActionTaken) {
        p.energy -= 25;
        p.buildCooldowns.miner = 5;
        p.buildQueue.push({
            type: 'miners',
            unitData: {
                x: p.homePlanet.x,
                y: p.homePlanet.y,
                targetAsteroid: null,
                payload: 0,
                returning: false,
                health: 60,
                maxHealth: 60,
                damageTime: 0
            }
        });
        buildActionTaken = true;
    }

    // 2. Build Fighters (Priority 2: Allow queuing up to 2 fighters)
    const canQueueFighter = queuedFighters < 2;
    if (needsFighters && p.energy >= 100 && canQueueFighter && !buildActionTaken) {
        p.energy -= 100;
        if (p.buildCooldowns.fighter <= 0) {
            p.buildCooldowns.fighter = 15;
        }
        p.buildQueue.push({
            type: 'fighters',
            unitData: {
                x: p.homePlanet.x,
                y: p.homePlanet.y,
                path: [{ x: p.homePlanet.x + 1.5 * pDir, y: p.homePlanet.y }],
                pathIndex: 0,
                pathDir: 1,
                isLoop: false,
                health: 150,
                maxHealth: 150,
                cooldown: 0,
                damageTime: 0
            }
        });
        buildActionTaken = true;
    }

    // 3. Build Stations (Priority 3: Expands territory to envelop asteroids & dominate map)
    if (p.units.stations.length < maxStations && p.energy >= (50 + energyReservedForFighters) && p.buildCooldowns.station <= 0 && !buildActionTaken) {
        p.energy -= 50;
        p.buildCooldowns.station = 10;
        let nextTarget = computeStationTargets(p.units.stations.length + 1)[p.units.stations.length] || { x: p.homePlanet.x + 2.0 * pDir, y: p.homePlanet.y };
        p.buildQueue.push({
            type: 'stations',
            unitData: {
                x: p.homePlanet.x,
                y: p.homePlanet.y,
                targetX: p.homePlanet.x,
                targetY: p.homePlanet.y,
                desiredTargetX: nextTarget.x,
                desiredTargetY: nextTarget.y,
                health: 200,
                maxHealth: 200,
                cooldown: 0,
                damageTime: 0
            }
        });
        buildActionTaken = true;
    }

    // --- Tactical Fighter Management ---
    let nearestThreat = null;
    let minThreatDist = Infinity;
    const squadSize = p.units.fighters.length;

    if (enemy) {
        enemy.units.fighters.forEach(ef => {
            let dPlanet = Math.hypot(ef.x - p.homePlanet.x, ef.y - p.homePlanet.y);
            let dMiners = p.units.miners.map(m => Math.hypot(ef.x - m.x, ef.y - m.y));
            let closestMinerDist = Math.min(...(dMiners.length > 0 ? dMiners : [Infinity]));

            // If we have a squad (>= 2), we can defend any threat within 6.0 units of any friendly entity.
            // If lone fighter (squadSize < 2), only scramble if enemy directly threatens miners or planet!
            let isUrgentThreat = closestMinerDist < 3.5 || dPlanet < 3.5;
            if (squadSize >= 2) {
                let dStations = p.units.stations.map(s => Math.hypot(ef.x - s.x, ef.y - s.y));
                let closestFriendly = Math.min(dPlanet, closestMinerDist, ...(dStations.length > 0 ? dStations : [Infinity]));
                if (closestFriendly < 6.0 && closestFriendly < minThreatDist) {
                    minThreatDist = closestFriendly;
                    nearestThreat = ef;
                }
            } else if (isUrgentThreat) {
                let dist = Math.min(dPlanet, closestMinerDist);
                if (dist < minThreatDist) {
                    minThreatDist = dist;
                    nearestThreat = ef;
                }
            }
        });
    }

    // Launch coordinated offensive push:
    // 1) Fleet assembly: Wait for queued fighters to finish rolling out unless already at critical mass (>= 3)
    // 2) Must have at least 2 fighters and superiority (or >= 3)
    // 3) Or enemy has 0 fighters and 0 stations (uncontested)
    // 4) Or all resources depleted and cannot afford more fighters (last stand)
    const remainingResources = asteroids.reduce((acc, a) => acc + (a.resources || 0), 0);
    const cannotAffordFighter = p.energy < 100 && (remainingResources === 0 || p.units.miners.length === 0);
    const enemyFleetSize = enemy ? enemy.units.fighters.length : 0;
    const isAssembling = queuedFighters > 0 && squadSize < 3;
    const minFleetSize = Math.min(desiredFighters, 3);
    const hasSuperiority = squadSize >= 3 || enemyFleetSize === 0 || squadSize > enemyFleetSize;

    const shouldOffend = p.aiTime > 60 && !isAssembling && (
        (squadSize >= minFleetSize && hasSuperiority) ||
        (squadSize >= 1 && enemyFleetSize === 0 && (!enemy || enemy.units.stations.length === 0)) ||
        (cannotAffordFighter && squadSize >= 1)
    );

    // Shared offensive target for the whole squad (focus fire)
    let sharedAttackTarget = null;
    if (shouldOffend && enemy) {
        if (enemy.units.fighters.length > 0) {
            // Priority 1: Defeat enemy fighters, prioritize closest
            sharedAttackTarget = enemy.units.fighters.reduce((closest, ef) => {
                let d = Math.hypot(ef.x - p.homePlanet.x, ef.y - p.homePlanet.y);
                let cd = Math.hypot(closest.x - p.homePlanet.x, closest.y - p.homePlanet.y);
                return d < cd ? ef : closest;
            }, enemy.units.fighters[0]);
        } else {
            // Priority 2: Clear frontline enemy assets in proximity order (peel enemy fortress)
            const candidateTargets = [
                ...enemy.units.miners,
                ...(squadSize >= 2 ? enemy.units.stations : enemy.units.stations.filter(s => s.health <= 80)),
                enemy.homePlanet
            ];
            sharedAttackTarget = candidateTargets.reduce((closest, t) => {
                let d = Math.hypot(t.x - p.homePlanet.x, t.y - p.homePlanet.y);
                let cd = Math.hypot(closest.x - p.homePlanet.x, closest.y - p.homePlanet.y);
                return d < cd ? t : closest;
            }, enemy.homePlanet);
        }
    }

    p.units.fighters.forEach((f, i) => {
        let isArrival = f.path && f.path.length === 1 && Math.hypot(f.x - f.path[0].x, f.y - f.path[0].y) < 0.4;
        let isIdle = !f.path || f.path.length === 0 || (f.pathIndex >= f.path.length && !f.isLoop) || isArrival;

        // Priority 1: Defend against active intruder
        if (nearestThreat) {
            if (f.pursuitTarget !== nearestThreat || isIdle || !f.isDefending) {
                f.path = [{ x: nearestThreat.x, y: nearestThreat.y }];
                f.pathIndex = 0;
                f.pathDir = 1;
                f.isLoop = false;
                f.pursuitTarget = nearestThreat;
                f.attackTargetRef = nearestThreat;
                f.isDefending = true;
                f.isAggressiveTarget = false;
            }
            return;
        }

        // Priority 2: Coordinated offensive push (Squad focus fire)
        if (shouldOffend && sharedAttackTarget) {
            if (f.attackTargetRef !== sharedAttackTarget || isIdle || !f.isAggressiveTarget) {
                f.path = [{ x: sharedAttackTarget.x, y: sharedAttackTarget.y }];
                f.pathIndex = 0;
                f.pathDir = 1;
                f.isLoop = false;
                f.attackTargetRef = sharedAttackTarget;
                f.isAggressiveTarget = true;
                f.isDefending = false;
                f.pursuitTarget = (sharedAttackTarget.maxHealth !== undefined && sharedAttackTarget.maxHealth !== 200) ? sharedAttackTarget : null;
            }
            return;
        }

        // Priority 3: Safe Interior Staging
        // Lone fighters or pre-offensive fleet wait safely behind friendly lines
        if (isIdle || f.isAggressiveTarget) {
            let stageX = p.homePlanet.x + 1.6 * pDir;
            let stageY = p.homePlanet.y + (i - (Math.max(1, squadSize) - 1) / 2) * 1.2;
            f.path = [{ x: stageX, y: stageY }];
            f.pathIndex = 0;
            f.pathDir = 1;
            f.isLoop = false;
            f.attackTargetRef = null;
            f.pursuitTarget = null;
            f.isAggressiveTarget = false;
            f.isDefending = false;
        }
    });
}
