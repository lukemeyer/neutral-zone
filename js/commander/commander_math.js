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

// Computes station coordinates for N stations around corner Home Planet
export function computeStationPositions(homePlanet, n, isPlayer2 = false) {
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

    const stations = [];
    let id = 0;
    rings.forEach(ring => {
        for (let i = 0; i < ring.count; i++) {
            let angle;
            if (ring.count === 1) {
                angle = (ring.minA + ring.maxA) / 2;
            } else {
                const t = i / (ring.count - 1);
                angle = ring.minA + t * (ring.maxA - ring.minA);
            }

            const sx = cx + ring.r * Math.cos(angle);
            const sy = cy + ring.r * Math.sin(angle);

            stations.push({
                id: id++,
                x: Math.round(sx * 1000) / 1000,
                y: Math.round(sy * 1000) / 1000,
                ringRadius: ring.r,
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
        const maxR = Math.max(...activeOuter.map(s => Math.hypot(s.x, 15 - s.y)));

        const leftWallPoint = { x: 0, y: Math.max(0, Math.round((15 - maxR) * 1000) / 1000) };
        const bottomWallPoint = { x: Math.min(20, Math.round(maxR * 1000) / 1000), y: 15 };

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

// Symmetrically placed asteroid field layout in progressive concentric tiers
export function getAsteroidLayout() {
    const rawP1 = [
        // Tier 1 (Home Rings: enveloped by starting 3 stations)
        { tier: 1, x: 1.8, y: 12.0, resources: 500 },
        { tier: 1, x: 3.0, y: 13.2, resources: 500 },

        // Tier 2 (Expansion Arc: enveloped by 5 stations)
        { tier: 2, x: 2.5, y: 9.5, resources: 800 },
        { tier: 2, x: 5.5, y: 12.5, resources: 800 },

        // Tier 3 Contested asteroids (enveloped by 8-9 stations)
        { tier: 3, x: 6.0, y: 8.5, resources: 1200 }
    ];

    const asteroids = [];
    let id = 0;

    // P1 Asteroids
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
            radius: 0.35
        });
    });

    // P2 Asteroids (Symmetrically mirrored: x2 = 20 - x1, y2 = 15 - y1)
    rawP1.forEach(a => {
        asteroids.push({
            id: id++,
            x: Math.round((20 - a.x) * 100) / 100,
            y: Math.round((15 - a.y) * 100) / 100,
            tier: a.tier,
            side: 'p2',
            resources: a.resources,
            maxResources: a.resources,
            miners: 0,
            radius: 0.35
        });
    });

    // Central King Asteroid (exactly at map midpoint 10, 7.5)
    asteroids.push({
        id: id++,
        x: 10.0,
        y: 7.5,
        tier: 3,
        side: 'neutral',
        resources: 2000,
        maxResources: 2000,
        miners: 0,
        radius: 0.55
    });

    return asteroids;
}
