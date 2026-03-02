import { players, asteroids } from './state.js';
import { getPlayerTerritoryHull, isValidScoutPlacement, pointInPolygon, isAsteroidInPolygon } from './utils.js';
console.log('ai.js loaded');

export function updateAI(p, dt, mapWidth, mapHeight) {
    // Process "dragging" of scout targets to simulate human players and intersect borders precisely
    p.units.scouts.forEach(s => {
        if (s.desiredTargetX !== undefined && s.desiredTargetY !== undefined) {
            let dx = s.desiredTargetX - s.targetX;
            let dy = s.desiredTargetY - s.targetY;
            let dist = Math.hypot(dx, dy);
            if (dist > 1) {
                let dragSpeed = 800 * dt; // simulated rapid mouse drag
                let moveDist = Math.min(dragSpeed, dist);
                let proposedX = s.targetX + (dx / dist) * moveDist;
                let proposedY = s.targetY + (dy / dist) * moveDist;

                if (isValidScoutPlacement(proposedX, proposedY, s, p, players, mapWidth, mapHeight)) {
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

    // AI Priority 1: EXPANSION (Scouts & Territory)
    const currentHull = getPlayerTerritoryHull(p, players, true);
    const enemyHull = getPlayerTerritoryHull(enemy, players, false);

    function isAstCaptured(a) {
        if (currentHull.length < 3) return false;
        return isAsteroidInPolygon(a, currentHull);
    }

    function isAstEnemyControlled(a) {
        if (enemyHull.length < 3) return false;
        return isAsteroidInPolygon(a, enemyHull);
    }

    // 1. We want to capture asteroids. Let's find ALL uncaptured asteroids with resources.
    // Filter out ones that are fully inside enemy territory to prevent getting stuck
    let uncaptured = asteroids.filter(a => a.resources > 0 && !isAstCaptured(a) && !isAstEnemyControlled(a));

    // Sort them by distance to home planet
    uncaptured.sort((a, b) => Math.hypot(p.homePlanet.x - a.x, p.homePlanet.y - a.y) - Math.hypot(p.homePlanet.x - b.x, p.homePlanet.y - b.y));

    let assignedScouts = [];

    for (let ast of uncaptured) {
        // Find idle scouts to assign (up to 2 per asteroid for a pincer envelopment)
        let availableScouts = p.units.scouts.filter(s => !assignedScouts.includes(s));
        let idleScoutsForAst = availableScouts.filter(s => Math.hypot(s.targetX - s.x, s.targetY - s.y) < 5);

        if (idleScoutsForAst.length > 0) {
            let offsetSign = 1;
            for (let i = 0; i < Math.min(2, idleScoutsForAst.length); i++) {
                let scout = idleScoutsForAst[i];
                let offsetSign = p.units.scouts.indexOf(scout) % 2 === 0 ? 1 : -1;

                let dirX = ast.x - p.homePlanet.x;
                let dirY = ast.y - p.homePlanet.y;
                let len = Math.hypot(dirX, dirY) || 1;

                let perpX = -dirY / len * 40;
                let perpY = dirX / len * 40;

                let targetX = ast.x + (dirX / len) * (ast.radius + 30) + (perpX * offsetSign);
                let targetY = ast.y + (dirY / len) * (ast.radius + 30) + (perpY * offsetSign);

                assignedScouts.push(scout);

                if (Math.hypot((scout.desiredTargetX || scout.targetX) - targetX, (scout.desiredTargetY || scout.targetY) - targetY) > 5) {
                    scout.desiredTargetX = targetX;
                    scout.desiredTargetY = targetY;
                }
            }
        }
    }

    // Try to build scouts if we have uncaptured asteroids but no scouts available
    if (!buildActionTaken && p.energy >= 50 && p.buildCooldowns.scout <= 0 && (p.energy > 100 || p.units.scouts.length < 2 || p.units.scouts.length < uncaptured.length)) {
        p.energy -= 50;
        p.buildCooldowns.scout = 10;
        let tx = p.homePlanet.x;
        let ty = p.homePlanet.y - 100;
        p.buildQueue.push({ type: 'scouts', unitData: { x: p.homePlanet.x, y: p.homePlanet.y, targetX: p.homePlanet.x, targetY: p.homePlanet.y, desiredTargetX: tx, desiredTargetY: ty, health: 100, maxHealth: 100, cooldown: 0 } });
        buildActionTaken = true;
    }

    // Assign holding positions for captured asteroids
    let activeCaptured = asteroids.filter(a => a.resources > 0 && isAstCaptured(a));
    let holdingScouts = [];
    for (let a of activeCaptured) {
        let available = p.units.scouts.filter(s => !assignedScouts.includes(s) && !holdingScouts.includes(s));
        if (available.length > 0) {
            let holder = available.sort((s1, s2) => Math.hypot(s1.x - a.x, s1.y - a.y) - Math.hypot(s2.x - a.x, s2.y - a.y))[0];
            let dirX = a.x - p.homePlanet.x;
            let dirY = a.y - p.homePlanet.y;
            let len = Math.hypot(dirX, dirY) || 1;
            let targetX = a.x + (dirX / len) * (a.radius + 30);
            let targetY = a.y + (dirY / len) * (a.radius + 30);
            holdingScouts.push(holder);

            if (Math.hypot((holder.desiredTargetX || holder.targetX) - targetX, (holder.desiredTargetY || holder.targetY) - targetY) > 5) {
                holder.desiredTargetX = targetX;
                holder.desiredTargetY = targetY;
            }
        }
    }

    // Pushing idle scouts to the corners for map domination %
    const idleScouts = p.units.scouts.filter(s => !assignedScouts.includes(s) && !holdingScouts.includes(s) && Math.hypot(s.targetX - s.x, s.targetY - s.y) < 5);
    if (idleScouts.length > 0) {
        const corners = [
            { x: p.id === 0 ? mapWidth : 0, y: 0 },
            { x: p.id === 0 ? mapWidth : 0, y: mapHeight },
            { x: p.id === 0 ? mapWidth : 0, y: mapHeight / 2 },
            { x: mapWidth / 2, y: mapHeight / 2 } // push towards actual center first
        ];

        for (let i = 0; i < idleScouts.length; i++) {
            let s = idleScouts[i];
            let targetCorner = corners[i % corners.length];
            let dirX = targetCorner.x - p.homePlanet.x;
            let dirY = targetCorner.y - p.homePlanet.y;
            let len = Math.hypot(dirX, dirY) || 1;

            // Push out progressively further based on total scouts to mimic perimeter expansion
            let pushDist = 200 + (idleScouts.length * 50);
            let targetX = p.homePlanet.x + (dirX / len) * pushDist;
            let targetY = p.homePlanet.y + (dirY / len) * pushDist;

            if (Math.hypot((s.desiredTargetX || s.targetX) - targetX, (s.desiredTargetY || s.targetY) - targetY) > 5) {
                s.desiredTargetX = targetX;
                s.desiredTargetY = targetY;
            }
        }
    }

    // Calculate target miners early to determine if economy is critical
    let targetMiners = Math.max(1, activeCaptured.length * 3);
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
