import { computeStationPositions, getTerritoryPolygon, getBorderIntersection, isPointInFan, canExpandStation } from './commander_math.js';

export const COMMANDER_COSTS = {
    station: 50,
    miner: 25,
    fighter: 75
};

export const COMMANDER_BUILD_TIMES = {
    station: 5.0,
    miner: 6.0,
    fighter: 8.0
};

// Queue expansion or unit (max 3 per unit type, enforces no overlapping territory)
export function queueBuild(player, type, enemyPlayer = null) {
    const cost = COMMANDER_COSTS[type];
    if (!cost) return false;

    // Maximum 3 units building/queued for each unit type
    const inProgress = player.buildCooldowns[type] > 0 ? 1 : 0;
    const queued = player.buildQueue.filter(b => b.type === type).length;
    const currentCount = inProgress + queued;
    if (currentCount >= 3) return false;

    if (player.energy >= cost) {
        player.energy -= cost;
        if (player.buildCooldowns[type] <= 0) {
            player.buildCooldowns[type] = COMMANDER_BUILD_TIMES[type];
        } else {
            player.buildQueue.push({ type });
        }
        return true;
    }
    return false;
}

export function updateCommanderUnits(state, dt) {
    const { players, asteroids, projectiles, particles } = state;

    // 1. Process build queues
    players.forEach(p => {
        ['station', 'miner', 'fighter'].forEach(type => {
            if (p.buildCooldowns[type] > 0) {
                p.buildCooldowns[type] -= dt;
                if (p.buildCooldowns[type] <= 0) {
                    p.buildCooldowns[type] = 0;
                    // Spawn built item
                    if (type === 'station') {
                        launchStation(p, state);
                    } else if (type === 'miner') {
                        p.units.miners.push({
                            id: p.id * 1000 + p.units.miners.length,
                            playerId: p.id,
                            x: p.homePlanet.x + (p.id === 0 ? 0.5 : -0.5),
                            y: p.homePlanet.y + (p.id === 0 ? -0.5 : 0.5),
                            payload: 0,
                            maxPayload: 10,
                            targetAsteroid: null,
                            returning: false,
                            health: 100,
                            maxHealth: 100
                        });
                    } else if (type === 'fighter') {
                        p.units.fighters.push({
                            id: p.id * 1000 + 50 + p.units.fighters.length,
                            playerId: p.id,
                            x: p.homePlanet.x + (p.id === 0 ? 0.8 : -0.8),
                            y: p.homePlanet.y + (p.id === 0 ? -0.8 : 0.8),
                            health: 150,
                            maxHealth: 150,
                            cooldown: 0,
                            speed: 2.2,
                            patrolT: Math.random()
                        });
                    }

                    // Continue queue if available
                    const nextIdx = p.buildQueue.findIndex(b => b.type === type);
                    if (nextIdx !== -1) {
                        p.buildQueue.splice(nextIdx, 1);
                        p.buildCooldowns[type] = COMMANDER_BUILD_TIMES[type];
                    }
                }
            } else {
                const nextIdx = p.buildQueue.findIndex(b => b.type === type);
                if (nextIdx !== -1) {
                    p.buildQueue.splice(nextIdx, 1);
                    p.buildCooldowns[type] = COMMANDER_BUILD_TIMES[type];
                }
            }
        });
    });

    // 1.5. Update Launching Stations in Flight (Along Steered Trajectory Line)
    players.forEach(p => {
        if (p.launchingStations && p.launchingStations.length > 0) {
            for (let i = p.launchingStations.length - 1; i >= 0; i--) {
                const ls = p.launchingStations[i];
                ls.progress += ls.speed * dt;
                const t = Math.min(1.0, ls.progress);
                const ease = 1 - Math.pow(1 - t, 3);
                ls.x = ls.startX + (ls.targetX - ls.startX) * ease;
                ls.y = ls.startY + (ls.targetY - ls.startY) * ease;

                // Glowing thruster trail
                if (particles && Math.random() < 0.85) {
                    particles.push({
                        x: ls.x,
                        y: ls.y,
                        vx: -Math.cos(ls.angle) * 2.8 + (Math.random() - 0.5) * 1.5,
                        vy: -Math.sin(ls.angle) * 2.8 + (Math.random() - 0.5) * 1.5,
                        color: p.accentColor,
                        size: 2.2,
                        life: 0.28,
                        maxLife: 0.28
                    });
                }

                if (ls.progress >= 1.0) {
                    // Station strikes the frontier!
                    p.launchingStations.splice(i, 1);
                    p.steeringAngle = ls.angle;
                    if (!p.launchHits) p.launchHits = [];
                    p.launchHits.push({ x: ls.targetX, y: ls.targetY, angle: ls.angle });

                    // Impact shockwave / ring explosion
                    if (particles) {
                        for (let k = 0; k < 16; k++) {
                            const ang = (k / 16) * Math.PI * 2;
                            const spd = 1.8 + Math.random() * 2.2;
                            particles.push({
                                x: ls.targetX,
                                y: ls.targetY,
                                vx: Math.cos(ang) * spd,
                                vy: Math.sin(ang) * spd,
                                color: p.accentColor,
                                size: 2.8,
                                life: 0.45,
                                maxLife: 0.45
                            });
                        }
                    }

                    // Impulse push and pull: new station pushes outward, pulling existing stations in a weighted way
                    onStationAdded(p, { x: ls.targetX, y: ls.targetY });
                }
            }
        }
    });

    // 2. Smoothly Glide Stations to their Target Radial Positions
    players.forEach(p => {
        p.stations.forEach(s => {
            if (s.targetX !== undefined && s.targetY !== undefined) {
                const lerpSpeed = 3.0 * dt;
                s.x += (s.targetX - s.x) * Math.min(1.0, lerpSpeed);
                s.y += (s.targetY - s.y) * Math.min(1.0, lerpSpeed);
            }
        });
    });

    // 3. Autonomous Miner Logistics (No micro-management)
    asteroids.forEach(a => { a.activeMiners = 0; });

    players.forEach(p => {
        const enemy = players.find(ep => ep.id !== p.id);
        const myPoly = getTerritoryPolygon(p.homePlanet, p.stations, p.id === 1);
        const enemyPoly = getTerritoryPolygon(enemy.homePlanet, enemy.stations, enemy.id === 1);

        // Find captured asteroids inside friendly territory (and NOT in enemy territory)
        const capturedAsteroids = asteroids.filter(a => {
            return a.resources > 0 && isPointInFan(a, myPoly) && !isPointInFan(a, enemyPoly);
        });

        p.units.miners.forEach(m => {
            const speed = 1.6;

            if (m.returning) {
                const dx = p.homePlanet.x - m.x;
                const dy = p.homePlanet.y - m.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= p.homePlanet.radius + 0.3) {
                    p.energy += m.payload;
                    m.payload = 0;
                    m.returning = false;
                    if (m.targetAsteroid) {
                        m.targetAsteroid.miners = Math.max(0, (m.targetAsteroid.miners || 1) - 1);
                        m.targetAsteroid = null;
                    }
                } else {
                    m.x += (dx / dist) * speed * dt;
                    m.y += (dy / dist) * speed * dt;
                }
            } else if (!m.targetAsteroid) {
                // Find nearest captured asteroid with space (< 3 assigned miners)
                let best = null;
                let minDist = Infinity;
                capturedAsteroids.forEach(a => {
                    const assigned = a.miners || 0;
                    if (assigned < 3) {
                        const d = Math.hypot(a.x - m.x, a.y - m.y);
                        if (d < minDist) {
                            minDist = d;
                            best = a;
                        }
                    }
                });

                if (best) {
                    m.targetAsteroid = best;
                    best.miners = (best.miners || 0) + 1;
                } else if (m.payload > 0) {
                    m.returning = true;
                }
            } else {
                // Flying to asteroid or mining
                const a = m.targetAsteroid;
                // Enforce territory protection: if asteroid lost to enemy or depleted
                if (!a || a.resources <= 0 || !isPointInFan(a, myPoly) || isPointInFan(a, enemyPoly)) {
                    if (a) a.miners = Math.max(0, (a.miners || 1) - 1);
                    m.targetAsteroid = null;
                    if (m.payload > 0) m.returning = true;
                    return;
                }

                const dx = a.x - m.x;
                const dy = a.y - m.y;
                const dist = Math.hypot(dx, dy);

                if (dist > 0.4) {
                    m.x += (dx / dist) * speed * dt;
                    m.y += (dy / dist) * speed * dt;
                } else {
                    // Miner arrived at asteroid.
                    // Enforce: max 3 miners actively mining an asteroid at once
                    if ((a.activeMiners || 0) < 3 && m.payload < m.maxPayload && a.resources > 0) {
                        a.activeMiners = (a.activeMiners || 0) + 1;

                        // Resource gathering speed cut in half: 5.0 units/sec (reduced from 10.0)
                        const GATHER_SPEED = 5.0;
                        const amount = Math.min(a.resources, GATHER_SPEED * dt, m.maxPayload - m.payload);
                        a.resources -= amount;
                        m.payload += amount;

                        if (Math.random() < 0.2) {
                            particles.push({
                                x: a.x + (Math.random() - 0.5) * 0.3,
                                y: a.y + (Math.random() - 0.5) * 0.3,
                                vx: (m.x - a.x) * 1.5,
                                vy: (m.y - a.y) * 1.5,
                                life: 0.35,
                                maxLife: 0.35,
                                color: '#3fb950',
                                size: 2.5
                            });
                        }

                        if (m.payload >= m.maxPayload || a.resources <= 0) {
                            m.returning = true;
                            a.miners = Math.max(0, (a.miners || 1) - 1);
                        }
                    } else if (m.payload >= m.maxPayload || a.resources <= 0) {
                        m.returning = true;
                        a.miners = Math.max(0, (a.miners || 1) - 1);
                    }
                }
            }
        });
    });

    // 3b. Asteroid Depletion & Disappearance (Asteroids disappear when resources reach 0)
    const depletedAsteroids = asteroids.filter(a => a.resources <= 0);
    if (depletedAsteroids.length > 0) {
        depletedAsteroids.forEach(da => {
            // Mineral dissolution burst
            for (let i = 0; i < 14; i++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = 0.4 + Math.random() * 1.8;
                particles.push({
                    x: da.x,
                    y: da.y,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd,
                    life: 0.6,
                    maxLife: 0.6,
                    color: '#8b949e',
                    size: 3.0
                });
            }

            // Detach any miners assigned to or targeting this asteroid
            players.forEach(p => {
                p.units.miners.forEach(m => {
                    if (m.targetAsteroid === da) {
                        m.targetAsteroid = null;
                        if (m.payload > 0) {
                            m.returning = true;
                        }
                    }
                });
            });
        });

        // Remove depleted asteroids from array in-place
        for (let i = asteroids.length - 1; i >= 0; i--) {
            if (asteroids[i].resources <= 0) {
                asteroids.splice(i, 1);
            }
        }
    }

    // 4. Fleet Stance Controller (Patrol / Defend / Attack)
    players.forEach(p => {
        const enemy = players.find(ep => ep.id !== p.id);
        const myPoly = getTerritoryPolygon(p.homePlanet, p.stations, p.id === 1);
        const perimeterStations = p.stations.filter(s => s.isPerimeter);
        const sortedPerimeter = [...perimeterStations].sort((a, b) => a.angle - b.angle);

        // When in attack mode, all fighters share the exact same target
        let sharedAttackTarget = null;
        if (p.stance === 'attack') {
            // Priority 1: Nearest enemy station to friendly home base
            if (enemy.stations.length > 0) {
                let bestStation = null;
                let minDist = Infinity;
                enemy.stations.forEach(es => {
                    const d = Math.hypot(es.x - p.homePlanet.x, es.y - p.homePlanet.y);
                    if (d < minDist) {
                        minDist = d;
                        bestStation = es;
                    }
                });
                sharedAttackTarget = bestStation;
            } else if (enemy.units.fighters.length > 0) {
                // Priority 2: Primary enemy fighter
                sharedAttackTarget = enemy.units.fighters[0];
            } else if (enemy.units.miners.length > 0) {
                // Priority 3: Primary enemy miner
                sharedAttackTarget = enemy.units.miners[0];
            } else {
                // Priority 4: Enemy Home Planet
                sharedAttackTarget = enemy.homePlanet;
            }
        }

        p.units.fighters.forEach((f, fIdx) => {
            f.cooldown = Math.max(0, f.cooldown - dt);

            let targetX = p.homePlanet.x;
            let targetY = p.homePlanet.y;
            let targetEntity = null;

            if (p.stance === 'patrol') {
                // Cruise along the perimeter frontier
                if (sortedPerimeter.length >= 2) {
                    const currentT = (typeof f.patrolT === 'number' && !isNaN(f.patrolT)) ? f.patrolT : 0;
                    f.patrolT = (currentT + 0.15 * dt) % 1.0;
                    const segmentCount = sortedPerimeter.length - 1;
                    const segIdx = Math.max(0, Math.min(segmentCount - 1, Math.floor(f.patrolT * segmentCount)));
                    const localT = Math.max(0, Math.min(1, (f.patrolT * segmentCount) - segIdx));

                    const pA = sortedPerimeter[segIdx];
                    const pB = sortedPerimeter[segIdx + 1];
                    if (pA && pB) {
                        targetX = pA.x + localT * (pB.x - pA.x);
                        targetY = pA.y + localT * (pB.y - pA.y);
                    } else if (pA) {
                        targetX = pA.x;
                        targetY = pA.y;
                    }
                } else if (sortedPerimeter.length === 1) {
                    targetX = sortedPerimeter[0].x;
                    targetY = sortedPerimeter[0].y;
                }

                // Intercept any enemy within 3.5 units of the frontier
                const nearbyThreat = enemy.units.fighters.find(ef => Math.hypot(ef.x - f.x, ef.y - f.y) <= 3.5) ||
                                     enemy.units.miners.find(em => Math.hypot(em.x - f.x, em.y - f.y) <= 3.5);
                if (nearbyThreat) {
                    targetX = nearbyThreat.x;
                    targetY = nearbyThreat.y;
                    targetEntity = nearbyThreat;
                }
            } else if (p.stance === 'defend') {
                // Check if any enemy engages a station or enters friendly territory
                const attackingStationThreat = enemy.units.fighters.find(ef => {
                    return p.stations.some(s => Math.hypot(ef.x - s.x, ef.y - s.y) <= 2.5) ||
                           Math.hypot(ef.x - p.homePlanet.x, ef.y - p.homePlanet.y) <= 3.5;
                });

                const territoryIntruder = enemy.units.fighters.find(ef => isPointInFan(ef, myPoly)) ||
                                          enemy.units.miners.find(em => isPointInFan(em, myPoly));

                const activeThreat = attackingStationThreat || territoryIntruder;

                if (activeThreat) {
                    targetX = activeThreat.x;
                    targetY = activeThreat.y;
                    targetEntity = activeThreat;
                } else {
                    // Hold defensive formation near HQ (escort arc facing toward center)
                    const baseAngle = (p.id === 0 ? -Math.PI * 0.25 : Math.PI * 0.75);
                    const spread = (fIdx - (p.units.fighters.length - 1) / 2) * 0.35;
                    const holdDist = 1.4;
                    targetX = p.homePlanet.x + holdDist * Math.cos(baseAngle + spread);
                    targetY = p.homePlanet.y + holdDist * Math.sin(baseAngle + spread);
                }
            } else if (p.stance === 'attack') {
                targetEntity = sharedAttackTarget;
                if (targetEntity) {
                    targetX = targetEntity.x;
                    targetY = targetEntity.y;
                }
            }

            // Move fighter towards target - stop when target is in weapons firing range (2.2)
            const dx = targetX - f.x;
            const dy = targetY - f.y;
            const dist = Math.hypot(dx, dy);
            const stopRange = targetEntity ? 2.2 : 0.3;

            if (dist > stopRange) {
                f.x += (dx / dist) * f.speed * dt;
                f.y += (dy / dist) * f.speed * dt;
            }

            // Friendly fighter separation so units do not occupy the exact same coordinates
            p.units.fighters.forEach((other, oIdx) => {
                if (fIdx !== oIdx) {
                    const sepDx = f.x - other.x;
                    const sepDy = f.y - other.y;
                    const sepDist = Math.hypot(sepDx, sepDy);
                    if (sepDist > 0 && sepDist < 0.65) {
                        const push = ((0.65 - sepDist) / 0.65) * 2.0 * dt;
                        f.x += (sepDx / sepDist) * push;
                        f.y += (sepDy / sepDist) * push;
                    }
                }
            });

            // Combat firing (range 2.8)
            if (f.cooldown <= 0) {
                if (targetEntity && Math.hypot(targetEntity.x - f.x, targetEntity.y - f.y) <= 2.8) {
                    f.cooldown = 0.65;
                    const angle = Math.atan2(targetEntity.y - f.y, targetEntity.x - f.x);
                    projectiles.push({
                        x: f.x,
                        y: f.y,
                        vx: Math.cos(angle) * 8.0,
                        vy: Math.sin(angle) * 8.0,
                        damage: 16,
                        ownerId: p.id,
                        life: 0.5
                    });
                }
            }
        });
    });

    // 5. Station Defense Turrets
    players.forEach(p => {
        const enemy = players.find(ep => ep.id !== p.id);
        p.stations.forEach(s => {
            s.cooldown = Math.max(0, s.cooldown - dt);
            if (s.cooldown <= 0) {
                const targetFighter = enemy.units.fighters.find(ef => Math.hypot(ef.x - s.x, ef.y - s.y) <= s.range);
                if (targetFighter) {
                    s.cooldown = 1.0;
                    const angle = Math.atan2(targetFighter.y - s.y, targetFighter.x - s.x);
                    projectiles.push({
                        x: s.x,
                        y: s.y,
                        vx: Math.cos(angle) * 8.5,
                        vy: Math.sin(angle) * 8.5,
                        damage: 22,
                        ownerId: p.id,
                        life: 0.45,
                        isTurretPulse: true
                    });
                }
            }
        });
    });

    // 6. Projectiles Simulation & Hits
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.life -= dt;

        let hit = false;
        const enemy = players.find(p => p.id !== pr.ownerId);

        // Check enemy fighters
        for (let f of enemy.units.fighters) {
            if (Math.hypot(f.x - pr.x, f.y - pr.y) <= 0.35) {
                f.health -= pr.damage;
                hit = true;
                break;
            }
        }

        // Check enemy stations
        if (!hit) {
            for (let s of enemy.stations) {
                if (Math.hypot(s.x - pr.x, s.y - pr.y) <= 0.45) {
                    s.health -= pr.damage;
                    hit = true;
                    if (s.health <= 0) {
                        // Station destroyed! Impulse gap-filling pull
                        onStationDestroyed(enemy, s);
                    }
                    break;
                }
            }
        }

        // Check enemy Home Planet
        if (!hit && Math.hypot(enemy.homePlanet.x - pr.x, enemy.homePlanet.y - pr.y) <= enemy.homePlanet.radius) {
            enemy.homePlanet.health -= pr.damage;
            hit = true;
        }

        if (hit || pr.life <= 0) {
            projectiles.splice(i, 1);
        }
    }

    // 7. Cleanup Dead Units
    players.forEach(p => {
        p.units.fighters = p.units.fighters.filter(f => f.health > 0);
    });

    // 8. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) particles.splice(i, 1);
    }
}

