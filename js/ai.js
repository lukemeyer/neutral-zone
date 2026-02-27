import { players, asteroids } from './state.js';
import { getConvexHull } from './utils.js';
console.log('ai.js loaded');

export function updateAI(p, dt) {
    // Check if any scouts are currently moving
    const scoutsMoving = p.units.scouts.some(s => Math.hypot(s.targetX - s.x, s.targetY - s.y) > 5);

    if (scoutsMoving) {
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
    const currentPoints = [p.homePlanet, ...p.units.scouts.map(s => ({ x: s.targetX, y: s.targetY }))];
    const currentHull = getConvexHull(currentPoints);

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
        const offsets = [[0, 0], [25, 0], [-25, 0], [0, 25], [0, -25]];
        return offsets.every(off => pointInPolygon({ x: a.x + off[0], y: a.y + off[1] }, currentHull));
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
            scout.targetX = ast.x + (dirX / len) * (ast.radius + 30);
            scout.targetY = ast.y + (dirY / len) * (ast.radius + 30);

            assignedScouts.push(scout);
        } else if (p.energy >= 50 && (p.energy > 100 || p.units.scouts.length === 0)) {
            // No idle scout available for this asteroid. Build one if we have the energy.
            p.energy -= 50;
            let tx = p.homePlanet.x;
            let ty = p.homePlanet.y - 100;
            p.units.scouts.push({ x: p.homePlanet.x, y: p.homePlanet.y, targetX: tx, targetY: ty, health: 50, maxHealth: 50, cooldown: 0 });
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
            holder.targetX = a.x + (dirX / len) * (a.radius + 30);
            holder.targetY = a.y + (dirY / len) * (a.radius + 30);
            holdingScouts.push(holder);
        }
    });

    // Pushing idle scouts to the corners for map domination %
    const idleScouts = p.units.scouts.filter(s => !assignedScouts.includes(s) && !holdingScouts.includes(s));
    if (idleScouts.length > 0) {
        const corners = [
            { x: p.id === 0 ? 1280 : 0, y: 0 },
            { x: p.id === 0 ? 1280 : 0, y: 720 },
            { x: p.id === 0 ? 1280 : 0, y: 360 } // center edge push
        ];

        idleScouts.forEach((s, i) => {
            let targetCorner = corners[i % corners.length];
            let dirX = targetCorner.x - p.homePlanet.x;
            let dirY = targetCorner.y - p.homePlanet.y;
            let len = Math.hypot(dirX, dirY) || 1;

            // Push out progressively further based on total scouts to mimic perimeter expansion
            let pushDist = 200 + (idleScouts.length * 50);
            s.targetX = p.homePlanet.x + (dirX / len) * pushDist;
            s.targetY = p.homePlanet.y + (dirY / len) * pushDist;
        });
    }

    // AI Priority 2: DEFENSE & OFFENSE (Fighters)
    if (p.units.fighters.length < enemy.units.fighters.length && p.energy >= 100) {
        // Defensive: Match opponent numbers
        p.energy -= 100;
        let tx = p.id === 0 ? p.homePlanet.x + 100 : p.homePlanet.x - 100;
        let ty = p.homePlanet.y;
        p.units.fighters.push({ x: p.homePlanet.x, y: p.homePlanet.y, path: [{ x: tx, y: ty }], pathIndex: 0, pathDir: 1, isLoop: false, health: 100, maxHealth: 100, cooldown: 0 });
    } else if (p.units.miners.length >= 2 && p.energy >= 200) {
        // Offensive: Economy is stable, push for the win
        p.energy -= 100;
        p.units.fighters.push({ x: p.homePlanet.x, y: p.homePlanet.y, path: [{ x: enemy.homePlanet.x, y: enemy.homePlanet.y }], pathIndex: 0, pathDir: 1, isLoop: false, health: 100, maxHealth: 100, cooldown: 0 });
    }

    // AI Priority 3: ECONOMY (Miners)
    // Scale miners dynamically based on total captured asteroids
    if (p.units.miners.length < activeCaptured.length * 3 && p.energy >= 25) {
        p.energy -= 25;
        p.units.miners.push({ x: p.homePlanet.x, y: p.homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });
    }
}
