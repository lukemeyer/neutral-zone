// Strategic AI for Neutral Zone: Hex Variant
import { COSTS, scrambleFighters, recallFighters } from './hex_units.js';

export function updateHexAI(state, dt) {
    const { grid, players } = state;
    const ai = players[1]; // P2 is CPU
    if (!ai || !ai.isCPU) return;

    ai.aiTimer = (ai.aiTimer || 0) + dt;
    if (ai.aiTimer < 1.0) return; // Evaluate every 1.0 second
    ai.aiTimer = 0;

    const enemy = players[0];

    // 1. Check unit production
    const totalMiners = ai.units.miners.length;
    const capturedAsteroids = grid.cells.filter(c => c.type === 'asteroid' && c.owner === ai.id);
    const minerQueueCount = ai.buildQueue.filter(b => b.type === 'miner').length;

    if (capturedAsteroids.length > 0 && totalMiners + minerQueueCount < capturedAsteroids.length * 2 && ai.energy >= COSTS.miner) {
        ai.energy -= COSTS.miner;
        ai.buildQueue.push({ type: 'miner' });
    }

    const totalFighters = ai.units.fighters.length;
    const fighterQueueCount = ai.buildQueue.filter(b => b.type === 'fighter').length;
    if (totalFighters + fighterQueueCount < 4 && ai.energy >= COSTS.fighter) {
        ai.energy -= COSTS.fighter;
        ai.buildQueue.push({ type: 'fighter' });
    }

    // 2. Station Expansion on Hex Intersections
    if (ai.energy >= COSTS.stationRelay) {
        // Find all unowned vertices adjacent to an owned vertex
        const ownedVertexIds = new Set(grid.vertices.filter(v => v.owner === ai.id).map(v => v.id));
        const candidateVertices = [];

        grid.vertices.forEach(v => {
            if (v.owner === null) {
                const isAdjacentToNetwork = v.adjacentVertices.some(adjId => ownedVertexIds.has(adjId));
                if (isAdjacentToNetwork) {
                    candidateVertices.push(v);
                }
            }
        });

        if (candidateVertices.length > 0) {
            // Score candidates
            let bestVertex = null;
            let bestScore = -Infinity;

            candidateVertices.forEach(v => {
                let score = 0;

                // Priority for completing hex rings
                v.cells.forEach(cId => {
                    const cell = grid.cells[cId];
                    if (cell.owner !== ai.id) {
                        const ownedInCell = cell.vertices.filter(vid => ownedVertexIds.has(vid)).length;
                        if (ownedInCell === 5) score += 100; // Will complete cell!
                        else score += ownedInCell * 15;

                        // Extra weight if cell has an asteroid
                        if (cell.type === 'asteroid') {
                            score += 60;
                        }
                    }
                });

                // Favor expanding inward toward center of map (smaller X for P2 on right)
                score += (20 - v.x) * 4;

                if (score > bestScore) {
                    bestScore = score;
                    bestVertex = v;
                }
            });

            if (bestVertex) {
                ai.energy -= COSTS.stationRelay;
                bestVertex.owner = ai.id;
                bestVertex.station = {
                    type: 'relay',
                    health: 200,
                    maxHealth: 200,
                    cooldown: 0,
                    range: 2.2
                };
                grid.updateOwnership();
            }
        }
    }

    // 3. Station Upgrades to Turrets
    if (ai.energy >= COSTS.stationTurret) {
        // Find front-line relay stations that border neutral or enemy vertices
        const frontLineRelays = grid.vertices.filter(v => {
            return v.owner === ai.id && v.station && v.station.type === 'relay' &&
                   v.adjacentVertices.some(adjId => grid.vertices[adjId].owner !== ai.id);
        });

        if (frontLineRelays.length > 0) {
            const turretCandidate = frontLineRelays[Math.floor(Math.random() * frontLineRelays.length)];
            ai.energy -= COSTS.stationTurret;
            turretCandidate.station.type = 'turret';
            turretCandidate.station.health = 300;
            turretCandidate.station.maxHealth = 300;
            turretCandidate.station.range = 2.6;
        }
    }

    // 4. Fighter Tactical Behavior
    // If enemy airborne fighters are close, or if AI has docked fighters and territory is threatened, scramble!
    const dockedCount = ai.hangars.fighter.dockedUnits.length;
    const enemyAirborneFighters = enemy.units.fighters.filter(f => f.state !== 'docked');
    const airThreat = enemyAirborneFighters.some(ef => ef.x > 8.0); // Approaching center or right

    if (dockedCount >= 2 || (dockedCount > 0 && airThreat)) {
        // Generate patrol path along front-line vertices
        const myFrontier = grid.vertices.filter(v => v.owner === ai.id && v.x < 15.0);
        let path = null;
        if (myFrontier.length >= 3) {
            path = myFrontier.slice(0, 3).map(v => ({ x: v.x, y: v.y }));
        }
        scrambleFighters(ai, dockedCount, path);
    }

    // Recall injured fighters (< 40 HP)
    ai.units.fighters.forEach(f => {
        if (f.state !== 'docked' && f.health < 40) {
            f.state = 'returning';
            f.path = null;
        }
    });
}