// Clamps a coordinate to the neutral diagonal treaty seam (y = 0.75 * x)
export function clampStationToSeam(pt, isP2) {
    let x = pt.x;
    let y = pt.y;
    const buffer = 0.25;
    if (!isP2) {
        // P1 must stay in y >= 0.75 * x + buffer
        const minY = 0.75 * x + buffer;
        if (y < minY) y = minY;
    } else {
        // P2 must stay in y <= 0.75 * x - buffer
        const maxY = 0.75 * x - buffer;
        if (y > maxY) y = maxY;
    }
    return {
        x: Math.max(0.5, Math.min(19.5, x)),
        y: Math.max(0.5, Math.min(14.5, y))
    };
}

// Calculates where a newly launched station will push the frontier along angle
export function calculateLaunchTarget(player, angle) {
    const isP2 = player.id === 1;
    const hx = player.homePlanet.x;
    const hy = player.homePlanet.y;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const borderDist = getBorderIntersection(player.homePlanet, player.stations, isP2, angle);
    const targetDist = borderDist + 0.5;
    const rawX = hx + cosA * targetDist;
    const rawY = hy + sinA * targetDist;

    return clampStationToSeam({ x: rawX, y: rawY }, isP2);
}

// Launches a newly constructed station along the HQ trajectory line
export function launchStation(player, state = null) {
    if (!player.launchingStations) player.launchingStations = [];
    const isP2 = player.id === 1;
    const launchAngle = player.launchAngle !== undefined ? player.launchAngle : (isP2 ? Math.PI * 0.75 : -Math.PI * 0.25);

    const targetPos = calculateLaunchTarget(player, launchAngle);

    player.launchingStations.push({
        id: (isP2 ? 100 : 0) + player.stationCount,
        x: player.homePlanet.x,
        y: player.homePlanet.y,
        startX: player.homePlanet.x,
        startY: player.homePlanet.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        angle: launchAngle,
        progress: 0,
        speed: 1.5 // ~0.66s travel time
    });
}

