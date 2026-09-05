// Radial Geometry & Mathematical Engine for Neutral Zone: Commander Variant
// Rebuilt with the Prototype 91-Degree Radial Border Engine

export function degreeToAngleRad(playerId, deg) {
    if (playerId === 0) {
        return - (deg / 90.0) * (Math.PI * 0.5);
    } else {
        return Math.PI - (deg / 90.0) * (Math.PI * 0.5);
    }
}

export function angleRadToDegree(playerId, rad) {
    if (playerId === 0) {
        let norm = -rad / (Math.PI * 0.5);
        return Math.max(0, Math.min(90, Math.round(norm * 90)));
    } else {
        let norm = (Math.PI - rad) / (Math.PI * 0.5);
        return Math.max(0, Math.min(90, Math.round(norm * 90)));
    }
}

export function getDotPosition(homePlanet, isP2, deg, r) {
    const rad = degreeToAngleRad(isP2 ? 1 : 0, deg);
    return {
        x: homePlanet.x + r * Math.cos(rad),
        y: homePlanet.y + r * Math.sin(rad)
    };
}

export function closeBorder(poly) {
    if (!poly || poly.length !== 91) return poly;
    const isP2 = poly[0].y < 7.5;
    if (!isP2) {
        return [
            ...poly,
            { x: 0, y: Math.max(0, poly[90].y) },
            { x: 0, y: 15 },
            { x: Math.min(20, poly[0].x), y: 15 }
        ];
    } else {
        return [
            ...poly,
            { x: 20, y: Math.min(15, poly[90].y) },
            { x: 20, y: 0 },
            { x: Math.max(0, poly[0].x), y: 0 }
        ];
    }
}

export function polygonArea(poly) {
    if (!poly || poly.length < 3) return 0;
    const closed = poly.length === 91 ? closeBorder(poly) : poly;
    let a = 0;
    for (let i = 0; i < closed.length; i++) {
        let p1 = closed[i];
        let p2 = closed[(i + 1) % closed.length];
        a += (p1.x * p2.y - p2.x * p1.y);
    }
    return Math.abs(a / 2);
}

