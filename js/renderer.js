import { players, asteroids, projectiles, state, stars } from './state.js';
import { getStationGraph, TERRITORY_RADIUS, getPlayerTerritoryHulls } from './utils.js';
console.log('renderer.js loaded');

let canvas;
let ctx;

const terrLayer = document.createElement('canvas');
let tCtx;

export function initRenderer(gameCanvas) {
    canvas = gameCanvas;
    ctx = canvas.getContext('2d');
    tCtx = terrLayer.getContext('2d');
}

import { graphicsCache } from './graphics.js';

function drawHealthBar(x, y, current, max, width = 20) {
    if (current >= max) return; // Only draw when damaged
    const pct = Math.max(0, current / max);
    ctx.fillStyle = 'red';
    ctx.fillRect(x - width / 2, y, width, 4);
    ctx.fillStyle = '#2ea043';
    ctx.fillRect(x - width / 2, y, width * pct, 4);
}

function drawRotatedImage(img, x, y, size, angle) {
    if (!img) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
}

export function draw() {
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.globalAlpha = star.opacity;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Territories
    // Draw Territories
    players.forEach(p => {
        let isProjecting = p.units.stations.some(s => Math.hypot(s.targetX - s.x, s.targetY - s.y) > 5);

        const drawTerritoryArea = (g, alpha, isProj, hull) => {
            if (terrLayer.width !== canvas.width || terrLayer.height !== canvas.height) {
                terrLayer.width = canvas.width;
                terrLayer.height = canvas.height;
            }
            tCtx.clearRect(0, 0, terrLayer.width, terrLayer.height);
            const fillStyle = p.id === 0 ? 'rgba(46, 160, 67, 1)' : 'rgba(218, 54, 51, 1)';
            tCtx.fillStyle = fillStyle;
            tCtx.strokeStyle = fillStyle;
            tCtx.lineCap = 'round';
            tCtx.lineJoin = 'round';

            if (hull.length > 2) {
                tCtx.beginPath();
                tCtx.moveTo(hull[0].x, hull[0].y);
                for (let i = 1; i < hull.length; i++) tCtx.lineTo(hull[i].x, hull[i].y);
                tCtx.closePath();
                tCtx.fill();
            }

            if (hull.length > 1) {
                tCtx.lineWidth = 2; // Thin explicit sharp boundary lines
                tCtx.beginPath();
                tCtx.moveTo(hull[0].x, hull[0].y);
                for (let i = 1; i < hull.length; i++) tCtx.lineTo(hull[i].x, hull[i].y);
                tCtx.closePath();
                tCtx.stroke();
            }

            ctx.globalAlpha = alpha;
            ctx.drawImage(terrLayer, 0, 0);
            ctx.globalAlpha = 1.0;
        };

        const drawGraphLines = (g, isProj) => {
            const colorValid = p.id === 0 ? 'rgba(46, 160, 67, 0.8)' : 'rgba(218, 54, 51, 0.8)';
            const colorBroken = 'rgba(139, 148, 158, 0.4)';

            g.brokenEdges.forEach(e => {
                ctx.beginPath();
                ctx.moveTo(e.posA.x, e.posA.y);
                ctx.lineTo(e.posB.x, e.posB.y);
                ctx.strokeStyle = colorBroken;
                if (isProj) ctx.setLineDash([5, 5]);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]);
            });

            g.validEdges.forEach(e => {
                ctx.beginPath();
                ctx.moveTo(e.posA.x, e.posA.y);
                ctx.lineTo(e.posB.x, e.posB.y);
                ctx.strokeStyle = colorValid;
                if (isProj) ctx.setLineDash([5, 5]);
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
            });
        };

        if (isProjecting) {
            const projectedGraph = getStationGraph(p, true);
            const hulls = getPlayerTerritoryHulls(p, players, true);
            for (let hull of hulls) {
                drawTerritoryArea(projectedGraph, 0.1, true, hull);
            }
            drawGraphLines(projectedGraph, true);
        }

        const graph = getStationGraph(p, false);
        const hulls = getPlayerTerritoryHulls(p, players, false);
        for (let hull of hulls) {
            drawTerritoryArea(graph, 0.25, false, hull);
        }
        drawGraphLines(graph, false);

        // Fighter Paths
        p.units.fighters.forEach(f => {
            // Only draw existing paths if we aren't currently drawing a new one for this selected fighter
            const isDrawingForThisFighter = state.drawingPath && state.selectedFighters && state.selectedFighters.includes(f);
            if (f.path && f.path.length > 0 && !isDrawingForThisFighter) {
                ctx.beginPath();
                ctx.moveTo(f.path[0].x, f.path[0].y);
                for (let i = 1; i < f.path.length; i++) ctx.lineTo(f.path[i].x, f.path[i].y);
                ctx.strokeStyle = p.id === 0 ? 'rgba(88, 166, 255, 0.4)' : 'rgba(248, 81, 73, 0.4)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });
    });

    // Draw active drawing path
    if (state.drawingPath && state.currentPath.length > 0) {
        ctx.beginPath();
        ctx.moveTo(state.currentPath[0].x, state.currentPath[0].y);
        for (let i = 1; i < state.currentPath.length; i++) ctx.lineTo(state.currentPath[i].x, state.currentPath[i].y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // White temporary path
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw Selection Box
    if (state.selectionBox) {
        const minX = Math.min(state.selectionBox.startX, state.selectionBox.endX);
        const maxX = Math.max(state.selectionBox.startX, state.selectionBox.endX);
        const minY = Math.min(state.selectionBox.startY, state.selectionBox.endY);
        const maxY = Math.max(state.selectionBox.startY, state.selectionBox.endY);

        ctx.fillStyle = 'rgba(88, 166, 255, 0.2)';
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
    }

    // Draw Asteroids
    asteroids.forEach(a => {
        if (a.resources <= 0) return;

        const img = graphicsCache.asteroids[a.variant] || graphicsCache.asteroids[0];
        if (img) {
            ctx.drawImage(img, a.x - a.radius, a.y - a.radius, a.radius * 2, a.radius * 2);
        } else {
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#8b949e';
            ctx.fill();
        }

        ctx.fillStyle = 'white';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(a.resources), a.x, a.y - a.radius - 5);
    });

    // Draw Units & Planets
    players.forEach(p => {
        const cache = p.id === 0 ? graphicsCache.p1 : graphicsCache.p2;

        // Home Planet
        const planetImg = p.id === 0 ? graphicsCache.planet1 : graphicsCache.planet2;
        if (planetImg) {
            ctx.drawImage(planetImg, p.homePlanet.x - p.homePlanet.radius, p.homePlanet.y - p.homePlanet.radius, p.homePlanet.radius * 2, p.homePlanet.radius * 2);
        } else {
            ctx.beginPath();
            ctx.arc(p.homePlanet.x, p.homePlanet.y, p.homePlanet.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        if (p.homePlanet.damageTime > 0) {
            ctx.beginPath();
            ctx.arc(p.homePlanet.x, p.homePlanet.y, p.homePlanet.radius + 10, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(218, 54, 51, ${p.homePlanet.damageTime * 2})`;
            ctx.fill();
        }
        drawHealthBar(p.homePlanet.x, p.homePlanet.y + p.homePlanet.radius + 10, p.homePlanet.health, p.homePlanet.maxHealth, 40);

        // Stations
        p.units.stations.forEach(s => {
            const isMoving = Math.hypot(s.targetX - s.x, s.targetY - s.y) > 5;
            if (isMoving) {
                ctx.beginPath();
                ctx.arc(s.targetX, s.targetY, 10, 0, Math.PI * 2);
                ctx.fillStyle = p.id === 0 ? 'rgba(46, 160, 67, 0.4)' : 'rgba(218, 54, 51, 0.4)';
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(s.x, s.y, 50, 0, Math.PI * 2);
                ctx.strokeStyle = p.id === 0 ? 'rgba(46, 160, 67, 0.15)' : 'rgba(218, 54, 51, 0.15)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Calculate angle matching desired movement
            let angle = Math.atan2(s.targetY - s.y, s.targetX - s.x) + Math.PI / 2;
            if (!isMoving) angle = 0; // Upright if stationary

            if (s.damageTime > 0) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, 16, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(218, 54, 51, ${s.damageTime * 2})`;
                ctx.fill();
            }

            drawRotatedImage(cache.station, s.x, s.y, 26, angle);
            drawHealthBar(s.x, s.y - 20, s.health, s.maxHealth);
        });

        // Fighters
        p.units.fighters.forEach(f => {
            // Determine direction. If they have a path, point towards next node. 
            // If they are colliding/repelling, we don't have a rigid velocity vector so we use path if available
            let angle = 0;
            if (f.cooldown > 0 && f.lastTargetAngle !== undefined) {
                // Face the target we just fired at
                angle = f.lastTargetAngle;
            } else if (f.pursuitTarget) {
                // Face the pursuit target if actively engaging but not firing yet
                angle = Math.atan2(f.pursuitTarget.y - f.y, f.pursuitTarget.x - f.x) + Math.PI / 2;
            } else if (f.path && f.path.length > 0) {
                const targetPoint = f.path[f.pathIndex];
                if (targetPoint) {
                    angle = Math.atan2(targetPoint.y - f.y, targetPoint.x - f.x) + Math.PI / 2;
                }
            }

            drawRotatedImage(cache.fighter, f.x, f.y, 24, angle);

            if (state.selectedFighters && state.selectedFighters.includes(f)) {
                ctx.beginPath();
                ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            if (f.damageTime > 0) {
                ctx.beginPath();
                ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(218, 54, 51, ${f.damageTime * 2})`;
                ctx.fill();
            }

            if (f.cooldown > 0.4) {
                // Draw a symmetric firing starburst (4-point cross)
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(angle);

                ctx.beginPath();
                ctx.moveTo(0, -22); // Top point
                ctx.lineTo(-4, -14); // Left inner
                ctx.lineTo(-12, -14); // Left outer
                ctx.lineTo(-4, -10); // Bottom left inner
                ctx.lineTo(0, -2); // Bottom outer
                ctx.lineTo(4, -10); // Bottom right inner
                ctx.lineTo(12, -14); // Right outer
                ctx.lineTo(4, -14); // Right inner
                ctx.closePath();

                ctx.fillStyle = 'rgba(255, 255, 100, 0.9)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.restore();
            }

            drawHealthBar(f.x, f.y - 20, f.health, f.maxHealth);
        });

        // Miners
        p.units.miners.forEach(m => {
            let angle = 0;
            if (m.returning) {
                angle = Math.atan2(p.homePlanet.y - m.y, p.homePlanet.x - m.x) + Math.PI / 2;
            } else if (m.targetAsteroid) {
                angle = Math.atan2(m.targetAsteroid.y - m.y, m.targetAsteroid.x - m.x) + Math.PI / 2;
            }

            const isMining = m.targetAsteroid && Math.hypot(m.targetAsteroid.x - m.x, m.targetAsteroid.y - m.y) <= 20;

            if (m.damageTime > 0) {
                ctx.beginPath();
                ctx.arc(m.x, m.y, 16, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(218, 54, 51, ${m.damageTime * 2})`;
                ctx.fill();
            }

            drawRotatedImage(isMining ? cache.minerActive : cache.miner, m.x, m.y, 24, angle);

            if (m.payload > 0) {
                const ratio = m.payload / 25;
                ctx.fillStyle = '#2ea043';
                ctx.fillRect(m.x - 4, (m.y + 12) - (8 * ratio), 8, 8 * ratio);
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
}