// Handles physical addition of a new station: pushes frontier out and pulls existing stations
export function onStationAdded(player, impactPos) {
    const isP2 = player.id === 1;
    const cx = isP2 ? 20 : 0;
    const cy = isP2 ? 0 : 15;

    const clampedNewPos = clampStationToSeam(impactPos, isP2);

    // Pull existing stations in a weighted way: closer stations move more, farther stations move less
    const pullRadius = 9.0;
    const maxDisplacement = 0.50;

    if (player.stations) {
        player.stations.forEach(s => {
            const curX = s.targetX !== undefined ? s.targetX : s.x;
            const curY = s.targetY !== undefined ? s.targetY : s.y;
            const d = Math.hypot(clampedNewPos.x - curX, clampedNewPos.y - curY);
            if (d < pullRadius && d > 0.01) {
                const w = Math.pow(1 - d / pullRadius, 2);
                const moveDist = maxDisplacement * w;

                const dx = (clampedNewPos.x - curX) / d;
                const dy = (clampedNewPos.y - curY) / d;

                let nx = curX + dx * moveDist;
                let ny = curY + dy * moveDist;

                const clamped = clampStationToSeam({ x: nx, y: ny }, isP2);
                s.targetX = Math.round(clamped.x * 1000) / 1000;
                s.targetY = Math.round(clamped.y * 1000) / 1000;
                s.angle = Math.atan2(s.targetY - cy, s.targetX - cx);
            }
        });
    } else {
        player.stations = [];
    }

    const newStation = {
        id: (isP2 ? 100 : 0) + player.stations.length,
        x: clampedNewPos.x,
        y: clampedNewPos.y,
        targetX: Math.round(clampedNewPos.x * 1000) / 1000,
        targetY: Math.round(clampedNewPos.y * 1000) / 1000,
        health: 250,
        maxHealth: 250,
        cooldown: 0,
        range: 2.5,
        isPerimeter: true,
        angle: Math.atan2(clampedNewPos.y - cy, clampedNewPos.x - cx)
    };
    player.stations.push(newStation);
    player.stationCount = player.stations.length;
}

