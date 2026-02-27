import { players, asteroids, projectiles, state } from './state.js';
import { pointInPolygon } from './utils.js';
console.log('units.js loaded');

export function updateUnits(p, dt, currentHull, selectedFighters, drawingPath) {
    p.units.scouts.forEach(s => {
        let dx = s.targetX - s.x;
        let dy = s.targetY - s.y;
        let dist = Math.hypot(dx, dy);
        if (dist > 2) {
            s.x += (dx / dist) * 40 * dt;
            s.y += (dy / dist) * 40 * dt;
        } else {
            s.x = s.targetX;
            s.y = s.targetY;
        }

        // Anti-overlap Repulsion
        p.units.scouts.forEach(other => {
            if (s === other) return;
            let sepDist = Math.hypot(s.x - other.x, s.y - other.y);
            if (sepDist > 0 && sepDist < 40) { // Push apart if closer than 40px
                s.x += ((s.x - other.x) / sepDist) * 30 * dt;
                s.y += ((s.y - other.y) / sepDist) * 30 * dt;
            }
        });
    });

    p.units.fighters.forEach(f => {
        // Only skip movement if this specific fighter is selected AND we are currently drawing a path for them
        const isDrawingForThisFighter = drawingPath && selectedFighters && selectedFighters.includes(f);

        if (f.path && f.path.length > 0 && !isDrawingForThisFighter) {
            let targetPoint = f.path[f.pathIndex];
            if (!targetPoint) return; // safety check

            let dx = targetPoint.x - f.x;
            let dy = targetPoint.y - f.y;
            let dist = Math.hypot(dx, dy);

            if (dist < 5) {
                if (f.path.length > 1) {
                    f.pathIndex += f.pathDir;
                    if (f.pathIndex >= f.path.length || f.pathIndex < 0) {
                        if (f.isLoop) {
                            f.pathIndex = 0;
                        } else {
                            f.pathDir *= -1;
                            f.pathIndex += f.pathDir * 2;
                        }
                    }
                }
            } else {
                f.x += (dx / dist) * 80 * dt;
                f.y += (dy / dist) * 80 * dt;
            }
        }

        // Anti-overlap Repulsion (Formation)
        p.units.fighters.forEach(other => {
            if (f === other) return;
            let sepDist = Math.hypot(f.x - other.x, f.y - other.y);
            if (sepDist > 0 && sepDist < 30) { // Push apart if closer than 30px
                f.x += ((f.x - other.x) / sepDist) * 80 * dt;
                f.y += ((f.y - other.y) / sepDist) * 80 * dt;
            }
        });
    });

    p.units.miners.forEach(m => {
        if (m.payload === undefined) m.payload = 0;
        if (m.returning === undefined) m.returning = false;

        if (m.returning) {
            let dx = p.homePlanet.x - m.x;
            let dy = p.homePlanet.y - m.y;
            let dist = Math.hypot(dx, dy);
            if (dist > p.homePlanet.radius) {
                m.x += (dx / dist) * 50 * dt;
                m.y += (dy / dist) * 50 * dt;
            } else {
                p.energy += m.payload;
                m.payload = 0;
                m.returning = false;
            }
        } else if (!m.targetAsteroid || m.targetAsteroid.resources <= 0) {
            if (m.targetAsteroid) {
                m.targetAsteroid.miners = Math.max(0, m.targetAsteroid.miners - 1);
                m.targetAsteroid = null;
            }

            let closest = null;
            let minDist = Infinity;
            asteroids.forEach(a => {
                if (a.resources > 0 && a.miners < 3 && pointInPolygon(a, currentHull)) {
                    let d = Math.hypot(a.x - m.x, a.y - m.y);
                    if (d < minDist) { minDist = d; closest = a; }
                }
            });

            if (closest) {
                m.targetAsteroid = closest;
                closest.miners++;
            } else if (m.payload > 0) {
                m.returning = true;
            }
        } else {
            let dx = m.targetAsteroid.x - m.x;
            let dy = m.targetAsteroid.y - m.y;
            let dist = Math.hypot(dx, dy);
            if (dist > 20) {
                m.x += (dx / dist) * 50 * dt;
                m.y += (dy / dist) * 50 * dt;
            } else {
                // Mining
                let amount = Math.min(m.targetAsteroid.resources, 10 * dt);
                m.targetAsteroid.resources -= amount;
                m.payload += amount;
                if (m.payload >= 25) {
                    m.payload = 25;
                    m.returning = true;
                    m.targetAsteroid.miners = Math.max(0, m.targetAsteroid.miners - 1);
                    m.targetAsteroid = null;
                }
            }
        }
    });

    // Combat Logic
    const enemyP = players.find(ep => ep.id !== p.id);

    // Fighters attack anything
    p.units.fighters.forEach(f => {
        if (f.cooldown > 0) f.cooldown -= dt;
        if (f.cooldown <= 0) {
            let target = null;
            let minDist = 200; // Fighter Range

            // Check Enemy Planet
            let dPlanet = Math.hypot(enemyP.homePlanet.x - f.x, enemyP.homePlanet.y - f.y);
            if (dPlanet < minDist) { minDist = dPlanet; target = { type: 'planet', ref: enemyP.homePlanet }; }

            // Check Enemy Units
            ['fighters', 'scouts', 'miners'].forEach(type => {
                enemyP.units[type].forEach(u => {
                    let d = Math.hypot(u.x - f.x, u.y - f.y);
                    if (d < minDist) { minDist = d; target = { type: 'unit', ref: u }; }
                });
            });

            if (target) {
                projectiles.push({ x: f.x, y: f.y, target: target, damage: 10, speed: 300, ownerId: p.id, color: p.color });
                f.cooldown = 0.5; // Firerate
            }
        }
    });

    // Scouts attack only fighters
    p.units.scouts.forEach(s => {
        if (s.cooldown > 0) s.cooldown -= dt;
        if (s.cooldown <= 0) {
            let target = null;
            let minDist = 150; // Scout defensive range

            enemyP.units.fighters.forEach(f => {
                let d = Math.hypot(f.x - s.x, f.y - s.y);
                if (d < minDist) { minDist = d; target = { type: 'unit', ref: f }; }
            });

            if (target) {
                projectiles.push({ x: s.x, y: s.y, target: target, damage: 5, speed: 400, ownerId: p.id, color: p.territoryColor });
                s.cooldown = 0.3; // Firerate
            }
        }
    });
}

export function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        let tx = proj.target.type === 'planet' ? proj.target.ref.x : proj.target.ref.x;
        let ty = proj.target.type === 'planet' ? proj.target.ref.y : proj.target.ref.y;
        let dx = tx - proj.x;
        let dy = ty - proj.y;
        let dist = Math.hypot(dx, dy);

        if (dist < 10) {
            proj.target.ref.health -= proj.damage;
            projectiles.splice(i, 1);
        } else {
            proj.x += (dx / dist) * proj.speed * dt;
            proj.y += (dy / dist) * proj.speed * dt;
        }
    }
}