export function isPointInFan(pt, poly) {
    if (!poly || poly.length < 3) return false;
    const closed = poly.length === 91 ? closeBorder(poly) : poly;

    // Check if point coincides with any vertex
    for (let i = 0; i < closed.length; i++) {
        if (Math.abs(pt.x - closed[i].x) < 1e-4 && Math.abs(pt.y - closed[i].y) < 1e-4) {
            return true;
        }
    }

    let inside = false;
    const x = pt.x, y = pt.y;
    for (let i = 0, j = closed.length - 1; i < closed.length; j = i++) {
        const xi = closed[i].x, yi = closed[i].y;
        const xj = closed[j].x, yj = closed[j].y;
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

    const closedA = polyA.length === 91 ? closeBorder(polyA) : polyA;
    const closedB = polyB.length === 91 ? closeBorder(polyB) : polyB;

    // 1. Edge-edge intersections
    for (let i = 0; i < closedA.length; i++) {
        const a1 = closedA[i];
        const a2 = closedA[(i + 1) % closedA.length];
        for (let j = 0; j < closedB.length; j++) {
            const b1 = closedB[j];
            const b2 = closedB[(j + 1) % closedB.length];
            if (doLineSegmentsIntersect(a1, a2, b1, b2)) return true;
        }
    }

    // 2. Vertex containment
    for (let pt of closedA) {
        if (isPointInFan(pt, closedB)) return true;
    }
    for (let pt of closedB) {
        if (isPointInFan(pt, closedA)) return true;
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

// Generates initial 91-degree quadrant border (0 to 90 degrees)
export function createQuadrantBorder(initialRadius = 3.8) {
    return new Float64Array(91).fill(initialRadius);
}
export const createRadialBorder = createQuadrantBorder;

// Interpolates border distance at any continuous degree d in [0.0, 90.0]
export function getBorderDistanceAtDegree(borderDistances, continuousDeg) {
    if (!borderDistances) return 3.8;
    const d = Math.max(0, Math.min(90, continuousDeg));
    const i = Math.floor(d);
    if (i >= 90) return borderDistances[90];
    const f = d - i;
    return (1 - f) * borderDistances[i] + f * borderDistances[i + 1];
}

// Pins a station to the continuous border curve
export function pinStationToBorder(station, homePlanet, borderDistances, isP2 = false) {
    const hx = homePlanet.x;
    const hy = homePlanet.y;
    if (station.degree === undefined) {
        let ang = station.angle;
        if (ang === undefined || isNaN(ang)) {
            const curX = station.targetX !== undefined ? station.targetX : station.x;
            const curY = station.targetY !== undefined ? station.targetY : station.y;
            ang = Math.atan2(curY - hy, curX - hx);
        }
        station.degree = angleRadToDegree(isP2 ? 1 : 0, ang);
    }
    const d = Math.max(0, Math.min(90, station.degree));
    const r = getBorderDistanceAtDegree(borderDistances, d);
    const rad = degreeToAngleRad(isP2 ? 1 : 0, d);
    station.targetX = Math.max(0.5, Math.min(19.5, Math.round((hx + r * Math.cos(rad)) * 1000) / 1000));
    station.targetY = Math.max(0.5, Math.min(14.5, Math.round((hy + r * Math.sin(rad)) * 1000) / 1000));
    station.angle = rad;
    if (station.x === undefined) {
        station.x = station.targetX;
        station.y = station.targetY;
    }
    return station;
}

// Helper to dig cavities along wide frontier edges for concave territory shapes (e.g. U-shapes)
function digCavity(A, B, stations, boundary) {
    const isWallA = A.x === 0 || A.y === 15;
    const isWallB = B.x === 0 || B.y === 15;
    if (isWallA || isWallB) return [];

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    if (L < 5.0) return [];

    const candidates = [];
    for (let p of stations) {
        if (boundary.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 0.1)) continue;
        const t = ((p.x - A.x) * dx + (p.y - A.y) * dy) / (L * L);
        if (t <= 0.05 || t >= 0.95) continue;
        const depth = (dx * (p.y - A.y) - dy * (p.x - A.x)) / L;

        if (depth >= 2.8) {
            candidates.push({ p, t, depth });
        }
    }

    if (candidates.length === 0) return [];

    candidates.sort((a, b) => a.t - b.t);

    const result = [];
    candidates.forEach(c => {
        if (result.length === 0 || c.t - result[result.length - 1].t > 0.10) {
            result.push(c);
        } else if (c.depth < result[result.length - 1].depth) {
            result[result.length - 1] = c;
        }
    });

    return result.map(c => c.p);
}

// Builds legacy polygon for station arrays without precomputed border distances
function getLegacyTerritoryPolygon(homePlanet, stations, isPlayer2 = false) {
    if (!stations || stations.length === 0) return [];
    const isP2 = isPlayer2 || (homePlanet && homePlanet.x > 10) || (stations[0] && stations[0].x > 10);

    if (!isP2) {
        let minAngle = Infinity;
        let maxAngle = -Infinity;
        let leftStation = null;
        let bottomStation = null;

        const st = stations.map(s => ({
            x: s.targetX !== undefined ? s.targetX : s.x,
            y: s.targetY !== undefined ? s.targetY : s.y
        }));

        st.forEach(s => {
            const ang = Math.atan2(s.y - 15, s.x);
            if (ang < minAngle) {
                minAngle = ang;
                leftStation = s;
            }
            if (ang > maxAngle) {
                maxAngle = ang;
                bottomStation = s;
            }
        });

        const leftR = leftStation ? Math.max(3.2, Math.hypot(leftStation.x, 15 - leftStation.y)) : 3.2;
        const bottomR = bottomStation ? Math.max(3.2, Math.hypot(bottomStation.x, 15 - bottomStation.y)) : 3.2;

        const leftWallPoint = { x: 0, y: Math.max(0, Math.round((15 - leftR) * 1000) / 1000) };
        const bottomWallPoint = { x: Math.min(20, Math.round(bottomR * 1000) / 1000), y: 15 };

        const allPoints = [
            { x: 0, y: 15 },
            leftWallPoint,
            ...st,
            bottomWallPoint
        ];

        const hull = convexHull(allPoints);
        const cornerIdx = hull.findIndex(p => Math.abs(p.x - 0) < 1e-4 && Math.abs(p.y - 15) < 1e-4);
        if (cornerIdx === -1) return hull;

        let ordered = [];
        for (let i = 0; i < hull.length; i++) {
            ordered.push(hull[(cornerIdx + i) % hull.length]);
        }
        if (ordered.length >= 2 && ordered[1].x !== 0) {
            const rev = [ordered[0]];
            for (let i = ordered.length - 1; i >= 1; i--) rev.push(ordered[i]);
            ordered = rev;
        }

        const refined = [];
        for (let i = 0; i < ordered.length; i++) {
            const A = ordered[i];
            const B = ordered[(i + 1) % ordered.length];
            refined.push(A);

            const isWallEdge = (A.x === 0 && B.x === 0) || (A.y === 15 && B.y === 15) || (A.x === 0 && A.y === 15) || (B.x === 0 && B.y === 15);
            if (!isWallEdge) {
                const dug = digCavity(A, B, st, ordered);
                dug.forEach(p => refined.push(p));
            }
        }

        return refined;
    } else {
        const reflectedStations = stations.map(s => {
            const rx = 20 - (s.targetX !== undefined ? s.targetX : s.x);
            const ry = 15 - (s.targetY !== undefined ? s.targetY : s.y);
            return {
                ...s,
                x: rx,
                y: ry,
                targetX: rx,
                targetY: ry
            };
        });
        const p1Poly = getLegacyTerritoryPolygon(null, reflectedStations, false);
        return p1Poly.map(pt => ({
            x: Math.round((20 - pt.x) * 1000) / 1000,
            y: Math.round((15 - pt.y) * 1000) / 1000
        }));
    }
}

// Builds territory border polygon strictly from the 91 permanent points
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
        if (source._borderDistances) {
            distances = source._borderDistances;
        } else if (source.length > 0 && source[0].ringRadius === undefined && source[0].isPerimeter === undefined) {
            return getLegacyTerritoryPolygon(homePlanet, source, isP2);
        } else {
            distances = createBorderFromStations({ x: hx, y: hy }, source, isP2);
        }
    }

    if (!distances) {
        distances = createQuadrantBorder(3.8);
    }
    const poly = [];
    for (let i = 0; i <= 90; i++) {
        const rad = degreeToAngleRad(isP2 ? 1 : 0, i);
        const dist = distances[i];
        const px = Math.max(0, Math.min(20, Math.round((hx + dist * Math.cos(rad)) * 1000) / 1000));
        const py = Math.max(0, Math.min(15, Math.round((hy + dist * Math.sin(rad)) * 1000) / 1000));
        poly.push({ x: px, y: py });
    }
    return poly;
}