// Handles physical destruction of a station: remaining stations pull in to fill the gap
export function onStationDestroyed(player, destroyedStation) {
    const isP2 = player.id === 1;
    const cx = isP2 ? 20 : 0;
    const cy = isP2 ? 0 : 15;
    const deadX = destroyedStation.targetX !== undefined ? destroyedStation.targetX : destroyedStation.x;
    const deadY = destroyedStation.targetY !== undefined ? destroyedStation.targetY : destroyedStation.y;

    player.stations = player.stations.filter(s => s !== destroyedStation);
    player.stationCount = Math.max(0, player.stations.length);

    // Remaining stations move in a weighted way to fill the gap: closer stations move more, farther stations move less
    const fillRadius = 8.0;
    const maxFillMove = 0.50;

    player.stations.forEach(s => {
        const curX = s.targetX !== undefined ? s.targetX : s.x;
        const curY = s.targetY !== undefined ? s.targetY : s.y;
        const d = Math.hypot(deadX - curX, deadY - curY);
        if (d < fillRadius && d > 0.01) {
            const w = Math.pow(1 - d / fillRadius, 2);
            const moveDist = maxFillMove * w;

            const dx = (deadX - curX) / d;
            const dy = (deadY - curY) / d;

            let nx = curX + dx * moveDist;
            let ny = curY + dy * moveDist;

            const clamped = clampStationToSeam({ x: nx, y: ny }, isP2);
            s.targetX = Math.round(clamped.x * 1000) / 1000;
            s.targetY = Math.round(clamped.y * 1000) / 1000;
            s.angle = Math.atan2(s.targetY - cy, s.targetX - cx);
        }
    });
}

// Recalculates or grows a player's stations without modifying settled positions during aiming
export function updateStationLayout(player, spawnPos = null) {
    const isP2 = player.id === 1;
    if (!player.stations || player.stations.length === 0) {
        const defaultPositions = computeStationPositions(player.homePlanet, player.stationCount, isP2, player.launchAngle);
        player.stations = defaultPositions.map((pos, idx) => ({
            id: (isP2 ? 100 : 0) + idx,
            x: pos.x,
            y: pos.y,
            targetX: pos.x,
            targetY: pos.y,
            health: 250,
            maxHealth: 250,
            cooldown: 0,
            range: 2.5,
            isPerimeter: pos.isPerimeter,
            angle: pos.angle
        }));
        return;
    }
    while (player.stations.length < player.stationCount) {
        const defaultAngle = isP2 ? Math.PI * 0.75 : -Math.PI * 0.25;
        const target = spawnPos || calculateLaunchTarget(player, player.launchAngle !== undefined ? player.launchAngle : defaultAngle);
        onStationAdded(player, target);
    }
}
