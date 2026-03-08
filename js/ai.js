import { players, asteroids } from './state.js';
import { isValidStationPlacement, isAsteroidInPolygon, getStationGraph, MAX_CONNECTION_LENGTH } from './utils.js';
console.log('ai.js loaded');

export function updateAI(p, dt, mapWidth, mapHeight) {
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

    const enemy = players.find(ep => ep.id !== p.id);

    // We use a flag to track if we spent energy this frame. We can only queue one build per frame.
    let buildActionTaken = false;

    // AI Priority 1: EXPANSION (Stations & Territory)
    function isAstCaptured(a) {
        return isAsteroidInPolygon(a, p);
    }

    function isAstEnemyControlled(a) {
        return isAsteroidInPolygon(a, enemy);
    }

    // 1. Maintain Station AI States
    p.units.stations.forEach(s => {
        if (!s.aiState) s.aiState = 'IDLE';

        if (s.aiState === 'CONNECTING') {
            // Re-evaluate if it's still needed or has arrived
            if (Math.hypot(s.targetX - s.x, s.targetY - s.y) <= 5) {
                // Done moving to bridge position, could stay CONNECTING or just HOLDING
                s.desiredTargetX = s.targetX;
                s.desiredTargetY = s.targetY;
            }
        } else if (s.aiTargetAst) {
            if (s.aiTargetAst.resources <= 0) {
                // Asteroid depleted
                s.aiState = 'IDLE';
                s.aiTargetAst = null;
                s.desiredTargetX = s.targetX; // Stop moving
                s.desiredTargetY = s.targetY;
            } else if (s.aiState === 'ENVELOPING' && isAstCaptured(s.aiTargetAst)) {
                // Successfully captured
                s.aiState = 'HOLDING';
                s.desiredTargetX = s.targetX; // Lock target where it is
                s.desiredTargetY = s.targetY;
            } else if (s.aiState === 'HOLDING' && !isAstCaptured(s.aiTargetAst)) {
                // Lost capture, need to envelop again
                s.aiState = 'ENVELOPING';
            }
        }
    });

    // 1.5 Evaluate Graph for Disconnected Territories
    const graph = getStationGraph(p, false); // useTarget = false for current positions

    // Clear CONNECTING states to re-evaluate what's strictly necessary each frame
    p.units.stations.filter(s => s.aiState === 'CONNECTING').forEach(s => s.aiState = 'IDLE');

    // Find all disconnected components (components that do NOT contain the home planet)
    let detachedComponents = graph.components.filter(c => !c.includes(p.homePlanet));

    // Sort components by size (prioritize connecting largest components)
    detachedComponents.sort((a, b) => b.length - a.length);

    let connectingAssignments = 0;

    for (let comp of detachedComponents) {
        // Find the absolute closest point between this component and the main connected network
        let minGap = Infinity;
        let bestDetachedNode = null;
        let bestMainNode = null;

        for (let dtNode of comp) {
            for (let mtNode of graph.connectedNodes) {
                let dist = Math.hypot(dtNode.x - mtNode.x, dtNode.y - mtNode.y);
                if (dist < minGap) {
                    minGap = dist;
                    bestDetachedNode = dtNode;
                    bestMainNode = mtNode;
                }
            }
        }

        if (bestDetachedNode && bestMainNode && minGap > MAX_CONNECTION_LENGTH) {
            // Need a bridge. How many stations do we need?
            let bridgesNeeded = Math.ceil(minGap / MAX_CONNECTION_LENGTH) - 1;

            for (let i = 1; i <= bridgesNeeded; i++) {
                // Grab an IDLE or SCOUTING station
                let available = p.units.stations.filter(s => s.aiState === 'IDLE' || s.aiState === 'SCOUTING');

                // Position fractionally along the gap
                let fraction = i / (bridgesNeeded + 1);
                let bridgeX = bestMainNode.x + (bestDetachedNode.x - bestMainNode.x) * fraction;
                let bridgeY = bestMainNode.y + (bestDetachedNode.y - bestMainNode.y) * fraction;

                available.sort((s1, s2) => Math.hypot(s1.x - bridgeX, s1.y - bridgeY) - Math.hypot(s2.x - bridgeX, s2.y - bridgeY));

                if (available.length > 0) {
                    let station = available[0];
                    station.aiState = 'CONNECTING';
                    station.aiTargetAst = null; // Clear asteroid tracking
                    connectingAssignments++;

                    if (Math.hypot((station.desiredTargetX || station.targetX) - bridgeX, (station.desiredTargetY || station.targetY) - bridgeY) > 5) {
                        station.desiredTargetX = bridgeX;
                        station.desiredTargetY = bridgeY;
                    }
                }
            }
        }
    }

    // 2. Identify uncaptured asteroids
    let uncaptured = asteroids.filter(a => a.resources > 0 && !isAstCaptured(a) && !isAstEnemyControlled(a));
    uncaptured.sort((a, b) => Math.hypot(p.homePlanet.x - a.x, p.homePlanet.y - a.y) - Math.hypot(p.homePlanet.x - b.x, p.homePlanet.y - b.y));
    uncaptured = uncaptured.slice(0, 3); // Limit CPU focus to the closest 3 asteroids to prevent over-extension

    const MAX_LINK = 150;
    function getClampedTarget(targetX, targetY, currentStation) {
        let bestNode = null;
        let minDistToTarget = Infinity;

        // ALLNODES is used for repulsion, but for LINKING we only want to build off the connected graph to force organic expansion
        let allNodes = [p.homePlanet, ...p.units.stations];

        let linkableNodes = graph.connectedNodes;
        if (!linkableNodes || linkableNodes.length === 0) {
            linkableNodes = [p.homePlanet];
        }

        for (let node of linkableNodes) {
            if (node === currentStation || node.aiState === 'IDLE') continue;
            let nx = node.desiredTargetX !== undefined ? node.desiredTargetX : (node.targetX !== undefined ? node.targetX : node.x);
            let ny = node.desiredTargetY !== undefined ? node.desiredTargetY : (node.targetY !== undefined ? node.targetY : node.y);

            let dist = Math.hypot(targetX - nx, targetY - ny);
            if (dist < minDistToTarget) {
                minDistToTarget = dist;
                bestNode = { x: nx, y: ny };
            }
        }

        if (!bestNode) bestNode = { x: p.homePlanet.x, y: p.homePlanet.y };

        let clampedX = targetX;
        let clampedY = targetY;

        let distFromBest = Math.hypot(targetX - bestNode.x, targetY - bestNode.y);
        if (distFromBest > MAX_LINK) {
            let dirX = targetX - bestNode.x;
            let dirY = targetY - bestNode.y;
            let len = distFromBest || 1;
            clampedX = bestNode.x + (dirX / len) * MAX_LINK;
            clampedY = bestNode.y + (dirY / len) * MAX_LINK;
        }

        // Apply stronger repulsion from other nodes to prevent exact overlap/clustering
        const MIN_NODE_DIST = 90; // Increased required spacing
        for (let i = 0; i < 5; i++) { // More relaxation passes for better solving
            for (let node of allNodes) {
                if (node === currentStation || node.aiState === 'IDLE') continue;
                let nx = node.desiredTargetX !== undefined ? node.desiredTargetX : (node.targetX !== undefined ? node.targetX : node.x);
                let ny = node.desiredTargetY !== undefined ? node.desiredTargetY : (node.targetY !== undefined ? node.targetY : node.y);

                let d = Math.hypot(clampedX - nx, clampedY - ny);
                if (d < MIN_NODE_DIST && d > 0) {
                    let push = MIN_NODE_DIST - d; // Stronger push (full overlap correction)
                    clampedX += (clampedX - nx) / d * push;
                    clampedY += (clampedY - ny) / d * push;
                }
            }
        }

        return { x: clampedX, y: clampedY };
    }

    // 3. Assign ENVELOPING stations
    for (let ast of uncaptured) {
        let closestDist = Infinity;
        for (let n of [p.homePlanet, ...p.units.stations]) {
            if (n.aiState === 'IDLE') continue;
            let nx = n.desiredTargetX !== undefined ? n.desiredTargetX : n.x;
            let ny = n.desiredTargetY !== undefined ? n.desiredTargetY : n.y;
            let pd = Math.hypot(nx - ast.x, ny - ast.y);
            if (pd < closestDist) closestDist = pd;
        }

        let distToCover = closestDist - (ast.radius + 30);
        let chainNeeded = distToCover > 0 ? Math.ceil(distToCover / MAX_LINK) : 0;
        let totalNeeded = 2 + chainNeeded;

        let assigned = p.units.stations.filter(s => s.aiTargetAst === ast);
        let needed = totalNeeded - assigned.length;

        if (needed > 0) {
            // Grab IDLE or re-task SCOUTING stations
            let available = p.units.stations.filter(s => s.aiState === 'IDLE' || s.aiState === 'SCOUTING');
            available.sort((s1, s2) => Math.hypot(s1.x - ast.x, s1.y - ast.y) - Math.hypot(s2.x - ast.x, s2.y - ast.y));

            for (let i = 0; i < Math.min(needed, available.length); i++) {
                let station = available[i];
                station.aiState = 'ENVELOPING';
                station.aiTargetAst = ast;
                assigned.push(station);
            }
        }

        // Move enveloping stations to surround the asteroid
        for (let i = 0; i < assigned.length; i++) {
            let station = assigned[i];
            if (station.aiState === 'ENVELOPING') {
                let offsetSign = i % 2 === 0 ? 1 : -1;
                // Approach from the direction of the home planet for simplicity
                let dirX = ast.x - p.homePlanet.x;
                let dirY = ast.y - p.homePlanet.y;
                let len = Math.hypot(dirX, dirY) || 1;

                let perpX = -dirY / len * 40;
                let perpY = dirX / len * 40;

                // Position slightly behind and to the side of the asteroid
                let trueTargetX = ast.x + (dirX / len) * (ast.radius + 30) + (perpX * offsetSign);
                let trueTargetY = ast.y + (dirY / len) * (ast.radius + 30) + (perpY * offsetSign);

                let clamped = getClampedTarget(trueTargetX, trueTargetY, station);

                if (Math.hypot((station.desiredTargetX || station.targetX) - clamped.x, (station.desiredTargetY || station.targetY) - clamped.y) > 5) {
                    station.desiredTargetX = clamped.x;
                    station.desiredTargetY = clamped.y;
                }
            }
        }
    }

    // Try to build stations if we have uncaptured asteroids but no stations IDLE or ENVELOPING (or we desperately need CONNECTING stations)
    let stationsActing = p.units.stations.filter(s => s.aiState === 'ENVELOPING' || s.aiState === 'HOLDING').length;
    let needBuildersForConnections = detachedComponents.length > 0 && connectingAssignments === 0 && p.units.stations.filter(s => s.aiState === 'IDLE').length === 0;

    if (!buildActionTaken && p.energy >= 50 && p.buildCooldowns.station <= 0 &&
        (p.energy > 100 || p.units.stations.length < 2 || stationsActing < uncaptured.length * 2 || needBuildersForConnections)) {
        p.energy -= 50;
        p.buildCooldowns.station = 10;
        let tx = p.homePlanet.x;
        let ty = p.homePlanet.y - 100;
        p.buildQueue.push({ type: 'stations', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, targetX: p.homePlanet.x, targetY: p.homePlanet.y, desiredTargetX: tx, desiredTargetY: ty, health: 100, maxHealth: 100, cooldown: 0, aiState: 'IDLE' } });
        buildActionTaken = true;
    }

    // 4. Ensure captured asteroids are HELD
    let activeCaptured = asteroids.filter(a => a.resources > 0 && isAstCaptured(a));
    for (let ast of activeCaptured) {
        let assigned = p.units.stations.filter(s => s.aiTargetAst === ast && s.aiState === 'HOLDING');
        if (assigned.length === 0) {
            let available = p.units.stations.filter(s => s.aiState === 'IDLE' || s.aiState === 'SCOUTING');
            available.sort((s1, s2) => Math.hypot(s1.x - ast.x, s1.y - ast.y) - Math.hypot(s2.x - ast.x, s2.y - ast.y));
            if (available.length > 0) {
                let station = available[0];
                station.aiState = 'HOLDING';
                station.aiTargetAst = ast;
                assigned.push(station);

                let dirX = ast.x - p.homePlanet.x;
                let dirY = ast.y - p.homePlanet.y;
                let len = Math.hypot(dirX, dirY) || 1;
                let targetX = ast.x + (dirX / len) * (ast.radius + 30);
                let targetY = ast.y + (dirY / len) * (ast.radius + 30);

                if (Math.hypot((station.desiredTargetX || station.targetX) - targetX, (station.desiredTargetY || station.targetY) - targetY) > 5) {
                    station.desiredTargetX = targetX;
                    station.desiredTargetY = targetY;
                }
            }
        }
        // HOLDING stations just stay where they are (target is locked in state transition)
    }

    // 5. Assign SCOUTING to idle stations
    let idleStations = p.units.stations.filter(s => s.aiState === 'IDLE');
    if (idleStations.length > 0) {
        let scouters = p.units.stations.filter(s => s.aiState === 'SCOUTING');
        const corners = [
            { x: p.id === 0 ? mapWidth : 0, y: 0 },
            { x: p.id === 0 ? mapWidth : 0, y: mapHeight },
            { x: p.id === 0 ? mapWidth : 0, y: mapHeight / 2 },
            { x: mapWidth / 2, y: mapHeight / 2 } // push towards actual center first
        ];

        for (let s of idleStations) {
            s.aiState = 'SCOUTING';
            scouters.push(s);
        }

        for (let i = 0; i < scouters.length; i++) {
            let s = scouters[i];
            let targetCorner = corners[i % corners.length];
            let dirX = targetCorner.x - p.homePlanet.x;
            let dirY = targetCorner.y - p.homePlanet.y;
            let len = Math.hypot(dirX, dirY) || 1;

            // Push out progressively further
            let pushDist = 200 + (scouters.length * 50);
            let trueTargetX = p.homePlanet.x + (dirX / len) * pushDist;
            let trueTargetY = p.homePlanet.y + (dirY / len) * pushDist;

            let clamped = getClampedTarget(trueTargetX, trueTargetY, s);

            if (Math.hypot((s.desiredTargetX || s.targetX) - clamped.x, (s.desiredTargetY || s.targetY) - clamped.y) > 5) {
                s.desiredTargetX = clamped.x;
                s.desiredTargetY = clamped.y;
            }
        }
    }

    // Calculate target miners early to determine if economy is critical
    let targetMiners = Math.max(1, activeCaptured.length * 3);
    if (activeCaptured.length === 0 && uncaptured.length > 0) targetMiners = 1; // Anticipate need
    // Economy is critical if we have 0 miners, or fewer than 2 when we have targets
    let economyCritical = p.units.miners.length < Math.min(2, targetMiners);

    // AI Priority 2: DEFENSE & OFFENSE (Fighters)
    let minFighters = Math.max(1, enemy.units.fighters.length + 1); // Always want an edge
    let savingEnergy = false;

    if (!buildActionTaken && !economyCritical && p.units.fighters.length < minFighters && p.buildCooldowns.fighter <= 0) {
        if (p.energy >= 100) {
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