export const getBorderPoints = getTerritoryPolygon;

// Finds distance from HQ to territory border along degree or angle (O(1) lookup)
export function getBorderIntersection(homePlanet, source, isPlayer2, angleOrDeg) {
    if (!homePlanet) return 3.8;
    const isP2 = isPlayer2 !== undefined ? isPlayer2 : homePlanet.x > 10;
    let deg = 45;
    if (typeof angleOrDeg === 'number') {
        if (angleOrDeg >= 0 && angleOrDeg <= 90 && Math.abs(angleOrDeg - Math.round(angleOrDeg)) < 1e-4) {
            deg = Math.round(angleOrDeg);
        } else {
            deg = angleRadToDegree(isP2 ? 1 : 0, angleOrDeg);
        }
    }
    deg = Math.max(0, Math.min(90, deg));

    let distances = null;
    if (source instanceof Float64Array || (Array.isArray(source) && source.length === 91 && typeof source[0] === 'number')) {
        distances = source;
    } else if (source && source.borderDistances) {
        distances = source.borderDistances;
    } else if (Array.isArray(source)) {
        if (source._borderDistances) distances = source._borderDistances;
        else distances = createBorderFromStations(homePlanet, source, isP2);
    }

    return distances ? distances[deg] : 3.8;
}

// Falloff Formulation (from Prototype)
export function calculateInfluence(deltaDeg, spread, curveType = 'smoothstep') {
    if (deltaDeg === 0) return 1.0;
    if (deltaDeg > spread) return 0.0;
    const norm = deltaDeg / spread;
    switch (curveType) {
        case 'smoothstep':
            return 1.0 - (3 * norm * norm - 2 * norm * norm * norm);
        case 'gaussian': {
            const sigma = spread / 2.5;
            return Math.exp(-0.5 * Math.pow(deltaDeg / sigma, 2));
        }
        case 'cosine':
            return 0.5 * (1.0 + Math.cos(Math.PI * norm));
        case 'linear':
        default:
            return Math.max(0.0, 1.0 - norm);
    }
}

