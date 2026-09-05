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

    // Base P1 corner is (2.5, 12.5)
    // We compute canonical P1 positions, then reflect for P2
    const hx = 2.5;
    const hy = 12.5;

    const baseAngles = {
        min: -Math.PI * 0.42, // ~ -75 deg (pointing mostly up)
        max: -Math.PI * 0.08  // ~ -15 deg (pointing mostly right)
    };

    const stations = [];

    // Radial ring distribution
    // Ring 1: R = 3.2
    // Ring 2: R = 5.8
    // Ring 3: R = 8.4
    // Ring 4: R = 11.0

    let ringAssignments = [];
    if (n === 1) {
        ringAssignments = [{ r: 3.2, count: 1 }];
    } else if (n === 2) {
        ringAssignments = [{ r: 3.2, count: 2 }];
    } else if (n === 3) {
        ringAssignments = [{ r: 3.4, count: 3 }];
    } else if (n === 4) {
        ringAssignments = [
            { r: 3.2, count: 2 },
            { r: 5.6, count: 2 }
        ];
    } else if (n === 5) {
        ringAssignments = [
            { r: 3.2, count: 2 },
            { r: 5.8, count: 3 }
        ];
    } else if (n === 6) {
        ringAssignments = [
            { r: 3.2, count: 2 },
            { r: 6.0, count: 4 }
        ];
    } else if (n === 7) {
        ringAssignments = [
            { r: 3.2, count: 2 },
            { r: 5.6, count: 2 },
            { r: 8.2, count: 3 }
        ];
    } else {
        // n >= 8
        const r3Count = n - 4;
        ringAssignments = [
            { r: 3.2, count: 2 },
            { r: 5.6, count: 2 },
            { r: 8.4, count: r3Count }
        ];
    }

    let id = 0;
    ringAssignments.forEach((ring, ringIdx) => {
        const count = ring.count;
        const isOutermost = ringIdx === ringAssignments.length - 1;

        for (let i = 0; i < count; i++) {
            let angle;
            if (count === 1) {
                angle = (baseAngles.min + baseAngles.max) / 2;
            } else {
                const t = i / (count - 1);
                angle = baseAngles.min + t * (baseAngles.max - baseAngles.min);
            }

            const sx = hx + ring.r * Math.cos(angle);
            const sy = hy + ring.r * Math.sin(angle);

            stations.push({
                id: id++,
                x: Math.round(sx * 1000) / 1000,
                y: Math.round(sy * 1000) / 1000,
                ringRadius: ring.r,
                isPerimeter: isOutermost,
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

// Builds the simple, solid territory polygon from Home Planet and outer perimeter stations
export function getTerritoryPolygon(homePlanet, stations) {
    if (!stations || stations.length === 0) {
        return [];
    }

    const outerStations = stations.filter(s => s.isPerimeter);
    const activeOuter = outerStations.length > 0 ? outerStations : stations;

    // Sort outer stations by angle in sector
    const sorted = [...activeOuter].sort((a, b) => a.angle - b.angle);

    // Convex fan: Home -> Sorted outer stations -> Home
    const poly = [{ x: homePlanet.x, y: homePlanet.y }];
    sorted.forEach(s => poly.push({ x: s.x, y: s.y }));

    return poly;
}

// Symmetrically placed asteroid field layout in progressive concentric tiers
export function getAsteroidLayout() {
    // Symmetrical pairs around diagonal axis: P1 side vs P2 side
    const p1Home = { x: 2.5, y: 12.5 };
    const p2Home = { x: 17.5, y: 2.5 };

    const rawP1 = [
        // Tier 1 (Home Rings: enveloped by 2-3 stations)
        { tier: 1, dist: 2.6, angle: -Math.PI * 0.30, resources: 500 },
        { tier: 1, dist: 2.8, angle: -Math.PI * 0.18, resources: 500 },

        // Tier 2 (Expansion Arc: enveloped by 4-6 stations)
        { tier: 2, dist: 5.0, angle: -Math.PI * 0.38, resources: 800 },
        { tier: 2, dist: 5.2, angle: -Math.PI * 0.12, resources: 800 },

        // Tier 3 Central contested asteroids (near diagonal midpoint)
        { tier: 3, dist: 8.5, angle: -Math.PI * 0.25, resources: 1200 }
    ];

    const asteroids = [];
    let id = 0;

    // P1 Asteroids
    rawP1.forEach(a => {
        const x = Math.round((p1Home.x + a.dist * Math.cos(a.angle)) * 100) / 100;
        const y = Math.round((p1Home.y + a.dist * Math.sin(a.angle)) * 100) / 100;
        asteroids.push({
            id: id++,
            x,
            y,
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
        const s1X = p1Home.x + a.dist * Math.cos(a.angle);
        const s1Y = p1Home.y + a.dist * Math.sin(a.angle);
        const x = Math.round((20 - s1X) * 100) / 100;
        const y = Math.round((15 - s1Y) * 100) / 100;
        asteroids.push({
            id: id++,
            x,
            y,
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
