import { getTerritoryPolygon, getClosedTerritoryPolygon, getBorderIntersection, degreeToAngleRad, angleRadToDegree, calculateTapWeight } from './commander_math.js';
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

    // 3. Draw Prototype Radial Territory System (Rays, Dots, Straight Lines, Gradient Fill)
    players.forEach(p => {
        const isP2 = p.id === 1;
        const frontierPts = getTerritoryPolygon(p.homePlanet, p.borderDistances || p.stations, isP2);
        const closedPoly = getClosedTerritoryPolygon(p.homePlanet, p.borderDistances || p.stations, isP2);
        const hpScreen = toScreen(p.homePlanet.x, p.homePlanet.y);
        const maxR = (p.borderDistances ? Math.max(...p.borderDistances) : 3.8) + 1.5;

        // 3a. Shaded Territory Fill with Radial Gradient from HQ
        ctx.save();
        ctx.beginPath();
        closedPoly.forEach((pt, idx) => {
            const s = toScreen(pt.x, pt.y);
            if (idx === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();

        const fillGrad = ctx.createRadialGradient(hpScreen.x, hpScreen.y, 8, hpScreen.x, hpScreen.y, maxR * scX);
        if (!isP2) {
            fillGrad.addColorStop(0, 'rgba(31, 111, 235, 0.20)');
            fillGrad.addColorStop(0.7, 'rgba(56, 139, 253, 0.08)');
            fillGrad.addColorStop(1, 'rgba(88, 166, 255, 0.02)');
        } else {
            fillGrad.addColorStop(0, 'rgba(218, 54, 51, 0.20)');
            fillGrad.addColorStop(0.7, 'rgba(248, 81, 73, 0.08)');
            fillGrad.addColorStop(1, 'rgba(255, 123, 114, 0.02)');
        }
        ctx.fillStyle = fillGrad;
        ctx.fill();
        ctx.restore();

        // 3b. The 91 Radial Rays from HQ
        ctx.save();
        for (let i = 0; i <= 90; i++) {
            const dotScreen = toScreen(frontierPts[i].x, frontierPts[i].y);
            const isAimed = (!isP2 && i === p.aimDegree);
            const isMajor = (i % 10 === 0);

            ctx.beginPath();
            ctx.moveTo(hpScreen.x, hpScreen.y);
            ctx.lineTo(dotScreen.x, dotScreen.y);

            if (isAimed) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.8;
            } else if (isMajor) {
                ctx.strokeStyle = !isP2 ? 'rgba(88, 166, 255, 0.38)' : 'rgba(248, 81, 73, 0.38)';
                ctx.lineWidth = 1.2;
            } else {
                ctx.strokeStyle = !isP2 ? 'rgba(56, 139, 253, 0.12)' : 'rgba(248, 81, 73, 0.12)';
                ctx.lineWidth = 0.8;
            }
            ctx.stroke();
        }
        ctx.restore();

        // 3c. Straight Lines Connecting Neighbor Dots
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= 90; i++) {
            const s = toScreen(frontierPts[i].x, frontierPts[i].y);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        }
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();

        // 3d. 91 Ray End Dots on the Border
        ctx.save();
        for (let i = 0; i <= 90; i++) {
            const s = toScreen(frontierPts[i].x, frontierPts[i].y);
            const isAimed = (!isP2 && i === p.aimDegree);
            const isMajor = (i % 10 === 0);

            ctx.beginPath();
            let radius = isMajor ? 3.5 : 2.2;
            if (isAimed) radius = 5.5;

            ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
            if (isAimed) {
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 10;
            } else if (isMajor) {
                ctx.fillStyle = p.accentColor || p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 3;
            } else {
                ctx.fillStyle = p.accentColor || p.color;
                ctx.shadowBlur = 0;
            }
            ctx.fill();
        }
        ctx.restore();
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

        // Prototype Aiming Influence Preview Contour along the frontier
        const landingDeg = targetPos.degree !== undefined ? targetPos.degree : aimDeg;
        const rCore = 1;
        const neighborSpread = 10;
        const totalRadius = rCore + neighborSpread;
        const minDeg = Math.max(0, landingDeg - totalRadius);
        const maxDeg = Math.min(90, landingDeg + totalRadius);

        ctx.save();
        ctx.beginPath();
        for (let i = minDeg; i <= maxDeg; i++) {
            const deltaDeg = Math.abs(i - landingDeg);
            const weight = calculateTapWeight(deltaDeg, 3, 'rounded', neighborSpread, 1.0, 'smoothstep');
            const pushAmt = 1.4;
            const curR = (p.borderDistances ? p.borderDistances[i] : 3.8);
            const previewR = curR + pushAmt * weight;
            const rad = degreeToAngleRad(isP2 ? 1 : 0, i);
            const px = p.homePlanet.x + previewR * Math.cos(rad);
            const py = p.homePlanet.y + previewR * Math.sin(rad);
            const ptScreen = toScreen(px, py);
            if (i === minDeg) ctx.moveTo(ptScreen.x, ptScreen.y);
            else ctx.lineTo(ptScreen.x, ptScreen.y);
        }
        ctx.strokeStyle = isSlid ? 'rgba(240, 136, 62, 0.95)' : 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.restore();

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
