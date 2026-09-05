import { createHexGrid } from './hex_grid.js';

export function createInitialState(mapWidth = 20, mapHeight = 15, hexRadius = 1.6) {
    const grid = createHexGrid(mapWidth, mapHeight, hexRadius);

    const players = [
        {
            id: 0,
            name: 'Player 1',
            color: '#1f6feb', // Blue
            accentColor: '#58a6ff',
            territoryColor: 'rgba(31, 111, 235, 0.35)',
            energy: 120,
            homePlanet: {
                x: grid.p1Base.home.center.x,
                y: grid.p1Base.home.center.y,
                health: 1200,
                maxHealth: 1200,
                radius: 0.7
            },
            hangars: {
                miner: {
                    type: 'miner',
                    center: { ...grid.p1Base.minerHangar.center },
                    cellId: grid.p1Base.minerHangar.id,
                    dockedUnits: []
                },
                fighter: {
                    type: 'fighter',
                    center: { ...grid.p1Base.fighterHangar.center },
                    cellId: grid.p1Base.fighterHangar.id,
                    dockedUnits: []
                }
            },
            units: {
                miners: [],
                fighters: []
            },
            buildQueue: [],
            buildCooldowns: { miner: 0, station: 0, turret: 0, fighter: 0 },
            isCPU: false,
            aiTimer: 0
        },
        {
            id: 1,
            name: 'Player 2',
            color: '#f85149', // Red
            accentColor: '#ff7b72',
            territoryColor: 'rgba(248, 81, 73, 0.35)',
            energy: 120,
            homePlanet: {
                x: grid.p2Base.home.center.x,
                y: grid.p2Base.home.center.y,
                health: 1200,
                maxHealth: 1200,
                radius: 0.7
            },
            hangars: {
                miner: {
                    type: 'miner',
                    center: { ...grid.p2Base.minerHangar.center },
                    cellId: grid.p2Base.minerHangar.id,
                    dockedUnits: []
                },
                fighter: {
                    type: 'fighter',
                    center: { ...grid.p2Base.fighterHangar.center },
                    cellId: grid.p2Base.fighterHangar.id,
                    dockedUnits: []
                }
            },
            units: {
                miners: [],
                fighters: []
            },
            buildQueue: [],
            buildCooldowns: { miner: 0, station: 0, turret: 0, fighter: 0 },
            isCPU: true,
            aiTimer: 0
        }
    ];

    // Give each player 2 initial miners and 2 initial fighters already docked inside hangars
    [0, 1].forEach(pId => {
        const p = players[pId];
        // 2 starting miners (docked in hangar)
        for (let i = 0; i < 2; i++) {
            const miner = {
                id: pId * 1000 + i,
                playerId: pId,
                state: 'docked', // 'docked' | 'launching' | 'mining' | 'returning'
                x: p.hangars.miner.center.x,
                y: p.hangars.miner.center.y,
                payload: 0,
                maxPayload: 25,
                targetAsteroid: null,
                health: 100,
                maxHealth: 100
            };
            p.units.miners.push(miner);
            p.hangars.miner.dockedUnits.push(miner);
        }

        // 2 starting fighters (docked in hangar)
        for (let i = 0; i < 2; i++) {
            const fighter = {
                id: pId * 1000 + 50 + i,
                playerId: pId,
                state: 'docked', // 'docked' | 'patrol' | 'intercept' | 'returning'
                x: p.hangars.fighter.center.x,
                y: p.hangars.fighter.center.y,
                health: 150,
                maxHealth: 150,
                cooldown: 0,
                path: null,
                pathIndex: 0,
                speed: 1.8
            };
            p.units.fighters.push(fighter);
            p.hangars.fighter.dockedUnits.push(fighter);
        }
    });

    const asteroids = grid.cells.filter(c => c.asteroid).map(c => c.asteroid);

    return {
        grid,
        players,
        asteroids,
        projectiles: [],
        particles: [],
        gameTime: 0,
        gameSpeed: 1.0,
        isPaused: false,
        isGameOver: false,
        winner: null,
        hoveredVertexId: null,
        hoveredCellId: null,
        selectedFighters: [],
        drawingPath: false,
        activePathWaypoints: []
    };
}
