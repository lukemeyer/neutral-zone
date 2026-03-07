import { players, state } from './state.js';
import { isValidStationPlacement, getStationGraph, MAX_CONNECTION_LENGTH } from './utils.js';
console.log('input.js loaded');

let canvas;

export function initInput(gameCanvas) {
    canvas = gameCanvas;

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
        if (!state.gameStarted) return;
        e.preventDefault();
        const pos = getMousePos(e);
        const mouseX = pos.x;
        const mouseY = pos.y;

        // Check Stations first (for dragging target)
        for (let p of players) {
            if (p.isCPU) continue;
            for (let s of p.units.stations) {
                if (Math.hypot(s.x - mouseX, s.y - mouseY) < 40 || Math.hypot(s.targetX - mouseX, s.targetY - mouseY) < 40) {
                    state.activeStation = s;
                    state.activeStationPlayer = p;
                    return; // drag station
                }
            }
        }

        // Check Fighters (for selection OR path drawing)
        let clickedFighter = null;
        for (let p of players) {
            if (p.isCPU) continue;
            for (let f of p.units.fighters) {
                if (Math.hypot(f.x - mouseX, f.y - mouseY) < 40) {
                    clickedFighter = f;
                    break;
                }
            }
        }

        if (clickedFighter) {
            if (!state.selectedFighters.includes(clickedFighter)) {
                // Should click add to selection? Requirement: "if a user selects another fighter by tapping/clicking while one is alredy selected it will add to the group"
                state.selectedFighters.push(clickedFighter);
            }
            state.drawingPath = true;
            state.currentPath = [{ x: mouseX, y: mouseY }];
            state.clickedFighterClick = true;
            return;
        }

        state.clickedFighterClick = false;

        // If clicked empty space
        if (state.selectedFighters.length > 0) {
            // Start drawing a path for the selected group
            state.drawingPath = true;
            state.currentPath = [{ x: mouseX, y: mouseY }];
        } else {
            // No fighters selected, start drag box selection
            state.selectionBox = { startX: mouseX, startY: mouseY, endX: mouseX, endY: mouseY };
        }
    });

    const MAX_EDGE_LENGTH = 350;

    canvas.addEventListener('pointermove', (e) => {
        if (!state.gameStarted) return;
        e.preventDefault();
        const pos = getMousePos(e);
        const mouseX = pos.x;
        const mouseY = pos.y;

        if (state.selectionBox) {
            state.selectionBox.endX = mouseX;
            state.selectionBox.endY = mouseY;
        }

        if (state.activeStation && state.activeStationPlayer) {
            const proposedX = mouseX;
            const proposedY = mouseY;

            const initialGraph = getStationGraph(state.activeStationPlayer, true);
            const edgesToEnforce = initialGraph.validEdges.filter(e =>
                initialGraph.components.some(comp => comp.includes(e.nodeA))
            );

            const backupTargets = state.activeStationPlayer.units.stations.map(s => ({ s, tx: s.targetX, ty: s.targetY }));
            const origActX = backupTargets.find(b => b.s === state.activeStation).tx;
            const origActY = backupTargets.find(b => b.s === state.activeStation).ty;

            const applyIK = (propX, propY) => {
                backupTargets.forEach(b => { b.s.targetX = b.tx; b.s.targetY = b.ty; });
                state.activeStation.targetX = propX;
                state.activeStation.targetY = propY;
                for (let i = 0; i < 5; i++) {
                    for (let edge of edgesToEnforce) {
                        let A = edge.nodeA;
                        let B = edge.nodeB;
                        let dx = B.targetX - A.targetX;
                        let dy = B.targetY - A.targetY;
                        let dist = Math.hypot(dx, dy);
                        if (dist > MAX_CONNECTION_LENGTH) {
                            let diff = dist - MAX_CONNECTION_LENGTH;
                            let nx = dx / dist;
                            let ny = dy / dist;
                            let movA = (A === state.activeStation || A === state.activeStationPlayer.homePlanet) ? 0 : 1;
                            let movB = (B === state.activeStation || B === state.activeStationPlayer.homePlanet) ? 0 : 1;
                            if (movA + movB > 0) {
                                let totalW = movA + movB;
                                if (movA > 0) { A.targetX += nx * (diff * (movA / totalW)); A.targetY += ny * (diff * (movA / totalW)); }
                                if (movB > 0) { B.targetX -= nx * (diff * (movB / totalW)); B.targetY -= ny * (diff * (movB / totalW)); }
                            }
                        }
                    }
                }
            };

            const checkValid = () => isValidStationPlacement(state.activeStation.targetX, state.activeStation.targetY, state.activeStation, state.activeStationPlayer, players, canvas.width, canvas.height);

            applyIK(proposedX, proposedY);

            if (!checkValid()) {
                let low = 0; let high = 1; let bestT = 0;
                for (let step = 0; step < 10; step++) {
                    let mid = (low + high) / 2;
                    applyIK(origActX + (proposedX - origActX) * mid, origActY + (proposedY - origActY) * mid);
                    if (checkValid()) { bestT = mid; low = mid; }
                    else { high = mid; }
                }
                applyIK(origActX + (proposedX - origActX) * bestT, origActY + (proposedY - origActY) * bestT);
            }
        }

        if (state.drawingPath && state.selectedFighters.length > 0) {
            const lastPoint = state.currentPath[state.currentPath.length - 1];
            if (Math.hypot(lastPoint.x - mouseX, lastPoint.y - mouseY) > 15) {
                state.currentPath.push({ x: mouseX, y: mouseY });
            }
        }
    });

    const handleMouseUpOrLeave = (e) => {
        e.preventDefault();
        if (state.selectionBox) {
            // Apply box selection
            const minX = Math.min(state.selectionBox.startX, state.selectionBox.endX);
            const maxX = Math.max(state.selectionBox.startX, state.selectionBox.endX);
            const minY = Math.min(state.selectionBox.startY, state.selectionBox.endY);
            const maxY = Math.max(state.selectionBox.startY, state.selectionBox.endY);

            // If it was just a click (or tiny drag), we stay with empty selection
            if (maxX - minX > 5 || maxY - minY > 5) {
                for (let p of players) {
                    if (p.isCPU) continue;
                    for (let f of p.units.fighters) {
                        if (f.x >= minX && f.x <= maxX && f.y >= minY && f.y <= maxY) {
                            if (!state.selectedFighters.includes(f)) {
                                state.selectedFighters.push(f);
                            }
                        }
                    }
                }
            }
            state.selectionBox = null;
        }

        if (state.drawingPath && state.selectedFighters.length > 0) {
            // Only assign the path if they actually dragged it OR if they clicked on empty space (which acts as a move command)
            if (state.currentPath.length > 1 || !state.clickedFighterClick) {
                // Close loop if drawn back to start and path is long enough
                const firstP = state.currentPath[0];
                const lastP = state.currentPath[state.currentPath.length - 1];
                let isLoop = false;

                if (state.currentPath.length > 5 && Math.hypot(firstP.x - lastP.x, firstP.y - lastP.y) < 30) {
                    isLoop = true;
                    state.currentPath.push({ x: firstP.x, y: firstP.y });
                }

                // Assign the drawn path to all selected fighters
                state.selectedFighters.forEach(f => {
                    // Determine closest point on path to set as initial pathIndex
                    let closestIndex = 0;
                    let minDist = Infinity;
                    state.currentPath.forEach((pt, i) => {
                        let d = Math.hypot(pt.x - f.x, pt.y - f.y);
                        if (d < minDist) {
                            minDist = d;
                            closestIndex = i;
                        }
                    });

                    f.path = [...state.currentPath];
                    f.isLoop = isLoop;
                    f.pathIndex = closestIndex;
                    f.pathDir = 1;
                });
            }
        }

        state.activeStation = null;
        state.activeStationPlayer = null;
        state.drawingPath = false;
        state.currentPath = [];
    };

    canvas.addEventListener('pointerup', handleMouseUpOrLeave);
    canvas.addEventListener('pointercancel', handleMouseUpOrLeave);
    canvas.addEventListener('pointerleave', handleMouseUpOrLeave);
}

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / (rect.width / canvas.width),
        y: (e.clientY - rect.top) / (rect.height / canvas.height)
    };
}
