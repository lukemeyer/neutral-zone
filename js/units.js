import { players, asteroids, projectiles } from './state.js';
import { doTerritoriesIntersect, isAsteroidInPolygon, isPointInTerritory } from './utils.js';
console.log('units.js loaded');

export function updateUnits(p, dt, currentHull, selectedFighters, drawingPath) {
    function applySteering(u, targetX, targetY, speed, p = null) {
        let dx = targetX - u.x;
        let dy = targetY - u.y;
        let dist = Math.hypot(dx, dy);

        if (dist <= 0.05) {
            u.x = targetX;
            u.y = targetY;
            return true; // arrived
        }

        let desiredHeading = Math.atan2(dy, dx);
        if (u.steerBias === undefined) u.steerBias = 0;

        let blocked = false;
        let arrivedByAdj = false;

        let myGx = Math.floor(u.x);
        let myGy = Math.floor(u.y);
        let tgx = Math.floor(targetX);
        let tgy = Math.floor(targetY);

        for (let d = 0.1; d <= 0.6; d += 0.1) {
            let cx = u.x + Math.cos(desiredHeading) * d;
            let cy = u.y + Math.sin(desiredHeading) * d;

            for (let pl of players) {
                if (targetX === pl.homePlanet.x && targetY === pl.homePlanet.y) continue;
                if (Math.hypot(cx - pl.homePlanet.x, cy - pl.homePlanet.y) < pl.homePlanet.radius + 0.05) {
                    blocked = true; break;
                }
            }
            if (blocked) break;

            for (let a of asteroids) {
                if (targetX === a.x && targetY === a.y) continue;
                if (Math.hypot(cx - a.x, cy - a.y) < a.radius + 0.05) {
                    blocked = true; break;
                }
            }
            if (blocked) break;

            let cgx = Math.floor(cx);
            let cgy = Math.floor(cy);
            if (cgx !== myGx || cgy !== myGy) {
                let occupied = false;
                for (let pl of players) {
                    for (let type of ['stations', 'fighters', 'miners']) {
                        for (let other of pl.units[type]) {
                            if (other === u) continue;
                            if (Math.floor(other.x) === cgx && Math.floor(other.y) === cgy) {
                                occupied = true; break;
                            }
                        }
                        if (occupied) break;
                    }
                    if (occupied) break;
                }
                if (occupied) {
                    if (cgx === tgx && cgy === tgy) arrivedByAdj = true;
                    else blocked = true;
                    break;
                }
            }
        }

        if (arrivedByAdj) return true; // Stop in adjacent space

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

        // Prevent Station from pushing territory into enemy territory
        if (p) {
            const enemyP = players.find(ep => ep.id !== p.id);
            if (doTerritoriesIntersect(enemyP, p, false, false)) {
                const tempX = u.x;
                const tempY = u.y;
                u.x = oldX;
                u.y = oldY;

                if (!doTerritoriesIntersect(enemyP, p, false, false)) {
                    // The movement CAUSED the intersection. Block it but DO NOT clear the target coordinates.
                    u.x = oldX;
                    u.y = oldY;
                    return true;
                }

                // Otherwise it was already intersecting, allow it. Bouncing will push it back cleaner globally.
                u.x = tempX;
                u.y = tempY;
            }
        }

        return false;
    }

    p.units.stations.forEach(s => {
        let currentSpeed = 0.8;
        if (!isPointInTerritory({ x: s.x, y: s.y }, p)) {
            currentSpeed = 0.4; // 50% slower outside territory
        }
        applySteering(s, s.targetX, s.targetY, currentSpeed, p);
    });

    p.units.fighters.forEach(f => {
        // Only skip movement if this specific fighter is selected AND we are currently drawing a path for them
        const isDrawingForThisFighter = drawingPath && selectedFighters && selectedFighters.includes(f);

        if (f.path && f.path.length > 0 && !isDrawingForThisFighter) {
            let targetPoint = null;

            if (f.pursuitTarget && f.pursuitTarget.health > 0) {
                let dtgt = Math.hypot(f.pursuitTarget.x - f.x, f.pursuitTarget.y - f.y);
                if (dtgt > 1.2) { // Dropped pursuit distance buffer
                    f.pursuitTarget = null;
                    targetPoint = f.path[f.pathIndex];
                } else {
                    targetPoint = { x: f.pursuitTarget.x, y: f.pursuitTarget.y };
                }
            } else {
                f.pursuitTarget = null;
                targetPoint = f.path[f.pathIndex];
            }

            if (!targetPoint) return;

            let dx = targetPoint.x - f.x;
            let dy = targetPoint.y - f.y;
            let dist = Math.hypot(dx, dy);

            let isFinal = f.path.length === 1 || (!f.isLoop && f.pathIndex === f.path.length - 1 && f.pathDir === 1);
            let stopDist = 0.1;

            if (isFinal) {
                const enemyP = players.find(ep => ep.id !== p.id);
                let distToPlanet = Math.hypot(enemyP.homePlanet.x - targetPoint.x, enemyP.homePlanet.y - targetPoint.y);
                if (distToPlanet < enemyP.homePlanet.radius + 0.2) {
                    stopDist = 0.9;
                } else {
                    stopDist = 0.2;
                }
            }

            if (f.pursuitTarget && Math.hypot(f.pursuitTarget.x - f.x, f.pursuitTarget.y - f.y) <= 0.5) {
                stopDist = 0.5;
            }

            if (dist < stopDist) {
                if (f.pursuitTarget) {
                    // Do nothing, just stay at range from the target
                } else if (f.path.length > 1) {
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
                let currentSpeed = 1.6;
                if (!isPointInTerritory({ x: f.x, y: f.y }, p)) {
                    currentSpeed = 0.8; // 50% slower outside territory
                }
                applySteering(f, targetPoint.x, targetPoint.y, currentSpeed);
            }
        }
    });

    // currentHull is removed; we query distance directly.

    p.units.miners.forEach(m => {
        if (m.payload === undefined) m.payload = 0;
        if (m.returning === undefined) m.returning = false;

        let currentMinerSpeed = 1.0;
        if (!isPointInTerritory({ x: m.x, y: m.y }, p)) {
            currentMinerSpeed = 0.5; // Miners are 50% slower outside territory
        }

        if (m.returning) {
            applySteering(m, p.homePlanet.x, p.homePlanet.y, currentMinerSpeed);
            if (Math.hypot(p.homePlanet.x - m.x, p.homePlanet.y - m.y) <= p.homePlanet.radius + 0.1) {
                p.energy += m.payload;
                m.payload = 0;
                m.returning = false;
            }
        } else if (!m.targetAsteroid) {
            let closest = null;
            let minDist = Infinity;

            asteroids.forEach(a => {
                if (a.resources > 0 && a.miners < 4 && isAsteroidInPolygon(a, p)) {
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
            if (!isAsteroidInPolygon(m.targetAsteroid, p) || m.targetAsteroid.resources <= 0) {
                // Drop the asteroid lock and recall home immediately
                m.targetAsteroid.miners = Math.max(0, m.targetAsteroid.miners - 1);
                m.targetAsteroid = null;
                m.returning = true;
                return; // skip the movement loop for this frame
            }
            let dist = Math.hypot(m.targetAsteroid.x - m.x, m.targetAsteroid.y - m.y);
            if (dist > 0.42) {
                applySteering(m, m.targetAsteroid.x, m.targetAsteroid.y, currentMinerSpeed);
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
    const allUnits = [...p.units.stations, ...p.units.fighters, ...p.units.miners];
    const allEnemyUnits = [...enemyP.units.stations, ...enemyP.units.fighters, ...enemyP.units.miners];
    const globalUnits = [...allUnits, ...allEnemyUnits];

    // Pre-calculate movement status for parking push logic
    const calcMoving = (u, ownerPlayer) => {
        if (u.maxHealth === 150) { // Fighter
            if (!u.path || u.path.length === 0) return false;
            let targetPoint = u.path[u.pathIndex];
            if (!targetPoint) return false;
            let isFinal = u.path.length === 1 || (!u.isLoop && u.pathIndex === u.path.length - 1 && u.pathDir === 1);
            let stopDist = 0.2;
            if (isFinal && Math.hypot(enemyP.homePlanet.x - targetPoint.x, enemyP.homePlanet.y - targetPoint.y) < enemyP.homePlanet.radius + 0.2) stopDist = 0.9;
            return Math.hypot(targetPoint.x - u.x, targetPoint.y - u.y) > stopDist;
        } else if (u.maxHealth === 200) { // Station
            return Math.hypot(u.targetX - u.x, u.targetY - u.y) > 0.1;
        } else if (u.maxHealth === 60) { // Miner
            if (u.returning) return Math.hypot(ownerPlayer.homePlanet.x - u.x, ownerPlayer.homePlanet.y - u.y) > ownerPlayer.homePlanet.radius + 0.1;
            if (u.targetAsteroid) return Math.hypot(u.targetAsteroid.x - u.x, u.targetAsteroid.y - u.y) > 0.4;
            return false;
        }
        return false;
    };

    allUnits.forEach(u => { u._moving = calcMoving(u, p); u._team = p.id; });
    allEnemyUnits.forEach(u => { u._moving = calcMoving(u, enemyP); u._team = enemyP.id; });

    // enemyHull check removed, do it inline
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

            if (dist > 0 && dist < 0.24) { // 12px = 0.24 grids
                let force = 1.2; // default force = 60px/sec => 1.2grids/sec

                if (u._moving && !other._moving) {
                    force = 0.1; // moving units barely get pushed by parked units
                } else if (!u._moving && other._moving) {
                    force = 4.0; // parked units yield heavily to moving units
                } else if (!u._moving && !other._moving) {
                    // Both arrived at their respective destinations.
                    // Only apply a tiny drift to prevent exact overlaps, avoiding violent jittering.
                    force = 0.1;
                }

                u.x += (dx / dist) * force * dt;
                u.y += (dy / dist) * force * dt;
            }
        });
    });

    // 4. Station Territory Bounce
    p.units.stations.forEach(s => {
        // Only violently bounce if this station is ACTIVELY moving and has successfully expanded 
        // Only violently bounce if this station is ACTIVELY moving.
        // If it is stationary it should just hold its ground (forming a convex dent over time as the borders wrap it).
        const isMoving = Math.hypot(s.targetX - s.x, s.targetY - s.y) > 0.04;

        if (isMoving && isPointInTerritory(s, enemyP)) {
            // Push station forcefully towards own home planet to escape
            let dx = p.homePlanet.x - s.x;
            let dy = p.homePlanet.y - s.y;
            let dist = Math.hypot(dx, dy) || 1;
            s.x += (dx / dist) * 4.0 * dt;
            s.y += (dy / dist) * 4.0 * dt;

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
            let minDist = 1.0; // Adjacent grid + tiny buffer (1.0 Chebyshev covers adjacency)

            // Check Enemy Planet
            let dPlanet = Math.hypot(enemyP.homePlanet.x - f.x, enemyP.homePlanet.y - f.y);
            if (dPlanet < minDist) { minDist = dPlanet; target = { type: 'planet', ref: enemyP.homePlanet }; }

            // Check Enemy Units
            ['fighters', 'stations', 'miners'].forEach(type => {
                enemyP.units[type].forEach(u => {
                    let d = Math.max(Math.abs(Math.floor(u.x) - Math.floor(f.x)), Math.abs(Math.floor(u.y) - Math.floor(f.y)));
                    if (d <= 1 && Math.hypot(u.x - f.x, u.y - f.y) < minDist) {
                        minDist = Math.hypot(u.x - f.x, u.y - f.y);
                        target = { type: 'unit', ref: u };
                    }
                });
            });

            if (target) {
                // Always pursue fighters if no active pursuit target
                if (!f.pursuitTarget && target.type === 'unit' && target.ref.maxHealth === 150) { // Only pursue fighters for now
                    f.pursuitTarget = target.ref;
                }

                projectiles.push({ x: f.x, y: f.y, target: target, damage: 10, speed: 6.0, ownerId: p.id, color: p.color });
                f.cooldown = 0.5; // Firerate

                // Track angle to face ANY target fired upon
                let targetY = target.type === 'planet' ? target.ref.y : target.ref.y;
                let targetX = target.type === 'planet' ? target.ref.x : target.ref.x;
                f.lastTargetAngle = Math.atan2(targetY - f.y, targetX - f.x) + Math.PI / 2;
            }
        }
    });

    // Stations attack only fighters
    p.units.stations.forEach(s => {
        const dTarget = Math.hypot(s.targetX - s.x, s.targetY - s.y);
        if (dTarget >= 0.04) return; // Currently moving, skip firing phase

        if (s.cooldown > 0) s.cooldown -= dt;
        if (s.cooldown <= 0) {
            let target = null;
            let minDist = 2.0; // Stations fire natively slightly further than 1 adj block

            enemyP.units.fighters.forEach(f => {
                let d = Math.max(Math.abs(Math.floor(f.x) - Math.floor(s.x)), Math.abs(Math.floor(f.y) - Math.floor(s.y)));
                if (d <= 1 && Math.hypot(f.x - s.x, f.y - s.y) < minDist) {
                    minDist = Math.hypot(f.x - s.x, f.y - s.y);
                    target = { type: 'unit', ref: f };
                }
            });

            if (target) {
                // Station deals less damage than Fighter (Fighter is 10, so Station is 5)
                projectiles.push({ x: s.x, y: s.y, target: target, damage: 5, speed: 8.0, ownerId: p.id, color: p.territoryColor });
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

        if (dist < 0.2) {
            proj.target.ref.health -= proj.damage;
            proj.target.ref.damageTime = 0.5; // Red pulse duration
            projectiles.splice(i, 1);
        } else {
            proj.x += (dx / dist) * proj.speed * dt;
            proj.y += (dy / dist) * proj.speed * dt;
        }
    }
}
