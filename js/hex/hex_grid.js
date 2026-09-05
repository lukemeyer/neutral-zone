// Hexagonal Grid System for Neutral Zone: Hex Variant

export function createHexGrid(mapWidth = 20, mapHeight = 15, hexRadius = 1.6) {
    const R = hexRadius;
    const W = Math.sqrt(3) * R;
    const H = 2 * R;
    const deltaX = W;
    const deltaY = 1.5 * R;

    const startX = R * 1.5;
    const startY = R * 1.5;

    const colCount = Math.floor((mapWidth - startX - R) / deltaX) + 1;
    const rowCount = Math.floor((mapHeight - startY - R) / deltaY) + 1;

    const cells = [];
    const vertices = [];
    const edges = [];

    const vertexMap = new Map();
    const edgeMap = new Map();

    const getOrCreateVertex = (vx, vy, cellId) => {
        const key = `${vx.toFixed(2)},${vy.toFixed(2)}`;
        if (vertexMap.has(key)) {
            const v = vertexMap.get(key);
            if (!v.cells.includes(cellId)) v.cells.push(cellId);
            return v;
        }
        const v = {
            id: vertices.length,
            x: Math.round(vx * 1000) / 1000,
            y: Math.round(vy * 1000) / 1000,
            adjacentVertices: [],
            cells: [cellId],
            owner: null, // null, 0 (P1), or 1 (P2)
            station: null // { type: 'relay' | 'turret', health, maxHealth, cooldown, range }
        };
        vertices.push(v);
        vertexMap.set(key, v);
        return v;
    };

    const getOrCreateEdge = (vA, vB) => {
        const key = `${Math.min(vA.id, vB.id)}-${Math.max(vA.id, vB.id)}`;
        if (edgeMap.has(key)) {
            return edgeMap.get(key);
        }
        const dist = Math.hypot(vA.x - vB.x, vA.y - vB.y);
        const e = {
            id: edges.length,
            u: vA.id,
            v: vB.id,
            dist: Math.round(dist * 1000) / 1000
        };
        edges.push(e);
        edgeMap.set(key, e);

        if (!vA.adjacentVertices.includes(vB.id)) vA.adjacentVertices.push(vB.id);
        if (!vB.adjacentVertices.includes(vA.id)) vB.adjacentVertices.push(vA.id);

        return e;
    };

    // 1. Generate regular hexagonal cells
    let cellIdCounter = 0;
    for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
            const cx = startX + c * deltaX + ((r % 2 === 1) ? (deltaX / 2) : 0);
            const cy = startY + r * deltaY;

            // Ensure cell center is reasonably within map margins
            if (cx + R > mapWidth + 0.5 || cy + R > mapHeight + 0.5) continue;

            const cellId = cellIdCounter++;
            const cell = {
                id: cellId,
                col: c,
                row: r,
                center: { x: cx, y: cy },
                vertices: [],
                edges: [],
                owner: null,
                type: 'neutral',
                asteroid: null
            };

            // 6 vertices of pointy-topped hex
            const cellVerts = [];
            for (let k = 0; k < 6; k++) {
                const angle = (Math.PI / 6) + k * (Math.PI / 3);
                const vx = cx + R * Math.cos(angle);
                const vy = cy + R * Math.sin(angle);
                const v = getOrCreateVertex(vx, vy, cellId);
                cell.vertices.push(v.id);
                cellVerts.push(v);
            }

            // 6 edges connecting vertices in cyclic loop
            for (let k = 0; k < 6; k++) {
                const vA = cellVerts[k];
                const vB = cellVerts[(k + 1) % 6];
                const edge = getOrCreateEdge(vA, vB);
                cell.edges.push(edge.id);
            }

            cells.push(cell);
        }
    }

    // 2. Assign Home Planets, Hangars, and Asteroids
    const midRow = Math.floor(rowCount / 2);

    // Left base (P1)
    const p1HomeCell = cells.find(c => c.col === 0 && c.row === midRow) || cells[0];
    p1HomeCell.type = 'home_p1';
    p1HomeCell.owner = 0;

    // P1 Hangars: adjacent cells to Home
    const p1HangarMiner = cells.find(c => (c.col === 0 && c.row === midRow - 1) || (c.col === 1 && c.row === midRow - 1)) || cells[1];
    p1HangarMiner.type = 'hangar_miner_p1';
    p1HangarMiner.owner = 0;

    const p1HangarFighter = cells.find(c => (c.col === 0 && c.row === midRow + 1) || (c.col === 1 && c.row === midRow)) || cells[2];
    p1HangarFighter.type = 'hangar_fighter_p1';
    p1HangarFighter.owner = 0;

    // Right base (P2)
    const maxCol = Math.max(...cells.map(c => c.col));
    const p2HomeCell = cells.find(c => c.col === maxCol && c.row === midRow) || cells[cells.length - 1];
    p2HomeCell.type = 'home_p2';
    p2HomeCell.owner = 1;

    // P2 Hangars: adjacent cells to Home
    const p2HangarMiner = cells.find(c => (c.col === maxCol && c.row === midRow - 1) || (c.col === maxCol - 1 && c.row === midRow - 1)) || cells[cells.length - 2];
    p2HangarMiner.type = 'hangar_miner_p2';
    p2HangarMiner.owner = 1;

    const p2HangarFighter = cells.find(c => (c.col === maxCol && c.row === midRow + 1) || (c.col === maxCol - 1 && c.row === midRow)) || cells[cells.length - 3];
    p2HangarFighter.type = 'hangar_fighter_p2';
    p2HangarFighter.owner = 1;

    // Pre-claim starting vertices for Home & Hangar cells so players start with an active base network
    [p1HomeCell, p1HangarMiner, p1HangarFighter].forEach(c => {
        c.vertices.forEach(vId => {
            vertices[vId].owner = 0;
            if (!vertices[vId].station) {
                vertices[vId].station = { type: 'relay', health: 200, maxHealth: 200, cooldown: 0, range: 2.2 };
            }
        });
    });

    [p2HomeCell, p2HangarMiner, p2HangarFighter].forEach(c => {
        c.vertices.forEach(vId => {
            vertices[vId].owner = 1;
            if (!vertices[vId].station) {
                vertices[vId].station = { type: 'relay', health: 200, maxHealth: 200, cooldown: 0, range: 2.2 };
            }
        });
    });

    // Place Asteroids in strategic midfield neutral cells
    const neutralCells = cells.filter(c => c.type === 'neutral');
    const midX = mapWidth / 2;
    // Sort neutral cells by distance to center
    neutralCells.sort((a, b) => Math.hypot(a.center.x - midX, a.center.y - (mapHeight / 2)) - Math.hypot(b.center.x - midX, b.center.y - (mapHeight / 2)));

    // Pick 4-6 balanced neutral asteroid locations
    const asteroidCandidates = neutralCells.slice(0, 6);
    asteroidCandidates.forEach((c, idx) => {
        c.type = 'asteroid';
        c.asteroid = {
            id: idx,
            resources: 600,
            maxResources: 600,
            radius: 0.35,
            x: c.center.x,
            y: c.center.y,
            miners: 0
        };
    });

    // 3. Ownership update method
    function updateOwnership() {
        for (let cell of cells) {
            if (cell.type.startsWith('home_p1') || cell.type.startsWith('hangar_') && cell.type.endsWith('_p1')) {
                cell.owner = 0;
                continue;
            }
            if (cell.type.startsWith('home_p2') || cell.type.startsWith('hangar_') && cell.type.endsWith('_p2')) {
                cell.owner = 1;
                continue;
            }

            // A neutral / asteroid cell is captured if all 6 perimeter vertices are owned by the same player
            const p1Verts = cell.vertices.filter(vId => vertices[vId].owner === 0).length;
            const p2Verts = cell.vertices.filter(vId => vertices[vId].owner === 1).length;

            if (p1Verts === 6) {
                cell.owner = 0;
            } else if (p2Verts === 6) {
                cell.owner = 1;
            } else {
                cell.owner = null;
            }
        }
    }

    // Run initial ownership calculation
    updateOwnership();

    return {
        width: mapWidth,
        height: mapHeight,
        hexRadius: R,
        cells,
        vertices,
        edges,
        p1Base: { home: p1HomeCell, minerHangar: p1HangarMiner, fighterHangar: p1HangarFighter },
        p2Base: { home: p2HomeCell, minerHangar: p2HangarMiner, fighterHangar: p2HangarFighter },
        updateOwnership
    };
}
