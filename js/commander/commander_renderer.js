import { getTerritoryPolygon, getBorderIntersection, degreeToAngleRad, angleRadToDegree } from './commander_math.js';
import { calculateLaunchTarget } from './commander_units.js';

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
        const isP2 = p.id === 1;
        const poly = getTerritoryPolygon(p.homePlanet, p.borderDistances || p.stations, isP2);
        if (poly.length === 91) {
            const screenPoly = poly.map(pt => toScreen(pt.x, pt.y));

            // Shaded Territory Fill behind the 91-point border
            ctx.beginPath();
            ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
            for (let i = 0; i < screenPoly.length - 1; i++) {
                const p0 = screenPoly[i];
                const p1 = screenPoly[i + 1];
                const midX = (p0.x + p1.x) / 2;
                const midY = (p0.y + p1.y) / 2;
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
            }
            ctx.lineTo(screenPoly[screenPoly.length - 1].x, screenPoly[screenPoly.length - 1].y);

            if (!isP2) {
                const leftWall = toScreen(0, poly[90].y);
                const corner = toScreen(0, 15);
                const bottomWall = toScreen(poly[0].x, 15);
                ctx.lineTo(leftWall.x, leftWall.y);
                ctx.lineTo(corner.x, corner.y);
                ctx.lineTo(bottomWall.x, bottomWall.y);
            } else {
                const rightWall = toScreen(20, poly[90].y);
                const corner = toScreen(20, 0);
                const topWall = toScreen(poly[0].x, 0);
                ctx.lineTo(rightWall.x, rightWall.y);
                ctx.lineTo(corner.x, corner.y);
                ctx.lineTo(topWall.x, topWall.y);
            }

            ctx.closePath();
            ctx.fillStyle = p.territoryColor;
            ctx.fill();

            // Glowing boundary perimeter: the border is ONLY the 91 permanent points (organic, no sharp corners)
            ctx.beginPath();
            ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
            for (let i = 0; i < screenPoly.length - 1; i++) {
                const p0 = screenPoly[i];
                const p1 = screenPoly[i + 1];
                const midX = (p0.x + p1.x) / 2;
                const midY = (p0.y + p1.y) / 2;
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
            }
            ctx.lineTo(screenPoly[screenPoly.length - 1].x, screenPoly[screenPoly.length - 1].y);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }
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

        // Launch Trajectory: line from center of HQ extending 2x HQ radius with an arrow at the end
        const isP2 = p.id === 1;
        const aimDeg = p.aimDegree !== undefined ? p.aimDegree : (p.launchAngle !== undefined ? angleRadToDegree(isP2 ? 1 : 0, p.launchAngle) : 45);
        const launchAngle = degreeToAngleRad(isP2 ? 1 : 0, aimDeg);
        const trajLen = p.homePlanet.radius * 2.0; // 2x HQ radius
        const arrowEndX = p.homePlanet.x + Math.cos(launchAngle) * trajLen;
        const arrowEndY = p.homePlanet.y + Math.sin(launchAngle) * trajLen;
        const arrowScreen = toScreen(arrowEndX, arrowEndY);

        // Frontier border intersection point along launch degree
        const borderDist = getBorderIntersection(p.homePlanet, p.borderDistances || p.stations, isP2, aimDeg);
        const borderX = p.homePlanet.x + Math.cos(launchAngle) * borderDist;
        const borderY = p.homePlanet.y + Math.sin(launchAngle) * borderDist;
        const borderScreen = toScreen(borderX, borderY);

        // Target position on border along degree system (slides if occupied)
        const enemy = players.find(ep => ep.id !== p.id);
        const targetPos = calculateLaunchTarget(p, aimDeg, enemy);
        const guideScreen = toScreen(targetPos.x, targetPos.y);
        const isSlid = targetPos.degree !== aimDeg;

        ctx.save();
        // Inner trajectory line from HQ arrow to border
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = p.accentColor + '44';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(arrowScreen.x, arrowScreen.y);
        ctx.lineTo(borderScreen.x, borderScreen.y);
        ctx.stroke();

        // If target slid due to occupation, draw slide curve to actual landing degree
        if (isSlid) {
            ctx.setLineDash([2, 3]);
            ctx.strokeStyle = '#f0883e'; // Orange warning
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(borderScreen.x, borderScreen.y);
            ctx.quadraticCurveTo(hpScreen.x, hpScreen.y, guideScreen.x, guideScreen.y);
            ctx.stroke();

            // Occupied warning badge
            ctx.font = '10px monospace';
            ctx.fillStyle = '#f0883e';
            ctx.textAlign = 'center';
            ctx.fillText(`Occupied -> ${targetPos.degree}°`, guideScreen.x, guideScreen.y - 12);
        }

        // Frontier border launch origin dot
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(borderScreen.x, borderScreen.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isSlid ? '#f0883e' : p.accentColor;
        ctx.fill();

        // Frontier impact reticle ring at target degree
        ctx.beginPath();
        ctx.arc(guideScreen.x, guideScreen.y, 6.5, 0, Math.PI * 2);
        ctx.strokeStyle = p.accentColor;
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Aim degree readout
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = p.accentColor;
        ctx.textAlign = 'center';
        ctx.fillText(`${aimDeg}°`, arrowScreen.x, arrowScreen.y - 14);

        ctx.restore();

        // Solid Trajectory line from HQ center extending 2x HQ radius
        ctx.beginPath();
        ctx.moveTo(hpScreen.x, hpScreen.y);
        ctx.lineTo(arrowScreen.x, arrowScreen.y);
        ctx.strokeStyle = p.accentColor;
        ctx.lineWidth = 3.2;
        ctx.stroke();

        // Prominent Arrowhead at the tip of the trajectory line
        const screenAngle = Math.atan2(arrowScreen.y - hpScreen.y, arrowScreen.x - hpScreen.x);
        ctx.save();
        ctx.translate(arrowScreen.x, arrowScreen.y);
        ctx.rotate(screenAngle);
        ctx.beginPath();
        ctx.moveTo(0, 0); // Tip
        ctx.lineTo(-14, -7);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-14, 7);
        ctx.closePath();
        ctx.fillStyle = p.accentColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // In-flight Launching Stations
        if (p.launchingStations && p.launchingStations.length > 0) {
            p.launchingStations.forEach(ls => {
                const lsScreen = toScreen(ls.x, ls.y);

                // Energy thruster flare
                ctx.beginPath();
                ctx.arc(lsScreen.x, lsScreen.y, 11, 0, Math.PI * 2);
                ctx.fillStyle = p.accentColor + '44';
                ctx.fill();

                // Station hull
                ctx.beginPath();
                ctx.arc(lsScreen.x, lsScreen.y, 7.5, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.0;
                ctx.stroke();

                // Core
                ctx.beginPath();
                ctx.arc(lsScreen.x, lsScreen.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            });
        }
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
