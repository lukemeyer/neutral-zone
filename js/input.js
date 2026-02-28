import { players, state } from './state.js';
import { getConvexHull } from './utils.js';
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

        // Check Scouts first (for dragging target)
        for (let p of players) {
            if (p.isCPU) continue;
            for (let s of p.units.scouts) {
                if (Math.hypot(s.x - mouseX, s.y - mouseY) < 20 || Math.hypot(s.targetX - mouseX, s.targetY - mouseY) < 20) {
                    state.activeScout = s;
                    state.activeScoutPlayer = p;
                    return; // drag scout
                }
            }
        }

        // Check Fighters (for selection OR path drawing)
        let clickedFighter = null;
        for (let p of players) {
            if (p.isCPU) continue;
            for (let f of p.units.fighters) {
                if (Math.hypot(f.x - mouseX, f.y - mouseY) < 20) {
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

        if (state.activeScout && state.activeScoutPlayer) {
            const originalX = state.activeScout.targetX;
            const originalY = state.activeScout.targetY;
            const proposedX = mouseX;
            const proposedY = mouseY;

            const checkHullValid = (x, y) => {
                state.activeScout.targetX = x;
                state.activeScout.targetY = y;
                const points = [state.activeScoutPlayer.homePlanet, ...state.activeScoutPlayer.units.scouts.map(s => ({ x: s.targetX, y: s.targetY }))];
                const hull = getConvexHull(points);

                let perimeter = 0;
                for (let i = 0; i < hull.length; i++) {
                    let p1 = hull[i];
                    let p2 = hull[(i + 1) % hull.length];
                    perimeter += Math.hypot(p1.x - p2.x, p1.y - p2.y);
                }

                const MAX_PERIMETER = (state.activeScoutPlayer.units.scouts.length + 1) * 350;
                return perimeter <= MAX_PERIMETER;
            };

            if (checkHullValid(proposedX, proposedY)) {
                state.activeScout.targetX = proposedX;
                state.activeScout.targetY = proposedY;
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
                    state.activeScout.targetX = originalX + (proposedX - originalX) * bestT;
                    state.activeScout.targetY = originalY + (proposedY - originalY) * bestT;
                } else {
                    state.activeScout.targetX = originalX;
                    state.activeScout.targetY = originalY;
                }
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

        state.activeScout = null;
        state.activeScoutPlayer = null;
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
