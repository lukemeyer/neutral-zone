import { players, asteroids, projectiles, state } from './state.js';
import { getConvexHull } from './utils.js';
console.log('renderer.js loaded');

let canvas;
let ctx;

export function initRenderer(gameCanvas) {
    canvas = gameCanvas;
    ctx = canvas.getContext('2d');
}

function drawHealthBar(x, y, current, max, width = 20) {
    if (current >= max) return; // Only draw when damaged
    const pct = Math.max(0, current / max);
    ctx.fillStyle = 'red';
    ctx.fillRect(x - width / 2, y, width, 4);
    ctx.fillStyle = '#2ea043';
    ctx.fillRect(x - width / 2, y, width * pct, 4);
}

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

export function draw() {
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
            // Highlight if selected
            if (state.selectedFighters && state.selectedFighters.includes(f)) {
                ctx.beginPath();
                ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            drawHealthBar(f.x, f.y - 20, f.health, f.maxHealth);
        });

        // Miners
        p.units.miners.forEach(m => {
            drawSquare(m.x, m.y, m.returning ? '#a371f7' : (p.id === 0 ? '#d2a8ff' : '#ff7b72'));
            if (m.payload > 0) {
                const ratio = m.payload / 25;
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
}
