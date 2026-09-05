// Canvas Renderer for Neutral Zone: Hex Variant

export function renderHexGame(ctx, canvas, state) {
    const { grid, players, projectiles, particles, hoveredVertexId, hoveredCellId } = state;

    const scX = canvas.width / grid.width;
    const scY = canvas.height / grid.height;
    const toScreen = (x, y) => ({ x: x * scX, y: y * scY });

    // 1. Clear background
    ctx.fillStyle = '#090d13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw deep-space ambient stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = 0; i < 40; i++) {
        const sx = ((i * 137.5) % canvas.width);
        const sy = ((i * 243.1) % canvas.height);
        const sz = (i % 3 === 0) ? 1.5 : 1.0;
        ctx.fillRect(sx, sy, sz, sz);
    }

    // 2. Draw Hex Cells (Territories and Grids)
    grid.cells.forEach(cell => {
        const poly = cell.vertices.map(vId => toScreen(grid.vertices[vId].x, grid.vertices[vId].y));

        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();

        if (cell.owner !== null) {
            // Captured Sector Fill
            const p = players[cell.owner];
            ctx.fillStyle = p.territoryColor;
            ctx.fill();

            // Inner border outline
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.0;
            ctx.stroke();
        } else {
            // Neutral Cell
            ctx.fillStyle = (cell.id === hoveredCellId) ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 36, 0.4)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(139, 148, 158, 0.15)';
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }

        // Cell Type Decorators
        const cCenter = toScreen(cell.center.x, cell.center.y);

        // Home Base Cell
        if (cell.type === 'home_p1' || cell.type === 'home_p2') {
            const pId = cell.type === 'home_p1' ? 0 : 1;
            const p = players[pId];
            ctx.beginPath();
            ctx.arc(cCenter.x, cCenter.y, 0.6 * ((scX + scY) / 2), 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Label
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(pId === 0 ? 'HQ (P1)' : 'HQ (P2)', cCenter.x, cCenter.y + 4);

            // Health bar
            const hpWidth = 36;
            const hpRatio = Math.max(0, p.homePlanet.health / p.homePlanet.maxHealth);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(cCenter.x - hpWidth / 2, cCenter.y + 18, hpWidth, 4);
            ctx.fillStyle = p.color;
            ctx.fillRect(cCenter.x - hpWidth / 2, cCenter.y + 18, hpWidth * hpRatio, 4);
        }

        // Miner Hangar Cell
        if (cell.type.startsWith('hangar_miner')) {
            const pId = cell.type.endsWith('p1') ? 0 : 1;
            const p = players[pId];
            const docked = p.hangars.miner.dockedUnits.length;

            ctx.fillStyle = 'rgba(46, 160, 67, 0.15)';
            ctx.fill();

            // Hangar icon & badge
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#3fb950';
            ctx.fillText('⛏️ Miner Bay', cCenter.x, cCenter.y - 6);

            ctx.font = '11px monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`Docked: ${docked}`, cCenter.x, cCenter.y + 10);
        }

        // Fighter Hangar Cell
        if (cell.type.startsWith('hangar_fighter')) {
            const pId = cell.type.endsWith('p1') ? 0 : 1;
            const p = players[pId];
            const docked = p.hangars.fighter.dockedUnits.length;

            ctx.fillStyle = 'rgba(88, 166, 255, 0.15)';
            ctx.fill();

            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#58a6ff';
            ctx.fillText('✈️ Flight Bay', cCenter.x, cCenter.y - 6);

            ctx.font = '11px monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`Docked: ${docked}`, cCenter.x, cCenter.y + 10);
        }

        // Asteroid in Cell
        if (cell.type === 'asteroid' && cell.asteroid) {
            const ast = cell.asteroid;
            ctx.beginPath();
            ctx.arc(cCenter.x, cCenter.y, 0.4 * ((scX + scY) / 2), 0, Math.PI * 2);
            ctx.fillStyle = '#8b949e';
            ctx.fill();
            ctx.strokeStyle = cell.owner !== null ? players[cell.owner].color : '#565f69';
            ctx.lineWidth = 2.0;
            ctx.stroke();

            // Mineral sparkle
            ctx.beginPath();
            ctx.arc(cCenter.x - 3, cCenter.y - 3, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#3fb950';
            ctx.fill();

            // Resource count
            ctx.font = '10px monospace';
            ctx.fillStyle = '#c9d1d9';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.ceil(ast.resources)}`, cCenter.x, cCenter.y + 16);
        }
    });

    // 3. Draw Edges (Grid Connection Lines)
    grid.edges.forEach(e => {
        const vA = grid.vertices[e.u];
        const vB = grid.vertices[e.v];
        const pA = toScreen(vA.x, vA.y);
        const pB = toScreen(vB.x, vB.y);

        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);

        if (vA.owner !== null && vA.owner === vB.owner) {
            // Active friendly territory connection beam
            ctx.strokeStyle = players[vA.owner].color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        } else {
            // Subtle grid connection
            ctx.strokeStyle = 'rgba(139, 148, 158, 0.2)';
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }
    });

    // 4. Draw Stations at Intersections (Vertices)
    grid.vertices.forEach(v => {
        const pScreen = toScreen(v.x, v.y);

        if (v.owner !== null && v.station) {
            const p = players[v.owner];
            const isTurret = v.station.type === 'turret';

            ctx.beginPath();
            if (isTurret) {
                // Turret shape (diamond/square)
                ctx.rect(pScreen.x - 7, pScreen.y - 7, 14, 14);
            } else {
                // Relay shape (circle)
                ctx.arc(pScreen.x, pScreen.y, 6.5, 0, Math.PI * 2);
            }
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // Turret cannon indicator
            if (isTurret) {
                ctx.beginPath();
                ctx.arc(pScreen.x, pScreen.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }

            // Health bar if damaged
            if (v.station.health < v.station.maxHealth) {
                const barW = 16;
                const ratio = Math.max(0, v.station.health / v.station.maxHealth);
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(pScreen.x - barW / 2, pScreen.y - 12, barW, 3);
                ctx.fillStyle = '#3fb950';
                ctx.fillRect(pScreen.x - barW / 2, pScreen.y - 12, barW * ratio, 3);
            }
        } else {
            // Unowned empty intersection notch
            const isHovered = v.id === hoveredVertexId;
            ctx.beginPath();
            ctx.arc(pScreen.x, pScreen.y, isHovered ? 4.5 : 2.5, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? '#58a6ff' : 'rgba(139, 148, 158, 0.4)';
            ctx.fill();
        }
    });

    // 5. Hover Preview for Legal Station Placement
    if (hoveredVertexId !== null) {
        const hV = grid.vertices[hoveredVertexId];
        if (hV && hV.owner === null) {
            const p1 = players[0];
            const ownedVertexIds = new Set(grid.vertices.filter(v => v.owner === 0).map(v => v.id));
            const isConnected = hV.adjacentVertices.some(adjId => ownedVertexIds.has(adjId));
            const hasEnergy = p1.energy >= 35;
            const canBuild = isConnected && hasEnergy;

            const pScreen = toScreen(hV.x, hV.y);

            // Draw holographic ghost station
            ctx.beginPath();
            ctx.arc(pScreen.x, pScreen.y, 9, 0, Math.PI * 2);
            ctx.fillStyle = canBuild ? 'rgba(88, 166, 255, 0.35)' : 'rgba(248, 81, 73, 0.35)';
            ctx.fill();
            ctx.strokeStyle = canBuild ? '#58a6ff' : '#f85149';
            ctx.lineWidth = 2.0;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw projected connection lines to adjacent friendly vertices
            hV.adjacentVertices.forEach(adjId => {
                if (ownedVertexIds.has(adjId)) {
                    const adjV = grid.vertices[adjId];
                    const adjScreen = toScreen(adjV.x, adjV.y);
                    ctx.beginPath();
                    ctx.moveTo(pScreen.x, pScreen.y);
                    ctx.lineTo(adjScreen.x, adjScreen.y);
                    ctx.strokeStyle = canBuild ? 'rgba(88, 166, 255, 0.8)' : 'rgba(248, 81, 73, 0.6)';
                    ctx.lineWidth = 2.0;
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            });

            // Tooltip
            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = canBuild ? '#58a6ff' : '#f85149';
            ctx.textAlign = 'center';
            const msg = !isConnected ? 'Must Connect to Network' : (!hasEnergy ? 'Need 35 Energy' : 'Click: Build Station (35 E)');
            ctx.fillText(msg, pScreen.x, pScreen.y - 14);
        }
    }

    // 6. Draw Active Miners in Flight (Docked ones are inside hangar)
    players.forEach(p => {
        p.units.miners.forEach(m => {
            if (m.state === 'docked') return; // Inactive inside hangar

            const mScreen = toScreen(m.x, m.y);

            // Mining laser beam
            if (m.state === 'mining' && m.targetAsteroid) {
                const aScreen = toScreen(m.targetAsteroid.x, m.targetAsteroid.y);
                ctx.beginPath();
                ctx.moveTo(mScreen.x, mScreen.y);
                ctx.lineTo(aScreen.x, aScreen.y);
                ctx.strokeStyle = 'rgba(63, 185, 80, 0.8)';
                ctx.lineWidth = 2.0;
                ctx.stroke();
            }

            // Miner Body (Square Drone)
            ctx.beginPath();
            ctx.rect(mScreen.x - 5, mScreen.y - 5, 10, 10);
            ctx.fillStyle = m.payload > 0 ? '#3fb950' : p.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Cargo indicator
            if (m.payload > 0) {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(`${Math.floor(m.payload)}`, mScreen.x, mScreen.y - 8);
            }
        });
    });

    // 7. Draw Airborne Fighters (Docked ones are inside hangar)
    players.forEach(p => {
        p.units.fighters.forEach(f => {
            if (f.state === 'docked') return; // Inactive inside hangar

            const fScreen = toScreen(f.x, f.y);

            // Flight Path Preview
            if (f.path && f.path.length > 0) {
                ctx.beginPath();
                ctx.moveTo(fScreen.x, fScreen.y);
                f.path.forEach(wp => {
                    const wpScreen = toScreen(wp.x, wp.y);
                    ctx.lineTo(wpScreen.x, wpScreen.y);
                });
                ctx.strokeStyle = p.id === 0 ? 'rgba(88, 166, 255, 0.4)' : 'rgba(248, 81, 73, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Delta-Wing Fighter
            ctx.save();
            ctx.translate(fScreen.x, fScreen.y);
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(6, 6);
            ctx.lineTo(-6, 6);
            ctx.closePath();
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // Health bar if damaged
            if (f.health < f.maxHealth) {
                const bW = 14;
                const r = Math.max(0, f.health / f.maxHealth);
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(fScreen.x - bW / 2, fScreen.y - 12, bW, 2.5);
                ctx.fillStyle = p.color;
                ctx.fillRect(fScreen.x - bW / 2, fScreen.y - 12, bW * r, 2.5);
            }
        });
    });

    // 8. Draw Projectiles & Particles
    projectiles.forEach(pr => {
        const prScreen = toScreen(pr.x, pr.y);
        ctx.beginPath();
        if (pr.isTurretPulse) {
            ctx.arc(prScreen.x, prScreen.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = pr.ownerId === 0 ? '#58a6ff' : '#ff7b72';
        } else {
            ctx.arc(prScreen.x, prScreen.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
        }
        ctx.fill();
    });

    particles.forEach(pt => {
        const ptScreen = toScreen(pt.x, pt.y);
        const alpha = Math.max(0, pt.life / pt.maxLife);
        ctx.beginPath();
        ctx.arc(ptScreen.x, ptScreen.y, pt.size, 0, Math.PI * 2);
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}