export function calculateTapWeight(deltaDeg, initialDots = 3, spreadMode = 'rounded', neighborSpread = 10, neighborStrength = 1.0, falloffCurve = 'smoothstep') {
    const rCore = Math.floor((initialDots - 1) / 2);
    if (spreadMode === 'rounded') {
        if (deltaDeg <= rCore) {
            if (rCore === 0) return 1.0;
            const t = deltaDeg / (rCore + 1);
            return Math.cos(Math.PI * 0.25 * t);
        }
        const deltaOut = deltaDeg - rCore;
        const edgeVal = Math.cos(Math.PI * 0.25 * (rCore / (rCore + 1)));
        const inf = calculateInfluence(deltaOut, neighborSpread, falloffCurve);
        return edgeVal * inf * neighborStrength;
    } else if (spreadMode === 'plateau') {
        if (deltaDeg <= rCore) return 1.0;
        const deltaOut = deltaDeg - rCore;
        const inf = calculateInfluence(deltaOut, neighborSpread, falloffCurve);
        return inf * neighborStrength;
    }
    return 1.0;
}

// 1-Pass Laplacian Filter for C2 Curvature
export function applyLaplacianSmoothing(array, weight = 0.18, iterations = 1) {
    if (!array || array.length !== 91) return;
    const n = array.length;
    let current = new Float64Array(array);

    for (let it = 0; it < iterations; it++) {
        const next = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const prev = i > 0 ? current[i - 1] : current[i];
            const succ = i < n - 1 ? current[i + 1] : current[i];
            next[i] = current[i] * (1.0 - 2.0 * weight) + (prev + succ) * weight;
        }
        current = next;
    }

    for (let i = 0; i < n; i++) {
        array[i] = current[i];
    }
}
export const smoothBorder = applyLaplacianSmoothing;

// Point to line segment minimum squared distance
export function distSqToSegment(p, a, b) {
    const l2 = Math.hypot(b.x - a.x, b.y - a.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y) ** 2;
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))) ** 2;
}

// Collision Check against Map Borders & Opposing Territory
export function isPointCrossingEnemy(playerId, pt, enemyHQ = null, enemyBorder = null, clearance = 0.45) {
    // 1. Map boundaries [0.5, 19.5] x [0.5, 14.5]
    if (pt.x < 0.5 || pt.x > 19.5 || pt.y < 0.5 || pt.y > 14.5) {
        return true;
    }
    if (!enemyHQ || !enemyBorder) return false;

    const isEnemyP2 = enemyHQ.x > 10;
    const enemyPoly = getTerritoryPolygon(enemyHQ, enemyBorder, isEnemyP2);

    // 2. Opposing territory containment check
    if (isPointInFan(pt, enemyPoly)) {
        return true;
    }

    // 3. Distance clearance to enemy frontier segments
    const clSq = clearance * clearance;
    for (let i = 0; i < enemyPoly.length - 1; i++) {
        const e1 = enemyPoly[i];
        const e2 = enemyPoly[i + 1];
        if (distSqToSegment(pt, e1, e2) < clSq) {
            return true;
        }
    }

    return false;
}

