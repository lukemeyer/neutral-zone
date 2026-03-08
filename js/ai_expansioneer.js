import { players, asteroids } from './state.js';
import { isValidStationPlacement, isAsteroidInPolygon, getStationGraph } from './utils.js';

console.log('ai_expansioneer.js loaded');

export function updateExpansioneerAI(p, dt, mapWidth, mapHeight) {
    p.aiTime = (p.aiTime || 0) + dt;

    function assignTarget(s, tx, ty) {
        let currentTargetX = s.desiredTargetX !== undefined ? s.desiredTargetX : s.targetX;
        let currentTargetY = s.desiredTargetY !== undefined ? s.desiredTargetY : s.targetY;
        if (Math.hypot(currentTargetX - tx, currentTargetY - ty) > 0.1) {
            if (!s.aiLastMoveTime || (p.aiTime - s.aiLastMoveTime) > 10) {
                s.desiredTargetX = tx;
                s.desiredTargetY = ty;
                s.aiLastMoveTime = p.aiTime;
            }
        }
    }

    // Simulate drag speed for smooth, deliberate station movement
    p.units.stations.forEach(s => {
        if (s.desiredTargetX !== undefined && s.desiredTargetY !== undefined) {
            let dx = s.desiredTargetX - s.targetX;
            let dy = s.desiredTargetY - s.targetY;
            let dist = Math.hypot(dx, dy);
            if (dist > 0.02) {
                let dragSpeed = 5.0 * dt; // Deliberate speed
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

    let enemy = players.find(ep => ep.id !== p.id);
    let graph = getStationGraph(p, false);
    let connectedAnchors = graph.connectedNodes;
    if (!connectedAnchors || connectedAnchors.length === 0) connectedAnchors = [p.homePlanet];

    let activeCaptured = asteroids.filter(a => a.resources > 0 && isAsteroidInPolygon(a, p));
    let uncaptured = asteroids.filter(a => a.resources > 0 && !isAsteroidInPolygon(a, p) && !isAsteroidInPolygon(a, enemy));

    // 1 & 2: Maintain territory and expand only if < 3 asteroids are being mined
    let needsExpansion = activeCaptured.length < 3 && uncaptured.length > 0;

    // Select targets based on closest uncaptured asteroid to the HOME PLANET, keeping focus centralized
    let targetAsteroids = [];
    if (needsExpansion) {
        uncaptured.sort((a, b) => Math.hypot(a.x - p.homePlanet.x, a.y - p.homePlanet.y) - Math.hypot(b.x - p.homePlanet.x, b.y - p.homePlanet.y));
        targetAsteroids = uncaptured.slice(0, 1); // Strictly single-minded
    }

    // --- Hexagonal "Creeping Sludge" Territory Generator ---
    const SPACING = 3.8;

    function hexToPixel(q, r) {
        let x = SPACING * (3 / 2) * q;
        let y = SPACING * Math.sqrt(3) * (r + q / 2);
        return { x: x + p.homePlanet.x, y: y + p.homePlanet.y };
    }

    let N = p.units.stations.length;
    let selectedNodes = [];
    let selectedSet = new Set();
    function getDist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }
    let homeId = "0,0";
    let candidates = new Map();

    const hexDirs = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];

    function addNeighbors(q, r) {
        for (let dir of hexDirs) {
            let nq = q + dir.q;
            let nr = r + dir.r;
            let nid = nq + "," + nr;
            if (nid !== homeId && !selectedSet.has(nid) && !candidates.has(nid)) {
                candidates.set(nid, { q: nq, r: nr, ...hexToPixel(nq, nr) });
            }
        }
    }

    addNeighbors(0, 0);

    for (let i = 0; i < N; i++) {
        if (candidates.size === 0) break;
        let bestCandidateId = null;
        let bestScore = -Infinity;

        for (let [cid, cand] of candidates.entries()) {
            if (cand.x < 0 || cand.x > mapWidth || cand.y < 0 || cand.y > mapHeight) continue;

            let minDistToTarget = Infinity;
            if (targetAsteroids.length > 0) {
                for (let ast of targetAsteroids) {
                    let d = getDist(cand, ast);
                    if (d < minDistToTarget) minDistToTarget = d;
                }
            } else {
                minDistToTarget = -getDist(cand, p.homePlanet); // Pull inward if no targets
            }

            let neighbors = 0;
            for (let dir of hexDirs) {
                let nid = (cand.q + dir.q) + "," + (cand.r + dir.r);
                if (selectedSet.has(nid) || nid === homeId) neighbors++;
            }

            // Expansioneer strongly rewards mesh stability over reaching targets
            // 8 units of distance is worth 1 neighbor. Ensures expansion is thick but continues moving.
            let score = (neighbors * 8.0) - minDistToTarget;

            if (score > bestScore) {
                bestScore = score;
                bestCandidateId = cid;
            }
        }

        if (bestCandidateId) {
            let chosen = candidates.get(bestCandidateId);
            selectedNodes.push(chosen);
            selectedSet.add(bestCandidateId);
            candidates.delete(bestCandidateId);
            addNeighbors(chosen.q, chosen.r);
        } else break;
    }

    let sortedNodes = selectedNodes.slice().sort((a, b) => getDist(a, p.homePlanet) - getDist(b, p.homePlanet));
    p.units.stations.forEach(s => { if (s.createdAt === undefined) s.createdAt = p.aiTime; });
    let sortedStations = p.units.stations.slice().sort((a, b) => a.createdAt - b.createdAt);

    for (let i = 0; i < sortedStations.length; i++) {
        let s = sortedStations[i];
        let tx = p.homePlanet.x;
        let ty = p.homePlanet.y;

        if (i < sortedNodes.length) {
            tx = sortedNodes[i].x;
            ty = sortedNodes[i].y;
        }

        // Ensure strictly connected to 2 valid anchors
        let maxDist = 4.4;
        let bestPair = null;
        let bestPairDist = Infinity;

        if (connectedAnchors.length >= 2) {
            for (let j = 0; j < connectedAnchors.length; j++) {
                for (let k = j + 1; k < connectedAnchors.length; k++) {
                    let a1 = connectedAnchors[j];
                    let a2 = connectedAnchors[k];
                    if (a1 === s || a2 === s) continue;
                    let ax1 = a1.targetX !== undefined ? a1.targetX : a1.x; let ay1 = a1.targetY !== undefined ? a1.targetY : a1.y;
                    let ax2 = a2.targetX !== undefined ? a2.targetX : a2.x; let ay2 = a2.targetY !== undefined ? a2.targetY : a2.y;
                    if (getDist({ x: ax1, y: ay1 }, { x: ax2, y: ay2 }) <= maxDist * 2) {
                        let mx = (ax1 + ax2) / 2;
                        let my = (ay1 + ay2) / 2;
                        let pairDist = getDist({ x: tx, y: ty }, { x: mx, y: my });
                        if (pairDist < bestPairDist) {
                            bestPairDist = pairDist;
                            bestPair = { A: { ax: ax1, ay: ay1 }, B: { ax: ax2, ay: ay2 } };
                        }
                    }
                }
            }
        }

        let A = null, B = null;
        if (bestPair) {
            A = bestPair.A;
            B = bestPair.B;
        } else {
            // fallback if < 2 anchors
            let closestAnchor = null;
            let minDistToAnchor = Infinity;
            for (let anchor of connectedAnchors) {
                if (anchor === s) continue;
                let ax = anchor.targetX !== undefined ? anchor.targetX : anchor.x;
                let ay = anchor.targetY !== undefined ? anchor.targetY : anchor.y;
                let d = getDist({ x: tx, y: ty }, { x: ax, y: ay });
                if (d < minDistToAnchor) {
                    minDistToAnchor = d;
                    closestAnchor = { ax, ay };
                }
            }
            A = closestAnchor;
        }

        if (A && B) {
            let mx = (A.ax + B.ax) / 2;
            let my = (A.ay + B.ay) / 2;
            let dirX = tx - mx;
            let dirY = ty - my;
            let len = Math.hypot(dirX, dirY) || 1;
            dirX /= len;
            dirY /= len;

            let validLen = 0;
            for (let testLen = 0; testLen <= len; testLen += 0.2) {
                let testX = mx + dirX * testLen;
                let testY = my + dirY * testLen;
                if (getDist({ x: testX, y: testY }, { x: A.ax, y: A.ay }) <= maxDist &&
                    getDist({ x: testX, y: testY }, { x: B.ax, y: B.ay }) <= maxDist) {
                    validLen = testLen;
                } else {
                    break;
                }
            }
            tx = mx + dirX * validLen;
            ty = my + dirY * validLen;
        } else if (A) {
            let d = getDist({ x: tx, y: ty }, { x: A.ax, y: A.ay });
            if (d > maxDist) {
                let dirX = tx - A.ax;
                let dirY = ty - A.ay;
                let len = Math.hypot(dirX, dirY) || 1;
                tx = A.ax + (dirX / len) * maxDist;
                ty = A.ay + (dirY / len) * maxDist;
            }
        }

        assignTarget(s, tx, ty);
    }

    let buildActionTaken = false;

    // 3. No idle workers: build miners/fighters only when needed
    let enemyFighters = enemy ? enemy.units.fighters.length : 0;
    let desiredFighters = Math.max(2, enemyFighters + 1); // Always have at least 2 for patrol, +1 edge on enemy

    // Aggressive push if base is extremely stable
    if (!needsExpansion && p.energy >= 150) {
        desiredFighters += 3;
    }

    let needsFighters = p.units.fighters.length < desiredFighters;
    let energyReservedForFighters = needsFighters ? 100 : 0;

    // Build Miners (Highest Priority if starved)
    let desiredMiners = Math.max(1, activeCaptured.length * 2);
    if (activeCaptured.length === 0 && uncaptured.length > 0) desiredMiners = 1;

    let economyCritical = p.units.miners.length < desiredMiners;

    if (economyCritical && p.energy >= 25 && p.buildCooldowns.miner <= 0 && !buildActionTaken) {
        p.energy -= 25;
        p.buildCooldowns.miner = 5;
        p.buildQueue.push({ type: 'miners', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60 } });
        buildActionTaken = true;
    }

    // Build Fighters (Priority 2)
    if (needsFighters && p.energy >= 100 && p.buildCooldowns.fighter <= 0 && !buildActionTaken) {
        p.energy -= 100;
        p.buildCooldowns.fighter = 15;
        let pDir = p.homePlanet.x < mapWidth / 2 ? 1 : -1;
        p.buildQueue.push({ type: 'fighters', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, path: [{ x: p.homePlanet.x + 2.0 * pDir, y: p.homePlanet.y }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 } });
        buildActionTaken = true;
    }

    // Build Stations (Priority 3, uses remaining unreserved energy)
    let maxStations = needsExpansion ? activeCaptured.length * 2 + 4 : Math.max(3, activeCaptured.length + 2);
    if (p.units.stations.length < maxStations && p.energy >= (50 + energyReservedForFighters) && p.buildCooldowns.station <= 0 && !buildActionTaken) {
        p.energy -= 50;
        p.buildCooldowns.station = 10;
        let pDir = p.homePlanet.x < mapWidth / 2 ? 1 : -1;
        p.buildQueue.push({ type: 'stations', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, targetX: p.homePlanet.x, targetY: p.homePlanet.y, desiredTargetX: p.homePlanet.x + 2.0 * pDir, desiredTargetY: p.homePlanet.y, health: 100, maxHealth: 100, cooldown: 0 } });
        buildActionTaken = true;
    }

    // Always have fighters patrolling or attacking
    let defenseRadius = 7.0;
    p.units.fighters.forEach((f, i) => {
        let isIdle = !f.path || f.path.length === 0 || (f.pathIndex >= f.path.length && !f.isLoop);

        // If we are aggressive and enemy exists, attack them.
        let isAggressive = !needsExpansion && p.energy > 50 && enemy;

        if (isIdle || (!f.isAggressiveTarget && isAggressive)) {
            if (isAggressive && enemy) {
                // Attack enemy planet
                f.path = [{ x: enemy.homePlanet.x, y: enemy.homePlanet.y }];
                f.pathIndex = 0;
                f.pathDir = 1;
                f.isLoop = false;
                f.isAggressiveTarget = true;
            } else if (isIdle) {
                // Patrol around home
                let angle = (i / Math.max(1, p.units.fighters.length)) * Math.PI * 2;
                let cx = p.homePlanet.x;
                let cy = p.homePlanet.y;
                f.path = [
                    { x: cx + Math.cos(angle) * defenseRadius, y: cy + Math.sin(angle) * defenseRadius },
                    { x: cx + Math.cos(angle + Math.PI) * defenseRadius, y: cy + Math.sin(angle + Math.PI) * defenseRadius }
                ];
                f.pathIndex = 0;
                f.pathDir = 1;
                f.isLoop = true;
                f.isAggressiveTarget = false;
            }
        }
    });
}
