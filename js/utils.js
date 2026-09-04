// Convex Hull Algorithm (Monotone Chain) to calculate territory
console.log('utils.js loaded');
export const TERRITORY_RADIUS = 50;

export function distToSegmentSquared(P, A, B) {
    const l2 = Math.pow(A.x - B.x, 2) + Math.pow(A.y - B.y, 2);
    if (l2 === 0) return Math.pow(P.x - A.x, 2) + Math.pow(P.y - A.y, 2);
    let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = A.x + t * (B.x - A.x);
    const projY = A.y + t * (B.y - A.y);
    return Math.pow(P.x - projX, 2) + Math.pow(P.y - projY, 2);
}

export function distToSegment(P, A, B) {
    return Math.sqrt(distToSegmentSquared(P, A, B));
}

export function getConvexHull(points) {
    const uniquePoints = [];
    const seen = new Set();
    for (let p of points) {
        let key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        if (!seen.has(key)) { seen.add(key); uniquePoints.push(p); }
    }
    if (uniquePoints.length <= 2) return uniquePoints;

    // Monotone chain algorithm
    const sorted = [...uniquePoints].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let i = 0; i < sorted.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) lower.pop();
        lower.push(sorted[i]);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) upper.pop();
        upper.push(sorted[i]);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

export function pointInPolygon(point, vs) {
    if (vs.length <= 2) {
        for (let v of vs) {
            if (Math.hypot(point.x - v.x, point.y - v.y) <= 0) return true;
        }
        if (vs.length === 2 && distToSegment(point, vs[0], vs[1]) <= 0) return true;
        return false;
    }

    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function doPolygonsIntersect(a, b) {
    if (a.length < 3 || b.length < 3) return false;
    let polygons = [a, b];
    for (let i = 0; i < polygons.length; i++) {
        let polygon = polygons[i];
        for (let j1 = 0; j1 < polygon.length; j1++) {
            let j2 = (j1 + 1) % polygon.length;
            let p1 = polygon[j1];
            let p2 = polygon[j2];

            let normal = { x: p2.y - p1.y, y: p1.x - p2.x };

            let minA = Infinity, maxA = -Infinity;
            for (let p of a) {
                let projected = normal.x * p.x + normal.y * p.y;
                minA = Math.min(minA, projected);
                maxA = Math.max(maxA, projected);
            }

            let minB = Infinity, maxB = -Infinity;
            for (let p of b) {
                let projected = normal.x * p.x + normal.y * p.y;
                minB = Math.min(minB, projected);
                maxB = Math.max(maxB, projected);
            }

            if (maxA < minB || maxB < minA) {
                return false;
            }
        }
    }
    return true;
}

export function isPointInTerritory(pt, player, useTarget = false, extraRadius = 0) {
    const hulls = getPlayerTerritoryHulls(player, [], useTarget);

    for (let hull of hulls) {
        if (pointInPolygon(pt, hull)) return true;

        // Check exact distance along the perimeter (no extra radius unless explicitly provided)
        for (let i = 0; i < hull.length; i++) {
            let A = hull[i];
            let B = hull[(i + 1) % hull.length];
            if (distToSegment(pt, A, B) <= extraRadius) return true;
        }
    }
    return false;
}

export const MAX_CONNECTION_LENGTH = 5;

export function polygonArea(poly) {
    if (!poly || poly.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        let p1 = poly[i];
        let p2 = poly[(i + 1) % poly.length];
        a += (p1.x * p2.y - p2.x * p1.y);
    }
    return Math.abs(a / 2);
}

function prunePolygon(poly) {
    let pts = [...poly];
    let changed = true;
    while (changed && pts.length >= 3) {
        changed = false;
        for (let i = 0; i < pts.length; i++) {
            let next = pts[(i + 1) % pts.length];
            if (Math.hypot(pts[i].x - next.x, pts[i].y - next.y) < 1e-4) {
                pts.splice(i, 1);
                changed = true;
                break;
            }
        }
        if (changed) continue;
        for (let i = 0; i < pts.length; i++) {
            let prev = pts[(i - 1 + pts.length) % pts.length];
            let next = pts[(i + 1) % pts.length];
            if (Math.hypot(prev.x - next.x, prev.y - next.y) < 1e-4) {
                pts.splice(i, 1);
                changed = true;
                break;
            }
        }
    }
    return pts;
}

function splitAtPinchPoints(poly) {
    const counts = new Map();
    for (let p of poly) {
        let k = p.x.toFixed(2) + ',' + p.y.toFixed(2);
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    let hasPinch = false;
    for (let count of counts.values()) {
        if (count > 1) { hasPinch = true; break; }
    }
    if (!hasPinch) return [poly];

    const result = [];
    let current = [];
    const seenMap = new Map();

    for (let i = 0; i < poly.length; i++) {
        let p = poly[i];
        let k = p.x.toFixed(2) + ',' + p.y.toFixed(2);
        if (seenMap.has(k)) {
            let prevIdx = seenMap.get(k);
            let subLoop = current.slice(prevIdx);
            if (subLoop.length >= 3) {
                result.push(subLoop);
            }
            current = current.slice(0, prevIdx);
            seenMap.clear();
            current.forEach((pt, idx) => seenMap.set(pt.x.toFixed(2) + ',' + pt.y.toFixed(2), idx));
        }
        seenMap.set(k, current.length);
        current.push(p);
    }
    if (current.length >= 3) result.push(current);
    return result;
}

function getHullsForComponent(nodes, getPos) {
    if (nodes.length < 3) return [];
    const positions = nodes.map(getPos);
    const unique = [];
    const seen = new Set();
    for (let p of positions) {
        let k = p.x.toFixed(2) + ',' + p.y.toFixed(2);
        if (!seen.has(k)) { seen.add(k); unique.push(p); }
    }
    if (unique.length < 3) return [];

    const convex = getConvexHull(unique);
    if (convex.length < 3) return [];

    const innerNodes = unique.filter(n => !convex.some(c => Math.hypot(c.x - n.x, c.y - n.y) < 1e-4));

    function findShortestBridge(start, end, available) {
        const queue = [[start]];
        const shortestPaths = [];
        let minHops = Infinity;

        while (queue.length > 0) {
            let path = queue.shift();
            if (path.length > minHops) break;
            let curr = path[path.length - 1];

            let d = Math.hypot(curr.x - end.x, curr.y - end.y);
            if (d <= MAX_CONNECTION_LENGTH + 1e-4) {
                shortestPaths.push([...path, end]);
                minHops = path.length;
                continue;
            }

            if (path.length >= minHops) continue;

            for (let cand of available) {
                if (!path.includes(cand)) {
                    let dist = Math.hypot(curr.x - cand.x, curr.y - cand.y);
                    if (dist <= MAX_CONNECTION_LENGTH + 1e-4) {
                        queue.push([...path, cand]);
                    }
                }
            }
        }

        if (shortestPaths.length === 0) return null;

        shortestPaths.sort((p1, p2) => {
            let a1 = 0, a2 = 0;
            for (let k = 0; k < p1.length - 1; k++) a1 += p1[k].x * p1[k + 1].y - p1[k + 1].x * p1[k].y;
            for (let k = 0; k < p2.length - 1; k++) a2 += p2[k].x * p2[k + 1].y - p2[k + 1].x * p2[k].y;
            return Math.abs(a2) - Math.abs(a1);
        });
        return shortestPaths[0];
    }

    let poly = [];
    for (let i = 0; i < convex.length; i++) {
        let A = convex[i];
        let B = convex[(i + 1) % convex.length];
        let d = Math.hypot(A.x - B.x, A.y - B.y);
        if (d <= MAX_CONNECTION_LENGTH + 1e-4) {
            poly.push(A);
        } else {
            let best = findShortestBridge(A, B, innerNodes);
            if (!best) {
                return getHullsForComponent(unique.filter(n => n !== A), p => p);
            }
            for (let k = 0; k < best.length - 1; k++) {
                poly.push(best[k]);
            }
        }
    }

    let cleaned = prunePolygon(poly);
    let loops = splitAtPinchPoints(cleaned);
    let validHulls = [];
    for (let loop of loops) {
        if (loop.length >= 3) {
            let area = polygonArea(loop);
            if (area > 0.1) {
                validHulls.push(loop);
            }
        }
    }
    return validHulls;
}

export function getStationGraph(player, useTarget = false) {
    const nodes = [player.homePlanet, ...player.units.stations];
    const getPos = (n) => {
        if (n === player.homePlanet || !useTarget) return { x: n.x, y: n.y };
        return {
            x: n.targetX !== undefined ? n.targetX : n.x,
            y: n.targetY !== undefined ? n.targetY : n.y
        };
    };

    // 1. Partition nodes into connected groups based on MAX_CONNECTION_LENGTH
    const rawAdj = new Map();
    nodes.forEach(n => rawAdj.set(n, []));
    for (let i = 0; i < nodes.length; i++) {
        let p1 = getPos(nodes[i]);
        for (let j = i + 1; j < nodes.length; j++) {
            let p2 = getPos(nodes[j]);
            let d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (d <= MAX_CONNECTION_LENGTH + 1e-4) {
                rawAdj.get(nodes[i]).push(nodes[j]);
                rawAdj.get(nodes[j]).push(nodes[i]);
            }
        }
    }

    const rawComponents = [];
    const visitedNodes = new Set();
    for (let node of nodes) {
        if (!visitedNodes.has(node)) {
            let comp = [];
            let q = [node];
            visitedNodes.add(node);
            while (q.length > 0) {
                let curr = q.shift();
                comp.push(curr);
                for (let neighbor of rawAdj.get(curr)) {
                    if (!visitedNodes.has(neighbor)) {
                        visitedNodes.add(neighbor);
                        q.push(neighbor);
                    }
                }
            }
            rawComponents.push(comp);
        }
    }

    // 2. Compute convex-prioritized territory hulls for each component
    const allHulls = [];
    for (let comp of rawComponents) {
        if (comp.length >= 3) {
            let compHulls = getHullsForComponent(comp, getPos);
            allHulls.push(...compHulls);
        }
    }

    // 3. Build validEdges
    const validEdges = [];
    const brokenEdges = [];
    const edgeSet = new Set();

    const addEdge = (u, v) => {
        let posA = getPos(u);
        let posB = getPos(v);
        let dist = Math.hypot(posA.x - posB.x, posA.y - posB.y);
        let uIdx = nodes.indexOf(u);
        let vIdx = nodes.indexOf(v);
        let key = Math.min(uIdx, vIdx) + '-' + Math.max(uIdx, vIdx);
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            if (dist <= MAX_CONNECTION_LENGTH + 1e-4) {
                validEdges.push({ nodeA: u, nodeB: v, posA, posB, dist });
            } else {
                brokenEdges.push({ nodeA: u, nodeB: v, posA, posB, dist });
            }
        }
    };

    // Add edges along perimeter of all hulls
    for (let hull of allHulls) {
        for (let i = 0; i < hull.length; i++) {
            let p1 = hull[i];
            let p2 = hull[(i + 1) % hull.length];
            let nodeA = nodes.find(n => {
                let p = getPos(n);
                return Math.hypot(p.x - p1.x, p.y - p1.y) < 1e-4;
            });
            let nodeB = nodes.find(n => {
                let p = getPos(n);
                return Math.hypot(p.x - p2.x, p.y - p2.y) < 1e-4;
            });
            if (nodeA && nodeB) {
                addEdge(nodeA, nodeB);
            }
        }
    }

    // For any node with degree < 2, connect to closest neighbors within MAX_CONNECTION_LENGTH
    for (let node of nodes) {
        let currentDegree = validEdges.filter(e => e.nodeA === node || e.nodeB === node).length;
        if (currentDegree < 2) {
            let others = nodes.filter(n => n !== node);
            others.sort((a, b) => {
                let pa = getPos(a), pb = getPos(b), pn = getPos(node);
                return Math.hypot(pa.x - pn.x, pa.y - pn.y) - Math.hypot(pb.x - pn.x, pb.y - pn.y);
            });
            for (let target of others) {
                let pt = getPos(target), pn = getPos(node);
                let d = Math.hypot(pt.x - pn.x, pt.y - pn.y);
                if (d <= MAX_CONNECTION_LENGTH + 1e-4) {
                    addEdge(node, target);
                    currentDegree++;
                    if (currentDegree >= 2) break;
                }
            }
        }
    }

    // Connected components using validEdges
    const components = [];
    const visited = new Set();
    nodes.forEach((n, i) => n.__tempId = i);

    for (let node of nodes) {
        if (!visited.has(node.__tempId)) {
            let currentComponent = new Set();
            let queue = [node.__tempId];
            visited.add(node.__tempId);
            currentComponent.add(node.__tempId);

            while (queue.length > 0) {
                let currentId = queue.shift();
                for (let edge of validEdges) {
                    let idA = edge.nodeA.__tempId;
                    let idB = edge.nodeB.__tempId;
                    let neighborId = null;
                    if (idA === currentId) neighborId = idB;
                    if (idB === currentId) neighborId = idA;
                    if (neighborId !== null && !visited.has(neighborId)) {
                        visited.add(neighborId);
                        currentComponent.add(neighborId);
                        queue.push(neighborId);
                    }
                }
            }
            components.push(nodes.filter(n => currentComponent.has(n.__tempId)));
        }
    }
    nodes.forEach(n => delete n.__tempId);

    const homeComponentNodes = components.find(comp => comp.includes(player.homePlanet)) || [];

    return {
        validEdges,
        brokenEdges,
        connectedNodes: homeComponentNodes,
        components,
        hulls: allHulls
    };
}

export function getPlayerTerritoryHulls(player, allPlayers, useTarget = false) {
    return getStationGraph(player, useTarget).hulls;
}

// Lenient check for asteroids on the edge of territories
export function isAsteroidInPolygon(ast, player) {
    // Treat the asteroid as "in" if it's within 1.5 grid units of a polygon edge. This prevents boundary flickering.
    return isPointInTerritory(ast, player, false, 1.5);
}

// Geometric intersection helpers
export function doLineSegmentsIntersect(p1, q1, p2, q2) {
    const orientation = (p, q, r) => {
        let val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        if (val === 0) return 0; // collinear
        return (val > 0) ? 1 : 2; // clock or counterclock wise
    };

    const onSegment = (p, q, r) => {
        // We use a small epsilon to account for floating point errors creating false overlapping detection
        const EPSILON = 0.0001;
        return q.x <= Math.max(p.x, r.x) + EPSILON && q.x >= Math.min(p.x, r.x) - EPSILON &&
            q.y <= Math.max(p.y, r.y) + EPSILON && q.y >= Math.min(p.y, r.y) - EPSILON;
    };

    let o1 = orientation(p1, q1, p2);
    let o2 = orientation(p1, q1, q2);
    let o3 = orientation(p2, q2, p1);
    let o4 = orientation(p2, q2, q1);

    if (o1 !== o2 && o3 !== o4) return true;

    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;

    return false;
}

export function distBetweenSegments(A, B, C, D) {
    if (doLineSegmentsIntersect(A, B, C, D)) return 0;
    return Math.sqrt(Math.min(
        distToSegmentSquared(C, A, B),
        distToSegmentSquared(D, A, B),
        distToSegmentSquared(A, C, D),
        distToSegmentSquared(B, C, D)
    ));
}

export function doTerritoriesIntersect(player1, player2, useTarget1 = false, useTarget2 = false) {
    const hulls1 = getPlayerTerritoryHulls(player1, [], useTarget1);
    const hulls2 = getPlayerTerritoryHulls(player2, [], useTarget2);

    for (let hull1 of hulls1) {
        for (let hull2 of hulls2) {
            // Try robust polygon intersection
            if (doPolygonsIntersect(hull1, hull2)) return true;

            // Check perimeter capsules for overlap if polygons are small or narrowly missed
            for (let i = 0; i < hull1.length; i++) {
                let A = hull1[i];
                let B = hull1[(i + 1) % hull1.length];

                for (let j = 0; j < hull2.length; j++) {
                    let C = hull2[j];
                    let D = hull2[(j + 1) % hull2.length];

                    if (A && B && C && D) {
                        // Remove TERRITORY_RADIUS so they only bounce if the exact borders clip
                        if (doLineSegmentsIntersect(A, B, C, D)) return true;
                    }
                }
            }
        }
    }

    return false;
}

export function isValidStationPlacement(proposedX, proposedY, activeStation, activePlayer, allPlayers, canvasWidth, canvasHeight) {
    // Ensure target is within game bounds
    if (proposedX < 0 || proposedX > canvasWidth || proposedY < 0 || proposedY > canvasHeight) return false;

    // Temporarily apply the proposed position to calculate the proposed hull
    const originalTargetX = activeStation.targetX;
    const originalTargetY = activeStation.targetY;
    activeStation.targetX = proposedX;
    activeStation.targetY = proposedY;

    let isValid = true;

    if (isValid) {
        // Restrict dragging into enemy territories to prevent overlap
        const enemyPlayer = allPlayers.find(p => p.id !== activePlayer.id);

        if (doTerritoriesIntersect(activePlayer, enemyPlayer, true, false)) isValid = false;
        if (isValid && doTerritoriesIntersect(activePlayer, enemyPlayer, true, true)) isValid = false;
    }

    // Restore the station's original target position so the input caller can decide whether to actually commit the move
    activeStation.targetX = originalTargetX;
    activeStation.targetY = originalTargetY;

    return isValid;
}