// Fast point collision check against enemy territory / stations (backward compatibility)
export function checkPointEnemyCollision(p, enemyHQ, enemyBorder, enemyStations = null, clearance = 0.45) {
    const isEnemyP2 = enemyHQ ? enemyHQ.x > 10 : false;
    const playerId = isEnemyP2 ? 0 : 1;
    if (isPointCrossingEnemy(playerId, p, enemyHQ, enemyBorder, clearance)) return true;
    if (enemyStations) {
        for (let s of enemyStations) {
            const sx = s.targetX !== undefined ? s.targetX : s.x;
            const sy = s.targetY !== undefined ? s.targetY : s.y;
            if (Math.hypot(p.x - sx, p.y - sy) < 1.15) {
                return true;
            }
        }
    }
    return false;
}

// Binary search to find max safe displacement along ray d
export function findMaxSafeDelta(playerId, deg, currentR, desiredInc, homePlanet, enemyHQ = null, enemyBorder = null, clearance = 0.45, enemyStations = null) {
    if (desiredInc <= 0.005) return 0;
    const isP2 = playerId === 1;

    function isSafe(r) {
        const pt = getDotPosition(homePlanet, isP2, deg, r);
        if (isPointCrossingEnemy(playerId, pt, enemyHQ, enemyBorder, clearance)) return false;
        if (enemyStations) {
            for (let s of enemyStations) {
                const sx = s.targetX !== undefined ? s.targetX : s.x;
                const sy = s.targetY !== undefined ? s.targetY : s.y;
                if (Math.hypot(pt.x - sx, pt.y - sy) < 1.35) return false;
            }
        }
        return true;
    }

    if (isSafe(currentR + desiredInc)) {
        return desiredInc;
    }

    let low = 0;
    let high = desiredInc;
    for (let iter = 0; iter < 12; iter++) {
        const mid = (low + high) * 0.5;
        if (!isSafe(currentR + mid)) {
            high = mid;
        } else {
            low = mid;
        }
    }
    return low;
}

