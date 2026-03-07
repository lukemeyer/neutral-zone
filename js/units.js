import { players, asteroids, projectiles } from './state.js';
import { pointInPolygon, getPlayerTerritoryHull, doPolygonsIntersect, isAsteroidInPolygon } from './utils.js';
console.log('units.js loaded');

export function updateUnits(p, dt, currentHull, selectedFighters, drawingPath) {
    function applySteering(u, targetX, targetY, speed, p = null) {
        let dx = targetX - u.x;
        let dy = targetY - u.y;
        let dist = Math.hypot(dx, dy);

        if (dist <= 2) {
            u.x = targetX;
            u.y = targetY;
            return true; // arrived
        }

        let desiredHeading = Math.atan2(dy, dx);
        if (u.steerBias === undefined) u.steerBias = 0;

        let blocked = false;
        for (let d = 5; d <= 30; d += 5) {
            let cx = u.x + Math.cos(desiredHeading) * d;
            let cy = u.y + Math.sin(desiredHeading) * d;

            for (let pl of players) {
                // Ignore destination planet to prevent orbiting it during docking
                if (targetX === pl.homePlanet.x && targetY === pl.homePlanet.y) continue;
                if (Math.hypot(cx - pl.homePlanet.x, cy - pl.homePlanet.y) < pl.homePlanet.radius + 5) {
                    blocked = true; break;
                }
            }
            if (blocked) break;

            for (let a of asteroids) {
                // Ignore destination asteroid to prevent orbit during approach
                if (targetX === a.x && targetY === a.y) continue;
                if (Math.hypot(cx - a.x, cy - a.y) < a.radius + 5) {
                    blocked = true; break;
                }
            }
            if (blocked) break;
        }

        if (blocked) {
            if (u.steerBias === 0) u.steerBias = Math.random() < 0.5 ? 1 : -1;
            // Add a ~60 degree deflection to slide off the obstacle
            desiredHeading += u.steerBias * 1.0;
        } else {
            u.steerBias = 0;
        }

        let moveDist = blocked ? speed * dt : Math.min(speed * dt, dist);

        let oldX = u.x;
        let oldY = u.y;

        u.x += Math.cos(desiredHeading) * moveDist;
        u.y += Math.sin(desiredHeading) * moveDist;

        // Prevent Scout from pushing territory into enemy territory
        if (p) {
            const enemyP = players.find(ep => ep.id !== p.id);
            const enemyHull = getPlayerTerritoryHull(enemyP, players, false);
            if (enemyHull.length > 2) {
                const proposedHull = getPlayerTerritoryHull(p, players, false);
                if (doPolygonsIntersect(proposedHull, enemyHull)) {
                    // Check if they were already intersecting before this movement
                    const tempX = u.x;
                    const tempY = u.y;
                    u.x = oldX;
                    u.y = oldY;
                    const oldHull = getPlayerTerritoryHull(p, players, false);

                    if (!doPolygonsIntersect(oldHull, enemyHull)) {
                        // The movement CAUSED the intersection. Block it but DO NOT clear the target coordinates.
                        // By leaving u.targetX untouched, the scout will keep marching "against" the wall until:
                        // 1. The wall moves naturally, opening a path.
                        // 2. The AI's actuallyMoving watcher realizes the scout hasn't progressed in 1 second and re-assigns it.
                        u.x = oldX;
                        u.y = oldY;
                        return true;
                    }

                    // Otherwise it was already intersecting, allow it. Bouncing will push it back cleaner globally.
                    u.x = tempX;
                    u.y = tempY;
                }
            }
        }

        return false;
    }

    p.units.scouts.forEach(s => {
        applySteering(s, s.targetX, s.targetY, 40, p);
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

            // Determine arrival distance based on target
            let isFinal = f.path.length === 1 || (!f.isLoop && f.pathIndex === f.path.length - 1 && f.pathDir === 1);
            let stopDist = 5;

            if (isFinal) {
                const enemyP = players.find(ep => ep.id !== p.id);
                // If the target point is on/inside the enemy planet, stop at firing range (50)
                let distToPlanet = Math.hypot(enemyP.homePlanet.x - targetPoint.x, enemyP.homePlanet.y - targetPoint.y);
                if (distToPlanet < enemyP.homePlanet.radius + 10) {
                    stopDist = 45; // Just under max firing range to ensure it can shoot
                } else {
                    stopDist = 10; // Slightly larger stop dist for generic waypoints to help clumping
                }
            }

            if (dist < stopDist) {
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
                let currentSpeed = 80;
                if (!pointInPolygon({ x: f.x, y: f.y }, currentHull)) {
                    currentSpeed = 40; // 50% slower outside territory
                }
                applySteering(f, targetPoint.x, targetPoint.y, currentSpeed);
            }
        }
    });

    // Determine Current Territory Polygon for this player
    currentHull = getPlayerTerritoryHull(p, players, false);

    p.units.miners.forEach(m => {
        if (m.payload === undefined) m.payload = 0;
        if (m.returning === undefined) m.returning = false;

        if (m.returning) {
            applySteering(m, p.homePlanet.x, p.homePlanet.y, 50);
            if (Math.hypot(p.homePlanet.x - m.x, p.homePlanet.y - m.y) <= p.homePlanet.radius + 5) {
                p.energy += m.payload;
                m.payload = 0;
                m.returning = false;
            }
        } else if (!m.targetAsteroid) {
            let closest = null;
            let minDist = Infinity;

            asteroids.forEach(a => {
                if (a.resources > 0 && a.miners < 4 && isAsteroidInPolygon(a, currentHull)) {
                    let dx = m.x - a.x;
                    let dy = m.y - a.y;
                    let d = Math.hypot(dx, dy);
                    if (d < minDist) { minDist = d; closest = a; }
                }
            });

            if (closest) {
                m.targetAsteroid = closest;
                closest.miners++;
            } else if (m.payload > 0) {
                m.returning = true; // No asteroids, go home with currently gathered resources
            } else {
                // If NO captured asteroids exist and payload is 0, recall the miner to the home planet.
                // This prevents them from wandering endlessly.
                m.returning = true;
            }
        } else {
            // Strictly enforce territory checking: if the asteroid is no longer captured OR depleted
            if (!isAsteroidInPolygon(m.targetAsteroid, currentHull) || m.targetAsteroid.resources <= 0) {
                // Drop the asteroid lock and recall home immediately
                m.targetAsteroid.miners = Math.max(0, m.targetAsteroid.miners - 1);
                m.targetAsteroid = null;
                m.returning = true;
                return; // skip the movement loop for this frame
            }
            let dist = Math.hypot(m.targetAsteroid.x - m.x, m.targetAsteroid.y - m.y);
            if (dist > 20) {
                applySteering(m, m.targetAsteroid.x, m.targetAsteroid.y, 50);
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

    // Global Physics & Collisions
    const enemyP = players.find(ep => ep.id !== p.id);
    const allUnits = [...p.units.scouts, ...p.units.fighters, ...p.units.miners];
    const allEnemyUnits = [...enemyP.units.scouts, ...enemyP.units.fighters, ...enemyP.units.miners];
    const globalUnits = [...allUnits, ...allEnemyUnits];

    // Pre-calculate movement status for parking push logic
    const calcMoving = (u, ownerPlayer) => {
        if (u.maxHealth === 150) { // Fighter
            if (!u.path || u.path.length === 0) return false;
            let targetPoint = u.path[u.pathIndex];
            if (!targetPoint) return false;
            let isFinal = u.path.length === 1 || (!u.isLoop && u.pathIndex === u.path.length - 1 && u.pathDir === 1);
            let stopDist = 10;
            if (isFinal && Math.hypot(enemyP.homePlanet.x - targetPoint.x, enemyP.homePlanet.y - targetPoint.y) < enemyP.homePlanet.radius + 10) stopDist = 45;
            return Math.hypot(targetPoint.x - u.x, targetPoint.y - u.y) > stopDist;
        } else if (u.maxHealth === 200) { // Scout
            return Math.hypot(u.targetX - u.x, u.targetY - u.y) > 5;
        } else if (u.maxHealth === 20) { // Miner
            if (u.returning) return Math.hypot(ownerPlayer.homePlanet.x - u.x, ownerPlayer.homePlanet.y - u.y) > ownerPlayer.homePlanet.radius + 5;
            if (u.targetAsteroid) return Math.hypot(u.targetAsteroid.x - u.x, u.targetAsteroid.y - u.y) > 20;
            return false;
        }
        return false;
    };

    allUnits.forEach(u => { u._moving = calcMoving(u, p); u._team = p.id; });
    allEnemyUnits.forEach(u => { u._moving = calcMoving(u, enemyP); u._team = enemyP.id; });

    // Territory definition for bouncing
    const enemyHull = getPlayerTerritoryHull(enemyP, players, false);

    allUnits.forEach(u => {
        // 1. Unit vs Unit Repulsion (Radius 12px)
        globalUnits.forEach(other => {
            if (u === other) return;

            // Prevent same-side fighters on the same path/team from colliding
            if (u.maxHealth === 150 && other.maxHealth === 150 && u._team === other._team) {
                return; // skip collision entirely for same-team fighters
            }

            let dx = u.x - other.x;
            let dy = u.y - other.y;
            let dist = Math.hypot(dx, dy);

            if (dist > 0 && dist < 12) {
                let force = 60; // default force

                if (u._moving && !other._moving) {
                    force = 5; // moving units barely get pushed by parked units
                } else if (!u._moving && other._moving) {
                    force = 200; // parked units yield heavily to moving units
                } else if (!u._moving && !other._moving) {
                    force = 20; // parked units gently clump without violent vibration
                }

                u.x += (dx / dist) * force * dt;
                u.y += (dy / dist) * force * dt;
            }
        });
    });

    // 4. Scout Territory Bounce
    p.units.scouts.forEach(s => {
        // Only violently bounce if this scout is ACTIVELY moving and has successfully expanded 
        // Only violently bounce if this scout is ACTIVELY moving.
        // If it is stationary it should just hold its ground (forming a convex dent over time as the borders wrap it).
        const isMoving = Math.hypot(s.targetX - s.x, s.targetY - s.y) > 2;

        if (isMoving && enemyHull.length > 2 && pointInPolygon(s, enemyHull)) {
            // Push scout forcefully towards own home planet to escape
            let dx = p.homePlanet.x - s.x;
            let dy = p.homePlanet.y - s.y;
            let dist = Math.hypot(dx, dy) || 1;
            s.x += (dx / dist) * 200 * dt;
            s.y += (dy / dist) * 200 * dt;

            // Stop its forward movement 
            s.targetX = s.x;
            s.targetY = s.y;
        }
    });

    // Combat Logic
    // Fighters attack anything
    p.units.fighters.forEach(f => {
        if (f.cooldown > 0) f.cooldown -= dt;
        if (f.cooldown <= 0) {
            let target = null;
            let minDist = 50; // Fighter Range (matched to 50% of old scout range)

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
        // Stationary Check: Scouts cannot fire while their movement vector implies they are traveling.
        const dTarget = Math.hypot(s.targetX - s.x, s.targetY - s.y);
        if (dTarget >= 2) return; // Currently moving, skip firing phase

        if (s.cooldown > 0) s.cooldown -= dt;
        if (s.cooldown <= 0) {
            let target = null;
            let minDist = 50; // Decreased Scout defensive firing range (now 50% of original 100)

            enemyP.units.fighters.forEach(f => {
                let d = Math.hypot(f.x - s.x, f.y - s.y);
                if (d < minDist) { minDist = d; target = { type: 'unit', ref: f }; }
            });

            if (target) {
                // Scout deals less damage than Fighter (Fighter is 10, so Scout is 5)
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
            proj.target.ref.damageTime = 0.5; // Red pulse duration
            projectiles.splice(i, 1);
        } else {
            proj.x += (dx / dist) * proj.speed * dt;
            proj.y += (dy / dist) * proj.speed * dt;
        }
    }
}
