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

export function polygonSignedArea(poly) {
    if (!poly || poly.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        let p1 = poly[i];
        let p2 = poly[(i + 1) % poly.length];
        a += (p1.x * p2.y - p2.x * p1.y);
    }
    return a / 2;
}

export function polygonArea(poly) {
    return Math.abs(polygonSignedArea(poly));
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

    const hpX = player.homePlanet ? player.homePlanet.x.toFixed(2) : '0';
    const hpY = player.homePlanet ? player.homePlanet.y.toFixed(2) : '0';
    const cacheKey = `${useTarget}:${hpX},${hpY}:${player.units.stations.map(s => {
        let x = (useTarget && s.targetX !== undefined) ? s.targetX : s.x;
        let y = (useTarget && s.targetY !== undefined) ? s.targetY : s.y;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(';')}`;

    if (player.__graphCache && player.__graphCache.key === cacheKey) {
        return player.__graphCache.result;
    }

    const n = nodes.length;
    const positions = nodes.map(getPos);

    // 1. Find all candidate edges <= MAX_CONNECTION_LENGTH
    const candidateEdges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            let dist = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
            if (dist <= MAX_CONNECTION_LENGTH + 1e-4) {
                candidateEdges.push({ u: i, v: j, dist });
            }
        }
    }
    // Prioritize shorter edges to build compact Delaunay-like planar cells
    candidateEdges.sort((a, b) => a.dist - b.dist);

    // 2. Greedily add non-crossing edges that do not pass through intermediate stations
    const planarEdges = [];
    for (let cand of candidateEdges) {
        let p1 = positions[cand.u];
        let p2 = positions[cand.v];

        let passesThroughOther = false;
        for (let k = 0; k < n; k++) {
            if (k === cand.u || k === cand.v) continue;
            if (distToSegment(positions[k], p1, p2) < 0.05) {
                passesThroughOther = true;
                break;
            }
        }
        if (passesThroughOther) continue;

        let crosses = false;
        for (let existing of planarEdges) {
            if (cand.u === existing.u || cand.u === existing.v || cand.v === existing.u || cand.v === existing.v) {
                continue;
            }
            let q1 = positions[existing.u];
            let q2 = positions[existing.v];
            if (doLineSegmentsIntersect(p1, p2, q1, q2)) {
                crosses = true;
                break;
            }
        }
        if (!crosses) {
            planarEdges.push(cand);
        }
    }

    // 3. Build adjacency list of directed half-edges with angles
    const adj = Array.from({ length: n }, () => []);
    for (let edge of planarEdges) {
        let pU = positions[edge.u];
        let pV = positions[edge.v];
        let angleUV = Math.atan2(pV.y - pU.y, pV.x - pU.x);
        let angleVU = Math.atan2(pU.y - pV.y, pU.x - pV.x);

        adj[edge.u].push({ to: edge.v, angle: angleUV, edgeRef: edge });
        adj[edge.v].push({ to: edge.u, angle: angleVU, edgeRef: edge });
    }

    for (let i = 0; i < n; i++) {
        adj[i].sort((a, b) => a.angle - b.angle);
    }

    // 4. Half-edge face traversal to extract all interior planar faces
    const visitedHalfEdges = new Set();
    const halfEdgeKey = (u, v) => `${u}->${v}`;

    const faces = [];
    for (let u = 0; u < n; u++) {
        for (let out of adj[u]) {
            let v = out.to;
            let key = halfEdgeKey(u, v);
            if (visitedHalfEdges.has(key)) continue;

            const face = [];
            let currU = u;
            let currV = v;
            let loopKey = halfEdgeKey(currU, currV);

            while (!visitedHalfEdges.has(loopKey)) {
                visitedHalfEdges.add(loopKey);
                face.push(currU);

                let vOutList = adj[currV];
                let revIdx = vOutList.findIndex(e => e.to === currU);
                if (revIdx === -1) break;

                // Turn leftmost in cyclic angular order
                let nextIdx = (revIdx - 1 + vOutList.length) % vOutList.length;
                let nextOut = vOutList[nextIdx];

                currU = currV;
                currV = nextOut.to;
                loopKey = halfEdgeKey(currU, currV);
            }

            if (face.length >= 3) {
                let poly = face.map(idx => positions[idx]);
                let sArea = polygonSignedArea(poly);
                // Bounded interior faces have positive signedArea
                if (sArea > 0.05) {
                    faces.push({ nodeIndices: face, poly, area: sArea });
                }
            }
        }
    }

    // 5. Track edge usage for perimeter calculation (boundary vs internal chords)
    const edgeUsage = new Map();
    for (let face of faces) {
        let fNodes = face.nodeIndices;
        for (let i = 0; i < fNodes.length; i++) {
            let u = fNodes[i];
            let v = fNodes[(i + 1) % fNodes.length];
            let k = Math.min(u, v) + '-' + Math.max(u, v);
            edgeUsage.set(k, (edgeUsage.get(k) || 0) + 1);
        }
    }

    const validEdges = [];
    const perimeterEdges = [];
    for (let edge of planarEdges) {
        let nodeA = nodes[edge.u];
        let nodeB = nodes[edge.v];
        let posA = positions[edge.u];
        let posB = positions[edge.v];
        let edgeObj = { nodeA, nodeB, posA, posB, dist: edge.dist };
        validEdges.push(edgeObj);

        let k = Math.min(edge.u, edge.v) + '-' + Math.max(edge.u, edge.v);
        let count = edgeUsage.get(k) || 0;
        if (count <= 1) {
            perimeterEdges.push(edgeObj);
        }
    }

    // 6. Connected components
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

    const allHulls = faces.map(f => f.poly);

    const result = {
        validEdges,
        perimeterEdges,
        brokenEdges: [],
        connectedNodes: homeComponentNodes,
        components,
        hulls: allHulls
    };

    player.__graphCache = { key: cacheKey, result };
    return result;
}

export function getPlayerTerritoryHulls(player, allPlayers, useTarget = false) {
    return getStationGraph(player, useTarget).hulls;
}

// Lenient check for asteroids on the edge of territories
export function isAsteroidInPolygon(ast, player, allPlayers = null) {
    if (allPlayers && Array.isArray(allPlayers)) {
        const enemy = allPlayers.find(op => op && op.id !== player.id);
        if (enemy && isPointInTerritory(ast, enemy, false, 0)) {
            return false;
        }
    }
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

    if (isValid && allPlayers) {
        // Restrict dragging into enemy territories to prevent overlap
        const enemyPlayer = allPlayers.find(p => p && p.id !== activePlayer.id);
        if (enemyPlayer && isPointInTerritory({ x: proposedX, y: proposedY }, enemyPlayer, false, 0.2)) {
            isValid = false;
        }
        if (isValid && enemyPlayer) {
            if (doTerritoriesIntersect(activePlayer, enemyPlayer, true, false)) isValid = false;
            if (isValid && doTerritoriesIntersect(activePlayer, enemyPlayer, true, true)) isValid = false;
        }
    }

    // Restore the station's original target position so the input caller can decide whether to actually commit the move
    activeStation.targetX = originalTargetX;
    activeStation.targetY = originalTargetY;

    return isValid;
}
