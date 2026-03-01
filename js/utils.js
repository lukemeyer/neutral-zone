// Convex Hull Algorithm (Monotone Chain) to calculate territory
console.log('utils.js loaded');
export function getConvexHull(points) {
    if (points.length <= 2) return points;
    const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        let p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
}

export function pointInPolygon(point, vs) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;

        // Check if the point lies exactly on the segment
        const crossProduct = (y - yi) * (xj - xi) - (x - xi) * (yj - yi);
        if (Math.abs(crossProduct) < 0.0001) {
            if (x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) {
                return true; // Point is on the boundary
            }
        }

        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function getPlayerTerritoryHull(player, allPlayers, useTarget = false) {
    const scoutPoints = player.units.scouts.map(s => useTarget ? { x: s.targetX, y: s.targetY } : { x: s.x, y: s.y });
    const basePoints = [player.homePlanet, ...scoutPoints];
    return getConvexHull(basePoints);
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

export function doPolygonsIntersect(poly1, poly2) {
    if (poly1.length < 3 || poly2.length < 3) return false;

    // Check if any point of poly1 is inside poly2
    for (let i = 0; i < poly1.length; i++) {
        if (pointInPolygon(poly1[i], poly2)) return true;
    }

    // Check if any point of poly2 is inside poly1
    for (let i = 0; i < poly2.length; i++) {
        if (pointInPolygon(poly2[i], poly1)) return true;
    }

    // Check if any edge of poly1 intersects any edge of poly2
    for (let i = 0; i < poly1.length; i++) {
        let p1 = poly1[i];
        let p2_1 = poly1[(i + 1) % poly1.length];

        for (let j = 0; j < poly2.length; j++) {
            let q1 = poly2[j];
            let q2_1 = poly2[(j + 1) % poly2.length];

            if (doLineSegmentsIntersect(p1, p2_1, q1, q2_1)) return true;
        }
    }

    return false;
}
