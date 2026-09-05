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

    const proposedStations = computeStationPositions(player.homePlanet, count, isP2, steer);
    const proposedPoly = getTerritoryPolygon(player.homePlanet, proposedStations, isP2);

    // 1. Check against enemy's current active territory
    const enemyCurrentStations = enemy.stations || computeStationPositions(enemy.homePlanet, enemy.stationCount, enemy.id === 1);
    const enemyCurrentPoly = getTerritoryPolygon(enemy.homePlanet, enemyCurrentStations, enemy.id === 1);
    if (doPolygonsIntersect(proposedPoly, enemyCurrentPoly)) {
        return false;
    }

    // 2. Check against enemy's committed pipeline (pending builds and in-flight stations)
    const enemyPending = (enemy.buildCooldowns && enemy.buildCooldowns.station > 0 ? 1 : 0) +
                         (enemy.launchingStations ? enemy.launchingStations.length : 0) +
                         (enemy.buildQueue ? enemy.buildQueue.filter(b => b.type === 'station').length : 0);
    if (enemyPending > 0) {
        const enemyTotalCommitted = (enemy.stationCount || 0) + enemyPending;
        const enemyCommittedStations = computeStationPositions(enemy.homePlanet, enemyTotalCommitted, enemy.id === 1, enemy.steeringAngle || enemy.launchAngle);
        const enemyCommittedPoly = getTerritoryPolygon(enemy.homePlanet, enemyCommittedStations, enemy.id === 1);
        if (doPolygonsIntersect(proposedPoly, enemyCommittedPoly)) {
            return false;
        }
    }

    // 3. Check against central neutral diagonal seam (y = 0.75 * x)
    for (let pt of proposedPoly) {
        if (!isP2) {
            // P1 must stay in y >= 0.75 * x + 0.20
            if (pt.y < 0.75 * pt.x + 0.20) return false;
        } else {
            // P2 must stay in y <= 0.75 * x - 0.20
            if (pt.y > 0.75 * pt.x - 0.20) return false;
        }
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
        rings = [{ r: 3.8, count: 2, minA: -Math.PI * 0.40, maxA: -Math.PI * 0.10, isPerimeter: true }];
    } else if (n === 3) {
        rings = [{ r: 4.5, count: 3, minA: -Math.PI * 0.42, maxA: -Math.PI * 0.08, isPerimeter: true }];
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
        const outerCount = 5;
        const midCount = Math.min(5, n - 7);
        const innerCount = Math.max(1, n - outerCount - midCount);
        rings = [
            { r: 3.2, count: innerCount, minA: -Math.PI * 0.35, maxA: -Math.PI * 0.15, isPerimeter: false },
            { r: 6.5, count: midCount, minA: -Math.PI * 0.38, maxA: -Math.PI * 0.12, isPerimeter: false },
            { r: rOuter, count: outerCount, minA: -Math.PI * 0.45, maxA: -Math.PI * 0.05, isPerimeter: true }
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

            const sx = cx + effectiveR * Math.cos(angle);
            const sy = cy + effectiveR * Math.sin(angle);

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

// Builds territory polygon filling the entire 90 degree corner
export function getTerritoryPolygon(homePlanet, stations, isPlayer2 = false) {
    if (!stations || stations.length === 0) {
        return [];
    }

    // Auto-detect player 2 if isPlayer2 flag isn't explicitly passed
    const isP2 = isPlayer2 || (homePlanet && homePlanet.x > 10) || (stations[0] && stations[0].x > 10);

    const outerStations = stations.filter(s => s.isPerimeter);
    const activeOuter = outerStations.length > 0 ? outerStations : stations;

    if (!isP2) {
        // P1 Corner is (0, 15)
        const sorted = [...activeOuter].sort((a, b) => a.angle - b.angle);
        const leftR = Math.hypot(sorted[0].x, 15 - sorted[0].y);
        const bottomR = Math.hypot(sorted[sorted.length - 1].x, 15 - sorted[sorted.length - 1].y);

        const leftWallPoint = { x: 0, y: Math.max(0, Math.round((15 - leftR) * 1000) / 1000) };
        const bottomWallPoint = { x: Math.min(20, Math.round(bottomR * 1000) / 1000), y: 15 };

        const poly = [
            { x: 0, y: 15 },
            leftWallPoint
        ];
        sorted.forEach(s => poly.push({ x: s.x, y: s.y }));
        poly.push(bottomWallPoint);
        return poly;
    } else {
        // P2 Corner is (20, 0)
        // Canonical reflection from P1
        const p1Poly = getTerritoryPolygon(null, stations.map(s => ({
            ...s,
            x: 20 - s.x,
            y: 15 - s.y,
            angle: s.angle - Math.PI
        })), false);

        return p1Poly.map(pt => ({
            x: Math.round((20 - pt.x) * 1000) / 1000,
            y: Math.round((15 - pt.y) * 1000) / 1000
        }));
    }
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

