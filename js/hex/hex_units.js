// Unit Management, Hangars, and Combat System for Neutral Zone: Hex Variant

export const COSTS = {
    stationRelay: 35,
    stationTurret: 45, // Upgrade or direct build
    miner: 30,
    fighter: 75
};

export const BUILD_TIMES = {
    miner: 6,
    fighter: 9
};

export function updateUnits(state, dt) {
    const { grid, players, projectiles, particles } = state;

    // 1. Process build queues for each player
    players.forEach(p => {
        ['miner', 'fighter'].forEach(type => {
            if (p.buildCooldowns[type] > 0) {
                p.buildCooldowns[type] -= dt;
                if (p.buildCooldowns[type] <= 0) {
                    p.buildCooldowns[type] = 0;
                    // Spawn unit directly into its designated hangar!
                    if (type === 'miner') {
                        const m = {
                            id: p.id * 1000 + p.units.miners.length,
                            playerId: p.id,
                            state: 'docked',
                            x: p.hangars.miner.center.x,
                            y: p.hangars.miner.center.y,
                            payload: 0,
                            maxPayload: 25,
                            targetAsteroid: null,
                            health: 100,
                            maxHealth: 100
                        };
                        p.units.miners.push(m);
                        p.hangars.miner.dockedUnits.push(m);
                    } else if (type === 'fighter') {
                        const f = {
                            id: p.id * 1000 + 50 + p.units.fighters.length,
                            playerId: p.id,
                            state: 'docked',
                            x: p.hangars.fighter.center.x,
                            y: p.hangars.fighter.center.y,
                            health: 150,
                            maxHealth: 150,
                            cooldown: 0,
                            path: null,
                            pathIndex: 0,
                            speed: 1.8
                        };
                        p.units.fighters.push(f);
                        p.hangars.fighter.dockedUnits.push(f);
                    }

                    // Check if more in buildQueue
                    const nextIdx = p.buildQueue.findIndex(b => b.type === type);
                    if (nextIdx !== -1) {
                        p.buildQueue.splice(nextIdx, 1);
                        p.buildCooldowns[type] = BUILD_TIMES[type];
                    }
                }
            } else {
                const nextIdx = p.buildQueue.findIndex(b => b.type === type);
                if (nextIdx !== -1) {
                    p.buildQueue.splice(nextIdx, 1);
                    p.buildCooldowns[type] = BUILD_TIMES[type];
                }
            }
        });
    });

    // 2. Miner Hangar Autonomous Dispatching
    players.forEach(p => {
        // Find captured asteroid cells owned by this player
        const capturedAsteroidCells = grid.cells.filter(c => c.type === 'asteroid' && c.owner === p.id && c.asteroid && c.asteroid.resources > 0);

        // If there are docked miners in the hangar, launch them towards asteroids with open capacity (< 3 miners)
        for (let cell of capturedAsteroidCells) {
            const ast = cell.asteroid;
            while (ast.miners < 3 && p.hangars.miner.dockedUnits.length > 0) {
                const miner = p.hangars.miner.dockedUnits.shift();
                miner.state = 'launching';
                miner.targetAsteroid = ast;
                miner.x = p.hangars.miner.center.x;
                miner.y = p.hangars.miner.center.y;
                ast.miners++;
            }
        }
    });

    // 3. Update Active Miners
    players.forEach(p => {
        p.units.miners.forEach(m => {
            if (m.state === 'docked') return; // Completely inactive inside hangar

            const speed = 1.4;

            if (m.state === 'launching' || m.state === 'traveling_to_ast') {
                const ast = m.targetAsteroid;
                // If asteroid was captured by enemy or depleted, abort and return home
                const astCell = ast ? grid.cells.find(c => c.asteroid === ast) : null;
                if (!ast || ast.resources <= 0 || !astCell || astCell.owner !== p.id) {
                    if (ast) ast.miners = Math.max(0, ast.miners - 1);
                    m.targetAsteroid = null;
                    m.state = 'returning';
                    return;
                }

                const dx = ast.x - m.x;
                const dy = ast.y - m.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= 0.35) {
                    m.state = 'mining';
                } else {
                    m.x += (dx / dist) * speed * dt;
                    m.y += (dy / dist) * speed * dt;
                }
            } else if (m.state === 'mining') {
                const ast = m.targetAsteroid;
                const astCell = ast ? grid.cells.find(c => c.asteroid === ast) : null;
                if (!ast || ast.resources <= 0 || !astCell || astCell.owner !== p.id) {
                    if (ast) ast.miners = Math.max(0, ast.miners - 1);
                    m.targetAsteroid = null;
                    m.state = 'returning';
                    return;
                }

                // Extract minerals
                const extractRate = 12 * dt;
                const needed = m.maxPayload - m.payload;
                const amount = Math.min(ast.resources, extractRate, needed);
                ast.resources -= amount;
                m.payload += amount;

                // Spawn small mining crystal particle
                if (Math.random() < 0.25) {
                    particles.push({
                        x: ast.x + (Math.random() - 0.5) * 0.3,
                        y: ast.y + (Math.random() - 0.5) * 0.3,
                        vx: (m.x - ast.x) * 1.5,
                        vy: (m.y - ast.y) * 1.5,
                        life: 0.4,
                        maxLife: 0.4,
                        color: '#3fb950',
                        size: 2.5
                    });
                }

                if (m.payload >= m.maxPayload || ast.resources <= 0) {
                    ast.miners = Math.max(0, ast.miners - 1);
                    m.targetAsteroid = null;
                    m.state = 'returning';
                }
            } else if (m.state === 'returning') {
                const hx = p.hangars.miner.center.x;
                const hy = p.hangars.miner.center.y;
                const dx = hx - m.x;
                const dy = hy - m.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= 0.3) {
                    // Deposit energy and dock into hangar!
                    p.energy += m.payload;
                    m.payload = 0;
                    m.state = 'docked';
                    m.x = hx;
                    m.y = hy;
                    if (!p.hangars.miner.dockedUnits.includes(m)) {
                        p.hangars.miner.dockedUnits.push(m);
                    }
                } else {
                    m.x += (dx / dist) * speed * dt;
                    m.y += (dy / dist) * speed * dt;
                }
            }
        });
    });

    // 4. Update Fighters (Docked vs Airborne Combat)
    players.forEach(p => {
        const enemyP = players.find(ep => ep.id !== p.id);

        p.units.fighters.forEach(f => {
            if (f.state === 'docked') {
                // Heal inside the safety of the hangar
                if (f.health < f.maxHealth) {
                    f.health = Math.min(f.maxHealth, f.health + 25 * dt);
                }
                return;
            }

            f.cooldown = Math.max(0, f.cooldown - dt);

            // Follow waypoint flight path if active
            if (f.path && f.path.length > 0) {
                const target = f.path[f.pathIndex];
                const dx = target.x - f.x;
                const dy = target.y - f.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= 0.2) {
                    f.pathIndex++;
                    if (f.pathIndex >= f.path.length) {
                        f.pathIndex = 0; // Loop waypoint path
                    }
                } else {
                    f.x += (dx / dist) * f.speed * dt;
                    f.y += (dy / dist) * f.speed * dt;
                }
            } else if (f.state === 'returning') {
                const hx = p.hangars.fighter.center.x;
                const hy = p.hangars.fighter.center.y;
                const dx = hx - f.x;
                const dy = hy - f.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= 0.3) {
                    f.state = 'docked';
                    f.x = hx;
                    f.y = hy;
                    f.path = null;
                    if (!p.hangars.fighter.dockedUnits.includes(f)) {
                        p.hangars.fighter.dockedUnits.push(f);
                    }
                } else {
                    f.x += (dx / dist) * f.speed * dt;
                    f.y += (dy / dist) * f.speed * dt;
                }
            }

            // Airborne combat: engage nearby enemy airborne fighters or stations
            if (f.cooldown <= 0) {
                // Check enemy airborne fighters
                const nearbyEnemyFighter = enemyP.units.fighters.find(ef => ef.state !== 'docked' && Math.hypot(ef.x - f.x, ef.y - f.y) <= 3.2);
                if (nearbyEnemyFighter) {
                    f.cooldown = 0.75;
                    const angle = Math.atan2(nearbyEnemyFighter.y - f.y, nearbyEnemyFighter.x - f.x);
                    projectiles.push({
                        x: f.x,
                        y: f.y,
                        vx: Math.cos(angle) * 7.5,
                        vy: Math.sin(angle) * 7.5,
                        damage: 22,
                        ownerId: p.id,
                        targetType: 'fighter',
                        life: 0.6
                    });
                } else {
                    // Check enemy stations
                    const nearbyEnemyStation = grid.vertices.find(v => v.owner === enemyP.id && v.station && Math.hypot(v.x - f.x, v.y - f.y) <= 2.8);
                    if (nearbyEnemyStation) {
                        f.cooldown = 1.0;
                        const angle = Math.atan2(nearbyEnemyStation.y - f.y, nearbyEnemyStation.x - f.x);
                        projectiles.push({
                            x: f.x,
                            y: f.y,
                            vx: Math.cos(angle) * 7.5,
                            vy: Math.sin(angle) * 7.5,
                            damage: 28,
                            ownerId: p.id,
                            targetType: 'station',
                            targetVertexId: nearbyEnemyStation.id,
                            life: 0.6
                        });
                    }
                }
            }
        });
    });

    // 5. Station Defensive Turrets
    grid.vertices.forEach(v => {
        if (v.owner !== null && v.station) {
            v.station.cooldown = Math.max(0, (v.station.cooldown || 0) - dt);
            const isTurret = v.station.type === 'turret';
            const range = isTurret ? 2.6 : 1.8;

            if (v.station.cooldown <= 0) {
                const enemyId = v.owner === 0 ? 1 : 0;
                const enemyPlayer = players[enemyId];
                // Target enemy airborne fighters within defensive perimeter
                const targetFighter = enemyPlayer.units.fighters.find(ef => ef.state !== 'docked' && Math.hypot(ef.x - v.x, ef.y - v.y) <= range);
                if (targetFighter) {
                    v.station.cooldown = isTurret ? 0.6 : 1.2;
                    const angle = Math.atan2(targetFighter.y - v.y, targetFighter.x - v.x);
                    projectiles.push({
                        x: v.x,
                        y: v.y,
                        vx: Math.cos(angle) * 8.0,
                        vy: Math.sin(angle) * 8.0,
                        damage: isTurret ? 24 : 14,
                        ownerId: v.owner,
                        targetType: 'fighter',
                        life: 0.5,
                        isTurretPulse: true
                    });
                }
            }
        }
    });

    // 6. Update Projectiles & Hits
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.life -= dt;

        let hit = false;
        const enemyId = pr.ownerId === 0 ? 1 : 0;
        const enemyPlayer = players[enemyId];

        if (pr.targetType === 'fighter') {
            for (let f of enemyPlayer.units.fighters) {
                if (f.state !== 'docked' && Math.hypot(f.x - pr.x, f.y - pr.y) <= 0.3) {
                    f.health -= pr.damage;
                    hit = true;
                    // Spark particles
                    for (let k = 0; k < 4; k++) {
                        particles.push({
                            x: pr.x,
                            y: pr.y,
                            vx: (Math.random() - 0.5) * 3.0,
                            vy: (Math.random() - 0.5) * 3.0,
                            life: 0.25,
                            maxLife: 0.25,
                            color: '#f85149',
                            size: 2.0
                        });
                    }
                    break;
                }
            }
        } else if (pr.targetType === 'station') {
            const v = grid.vertices[pr.targetVertexId];
            if (v && v.owner === enemyId && v.station && Math.hypot(v.x - pr.x, v.y - pr.y) <= 0.3) {
                v.station.health -= pr.damage;
                hit = true;
                if (v.station.health <= 0) {
                    // Station destroyed! Node reverts to neutral
                    v.owner = null;
                    v.station = null;
                    grid.updateOwnership();
                }
            }
        }

        if (hit || pr.life <= 0) {
            projectiles.splice(i, 1);
        }
    }

    // 7. Cleanup Dead Units
    players.forEach(p => {
        p.units.fighters = p.units.fighters.filter(f => f.health > 0);
        // Remove dead fighters from docked lists if any
        p.hangars.fighter.dockedUnits = p.hangars.fighter.dockedUnits.filter(f => f.health > 0);
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

// Scramble command: launches specified number of fighters on a patrol/strike path
export function scrambleFighters(player, count, pathWaypoints = null) {
    const docked = player.hangars.fighter.dockedUnits;
    const toLaunch = Math.min(count, docked.length);
    const launched = [];

    for (let i = 0; i < toLaunch; i++) {
        const f = docked.shift();
        f.state = 'patrol';
        f.x = player.hangars.fighter.center.x + (Math.random() - 0.5) * 0.4;
        f.y = player.hangars.fighter.center.y + (Math.random() - 0.5) * 0.4;
        f.path = pathWaypoints || [
            { x: player.hangars.fighter.center.x + (player.id === 0 ? 3.0 : -3.0), y: player.hangars.fighter.center.y - 1.5 },
            { x: player.hangars.fighter.center.x + (player.id === 0 ? 4.5 : -4.5), y: player.hangars.fighter.center.y + 1.5 },
            { x: player.hangars.fighter.center.x + (player.id === 0 ? 2.0 : -2.0), y: player.hangars.fighter.center.y }
        ];
        f.pathIndex = 0;
        launched.push(f);
    }
    return launched;
}

// Recall command: orders all airborne fighters to return to hangar
export function recallFighters(player) {
    player.units.fighters.forEach(f => {
        if (f.state !== 'docked') {
            f.state = 'returning';
            f.path = null;
        }
    });
}
