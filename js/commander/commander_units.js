import { computeStationPositions, getTerritoryPolygon, getBorderIntersection, isPointInFan, canExpandStation, doPolygonsIntersect, pushRadialBorder, pullRadialBorder, createRadialBorder, createBorderFromStations, checkPointEnemyCollision } from './commander_math.js';

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
                    const enemy = players.find(ep => ep.id !== p.id);
                    onStationAdded(p, { x: ls.targetX, y: ls.targetY }, enemy);
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
        const shooter = players.find(p => p.id === pr.ownerId);

        // Check enemy fighters
        for (let f of enemy.units.fighters) {
            if (Math.hypot(f.x - pr.x, f.y - pr.y) <= 0.35) {
                f.health -= pr.damage;
                hit = true;
                break;
            }
        }

        // Check enemy miners
        if (!hit) {
            for (let m of enemy.units.miners) {
                if (Math.hypot(m.x - pr.x, m.y - pr.y) <= 0.35) {
                    m.health -= pr.damage;
                    hit = true;
                    break;
                }
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
                        onStationDestroyed(enemy, s, shooter);

                        // Visual feedback: station destruction explosion particles
                        if (particles) {
                            for (let k = 0; k < 20; k++) {
                                const ang = (k / 20) * Math.PI * 2;
                                const spd = 1.5 + Math.random() * 3.0;
                                particles.push({
                                    x: s.x,
                                    y: s.y,
                                    vx: Math.cos(ang) * spd,
                                    vy: Math.sin(ang) * spd,
                                    color: enemy.accentColor || enemy.color || '#ff4444',
                                    size: 3.5,
                                    life: 0.6,
                                    maxLife: 0.6
                                });
                            }
                        }
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
        p.units.miners = p.units.miners.filter(m => {
            if (m.health <= 0) {
                if (m.targetAsteroid) {
                    m.targetAsteroid.miners = Math.max(0, (m.targetAsteroid.miners || 1) - 1);
                }
                return false;
            }
            return true;
        });
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

// Clamps a coordinate to valid map boundaries ([0.5, 19.5] x [0.5, 14.5]) without middle-line restrictions
export function clampStationToSeam(pt, isP2 = false) {
    return {
        x: Math.max(0.5, Math.min(19.5, pt.x)),
        y: Math.max(0.5, Math.min(14.5, pt.y))
    };
}
export const clampStationToBounds = clampStationToSeam;

// Safety check: coordinates within map boundaries, not inside enemy territory, and maintain station clearance
export function isPositionSafe(cand, player, enemy = null) {
    if (cand.x < 0.5 || cand.x > 19.5 || cand.y < 0.5 || cand.y > 14.5) return false;
    if (!enemy) return true;

    if (enemy.borderDistances) {
        if (checkPointEnemyCollision(cand, enemy.homePlanet, enemy.borderDistances, enemy.stations)) return false;
    } else {
        const enemyStations = enemy.stations || [];
        const isEnemyP2 = enemy.id === 1;
        const enemyPoly = getTerritoryPolygon(enemy.homePlanet, enemyStations, isEnemyP2);
        if (isPointInFan(cand, enemyPoly)) return false;
    }

    const minStationDist = 1.35;
    const enemyStations = enemy.stations || [];
    for (let es of enemyStations) {
        const esX = es.targetX !== undefined ? es.targetX : es.x;
        const esY = es.targetY !== undefined ? es.targetY : es.y;
        if (Math.hypot(cand.x - esX, cand.y - esY) < minStationDist) {
            return false;
        }
    }
    return true;
}

// Safety check: candidate station set does not produce overlapping territory polygons with enemy
export function isPolygonSafe(testStations, player, enemy = null) {
    if (!enemy) return true;
    const isP2 = player.id === 1;
    const isEnemyP2 = enemy.id === 1;
    const proposedPoly = getTerritoryPolygon(player.homePlanet, player.borderDistances || testStations, isP2);
    const enemyPoly = getTerritoryPolygon(enemy.homePlanet, enemy.borderDistances || enemy.stations || [], isEnemyP2);
    return !doPolygonsIntersect(proposedPoly, enemyPoly);
}

// Pins a station to the frontier border curve at its current angle
export function pinStationToBorder(station, homePlanet, borderDistances, isP2 = false, enemy = null) {
    const hx = homePlanet.x;
    const hy = homePlanet.y;
    const curX = station.targetX !== undefined ? station.targetX : station.x;
    const curY = station.targetY !== undefined ? station.targetY : station.y;
    let ang = station.angle;
    if (ang === undefined || isNaN(ang)) {
        ang = Math.atan2(curY - hy, curX - hx);
    }
    let canonical = isP2 ? ang - Math.PI : ang;
    const t = (canonical - (-Math.PI * 0.5)) / (Math.PI * 0.5);
    const deg = Math.max(0, Math.min(90, Math.round(t * 90)));
    let r = borderDistances ? borderDistances[deg] : 3.8;

    let candX = Math.max(0.5, Math.min(19.5, Math.round((hx + r * Math.cos(ang)) * 1000) / 1000));
    let candY = Math.max(0.5, Math.min(14.5, Math.round((hy + r * Math.sin(ang)) * 1000) / 1000));

    if (enemy) {
        const dummyPlayer = { id: isP2 ? 1 : 0, homePlanet: { x: hx, y: hy } };
        while (r > 1.5 && !isPositionSafe({ x: candX, y: candY }, dummyPlayer, enemy)) {
            r -= 0.1;
            candX = Math.max(0.5, Math.min(19.5, Math.round((hx + r * Math.cos(ang)) * 1000) / 1000));
            candY = Math.max(0.5, Math.min(14.5, Math.round((hy + r * Math.sin(ang)) * 1000) / 1000));
        }
    }

    station.targetX = candX;
    station.targetY = candY;
    station.angle = ang;
    return station;
}

// Stations no longer have behavior tied to distance between them (no pairwise distance repulsion)
export function relaxStations(stations, isP2, enemy = null) {
    // No-op: stations maintain their positions along the border without pairwise distance repulsion
}

// Constant station launch distance from the border frontier (based on starting inter-station spacing along arc)
export const STATION_LAUNCH_DISTANCE = 2.0;

// Calculates where a newly launched station will push the frontier along angle without overlapping enemy territory
export function calculateLaunchTarget(player, angle, enemy = null) {
    const isP2 = player.id === 1;
    const hx = player.homePlanet.x;
    const hy = player.homePlanet.y;
    const borderSource = player.borderDistances || player.stations;
    const borderDist = getBorderIntersection(player.homePlanet, borderSource, isP2, angle);

    let effectiveEnemy = enemy;
    if (enemy && enemy.launchingStations && enemy.launchingStations.length > 0) {
        const plannedStations = [
            ...(enemy.stations || []),
            ...enemy.launchingStations.map(ls => ({ x: ls.targetX, y: ls.targetY, targetX: ls.targetX, targetY: ls.targetY, isPerimeter: true }))
        ];
        effectiveEnemy = { ...enemy, stations: plannedStations };
    }

    const angleOffsets = [0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.25, -0.25, 0.3, -0.3, 0.4, -0.4];
    for (let dAng of angleOffsets) {
        const testAng = angle + dAng;
        const cosA = Math.cos(testAng);
        const sinA = Math.sin(testAng);
        const bDist = getBorderIntersection(player.homePlanet, borderSource, isP2, testAng);
        const maxD = bDist + STATION_LAUNCH_DISTANCE;
        const minD = bDist;

        const candMax = {
            x: Math.max(0.5, Math.min(19.5, hx + cosA * maxD)),
            y: Math.max(0.5, Math.min(14.5, hy + sinA * maxD))
        };
        if (isPositionSafe(candMax, player, effectiveEnemy) && isPolygonSafe([...(player.stations || []), candMax], player, effectiveEnemy)) {
            return candMax;
        }

        let low = minD;
        let high = maxD;
        let bestSafe = null;
        for (let iter = 0; iter < 8; iter++) {
            const mid = (low + high) / 2;
            const cand = {
                x: Math.max(0.5, Math.min(19.5, hx + cosA * mid)),
                y: Math.max(0.5, Math.min(14.5, hy + sinA * mid))
            };
            if (isPositionSafe(cand, player, effectiveEnemy) && isPolygonSafe([...(player.stations || []), cand], player, effectiveEnemy)) {
                bestSafe = cand;
                low = mid;
            } else {
                high = mid;
            }
        }
        if (bestSafe) return bestSafe;
    }

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    return {
        x: Math.max(0.5, Math.min(19.5, hx + cosA * borderDist)),
        y: Math.max(0.5, Math.min(14.5, hy + sinA * borderDist))
    };
}

// Launches a newly constructed station along the trajectory line from the frontier border
export function launchStation(player, state = null) {
    if (!player.launchingStations) player.launchingStations = [];
    const isP2 = player.id === 1;
    const enemy = state && state.players ? state.players.find(p => p.id !== player.id) : (player.enemy || null);
    const launchAngle = player.launchAngle !== undefined ? player.launchAngle : (isP2 ? Math.PI * 0.75 : -Math.PI * 0.25);

    const borderSource = player.borderDistances || player.stations;
    const borderDist = getBorderIntersection(player.homePlanet, borderSource, isP2, launchAngle);
    const startX = Math.max(0.5, Math.min(19.5, player.homePlanet.x + Math.cos(launchAngle) * borderDist));
    const startY = Math.max(0.5, Math.min(14.5, player.homePlanet.y + Math.sin(launchAngle) * borderDist));

    const targetPos = calculateLaunchTarget(player, launchAngle, enemy);

    player.launchingStations.push({
        id: (isP2 ? 100 : 0) + player.stationCount,
        x: startX,
        y: startY,
        startX: startX,
        startY: startY,
        targetX: targetPos.x,
        targetY: targetPos.y,
        angle: launchAngle,
        progress: 0,
        speed: 1.5 // ~0.66s travel time
    });
}

// Handles physical addition of a new station: pushes frontier out and pulls existing stations
export function onStationAdded(player, impactPos, enemy = null) {
    const isP2 = player.id === 1;
    const hx = player.homePlanet.x;
    const hy = player.homePlanet.y;

    // Initialize borderDistances if not present
    if (!player.borderDistances) {
        player.borderDistances = createBorderFromStations(player.homePlanet, player.stations || [], isP2);
    }

    const launchAng = impactPos
        ? Math.atan2(impactPos.y - hy, impactPos.x - hx)
        : (player.launchAngle !== undefined ? player.launchAngle : (isP2 ? Math.PI * 0.75 : -Math.PI * 0.25));

    // Push radial border with whole-arc distributed growth and directional emphasis
    pushRadialBorder(
        player.homePlanet,
        player.borderDistances,
        launchAng,
        2.0,
        enemy ? enemy.homePlanet : null,
        enemy ? enemy.borderDistances : null,
        enemy ? enemy.stations : null
    );

    if (player.stations) {
        player.stations._borderDistances = player.borderDistances;
    }

    // Existing stations stay locked to the border, gliding outward with the expanding frontier
    if (player.stations) {
        player.stations.forEach(s => {
            pinStationToBorder(s, player.homePlanet, player.borderDistances, isP2, enemy);
        });
    } else {
        player.stations = [];
    }

    const newStation = {
        id: (isP2 ? 100 : 0) + player.stations.length,
        x: impactPos.x,
        y: impactPos.y,
        targetX: impactPos.x,
        targetY: impactPos.y,
        health: 250,
        maxHealth: 250,
        cooldown: 0,
        range: 2.5,
        isPerimeter: true,
        angle: launchAng
    };
    pinStationToBorder(newStation, player.homePlanet, player.borderDistances, isP2, enemy);
    newStation.x = newStation.targetX;
    newStation.y = newStation.targetY;
    player.stations.push(newStation);
    player.stationCount = player.stations.length;
    player.stations._borderDistances = player.borderDistances;
}

// Handles physical destruction of a station: remaining stations remain pinned to the pulled border
export function onStationDestroyed(player, destroyedStation, enemy = null) {
    const isP2 = player.id === 1;
    const hx = player.homePlanet.x;
    const hy = player.homePlanet.y;
    const deadX = destroyedStation.targetX !== undefined ? destroyedStation.targetX : destroyedStation.x;
    const deadY = destroyedStation.targetY !== undefined ? destroyedStation.targetY : destroyedStation.y;
    const deadAng = destroyedStation.angle !== undefined ? destroyedStation.angle : Math.atan2(deadY - hy, deadX - hx);

    // Pull radial border inward at destroyed station angle
    if (player.borderDistances) {
        pullRadialBorder(player.homePlanet, player.borderDistances, deadAng, 1.8);
        if (player.stations) {
            player.stations._borderDistances = player.borderDistances;
        }
    }

    player.stations = player.stations.filter(s => s !== destroyedStation);
    player.stationCount = Math.max(0, player.stations.length);
    if (player.stations && player.borderDistances) {
        player.stations._borderDistances = player.borderDistances;
    }

    // Remaining stations stay locked to their angle on the border, gliding inward with the frontier
    player.stations.forEach(s => {
        pinStationToBorder(s, player.homePlanet, player.borderDistances, isP2, enemy);
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
        if (player.borderDistances) {
            player.stations._borderDistances = player.borderDistances;
        }
        return;
    }
    while (player.stations.length < player.stationCount) {
        const defaultAngle = isP2 ? Math.PI * 0.75 : -Math.PI * 0.25;
        const target = spawnPos || calculateLaunchTarget(player, player.launchAngle !== undefined ? player.launchAngle : defaultAngle);
        onStationAdded(player, target);
    }
}
