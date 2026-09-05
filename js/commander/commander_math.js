// Radial Geometry & Mathematical Engine for Neutral Zone: Commander Variant

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

export function isPointInFan(pt, poly) {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    const x = pt.x, y = pt.y;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function doLineSegmentsIntersect(p1, q1, p2, q2) {
    const orientation = (p, q, r) => {
        let val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        if (Math.abs(val) < 1e-9) return 0;
        return (val > 0) ? 1 : 2;
    };
    const onSegment = (p, q, r) => {
        return q.x <= Math.max(p.x, r.x) + 1e-5 && q.x >= Math.min(p.x, r.x) - 1e-5 &&
               q.y <= Math.max(p.y, r.y) + 1e-5 && q.y >= Math.min(p.y, r.y) - 1e-5;
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

export function doPolygonsIntersect(polyA, polyB) {
    if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;

    // 1. Edge-edge intersections
    for (let i = 0; i < polyA.length; i++) {
        const a1 = polyA[i];
        const a2 = polyA[(i + 1) % polyA.length];
        for (let j = 0; j < polyB.length; j++) {
            const b1 = polyB[j];
            const b2 = polyB[(j + 1) % polyB.length];
            if (doLineSegmentsIntersect(a1, a2, b1, b2)) return true;
        }
    }

    // 2. Vertex containment
    for (let pt of polyA) {
        if (isPointInFan(pt, polyB)) return true;
    }
    for (let pt of polyB) {
        if (isPointInFan(pt, polyA)) return true;
    }

    return false;
}

// Check if player can expand stations without overlapping enemy territory or neutral treaty seam
export function canExpandStation(player, enemy, targetCount = null) {
    if (!player || !enemy) return true;
    const isP2 = player.id === 1;
    const count = targetCount !== null ? targetCount : (player.stationCount + 1);
    const steer = player.launchAngle !== undefined ? player.launchAngle : (player.steeringAngle || null);

    // If players have radial borders, test if ray along steer angle has headroom
    if (player.borderDistances && enemy.borderDistances) {
        const angle = steer !== null ? steer : (isP2 ? Math.PI * 0.75 : -Math.PI * 0.25);
        let canonicalAngle = angle;
        if (isP2) canonicalAngle = angle - Math.PI;
        const t = (canonicalAngle - (-Math.PI * 0.5)) / (Math.PI * 0.5);
        const deg = Math.max(0, Math.min(90, Math.round(t * 90)));
        const rad = isP2 ? (Math.PI * 0.5 + (deg / 90) * (Math.PI * 0.5)) : (-Math.PI * 0.5 + (deg / 90) * (Math.PI * 0.5));
        const hx = player.homePlanet ? player.homePlanet.x : (isP2 ? 17.5 : 2.5);
        const hy = player.homePlanet ? player.homePlanet.y : (isP2 ? 2.5 : 12.5);
        const curDist = player.borderDistances[deg];
        const maxWall = distToWall(hx, hy, rad);
        if (curDist >= maxWall - 0.2) return false;

        const enemyHQ = enemy.homePlanet || { x: enemy.id === 1 ? 17.5 : 2.5, y: enemy.id === 1 ? 2.5 : 12.5 };
        const testP = { x: hx + (curDist + 1.0) * Math.cos(rad), y: hy + (curDist + 1.0) * Math.sin(rad) };
        if (checkPointEnemyCollision(testP, enemyHQ, enemy.borderDistances, enemy.stations)) {
            // Check if excess can spill to neighbors
            const leftP = { x: hx + (curDist + 0.5) * Math.cos(rad - 0.1), y: hy + (curDist + 0.5) * Math.sin(rad - 0.1) };
            const rightP = { x: hx + (curDist + 0.5) * Math.cos(rad + 0.1), y: hy + (curDist + 0.5) * Math.sin(rad + 0.1) };
            const leftSafe = !checkPointEnemyCollision(leftP, enemyHQ, enemy.borderDistances, enemy.stations);
            const rightSafe = !checkPointEnemyCollision(rightP, enemyHQ, enemy.borderDistances, enemy.stations);
            return leftSafe || rightSafe;
        }
        return true;
    }

    const proposedStations = computeStationPositions(player.homePlanet, count, isP2, steer);
    const proposedPoly = getTerritoryPolygon(player.homePlanet, proposedStations, isP2);

    // Check against enemy's current active territory
    const enemyCurrentStations = enemy.stations || computeStationPositions(enemy.homePlanet, enemy.stationCount, enemy.id === 1);
    const enemyCurrentPoly = getTerritoryPolygon(enemy.homePlanet, enemyCurrentStations, enemy.id === 1);
    if (doPolygonsIntersect(proposedPoly, enemyCurrentPoly)) {
        return false;
    }

    return true;
}

// Computes station coordinates for N stations around corner Home Planet
export function computeStationPositions(homePlanet, n, isPlayer2 = false, steeringAngle = null) {
    if (n <= 0) return [];

    // Corner is (0, 15) for P1
    const cx = 0;
    const cy = 15;

    // Outer radius strictly increases with each station n (no plateaus or clumping)
    const rOuter = n === 1 ? 3.2 : 3.6 + 0.9 * (n - 2);

    let rings = [];
    if (n === 1) {
        rings = [{ r: 3.2, count: 1, minA: -Math.PI * 0.25, maxA: -Math.PI * 0.25, isPerimeter: true }];
    } else if (n === 2) {
        rings = [{ r: 3.5, count: 2, minA: -Math.PI * 0.40, maxA: -Math.PI * 0.10, isPerimeter: true }];
    } else if (n === 3) {
        rings = [{ r: 3.8, count: 3, minA: -Math.PI * 0.42, maxA: -Math.PI * 0.08, isPerimeter: true }];
    } else if (n === 4) {
        rings = [
            { r: 2.8, count: 1, minA: -Math.PI * 0.25, maxA: -Math.PI * 0.25, isPerimeter: false },
            { r: 5.4, count: 3, minA: -Math.PI * 0.42, maxA: -Math.PI * 0.08, isPerimeter: true }
        ];
    } else if (n === 5) {
        rings = [
            { r: 3.2, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 6.3, count: 3, minA: -Math.PI * 0.43, maxA: -Math.PI * 0.07, isPerimeter: true }
        ];
    } else if (n === 6) {
        rings = [
            { r: 3.4, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 7.2, count: 4, minA: -Math.PI * 0.44, maxA: -Math.PI * 0.06, isPerimeter: true }
        ];
    } else if (n === 7) {
        rings = [
            { r: 3.2, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 5.6, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 8.1, count: 3, minA: -Math.PI * 0.44, maxA: -Math.PI * 0.06, isPerimeter: true }
        ];
    } else if (n === 8) {
        rings = [
            { r: 3.2, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 5.8, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 9.0, count: 4, minA: -Math.PI * 0.45, maxA: -Math.PI * 0.05, isPerimeter: true }
        ];
    } else if (n === 9) {
        rings = [
            { r: 3.2, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 6.0, count: 3, minA: -Math.PI * 0.38, maxA: -Math.PI * 0.12, isPerimeter: false },
            { r: 9.9, count: 4, minA: -Math.PI * 0.45, maxA: -Math.PI * 0.05, isPerimeter: true }
        ];
    } else if (n === 10) {
        rings = [
            { r: 3.2, count: 2, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 6.3, count: 3, minA: -Math.PI * 0.38, maxA: -Math.PI * 0.12, isPerimeter: false },
            { r: 10.8, count: 5, minA: -Math.PI * 0.45, maxA: -Math.PI * 0.05, isPerimeter: true }
        ];
    } else {
        // n >= 11: All additional stations increase density along the outer perimeter border!
        const innerCount = 2;
        const midCount = 3;
        const outerCount = n - innerCount - midCount;
        rings = [
            { r: 3.2, count: innerCount, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 6.5, count: midCount, minA: -Math.PI * 0.38, maxA: -Math.PI * 0.12, isPerimeter: false },
            { r: 11.2, count: outerCount, minA: -Math.PI * 0.45, maxA: -Math.PI * 0.05, isPerimeter: true }
        ];
    }

    // Default angle for P1 is diagonal: -PI/4
    const defaultAngle = -Math.PI * 0.25;
    let canonicalSteer = steeringAngle;
    if (isPlayer2 && steeringAngle !== null) {
        canonicalSteer = steeringAngle - Math.PI;
    }
    const steerDir = canonicalSteer !== null ? canonicalSteer : defaultAngle;

    const stations = [];
    let id = 0;
    rings.forEach(ring => {
        for (let i = 0; i < ring.count; i++) {
            let angle;
            if (ring.count === 1) {
                angle = (ring.minA + ring.maxA) / 2;
            } else {
                let t = i / (ring.count - 1);
                const span = Math.PI * 0.20;
                const s = Math.max(-1, Math.min(1, (steerDir - defaultAngle) / span));
                if (ring.isPerimeter && canonicalSteer !== null) {
                    t = t + 0.35 * s * Math.sin(Math.PI * t);
                }
                angle = ring.minA + t * (ring.maxA - ring.minA);
            }

            // Radial reach weighting (Dramatic and clearly visible)
            let effectiveR = ring.r;
            if (ring.isPerimeter && canonicalSteer !== null) {
                const span = Math.PI * 0.20;
                const s = Math.max(-1, Math.min(1, (steerDir - defaultAngle) / span));
                const u = Math.max(-1, Math.min(1, (angle - defaultAngle) / span));
                effectiveR = ring.r * (1 + 0.35 * s * u);
            }

            // Clamped to map boundaries ([0.5, 19.5] x [0.5, 14.5]) without middle-line restriction
            const rawX = cx + effectiveR * Math.cos(angle);
            const rawY = cy + effectiveR * Math.sin(angle);
            const sx = Math.max(0.5, Math.min(19.5, rawX));
            const sy = Math.max(0.5, Math.min(14.5, rawY));

            stations.push({
                id: id++,
                x: Math.round(sx * 1000) / 1000,
                y: Math.round(sy * 1000) / 1000,
                ringRadius: effectiveR,
                isPerimeter: ring.isPerimeter,
                angle
            });
        }
    });

    // If Player 2, symmetrically mirror on the diagonal: (x2 = 20 - x1, y2 = 15 - y1)
    if (isPlayer2) {
        return stations.map(s => ({
            ...s,
            x: Math.round((20 - s.x) * 1000) / 1000,
            y: Math.round((15 - s.y) * 1000) / 1000,
            angle: s.angle + Math.PI
        }));
    }

    return stations;
}

// Monotone chain 2D convex hull algorithm
function crossProduct2D(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points) {
    if (points.length <= 2) return [...points];

    const sorted = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);

    const unique = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i].x - unique[unique.length - 1].x) > 1e-5 ||
            Math.abs(sorted[i].y - unique[unique.length - 1].y) > 1e-5) {
            unique.push(sorted[i]);
        }
    }
    if (unique.length <= 2) return unique;

    const lower = [];
    for (let p of unique) {
        while (lower.length >= 2 && crossProduct2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    const upper = [];
    for (let i = unique.length - 1; i >= 0; i--) {
        const p = unique[i];
        while (upper.length >= 2 && crossProduct2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

// Function to find distance to rectangular boundary [0, 20] x [0, 15] along angle
export function distToWall(hx, hy, angleRad) {
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    let minD = Infinity;

    if (cosA > 1e-6) minD = Math.min(minD, (20 - hx) / cosA);
    if (cosA < -1e-6) minD = Math.min(minD, (0 - hx) / cosA);
    if (sinA > 1e-6) minD = Math.min(minD, (15 - hy) / sinA);
    if (sinA < -1e-6) minD = Math.min(minD, (0 - hy) / sinA);

    return Math.max(0, minD);
}

// Generates initial 91-degree quadrant border (0 to 90 degrees from North to East)
export function createQuadrantBorder(initialRadius = 3.8) {
    return new Float64Array(91).fill(initialRadius);
}
export const createRadialBorder = createQuadrantBorder;

// Pins a station to the frontier border curve at its current angle
export function pinStationToBorder(station, homePlanet, borderDistances, isP2 = false) {
    const hx = homePlanet.x;
    const hy = homePlanet.y;
    const curX = station.targetX !== undefined ? station.targetX : station.x;
    const curY = station.targetY !== undefined ? station.targetY : station.y;
    let ang = station.angle;
    if (ang === undefined || isNaN(ang)) {
        ang = Math.atan2(curY - hy, curX - hx);
    }
    let canonical = isP2 ? ang - Math.PI : ang;
    const t = (canonical - (-Math.PI * 0.5)) / (Math.PI * 0.5);
    const deg = Math.max(0, Math.min(90, Math.round(t * 90)));
    const r = borderDistances ? borderDistances[deg] : 3.8;
    station.targetX = Math.max(0.5, Math.min(19.5, Math.round((hx + r * Math.cos(ang)) * 1000) / 1000));
    station.targetY = Math.max(0.5, Math.min(14.5, Math.round((hy + r * Math.sin(ang)) * 1000) / 1000));
    station.angle = ang;
    return station;
}

// Generates a 91-degree radial border enclosing given stations
export function createBorderFromStations(hq, stations, isP2 = false) {
    if (stations && stations._borderDistances) return stations._borderDistances;
    const r = new Float64Array(91).fill(0.5);
    if (!stations || stations.length === 0) return r;

    for (let s of stations) {
        const sx = s.targetX !== undefined ? s.targetX : s.x;
        const sy = s.targetY !== undefined ? s.targetY : s.y;
        let dx = sx - hq.x;
        let dy = sy - hq.y;
        if (isP2) {
            dx = (20 - sx) - 2.5;
            dy = (15 - sy) - 12.5;
        }
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const t = (ang - (-Math.PI * 0.5)) / (Math.PI * 0.5);
        const centerDeg = Math.max(0, Math.min(90, Math.round(t * 90)));
        const spread = 15;
        const reach = Math.max(dist, 1.0);

        for (let i = 0; i <= 90; i++) {
            const diff = Math.abs(i - centerDeg);
            if (diff <= spread) {
                const w = Math.cos((Math.PI / 2) * (diff / spread));
                const bumped = reach * w * w + (1 - w * w) * r[i];
                if (bumped > r[i]) r[i] = bumped;
            }
        }
    }
    return r;
}

// Fast point collision check against enemy territory / stations
export function checkPointEnemyCollision(p, enemyHQ, enemyBorder, enemyStations = null, clearance = 0.5) {
    if (p.x < 0.5 || p.x > 19.5 || p.y < 0.5 || p.y > 14.5) return true;
    if (!enemyHQ) return false;
    const isEnemyP2 = enemyHQ.x > 10;
    if (enemyBorder) {
        const enemyPoly = getTerritoryPolygon(enemyHQ, enemyBorder, isEnemyP2);
        if (isPointInFan(p, enemyPoly)) return true;
        for (let i = 0; i < enemyPoly.length; i++) {
            const v = enemyPoly[i];
            if (Math.hypot(p.x - v.x, p.y - v.y) < clearance) return true;
        }
    }
    if (enemyStations) {
        for (let s of enemyStations) {
            const sx = s.targetX !== undefined ? s.targetX : s.x;
            const sy = s.targetY !== undefined ? s.targetY : s.y;
            if (Math.hypot(p.x - sx, p.y - sy) < 1.35) {
                return true;
            }
        }
    }
    return false;
}

// Pushes radial border with angular falloff and neighbor excess redistribution upon collision
export function pushRadialBorder(homePlanet, border, targetAngleRad, pushAmount = 2.0, enemyHQ = null, enemyBorder = null, enemyStations = null) {
    const isP2 = homePlanet.x > 10;
    const hx = homePlanet.x;
    const hy = homePlanet.y;
    let canonicalAngle = targetAngleRad;
    if (isP2) canonicalAngle = targetAngleRad - Math.PI;

    const t = (canonicalAngle - (-Math.PI * 0.5)) / (Math.PI * 0.5);
    const targetDeg = Math.max(0, Math.min(90, Math.round(t * 90)));
    const spread = 45;
    const baseGrowth = 0.4;
    const dirGrowth = Math.max(0, pushAmount - baseGrowth);
    const pendingPush = new Float64Array(91);

    for (let d = 0; d <= 90; d++) {
        const diff = Math.abs(d - targetDeg);
        const w = diff <= spread ? Math.cos((Math.PI / 2) * (diff / spread)) : 0;
        pendingPush[d] = baseGrowth + dirGrowth * w * w;
    }

    const maxIter = 3;
    const decay = 0.35;
    for (let iter = 0; iter < maxIter; iter++) {
        const excess = new Float64Array(91);
        let hasExcess = false;

        for (let d = 0; d <= 90; d++) {
            if (pendingPush[d] <= 0.001) continue;
            const rad = isP2
                ? (Math.PI * 0.5 + (d / 90) * (Math.PI * 0.5))
                : (-Math.PI * 0.5 + (d / 90) * (Math.PI * 0.5));
            const cosA = Math.cos(rad);
            const sinA = Math.sin(rad);
            const maxWall = distToWall(hx, hy, rad);

            const desiredR = border[d] + pendingPush[d];
            let safeR = border[d];
            const testSteps = 20;
            for (let s = 1; s <= testSteps; s++) {
                const r = border[d] + (desiredR - border[d]) * (s / testSteps);
                if (r > maxWall) break;
                const p = { x: hx + r * cosA, y: hy + r * sinA };
                if (enemyHQ && checkPointEnemyCollision(p, enemyHQ, enemyBorder, enemyStations, 0.65)) break;
                safeR = r;
            }

            const actualPush = safeR - border[d];
            border[d] = safeR;
            const rem = pendingPush[d] - actualPush;
            if (rem > 0.01) {
                hasExcess = true;
                if (d > 0) excess[d - 1] += rem * decay;
                if (d < 90) excess[d + 1] += rem * decay;
            }
            pendingPush[d] = 0;
        }

        if (!hasExcess) break;
        for (let d = 0; d <= 90; d++) {
            pendingPush[d] = excess[d];
        }
    }
}

// Pulls radial border inward around a target angle (e.g. when a station is destroyed)
export function pullRadialBorder(homePlanet, border, targetAngleRad, pullAmount = 1.5) {
    const isP2 = homePlanet.x > 10;
    const hx = homePlanet.x;
    const hy = homePlanet.y;
    let canonicalAngle = targetAngleRad;
    if (isP2) canonicalAngle = targetAngleRad - Math.PI;

    const t = (canonicalAngle - (-Math.PI * 0.5)) / (Math.PI * 0.5);
    const targetDeg = Math.max(0, Math.min(90, Math.round(t * 90)));
    const spread = 25;

    for (let d = 0; d <= 90; d++) {
        const diff = Math.abs(d - targetDeg);
        if (diff <= spread) {
            const w = Math.cos((Math.PI / 2) * (diff / spread));
            const pull = pullAmount * w * w;
            border[d] = Math.max(2.0, border[d] - pull);
        }
    }
}

// Builds territory polygon from 91-degree radial distance graph (fixed 94 vertices, guaranteed zero self-intersections)
export function getTerritoryPolygon(homePlanet, source, isPlayer2 = false) {
    const isP2 = isPlayer2 || (homePlanet && homePlanet.x > 10) || (source && source.id === 1) || (Array.isArray(source) && source[0] && source[0].x > 10);
    const hx = homePlanet ? homePlanet.x : (isP2 ? 17.5 : 2.5);
    const hy = homePlanet ? homePlanet.y : (isP2 ? 2.5 : 12.5);

    let distances = null;
    if (source instanceof Float64Array || (Array.isArray(source) && source.length === 91 && typeof source[0] === 'number')) {
        distances = source;
    } else if (source && source.borderDistances) {
        distances = source.borderDistances;
    } else if (Array.isArray(source)) {
        if (source._borderDistances) distances = source._borderDistances;
        else distances = createBorderFromStations({ x: hx, y: hy }, source, isP2);
    }

    if (!distances) {
        distances = createQuadrantBorder(3.8);
    }

    if (!isP2) {
        const poly = [];
        poly.push({ x: 0, y: 15 });
        poly.push({ x: 0, y: Math.max(0, Math.round((hy - distances[0]) * 1000) / 1000) });

        for (let i = 0; i <= 90; i++) {
            const rad = -Math.PI * 0.5 + (i / 90) * (Math.PI * 0.5);
            const dist = distances[i];
            const px = Math.max(0, Math.min(20, Math.round((hx + dist * Math.cos(rad)) * 1000) / 1000));
            const py = Math.max(0, Math.min(15, Math.round((hy + dist * Math.sin(rad)) * 1000) / 1000));
            poly.push({ x: px, y: py });
        }
        poly.push({ x: Math.min(20, Math.round((hx + distances[90]) * 1000) / 1000), y: 15 });
        return poly;
    } else {
        const p1Poly = getTerritoryPolygon({ x: 2.5, y: 12.5 }, distances, false);
        return p1Poly.map(pt => ({
            x: Math.round((20 - pt.x) * 1000) / 1000,
            y: Math.round((15 - pt.y) * 1000) / 1000
        }));
    }
}

// Finds distance from HQ to current territory border along angle (O(1) radial graph lookup)
export function getBorderIntersection(homePlanet, source, isPlayer2, angle) {
    if (!homePlanet) return 2.0;
    const isP2 = isPlayer2 !== undefined ? isPlayer2 : homePlanet.x > 10;
    let canonicalAngle = angle;
    if (isP2) canonicalAngle = angle - Math.PI;
    const t = (canonicalAngle - (-Math.PI * 0.5)) / (Math.PI * 0.5);
    const deg = Math.max(0, Math.min(90, Math.round(t * 90)));

    let distances = null;
    if (source instanceof Float64Array || (Array.isArray(source) && source.length === 91 && typeof source[0] === 'number')) {
        distances = source;
    } else if (source && source.borderDistances) {
        distances = source.borderDistances;
    } else if (Array.isArray(source)) {
        if (source._borderDistances) distances = source._borderDistances;
        else distances = createBorderFromStations(homePlanet, source, isP2);
    }

    if (distances) {
        return distances[deg];
    }
    return 2.0;
}

// Asymmetrical asteroid field layout with mathematically equal radial distances from HQ
export function getAsteroidLayout() {
    // Player 1 HQ is at (2.5, 12.5), Player 2 HQ is at (17.5, 2.5)
    // Tiers are organized by progressive concentric distance from each player's HQ:
    // Tier 1: R = 0.86 (Home base: enveloped by starting 3 stations)
    // Tier 2: R = 3.00 (Expansion frontier: enveloped by 6 stations)
    // Tier 3: R = 5.32 (Contested forward zone: enveloped by 8-9 stations)
    const rawP1 = [
        { tier: 1, x: 1.80, y: 12.00, resources: 500, hqDistance: 0.86 },
        { tier: 1, x: 3.00, y: 13.20, resources: 500, hqDistance: 0.86 },
        { tier: 2, x: 2.50, y: 9.50, resources: 800, hqDistance: 3.00 },
        { tier: 2, x: 5.50, y: 12.50, resources: 800, hqDistance: 3.00 },
        { tier: 3, x: 6.00, y: 8.50, resources: 1200, hqDistance: 5.32 }
    ];

    // Asymmetric placement for P2: NOT a point mirror, but identical distances from P2 HQ (17.5, 2.5)
    const rawP2 = [
        { tier: 1, x: 17.72, y: 3.33, resources: 500, hqDistance: 0.86 },
        { tier: 1, x: 16.69, y: 2.79, resources: 500, hqDistance: 0.86 },
        { tier: 2, x: 16.47, y: 5.32, resources: 800, hqDistance: 3.00 },
        { tier: 2, x: 14.68, y: 3.53, resources: 800, hqDistance: 3.00 },
        { tier: 3, x: 13.14, y: 5.55, resources: 1200, hqDistance: 5.32 }
    ];

    const asteroids = [];
    let id = 0;

    rawP1.forEach(a => {
        asteroids.push({
            id: id++,
            x: a.x,
            y: a.y,
            tier: a.tier,
            side: 'p1',
            resources: a.resources,
            maxResources: a.resources,
            miners: 0,
            radius: 0.35,
            hqDistance: a.hqDistance
        });
    });

    rawP2.forEach(a => {
        asteroids.push({
            id: id++,
            x: a.x,
            y: a.y,
            tier: a.tier,
            side: 'p2',
            resources: a.resources,
            maxResources: a.resources,
            miners: 0,
            radius: 0.35,
            hqDistance: a.hqDistance
        });
    });

    // Central Contested King Asteroid (midpoint at 10.0, 7.5; exactly 9.01 from both HQs)
    asteroids.push({
        id: id++,
        x: 10.0,
        y: 7.5,
        tier: 3,
        side: 'neutral',
        resources: 2000,
        maxResources: 2000,
        miners: 0,
        radius: 0.55,
        hqDistance: 9.01
    });

    return asteroids;
}

