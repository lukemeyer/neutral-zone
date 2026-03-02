import { players, asteroids } from './state.js';
import { getPlayerTerritoryHull, isValidScoutPlacement } from './utils.js';
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

    // Check if any scouts are currently moving
    // Added a more lenient tolerance (10) for movement matching due to physics bounds
    const movingScouts = p.units.scouts.filter(s => Math.hypot(s.targetX - s.x, s.targetY - s.y) > 10);

    // Check if the moving scouts actually made progress recently. If they get stuck on borders they shouldn't freeze the AI.
    let actuallyMoving = false;
    movingScouts.forEach(s => {
        if (!s.lastDist) s.lastDist = Infinity;
        let currentDist = Math.hypot(s.targetX - s.x, s.targetY - s.y);
        // If distance improved by at least 1 pixel this tick, they are still moving
        if (s.lastDist - currentDist > 0.5) actuallyMoving = true;
        s.lastDist = currentDist;
    });

    if (actuallyMoving) {
        p.scoutSettleTimer = 0;
        return; // Wait for them to arrive
    }

    p.scoutSettleTimer += dt;
    if (p.scoutSettleTimer < 1.0) return; // Wait 1 second after they stop before doing new things

    p.aiTimer += dt;
    if (p.aiTimer < 1.0) return; // run AI logic every 1s
    p.aiTimer = 0;

    const enemy = players.find(ep => ep.id !== p.id);

    // AI Priority 1: EXPANSION (Scouts & Territory)
    const currentHull = getPlayerTerritoryHull(p, players, true);

    const pointInPolygon = (point, vs) => {
        let x = point.x, y = point.y;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i].x, yi = vs[i].y;
            let xj = vs[j].x, yj = vs[j].y;
            let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    const isAstCaptured = (a) => {
        // Just checking the center is enough to confirm capture for AI purposes
        return pointInPolygon({ x: a.x, y: a.y }, currentHull);
    };

    // 1. We want to capture asteroids. Let's find ALL uncaptured asteroids with resources.
    let uncaptured = asteroids.filter(a => a.resources > 0 && !isAstCaptured(a));
    // Sort them by distance to home planet
    uncaptured.sort((a, b) => Math.hypot(p.homePlanet.x - a.x, p.homePlanet.y - a.y) - Math.hypot(p.homePlanet.x - b.x, p.homePlanet.y - b.y));

    // We can assign one expansion scout to one uncaptured asteroid at a time.
    let assignedScouts = [];

    uncaptured.forEach(ast => {
        // Find a scout that isn't already assigned to hold a captured asteroid, 
        // and isn't already assigned to another uncaptured asteroid.
        let availableScouts = p.units.scouts.filter(s => !assignedScouts.includes(s));

        let scout = availableScouts.find(s => Math.hypot(s.targetX - s.x, s.targetY - s.y) < 5); // Must be an idle scout

        if (scout) {
            let dirX = ast.x - p.homePlanet.x;
            let dirY = ast.y - p.homePlanet.y;
            let len = Math.hypot(dirX, dirY) || 1;

            // Push PAST the asteroid by its radius + 30 to fully encapsulate it
            scout.desiredTargetX = ast.x + (dirX / len) * (ast.radius + 30);
            scout.desiredTargetY = ast.y + (dirY / len) * (ast.radius + 30);

            assignedScouts.push(scout);
        } else if (p.energy >= 50 && (p.energy > 100 || p.units.scouts.length === 0 || p.units.scouts.length < uncaptured.length)) {
            // No idle scout available for this asteroid. Build one if we have the energy.
            p.energy -= 50;
            let tx = p.homePlanet.x;
            let ty = p.homePlanet.y - 100;
            p.units.scouts.push({ x: p.homePlanet.x, y: p.homePlanet.y, targetX: p.homePlanet.x, targetY: p.homePlanet.y, desiredTargetX: tx, desiredTargetY: ty, health: 100, maxHealth: 100, cooldown: 0 });
            // We just added one, but we wait for next tick to assign it.
            // Only build ONE per tick to prevent draining entirely on one frame.
            return;
        }
    });

    // Assign holding positions for captured asteroids
    let activeCaptured = asteroids.filter(a => a.resources > 0 && isAstCaptured(a));
    let holdingScouts = [];
    activeCaptured.forEach(a => {
        let available = p.units.scouts.filter(s => !assignedScouts.includes(s) && !holdingScouts.includes(s));
        if (available.length > 0) {
            let holder = available.sort((s1, s2) => Math.hypot(s1.x - a.x, s1.y - a.y) - Math.hypot(s2.x - a.x, s2.y - a.y))[0];
            let dirX = a.x - p.homePlanet.x;
            let dirY = a.y - p.homePlanet.y;
            let len = Math.hypot(dirX, dirY) || 1;
            holder.desiredTargetX = a.x + (dirX / len) * (a.radius + 30);
            holder.desiredTargetY = a.y + (dirY / len) * (a.radius + 30);
            holdingScouts.push(holder);
        }
    });

    // Pushing idle scouts to the corners for map domination %
    const idleScouts = p.units.scouts.filter(s => !assignedScouts.includes(s) && !holdingScouts.includes(s));
    if (idleScouts.length > 0) {
        // We need the validation method specifically for corner pushes since they naturally clip into enemy hulls
        // Since we know AI is loaded after Utils, we can lazily load the imported function synchronously through window if it exists or use dynamic import conceptually:
        // However, for ai.js it's easier to just import it globally at the top. We will rewrite the top of this file next.
        const corners = [
            { x: p.id === 0 ? mapWidth : 0, y: 0 },
            { x: p.id === 0 ? mapWidth : 0, y: mapHeight },
            { x: p.id === 0 ? mapWidth : 0, y: mapHeight / 2 },
            { x: mapWidth / 2, y: mapHeight / 2 } // push towards actual center first
        ];

        idleScouts.forEach((s, i) => {
            let targetCorner = corners[i % corners.length];
            let dirX = targetCorner.x - p.homePlanet.x;
            let dirY = targetCorner.y - p.homePlanet.y;
            let len = Math.hypot(dirX, dirY) || 1;

            // Push out progressively further based on total scouts to mimic perimeter expansion
            let pushDist = 200 + (idleScouts.length * 50);
            s.desiredTargetX = p.homePlanet.x + (dirX / len) * pushDist;
            s.desiredTargetY = p.homePlanet.y + (dirY / len) * pushDist;
        });
    }

    // AI Priority 2: DEFENSE & OFFENSE (Fighters)
    if (p.units.fighters.length < enemy.units.fighters.length && p.energy >= 100) {
        // Defensive: Match opponent numbers
        p.energy -= 100;
        let tx = p.id === 0 ? p.homePlanet.x + 100 : p.homePlanet.x - 100;
        let ty = p.homePlanet.y;
        p.units.fighters.push({ x: p.homePlanet.x, y: p.homePlanet.y, path: [{ x: tx, y: ty }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    } else if (p.units.miners.length >= 2 && p.energy >= 200) {
        // Offensive: Economy is stable, push for the win
        p.energy -= 100;
        p.units.fighters.push({ x: p.homePlanet.x, y: p.homePlanet.y, path: [{ x: enemy.homePlanet.x, y: enemy.homePlanet.y }], pathIndex: 0, pathDir: 1, isLoop: false, health: 150, maxHealth: 150, cooldown: 0 });
    }

    // AI Priority 3: ECONOMY (Miners)
    // Scale miners dynamically based on total captured asteroids
    if (p.units.miners.length < activeCaptured.length * 3 && p.energy >= 25) {
        p.energy -= 25;
        p.units.miners.push({ x: p.homePlanet.x, y: p.homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });
    }
}
