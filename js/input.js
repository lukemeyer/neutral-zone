import { players, state, GRID_W, GRID_H } from './state.js';
import { isValidStationPlacement, getStationGraph, MAX_CONNECTION_LENGTH } from './utils.js';
console.log('input.js loaded');

let canvas;

export function initInput(gameCanvas) {
    canvas = gameCanvas;

    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (state.selectedFighters.length > 0) {
            state.selectedFighters.forEach(f => {
                f.path = [];
                f.pursuitTarget = null;
            });
            state.selectedFighters = [];
        }
    });

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape' || e.key === 'x' || e.key === 'X') {
            if (state.selectedFighters.length > 0) {
                state.selectedFighters.forEach(f => {
                    f.path = [];
                    f.pursuitTarget = null;
                });
                state.selectedFighters = [];
            }
        }
    });

    canvas.addEventListener('pointerdown', (e) => {
        if (!state.gameStarted) return;
        e.preventDefault();
        const pos = getMousePos(e);
        const mouseX = pos.x / (canvas.width / GRID_W);
        const mouseY = pos.y / (canvas.height / GRID_H);

        // Check Stations first (for dragging target)
        for (let p of players) {
            if (p.isCPU) continue;
            for (let s of p.units.stations) {
                if (Math.hypot(s.x - mouseX, s.y - mouseY) < 1.0 || Math.hypot(s.targetX - mouseX, s.targetY - mouseY) < 1.0) {
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
                if (Math.hypot(f.x - mouseX, f.y - mouseY) < 1.0) {
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
        const mouseX = pos.x / (canvas.width / GRID_W);
        const mouseY = pos.y / (canvas.height / GRID_H);

        if (state.selectionBox) {
            state.selectionBox.endX = mouseX;
            state.selectionBox.endY = mouseY;
        }

        if (state.activeStation && state.activeStationPlayer) {
            const proposedX = mouseX;
            const proposedY = mouseY;

            const origTargetX = state.activeStation.targetX;
            const origTargetY = state.activeStation.targetY;

            const checkValid = () => isValidStationPlacement(state.activeStation.targetX, state.activeStation.targetY, state.activeStation, state.activeStationPlayer, players, GRID_W, GRID_H);

            state.activeStation.targetX = proposedX;
            state.activeStation.targetY = proposedY;

            if (!checkValid()) {
                let low = 0; let high = 1; let bestT = 0;
                for (let step = 0; step < 10; step++) {
                    let mid = (low + high) / 2;
                    state.activeStation.targetX = origTargetX + (proposedX - origTargetX) * mid;
                    state.activeStation.targetY = origTargetY + (proposedY - origTargetY) * mid;
                    if (checkValid()) { bestT = mid; low = mid; }
                    else { high = mid; }
                }
                state.activeStation.targetX = origTargetX + (proposedX - origTargetX) * bestT;
                state.activeStation.targetY = origTargetY + (proposedY - origTargetY) * bestT;
            }
        }

        if (state.drawingPath && state.selectedFighters.length > 0) {
            const lastPoint = state.currentPath[state.currentPath.length - 1];
            if (Math.hypot(lastPoint.x - mouseX, lastPoint.y - mouseY) > 0.5) {
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
            if (maxX - minX > 0.1 || maxY - minY > 0.1) {
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

                if (state.currentPath.length > 5 && Math.hypot(firstP.x - lastP.x, firstP.y - lastP.y) < 1.0) {
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
