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

export function getStationGraph(player, useTarget = false) {
    const nodes = [player.homePlanet, ...player.units.stations];
    nodes.forEach((n, i) => n.__tempId = i);

    const getPos = (n) => {
        if (n === player.homePlanet) return n;
        return useTarget ? { x: n.targetX, y: n.targetY } : { x: n.x, y: n.y };
    };

    const validEdges = [];
    const brokenEdges = [];
    const edgeSet = new Set();

    for (let s of player.units.stations) {
        let pos1 = getPos(s);
        let others = nodes.filter(n => n !== s);

        others.sort((a, b) => {
            let pa = getPos(a);
            let pb = getPos(b);
            return Math.hypot(pa.x - pos1.x, pa.y - pos1.y) - Math.hypot(pb.x - pos1.x, pb.y - pos1.y);
        });

        let closest = others.slice(0, 2);

        for (let c of closest) {
            let pos2 = getPos(c);
            let dist = Math.hypot(pos2.x - pos1.x, pos2.y - pos1.y);
            let minId = Math.min(s.__tempId, c.__tempId);
            let maxId = Math.max(s.__tempId, c.__tempId);
            let edgeHash = minId + '-' + maxId;

            if (!edgeSet.has(edgeHash)) {
                edgeSet.add(edgeHash);
                if (dist <= MAX_CONNECTION_LENGTH) {
                    validEdges.push({ nodeA: s, nodeB: c, posA: pos1, posB: pos2, dist });
                } else {
                    brokenEdges.push({ nodeA: s, nodeB: c, posA: pos1, posB: pos2, dist });
                }
            }
        }
    }

    // Find all disconnected components
    const components = [];
    const visited = new Set();

    for (let node of nodes) {
        if (!visited.has(node.__tempId)) {
            let currentComponent = new Set();
            let queue = [node.__tempId];
            visited.add(node.__tempId);
            currentComponent.add(node.__tempId);

            while (queue.length > 0) {
                let currentId = queue.shift();

                // Find all edges connected to this node
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

    // Filter out components that lack a path to the home planet.
    // Ensure only the component containing the home planet remains valid territory.
    const homeComponentNodes = components.find(comp => comp.includes(player.homePlanet)) || [];

    // All graph operations now return the entire set of valid sub-components
    return { validEdges, brokenEdges, connectedNodes: homeComponentNodes, components };
}

export function getPlayerTerritoryHulls(player, allPlayers, useTarget = false) {
    const graph = getStationGraph(player, useTarget);
    const hulls = [];
    const getPos = (n) => useTarget ? { x: n.targetX, y: n.targetY } : { x: n.x, y: n.y };

    for (let comp of graph.components) {
        if (comp.length < 3) continue;

        const adj = new Map();
        comp.forEach(n => adj.set(n, []));

        for (let e of graph.validEdges) {
            if (adj.has(e.nodeA) && adj.has(e.nodeB)) {
                adj.get(e.nodeA).push(e.nodeB);
                adj.get(e.nodeB).push(e.nodeA);
            }
        }

        for (let [u, neighbors] of adj.entries()) {
            let p1 = getPos(u);
            neighbors.sort((a, b) => {
                let pa = getPos(a);
                let pb = getPos(b);
                return Math.atan2(pa.y - p1.y, pa.x - p1.x) - Math.atan2(pb.y - p1.y, pb.x - p1.x);
            });
        }

        const seen = new Set();
        let nodeId = new Map();
        comp.forEach((n, i) => nodeId.set(n, i));

        for (let u of adj.keys()) {
            for (let v of adj.get(u)) {
                let edgeKey = nodeId.get(u) + '-' + nodeId.get(v);
                if (seen.has(edgeKey)) continue;

                let curr = u, next = v;
                let faceNodes = [];
                let isCycle = false;

                while (true) {
                    seen.add(nodeId.get(curr) + '-' + nodeId.get(next));
                    faceNodes.push(getPos(curr));

                    let nextNeighbors = adj.get(next);
                    let idx = nextNeighbors.indexOf(curr);
                    let nextNext = nextNeighbors[(idx + 1) % nextNeighbors.length];

                    curr = next;
                    next = nextNext;

                    if (curr === u && next === v) {
                        isCycle = true;
                        break;
                    }
                    if (faceNodes.length > comp.length * 5) break;
                }

                if (isCycle && faceNodes.length >= 3) {
                    let area = 0;
                    for (let i = 0; i < faceNodes.length; i++) {
                        let p1 = faceNodes[i];
                        let p2 = faceNodes[(i + 1) % faceNodes.length];
                        area += (p2.x - p1.x) * (p2.y + p1.y);
                    }
                    if (area > 0.1) {
                        hulls.push(faceNodes);
                    }
                }
            }
        }
    }
    return hulls;
}

// Lenient check for asteroids on the edge of territories
export function isAsteroidInPolygon(ast, player) {
    return isPointInTerritory(ast, player, false, ast.radius - 2);
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