// Pushes radial border with single-dot target, 3-dot core, ±10° spread, and 50/50 neighbor redistribution
export function pushRadialBorder(homePlanet, border, targetDegreeOrAngle, pushAmount = 1.6, enemyHQ = null, enemyBorder = null, enemyStations = null) {
    const isP2 = homePlanet.x > 10;
    const playerId = isP2 ? 1 : 0;
    let centerDeg = 45;
    if (typeof targetDegreeOrAngle === 'number') {
        if (targetDegreeOrAngle >= 0 && targetDegreeOrAngle <= 90 && Math.abs(targetDegreeOrAngle - Math.round(targetDegreeOrAngle)) < 1e-4) {
            centerDeg = Math.round(targetDegreeOrAngle);
        } else {
            centerDeg = angleRadToDegree(playerId, targetDegreeOrAngle);
        }
    } else if (targetDegreeOrAngle && targetDegreeOrAngle.degree !== undefined) {
        centerDeg = targetDegreeOrAngle.degree;
    } else if (targetDegreeOrAngle && targetDegreeOrAngle.x !== undefined) {
        const ang = Math.atan2(targetDegreeOrAngle.y - homePlanet.y, targetDegreeOrAngle.x - homePlanet.x);
        centerDeg = angleRadToDegree(playerId, ang);
    }
    centerDeg = Math.max(0, Math.min(90, centerDeg));

    const rCore = 1;
    const neighborSpread = 10;
    const totalRadius = rCore + neighborSpread;

    const minDeg = Math.max(0, centerDeg - totalRadius);
    const maxDeg = Math.min(90, centerDeg + totalRadius);

    // Initial incremental distribution (3-dot core + Hermite smoothstep falloff)
    const initialIncrements = new Float64Array(91);
    for (let i = minDeg; i <= maxDeg; i++) {
        const deltaDeg = Math.abs(i - centerDeg);
        const weight = calculateTapWeight(deltaDeg, 3, 'rounded', neighborSpread, 1.0, 'smoothstep');
        initialIncrements[i] = pushAmount * weight;
    }

    const currentR = new Float64Array(border);
    const prevDistances = new Float64Array(border);
    let pending = new Float64Array(initialIncrements);
    const clearance = 0.45;

    // Iterative 50/50 neighbor redistribution upon enemy boundary collision
    const maxIterations = 25;
    for (let iter = 0; iter < maxIterations; iter++) {
        let anyMoved = false;
        const nextPending = new Float64Array(91);

        for (let i = 0; i <= 90; i++) {
            const inc = pending[i];
            if (inc <= 0.002) continue;

            const maxSafe = findMaxSafeDelta(playerId, i, currentR[i], inc, homePlanet, enemyHQ, enemyBorder, clearance, enemyStations);
            if (maxSafe > 0.002) {
                currentR[i] += maxSafe;
                anyMoved = true;
            }

            const excess = inc - maxSafe;
            if (excess > 0.005) {
                if (i === 0) {
                    nextPending[1] += excess;
                } else if (i === 90) {
                    nextPending[89] += excess;
                } else {
                    nextPending[i - 1] += excess * 0.5;
                    nextPending[i + 1] += excess * 0.5;
                }
            }
        }

        pending = nextPending;
        if (!anyMoved) break;
    }

    border.set(currentR);

    // 1 pass of Laplacian smoothing (lambda = 0.18) with collision barrier protection
    applyLaplacianSmoothing(border, 0.18, 1);
    for (let i = 0; i <= 90; i++) {
        const pt = getDotPosition(homePlanet, isP2, i, border[i]);
        if (isPointCrossingEnemy(playerId, pt, enemyHQ, enemyBorder, clearance)) {
            border[i] = currentR[i]; // restore pre-smooth collision frontier
        }
    }

    // Restrict contraction: dots never decrease on expansion
    for (let i = 0; i <= 90; i++) {
        if (border[i] < prevDistances[i]) {
            border[i] = prevDistances[i];
        }
    }
}

// Pulls radial border inward targeting a single degree (e.g. when a station is destroyed)
export function pullRadialBorder(homePlanet, border, targetDegreeOrAngle, pullAmount = 1.4) {
    const isP2 = homePlanet.x > 10;
    const playerId = isP2 ? 1 : 0;
    let centerDeg = 45;
    if (typeof targetDegreeOrAngle === 'number') {
        if (targetDegreeOrAngle >= 0 && targetDegreeOrAngle <= 90 && Math.abs(targetDegreeOrAngle - Math.round(targetDegreeOrAngle)) < 1e-4) {
            centerDeg = Math.round(targetDegreeOrAngle);
        } else {
            centerDeg = angleRadToDegree(playerId, targetDegreeOrAngle);
        }
    }
    centerDeg = Math.max(0, Math.min(90, centerDeg));

    const rCore = 1;
    const neighborSpread = 10;
    const totalRadius = rCore + neighborSpread;

    const minDeg = Math.max(0, centerDeg - totalRadius);
    const maxDeg = Math.min(90, centerDeg + totalRadius);

    for (let i = minDeg; i <= maxDeg; i++) {
        const deltaDeg = Math.abs(i - centerDeg);
        const weight = calculateTapWeight(deltaDeg, 3, 'rounded', neighborSpread, 1.0, 'smoothstep');
        border[i] = Math.max(1.8, border[i] - pullAmount * weight);
    }

    applyLaplacianSmoothing(border, 0.18, 1);
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
        const centerDeg = angleRadToDegree(0, ang);
        const spread = 20;
        const reach = Math.max(dist, 0.5);

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

