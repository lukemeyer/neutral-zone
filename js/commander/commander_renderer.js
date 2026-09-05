import { getTerritoryPolygon } from './commander_math.js';

export function renderCommanderGame(ctx, canvas, state) {
    const { players, asteroids, projectiles, particles, mapWidth, mapHeight } = state;

    const scX = canvas.width / mapWidth;
    const scY = canvas.height / mapHeight;
    const toScreen = (x, y) => ({ x: x * scX, y: y * scY });

    // 1. Deep space background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let i = 0; i < 50; i++) {
        const sx = ((i * 197.3) % canvas.width);
        const sy = ((i * 311.7) % canvas.height);
        const sz = (i % 4 === 0) ? 1.8 : 1.0;
        ctx.fillRect(sx, sy, sz, sz);
    }

    // 2. Diagonal Neutral Seam & Concentric Radar Guide Rings
    const midScreen = toScreen(10.0, 7.5);
    ctx.strokeStyle = 'rgba(139, 148, 158, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);

    // Concentric 90° guide rings from each corner
    const ringRadii = [3.6, 5.4, 7.2, 9.0, 10.8, 12.6];
    const p1Corner = toScreen(0, 15);
    const p2Corner = toScreen(20, 0);
    const avgScale = (scX + scY) / 2;

    ringRadii.forEach(r => {
        // P1 Corner arc: -PI/2 to 0
        ctx.beginPath();
        ctx.arc(p1Corner.x, p1Corner.y, r * avgScale, -Math.PI * 0.5, 0);
        ctx.stroke();

        // P2 Corner arc: PI/2 to PI
        ctx.beginPath();
        ctx.arc(p2Corner.x, p2Corner.y, r * avgScale, Math.PI * 0.5, Math.PI);
        ctx.stroke();
    });

    // Diagonal neutral dividing line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Solid 90-Degree Corner Fan Territories
    players.forEach(p => {
        const poly = getTerritoryPolygon(p.homePlanet, p.stations, p.id === 1);
        if (poly.length >= 3) {
            const screenPoly = poly.map(pt => toScreen(pt.x, pt.y));

            ctx.beginPath();
            ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
            for (let i = 1; i < screenPoly.length; i++) {
                ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
            }
            ctx.closePath();

            // Vibrant territory fill
            ctx.fillStyle = p.territoryColor;
            ctx.fill();

            // Glowing boundary perimeter
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }

        // Draw internal energy grid lines between stations
        p.stations.forEach(s1 => {
            // Line back to Home
            if (Math.hypot(s1.x - p.homePlanet.x, s1.y - p.homePlanet.y) <= 4.5) {
                const pA = toScreen(p.homePlanet.x, p.homePlanet.y);
                const pB = toScreen(s1.x, s1.y);
                ctx.beginPath();
                ctx.moveTo(pA.x, pA.y);
                ctx.lineTo(pB.x, pB.y);
                ctx.strokeStyle = p.color + '44';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            // Lines to nearby peer stations
            p.stations.forEach(s2 => {
                if (s1.id < s2.id && Math.hypot(s1.x - s2.x, s1.y - s2.y) <= 4.2) {
                    const pA = toScreen(s1.x, s1.y);
                    const pB = toScreen(s2.x, s2.y);
                    ctx.beginPath();
                    ctx.moveTo(pA.x, pA.y);
                    ctx.lineTo(pB.x, pB.y);
                    ctx.strokeStyle = p.color + '66';
                    ctx.lineWidth = 1.8;
                    ctx.stroke();
                }
            });
        });
    });

    // 4. Draw Asteroids (Only active with resources > 0)
    asteroids.forEach(a => {
        if (a.resources <= 0) return;
        const aScreen = toScreen(a.x, a.y);
        ctx.beginPath();
        ctx.arc(aScreen.x, aScreen.y, a.radius * ((scX + scY) / 2), 0, Math.PI * 2);
        ctx.fillStyle = '#6e7681';
        ctx.fill();
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Mineral crystal accents
        ctx.beginPath();
        ctx.arc(aScreen.x - 2, aScreen.y - 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#3fb950';
        ctx.fill();

        // Resource & Tier text (shows active miners / 3 if mining)
        ctx.font = '10px monospace';
        ctx.fillStyle = '#8b949e';
        ctx.textAlign = 'center';
        const minerInfo = a.activeMiners > 0 ? ` (${a.activeMiners}/3)` : '';
        ctx.fillText(`T${a.tier} · ${Math.ceil(a.resources)}${minerInfo}`, aScreen.x, aScreen.y + 16);
    });

    // 5. Draw Stations
    players.forEach(p => {
        p.stations.forEach(s => {
            const sScreen = toScreen(s.x, s.y);
            ctx.beginPath();
            ctx.arc(sScreen.x, sScreen.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.0;
            ctx.stroke();

            // Turret cannon
            ctx.beginPath();
            ctx.arc(sScreen.x, sScreen.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Health bar if damaged
            if (s.health < s.maxHealth) {
                const bW = 16;
                const r = Math.max(0, s.health / s.maxHealth);
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(sScreen.x - bW / 2, sScreen.y - 12, bW, 3);
                ctx.fillStyle = '#3fb950';
                ctx.fillRect(sScreen.x - bW / 2, sScreen.y - 12, bW * r, 3);
            }
        });

        // Home Citadel
        const hpScreen = toScreen(p.homePlanet.x, p.homePlanet.y);
        ctx.beginPath();
        ctx.arc(hpScreen.x, hpScreen.y, p.homePlanet.radius * ((scX + scY) / 2), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.0;
        ctx.stroke();

        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(p.id === 0 ? 'HQ BLUE' : 'HQ RED', hpScreen.x, hpScreen.y + 4);

        // Health bar
        const hpW = 44;
        const hpRatio = Math.max(0, p.homePlanet.health / p.homePlanet.maxHealth);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(hpScreen.x - hpW / 2, hpScreen.y + 20, hpW, 4);
        ctx.fillStyle = p.color;
        ctx.fillRect(hpScreen.x - hpW / 2, hpScreen.y + 20, hpW * hpRatio, 4);
    });

    // 6. Draw Miners & Mining Beams
    players.forEach(p => {
        p.units.miners.forEach(m => {
            const mScreen = toScreen(m.x, m.y);

            // Mining laser
            if (m.targetAsteroid && !m.returning) {
                const d = Math.hypot(m.targetAsteroid.x - m.x, m.targetAsteroid.y - m.y);
                if (d <= 0.6) {
                    const aScreen = toScreen(m.targetAsteroid.x, m.targetAsteroid.y);
                    ctx.beginPath();
                    ctx.moveTo(mScreen.x, mScreen.y);
                    ctx.lineTo(aScreen.x, aScreen.y);
                    ctx.strokeStyle = 'rgba(63, 185, 80, 0.8)';
                    ctx.lineWidth = 2.0;
                    ctx.stroke();
                }
            }

            // Miner Body
            ctx.beginPath();
            ctx.rect(mScreen.x - 5, mScreen.y - 5, 10, 10);
            ctx.fillStyle = m.payload > 0 ? '#3fb950' : p.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            if (m.payload > 0) {
                ctx.font = '9px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(`${Math.floor(m.payload)}`, mScreen.x, mScreen.y - 7);
            }
        });
    });

    // 7. Draw Fighters & Fleet Stance Labels
    players.forEach(p => {
        p.units.fighters.forEach(f => {
            const fScreen = toScreen(f.x, f.y);

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

            // Health bar
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
            ctx.arc(prScreen.x, prScreen.y, 4.5, 0, Math.PI * 2);
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
