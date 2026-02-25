        const container = document.getElementById('game-container');
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');

        function handleResize() {
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
            container.style.transform = `scale(${scale})`;
        }
        window.addEventListener('resize', handleResize);
        handleResize();

        // Game State (Multiplayer)
        const players = [
            {
                id: 0,
                color: '#1f6feb', // Blue (Player 1)
                territoryColor: '#2ea043',
                energy: 50,
                homePlanet: { x: 128, y: 360, radius: 30, health: 1000, maxHealth: 1000 },
                units: { scouts: [], fighters: [], miners: [] }
            },
            {
                id: 1,
                color: '#f85149', // Red (Player 2)
                territoryColor: '#da3633',
                energy: 50,
                homePlanet: { x: 1152, y: 360, radius: 30, health: 1000, maxHealth: 1000 },
                units: { scouts: [], fighters: [], miners: [] }
            }
        ];

        const asteroids = [];
        // Generate Left Side Asteroids
        const generateAsteroids = () => {
            const leftAsteroids = [];
            // Guaranteed asteroid near P1
            leftAsteroids.push({
                x: players[0].homePlanet.x + 80,
                y: players[0].homePlanet.y,
                radius: 15, miners: 0,
                resources: Math.floor(Math.random() * 400 + 200)
            });
            // Random asteroids on left half
            for (let i = 1; i < 6; i++) {
                leftAsteroids.push({
                    x: Math.random() * (640 - 100) + 50,
                    y: Math.random() * (720 - 100) + 50,
                    radius: 15, miners: 0,
                    resources: Math.floor(Math.random() * 400 + 200)
                });
            }
            return leftAsteroids;
        };

        const leftAsteroids = generateAsteroids();
        // Add left side and mirrored right side
        leftAsteroids.forEach(a => {
            asteroids.push({ ...a });
            asteroids.push({
                x: 1280 - a.x,
                y: 720 - a.y,
                radius: 15, miners: 0,
                resources: a.resources
            });
        });

        // Setup Initial Units for both players
        players.forEach(p => {
            const dirX = p.homePlanet.x < 640 ? 1 : -1;
            p.units.scouts.push({ x: p.homePlanet.x - (100 * dirX), y: p.homePlanet.y - 100, targetX: p.homePlanet.x - (100 * dirX), targetY: p.homePlanet.y - 100, health: 50, maxHealth: 50, cooldown: 0 });
            p.units.scouts.push({ x: p.homePlanet.x + (100 * dirX), y: p.homePlanet.y - 100, targetX: p.homePlanet.x + (100 * dirX), targetY: p.homePlanet.y - 100, health: 50, maxHealth: 50, cooldown: 0 });
            p.units.scouts.push({ x: p.homePlanet.x, y: p.homePlanet.y + 120, targetX: p.homePlanet.x, targetY: p.homePlanet.y + 120, health: 50, maxHealth: 50, cooldown: 0 });
            p.units.miners.push({ x: p.homePlanet.x, y: p.homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });
        });

        let projectiles = [];

        // Interaction State
        let activeScout = null;
        let activeScoutPlayer = null;
        let activeFighter = null;
        let drawingPath = false;

        // Convex Hull Algorithm (Monotone Chain) to calculate territory
        function getConvexHull(points) {
            if (points.length <= 2) return points;
            const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
            const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
            const lower = [];
            for (let p of sorted) {
                while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
                lower.push(p);
            }
            const upper = [];
            for (let i = sorted.length - 1; i >= 0; i--) {
                let p = sorted[i];
                while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
                upper.push(p);
            }
            upper.pop(); lower.pop();
            return lower.concat(upper);
        }

        function pointInPolygon(point, vs) {
            let x = point.x, y = point.y;
            let inside = false;
            for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
                let xi = vs[i].x, yi = vs[i].y;
                let xj = vs[j].x, yj = vs[j].y;
                let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        function getMousePos(e) {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) / (rect.width / canvas.width),
                y: (e.clientY - rect.top) / (rect.height / canvas.height)
            };
        }

        // Input Handling
        canvas.addEventListener('mousedown', (e) => {
            const pos = getMousePos(e);
            const mouseX = pos.x;
            const mouseY = pos.y;

            // Check Fighters first (for drawing path)
            for (let p of players) {
                for (let f of p.units.fighters) {
                    if (Math.hypot(f.x - mouseX, f.y - mouseY) < 20) {
                        activeFighter = f;
                        activeFighter.path = [{ x: mouseX, y: mouseY }];
                        drawingPath = true;
                        return;
                    }
                }
            }

            // Check Scouts (for dragging target)
            for (let p of players) {
                for (let s of p.units.scouts) {
                    // Check against current position OR its target ghost
                    if (Math.hypot(s.x - mouseX, s.y - mouseY) < 20 || Math.hypot(s.targetX - mouseX, s.targetY - mouseY) < 20) {
                        activeScout = s;
                        activeScoutPlayer = p; // need to track which player's scout is active for hull checking
                        return;
                    }
                }
            }
        });

        const MAX_EDGE_LENGTH = 350;

        canvas.addEventListener('mousemove', (e) => {
            const pos = getMousePos(e);
            const mouseX = pos.x;
            const mouseY = pos.y;

            if (activeScout && activeScoutPlayer) {
                const originalX = activeScout.targetX;
                const originalY = activeScout.targetY;
                const proposedX = mouseX;
                const proposedY = mouseY;

                const checkHullValid = (x, y) => {
                    activeScout.targetX = x;
                    activeScout.targetY = y;
                    const points = [activeScoutPlayer.homePlanet, ...activeScoutPlayer.units.scouts.map(s => ({ x: s.targetX, y: s.targetY }))];
                    const hull = getConvexHull(points);

                    let perimeter = 0;
                    for (let i = 0; i < hull.length; i++) {
                        let p1 = hull[i];
                        let p2 = hull[(i + 1) % hull.length];
                        perimeter += Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    }

                    const MAX_PERIMETER = (activeScoutPlayer.units.scouts.length + 1) * 350;
                    return perimeter <= MAX_PERIMETER;
                };

                if (checkHullValid(proposedX, proposedY)) {
                    activeScout.targetX = proposedX;
                    activeScout.targetY = proposedY;
                } else {
                    if (checkHullValid(originalX, originalY)) {
                        let low = 0;
                        let high = 1;
                        let bestT = 0;
                        for (let step = 0; step < 10; step++) {
                            let mid = (low + high) / 2;
                            let testX = originalX + (proposedX - originalX) * mid;
                            let testY = originalY + (proposedY - originalY) * mid;
                            if (checkHullValid(testX, testY)) {
                                bestT = mid;
                                low = mid;
                            } else {
                                high = mid;
                            }
                        }
                        activeScout.targetX = originalX + (proposedX - originalX) * bestT;
                        activeScout.targetY = originalY + (proposedY - originalY) * bestT;
                    } else {
                        activeScout.targetX = originalX;
                        activeScout.targetY = originalY;
                    }
                }
            }
            if (drawingPath && activeFighter) {
                const lastPoint = activeFighter.path[activeFighter.path.length - 1];
                if (Math.hypot(lastPoint.x - mouseX, lastPoint.y - mouseY) > 15) {
                    activeFighter.path.push({ x: mouseX, y: mouseY });
                }
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (drawingPath && activeFighter) {
                // Check if path is closed (loop)
                const firstP = activeFighter.path[0];
                const lastP = activeFighter.path[activeFighter.path.length - 1];
                if (activeFighter.path.length > 5 && Math.hypot(firstP.x - lastP.x, firstP.y - lastP.y) < 50) {
                    activeFighter.isLoop = true;
                    activeFighter.path.push({ x: firstP.x, y: firstP.y }); // close the visual gap
                } else {
                    activeFighter.isLoop = false;
                }
                activeFighter.pathIndex = 0;
                activeFighter.pathDir = 1;
            }
            activeScout = null;
            activeScoutPlayer = null;
            activeFighter = null;
            drawingPath = false;
        });
        // Game Loop
        let lastTime = 0;
        function update(time) {
            const dt = (time - lastTime) / 1000 || 0;
            lastTime = time;

            // Only track UI for Player 0 (local player) for now
            document.getElementById('energy-display').innerText = Math.floor(players[0].energy);
            document.getElementById('btn-miner').disabled = players[0].energy < 25;
            document.getElementById('btn-scout').disabled = players[0].energy < 50;
            document.getElementById('btn-fighter').disabled = players[0].energy < 100;

            const currentHulls = [];

            // Update Players
            players.forEach(p => {
                const currentPoints = [p.homePlanet, ...p.units.scouts.map(s => ({ x: s.x, y: s.y }))];
                const currentHull = getConvexHull(currentPoints);
                currentHulls.push(currentHull);

                if (p.id === 0) {
                    let area = 0;
                    for (let i = 0; i < currentHull.length; i++) {
                        let j = (i + 1) % currentHull.length;
                        area += currentHull[i].x * currentHull[j].y;
                        area -= currentHull[j].x * currentHull[i].y;
                    }
                    area = Math.abs(area / 2);
                    const totalArea = canvas.width * canvas.height;
                    const pct = (area / totalArea) * 100;
                    document.getElementById('control-pct').innerText = pct.toFixed(1);
                }

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
                });

                p.units.fighters.forEach(f => {
                    if (f.path && f.path.length > 1 && f !== activeFighter) {
                        let targetPoint = f.path[f.pathIndex];
                        let dx = targetPoint.x - f.x;
                        let dy = targetPoint.y - f.y;
                        let dist = Math.hypot(dx, dy);

                        if (dist < 5) {
                            f.pathIndex += f.pathDir;
                            if (f.pathIndex >= f.path.length || f.pathIndex < 0) {
                                if (f.isLoop) {
                                    f.pathIndex = 0;
                                } else {
                                    f.pathDir *= -1;
                                    f.pathIndex += f.pathDir * 2;
                                }
                            }
                        } else {
                            f.x += (dx / dist) * 80 * dt;
                            f.y += (dy / dist) * 80 * dt;
                        }
                    }
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
                            let amount = Math.min(20 * dt, m.targetAsteroid.resources, 50 - m.payload);
                            m.payload += amount;
                            m.targetAsteroid.resources -= amount;
                            if (m.payload >= 50 || m.targetAsteroid.resources <= 0) {
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
            });

            // Update Projectiles
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

            // Cleanup Dead Entities
            players.forEach(p => {
                p.units.scouts = p.units.scouts.filter(u => u.health > 0);
                p.units.fighters = p.units.fighters.filter(u => u.health > 0);
                p.units.miners = p.units.miners.filter(u => {
                    if (u.health <= 0 && u.targetAsteroid) {
                        u.targetAsteroid.miners = Math.max(0, u.targetAsteroid.miners - 1);
                    }
                    return u.health > 0;
                });

                // Keep dead planets around for visual ruin or end game state, but cap at 0
                if (p.homePlanet.health <= 0) p.homePlanet.health = 0;
            });
        }

        function drawHealthBar(x, y, current, max, width = 20) {
            if (current >= max) return; // Only draw when damaged
            const pct = Math.max(0, current / max);
            ctx.fillStyle = 'red';
            ctx.fillRect(x - width / 2, y, width, 4);
            ctx.fillStyle = '#2ea043';
            ctx.fillRect(x - width / 2, y, width * pct, 4);
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Territories
            players.forEach(p => {
                const currentPoints = [p.homePlanet, ...p.units.scouts.map(s => ({ x: s.x, y: s.y }))];
                const currentHull = getConvexHull(currentPoints);

                // Projected
                let isProjecting = p.units.scouts.some(s => Math.hypot(s.targetX - s.x, s.targetY - s.y) > 5);
                if (isProjecting) {
                    const targetPoints = [p.homePlanet, ...p.units.scouts.map(s => ({ x: s.targetX, y: s.targetY }))];
                    const targetHull = getConvexHull(targetPoints);
                    ctx.beginPath();
                    targetHull.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
                    ctx.closePath();
                    ctx.fillStyle = p.id === 0 ? 'rgba(46, 160, 67, 0.1)' : 'rgba(218, 54, 51, 0.1)';
                    ctx.fill();
                    ctx.setLineDash([10, 10]);
                    ctx.strokeStyle = p.id === 0 ? 'rgba(46, 160, 67, 0.5)' : 'rgba(218, 54, 51, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Current
                ctx.beginPath();
                currentHull.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
                ctx.closePath();
                ctx.fillStyle = p.id === 0 ? 'rgba(46, 160, 67, 0.25)' : 'rgba(218, 54, 51, 0.25)';
                ctx.fill();
                ctx.strokeStyle = p.territoryColor;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Fighter Paths
                p.units.fighters.forEach(f => {
                    if (f.path && f.path.length > 0) {
                        ctx.beginPath();
                        ctx.moveTo(f.path[0].x, f.path[0].y);
                        for (let i = 1; i < f.path.length; i++) ctx.lineTo(f.path[i].x, f.path[i].y);
                        ctx.strokeStyle = p.id === 0 ? 'rgba(88, 166, 255, 0.4)' : 'rgba(248, 81, 73, 0.4)';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                });
            });

            // Draw Asteroids
            asteroids.forEach(a => {
                if (a.resources <= 0) return;
                ctx.beginPath();
                ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
                ctx.fillStyle = '#8b949e';
                ctx.fill();

                ctx.fillStyle = 'white';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(Math.ceil(a.resources), a.x, a.y - a.radius - 5);
            });

            // Draw Units & Planets
            players.forEach(p => {
                // Home Planet
                ctx.beginPath();
                ctx.arc(p.homePlanet.x, p.homePlanet.y, p.homePlanet.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
                drawHealthBar(p.homePlanet.x, p.homePlanet.y + 40, p.homePlanet.health, p.homePlanet.maxHealth, 40);

                // Scouts
                p.units.scouts.forEach(s => {
                    if (Math.hypot(s.targetX - s.x, s.targetY - s.y) > 5) {
                        drawCircle(s.targetX, s.targetY, p.id === 0 ? 'rgba(46, 160, 67, 0.4)' : 'rgba(218, 54, 51, 0.4)', 10);
                    }
                    drawCircle(s.x, s.y, p.territoryColor, 10);
                    drawHealthBar(s.x, s.y - 20, s.health, s.maxHealth);
                });

                // Fighters
                p.units.fighters.forEach(f => {
                    drawTriangle(f.x, f.y, p.color);
                    drawHealthBar(f.x, f.y - 20, f.health, f.maxHealth);
                });

                // Miners
                p.units.miners.forEach(m => {
                    drawSquare(m.x, m.y, m.returning ? '#a371f7' : (p.id === 0 ? '#d2a8ff' : '#ff7b72'));
                    if (m.payload > 0) {
                        const ratio = m.payload / 50;
                        ctx.fillStyle = '#2ea043';
                        ctx.fillRect(m.x - 4, (m.y + 4) - (8 * ratio), 8, 8 * ratio);
                    }
                    drawHealthBar(m.x, m.y - 20, m.health, m.maxHealth);
                });
            });

            // Draw Projectiles
            projectiles.forEach(proj => {
                ctx.beginPath();
                ctx.moveTo(proj.x, proj.y);
                ctx.lineTo(proj.x - (proj.target.ref.x - proj.x > 0 ? 5 : -5), proj.y - (proj.target.ref.y - proj.y > 0 ? 5 : -5)); // Simple trail
                ctx.strokeStyle = proj.color;
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            requestAnimationFrame((t) => {
                update(t);
                draw();
            });
        }

        // Drawing Helpers
        function drawTriangle(x, y, color) {
            ctx.beginPath();
            ctx.moveTo(x, y - 10);
            ctx.lineTo(x + 10, y + 10);
            ctx.lineTo(x - 10, y + 10);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }

        function drawCircle(x, y, color, radius) {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        }

        function drawSquare(x, y, color) {
            ctx.fillStyle = color;
            ctx.fillRect(x - 8, y - 8, 16, 16);
        }

        // UI Buttons (Player 0 Local Controls)
        document.getElementById('btn-miner').addEventListener('click', () => {
            if (players[0].energy >= 25) {
                players[0].energy -= 25;
                players[0].units.miners.push({ x: players[0].homePlanet.x, y: players[0].homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });
            }
        });
        document.getElementById('btn-scout').addEventListener('click', () => {
            if (players[0].energy >= 50) {
                players[0].energy -= 50;
                players[0].units.scouts.push({ x: players[0].homePlanet.x, y: players[0].homePlanet.y, targetX: players[0].homePlanet.x + 50, targetY: players[0].homePlanet.y + 50, health: 50, maxHealth: 50, cooldown: 0 });
            }
        });
        document.getElementById('btn-fighter').addEventListener('click', () => {
            if (players[0].energy >= 100) {
                players[0].energy -= 100;
                players[0].units.fighters.push({ x: players[0].homePlanet.x, y: players[0].homePlanet.y, path: [], pathIndex: 0, pathDir: 1, isLoop: false, health: 100, maxHealth: 100, cooldown: 0 });
            }
        });

        // Start
        requestAnimationFrame((t) => { lastTime = t; draw(); });
