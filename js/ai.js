import { players, asteroids } from './state.js';
import { isValidStationPlacement, isAsteroidInPolygon, getStationGraph, MAX_CONNECTION_LENGTH } from './utils.js';
import { updateExpansioneerAI } from './ai_expansioneer.js';
console.log('ai.js loaded');

export function updateAI(p, dt, mapWidth, mapHeight) {
    if (p.type === 'cpu_expansioneer') {
        updateExpansioneerAI(p, dt, mapWidth, mapHeight);
    } else {
        updateLegacyAI(p, dt, mapWidth, mapHeight);
    }
}

export function updateLegacyAI(p, dt, mapWidth, mapHeight) {
    p.aiTime = (p.aiTime || 0) + dt;

    let currentStationCount = p.units.stations.length;
    let enemy = players.find(ep => ep.id !== p.id);
    let currentEnemyStationCount = enemy ? enemy.units.stations.length : 0;
    let currentAsteroidCount = asteroids.filter(a => a.resources > 0).length;

    let forceReplan = false;
    if (p._aiLastStationCount !== currentStationCount ||
        p._aiLastAsteroidCount !== currentAsteroidCount ||
        p._aiLastEnemyStationCount !== currentEnemyStationCount) {
        forceReplan = true;
        p._aiLastStationCount = currentStationCount;
        p._aiLastAsteroidCount = currentAsteroidCount;
        p._aiLastEnemyStationCount = currentEnemyStationCount;
    }

    function assignTarget(s, tx, ty) {
        let currentTargetX = s.desiredTargetX !== undefined ? s.desiredTargetX : s.targetX;
        let currentTargetY = s.desiredTargetY !== undefined ? s.desiredTargetY : s.targetY;
        if (Math.hypot(currentTargetX - tx, currentTargetY - ty) > 5) {
            if (forceReplan || !s.aiLastMoveTime || (p.aiTime - s.aiLastMoveTime) > 10) {
                s.desiredTargetX = tx;
                s.desiredTargetY = ty;
                s.aiLastMoveTime = p.aiTime;
            }
        }
    }

    // Process "dragging" of station targets to simulate human players and intersect borders precisely
    p.units.stations.forEach(s => {
        if (s.desiredTargetX !== undefined && s.desiredTargetY !== undefined) {
            let dx = s.desiredTargetX - s.targetX;
            let dy = s.desiredTargetY - s.targetY;
            let dist = Math.hypot(dx, dy);
            if (dist > 1) {
                let dragSpeed = 800 * dt; // simulated rapid mouse drag
                let moveDist = Math.min(dragSpeed, dist);
                let proposedX = s.targetX + (dx / dist) * moveDist;
                let proposedY = s.targetY + (dy / dist) * moveDist;

                if (isValidStationPlacement(proposedX, proposedY, s, p, players, mapWidth, mapHeight)) {
                    s.targetX = proposedX;
                    s.targetY = proposedY;
                } else {
                    // Hit a territory boundary or max perimeter, stop dragging the target
                    s.desiredTargetX = s.targetX;
                    s.desiredTargetY = s.targetY;
                }
            } else {
                s.targetX = s.desiredTargetX;
                s.targetY = s.desiredTargetY;
            }
        }
    });

    // We use a flag to track if we spent energy this frame. We can only queue one build per frame.
    let buildActionTaken = false;

    // AI Priority 1: EXPANSION (Stations & Territory)
    function isAstCaptured(a) {
        return isAsteroidInPolygon(a, p);
    }
    function isAstEnemyControlled(a) {
        return isAsteroidInPolygon(a, enemy);
    }

    let uncaptured = asteroids.filter(a => a.resources > 0 && !isAstCaptured(a) && !isAstEnemyControlled(a));
    uncaptured.sort((a, b) => Math.hypot(p.homePlanet.x - a.x, p.homePlanet.y - a.y) - Math.hypot(p.homePlanet.x - b.x, p.homePlanet.y - b.y));
    let targetAsteroids = uncaptured.slice(0, 3); // CPU focus

    // "Creeping Sludge" Lattice Generation
    // We want to form a connected lattice of stations starting from the home planet.
    const SPACING = 190;

    // Convert a grid coordinate (q, r) to flat-topped hex world coordinates
    function hexToPixel(q, r) {
        let x = SPACING * (3 / 2) * q;
        let y = SPACING * Math.sqrt(3) * (r + q / 2);
        return { x: x + p.homePlanet.x, y: y + p.homePlanet.y }; // Anchored at home planet
    }

    let N = p.units.stations.length;
    let selectedNodes = [];
    let selectedSet = new Set();

    function getDist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }

    let homeId = "0,0";
    let candidates = new Map();

    // Neighbors of a hex(q,r)
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

    addNeighbors(0, 0); // Open neighbors around home planet

    for (let i = 0; i < N; i++) {
        if (candidates.size === 0) break;

        let bestCandidateId = null;
        let bestScore = -Infinity;

        for (let [cid, cand] of candidates.entries()) {
            if (cand.x < 0 || cand.x > mapWidth || cand.y < 0 || cand.y > mapHeight) {
                continue;
            }

            let minDistToTarget = Infinity;
            if (targetAsteroids.length > 0) {
                for (let ast of targetAsteroids) {
                    let d = getDist(cand, ast);
                    if (d < minDistToTarget) minDistToTarget = d;
                }
            } else {
                // If no targets, expand outward slowly
                minDistToTarget = -getDist(cand, p.homePlanet);
            }

            // Count neighbors already in the cluster (including home)
            let neighbors = 0;
            for (let dir of hexDirs) {
                let nid = (cand.q + dir.q) + "," + (cand.r + dir.r);
                if (selectedSet.has(nid) || nid === homeId) {
                    neighbors++;
                }
            }

            // Strongly reward sharing multiple edges (forming triangles/cycles) 
            let score = (neighbors * 800) - minDistToTarget;

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
        } else {
            break; // No valid candidates left
        }
    }

    // Greedy assignment: nearest stations to nearest lattice nodes
    let sortedNodes = selectedNodes.slice().sort((a, b) => getDist(a, p.homePlanet) - getDist(b, p.homePlanet));
    let sortedStations = p.units.stations.slice().sort((a, b) => getDist(a, p.homePlanet) - getDist(b, p.homePlanet));

    // To prevent stations from breaking off and jumping 1000px across the map, we must clamp their
    // targets to the ACTUAL, currently connected graph. They will act like a tethered chain.
    let currentGraph = getStationGraph(p, false);
    let connectedAnchors = currentGraph.connectedNodes;
    if (!connectedAnchors || connectedAnchors.length === 0) connectedAnchors = [p.homePlanet];

    for (let i = 0; i < sortedStations.length; i++) {
        let s = sortedStations[i];
        let tx = p.homePlanet.x;
        let ty = p.homePlanet.y;

        if (i < sortedNodes.length) {
            tx = sortedNodes[i].x;
            ty = sortedNodes[i].y;
        }

        // Check distance to the closest connected anchor
        let closestAnchor = null;
        let minDistToAnchor = Infinity;
        for (let anchor of connectedAnchors) {
            if (anchor === s) continue; // Don't anchor to yourself
            let d = getDist({ x: tx, y: ty }, anchor);
            if (d < minDistToAnchor) {
                minDistToAnchor = d;
                closestAnchor = anchor;
            }
        }

        // If the target is further than 220px from our solid network, clamp it!
        // This ensures the station waits at the border for other stations to catch up, organically growing the slime.
        if (closestAnchor && minDistToAnchor > 220) {
            let dirX = tx - closestAnchor.x;
            let dirY = ty - closestAnchor.y;
            let len = Math.hypot(dirX, dirY) || 1;
            tx = closestAnchor.x + (dirX / len) * 220;
            ty = closestAnchor.y + (dirY / len) * 220;
        }

        assignTarget(s, tx, ty);
        s.aiState = 'LATTICE';
    }

    let globalMinDistToTarget = Infinity;
    for (let node of selectedNodes) {
        for (let ast of targetAsteroids) {
            let d = getDist(node, ast);
            if (d < globalMinDistToTarget) globalMinDistToTarget = d;
        }
    }

    let activeCaptured = asteroids.filter(a => a.resources > 0 && isAstCaptured(a));

    // Explicit Highway Building Logic
    let needsMoreStations = false;
    if (uncaptured.length > 0) {
        if (p.units.stations.length < 3) needsMoreStations = true; // Minimum to form any 3-cycle territory
        else if (globalMinDistToTarget > 120) needsMoreStations = true; // Our lattice hasn't reached the asteroid! Build a highway.
        else if (p.energy > 150) needsMoreStations = true; // Excess energy, expand aggressively
    }

    if (!buildActionTaken && p.energy >= 50 && p.buildCooldowns.station <= 0 && needsMoreStations) {
        p.energy -= 50;
        p.buildCooldowns.station = 10;
        let tx = p.homePlanet.x;
        let ty = p.homePlanet.y - 100;
        p.buildQueue.push({ type: 'stations', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, targetX: p.homePlanet.x, targetY: p.homePlanet.y, desiredTargetX: tx, desiredTargetY: ty, health: 100, maxHealth: 100, cooldown: 0, aiState: 'LATTICE' } });
        buildActionTaken = true;
    }

    // Calculate target miners early to determine if economy is critical
    let targetMiners = Math.max(1, activeCaptured.length * 3);
    if (activeCaptured.length === 0 && uncaptured.length > 0) targetMiners = 1; // Anticipate need
    // Economy is critical if we have 0 miners, or fewer than 2 when we have targets
    let economyCritical = p.units.miners.length < Math.min(2, targetMiners);

    // AI Priority 2: DEFENSE & OFFENSE (Fighters)
    let minFighters = Math.max(1, enemy && enemy.units.fighters ? enemy.units.fighters.length + 1 : 1); // Always want an edge
    let savingEnergy = p.units.stations.length < 2 && p.energy < 100;

    if (!buildActionTaken && !economyCritical && p.units.fighters.length < minFighters && p.buildCooldowns.fighter <= 0) {
        if (p.energy >= 100 && !savingEnergy) {
            // Defensive/Matching: Build fighters to keep up or retake control
            p.energy -= 100;
            p.buildCooldowns.fighter = 15;
            let tx = p.id === 0 ? p.homePlanet.x + 100 : p.homePlanet.x - 100;
            let ty = p.homePlanet.y;
            p.buildQueue.push({ type: 'fighters', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, path: [{ x: tx, y: ty }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 } });
            buildActionTaken = true;
        } else {
            savingEnergy = true; // Block lower priorities from spending energy
        }
    } else if (!buildActionTaken && !economyCritical && p.units.miners.length >= 3 && p.buildCooldowns.fighter <= 0) {
        if (p.energy >= 100) { // Note: changed from 150 surplus requirement so it actually pushes
            // Offensive: Economy is stable, push for the win
            p.energy -= 100;
            p.buildCooldowns.fighter = 10; // Build faster offensively
            p.buildQueue.push({ type: 'fighters', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, path: [{ x: enemy.homePlanet.x, y: enemy.homePlanet.y }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 } });
            buildActionTaken = true;
        } else {
            savingEnergy = true;
        }
    }

    // AI Priority 3: ECONOMY (Miners)
    // Scale miners dynamically based on total captured asteroids, but ensure at least 1 at start
    if (!buildActionTaken && !savingEnergy && p.units.miners.length < targetMiners && p.energy >= 25 && p.buildCooldowns.miner <= 0) {
        p.energy -= 25;
        p.buildCooldowns.miner = 5;
        p.buildQueue.push({ type: 'miners', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 } });
        buildActionTaken = true;
    }
}
