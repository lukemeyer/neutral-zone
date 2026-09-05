import { computeStationPositions, getTerritoryPolygon, getAsteroidLayout, createBorderFromStations, createQuadrantBorder, pinStationToBorder } from './commander_math.js';

export function createCommanderState() {
    const p1Home = { x: 2.5, y: 12.5, health: 1500, maxHealth: 1500, radius: 0.8 };
    const p2Home = { x: 17.5, y: 2.5, health: 1500, maxHealth: 1500, radius: 0.8 };

    const p1Border = createQuadrantBorder(3.8);
    const p2Border = createQuadrantBorder(3.8);

    function initStations(home, count, isP2) {
        const border = isP2 ? p2Border : p1Border;
        const angles = isP2
            ? [Math.PI * 0.58, Math.PI * 0.75, Math.PI * 0.92]
            : [-Math.PI * 0.42, -Math.PI * 0.25, -Math.PI * 0.08];
        const stations = [];
        for (let idx = 0; idx < count; idx++) {
            const ang = angles[idx];
            const s = {
                id: (isP2 ? 100 : 0) + idx,
                angle: ang,
                health: 250,
                maxHealth: 250,
                cooldown: 0,
                range: 2.5,
                isPerimeter: true
            };
            pinStationToBorder(s, home, border, isP2);
            s.x = s.targetX;
            s.y = s.targetY;
            stations.push(s);
        }
        return stations;
    }

    const p1Stations = initStations(p1Home, 3, false);
    const p2Stations = initStations(p2Home, 3, true);
    p1Stations._borderDistances = p1Border;
    p2Stations._borderDistances = p2Border;

    const players = [
        {
            id: 0,
            name: 'Commander Blue',
            color: '#1f6feb',
            accentColor: '#58a6ff',
            territoryColor: 'rgba(31, 111, 235, 0.28)',
            energy: 150,
            homePlanet: p1Home,
            stationCount: 3,
            stations: p1Stations,
            borderDistances: p1Border,
            stance: 'patrol', // 'patrol' | 'defend' | 'attack'
            units: {
                miners: [],
                fighters: []
            },
            launchAngle: -Math.PI * 0.25,
            steeringAngle: -Math.PI * 0.25,
            launchHits: [],
            launchingStations: [],
            buildQueue: [],
            buildCooldowns: { station: 0, miner: 0, fighter: 0 },
            isCPU: false,
            aiTimer: 0
        },
        {
            id: 1,
            name: 'Commander Red',
            color: '#f85149',
            accentColor: '#ff7b72',
            territoryColor: 'rgba(248, 81, 73, 0.28)',
            energy: 150,
            homePlanet: p2Home,
            stationCount: 3,
            stations: p2Stations,
            borderDistances: p2Border,
            stance: 'patrol',
            units: {
                miners: [],
                fighters: []
            },
            launchAngle: Math.PI * 0.75,
            steeringAngle: Math.PI * 0.75,
            launchHits: [],
            launchingStations: [],
            buildQueue: [],
            buildCooldowns: { station: 0, miner: 0, fighter: 0 },
            isCPU: true,
            aiTimer: 0
        }
    ];

    players[0].stations._borderDistances = players[0].borderDistances;
    players[1].stations._borderDistances = players[1].borderDistances;

    // Starting units for each player: 2 miners and 3 fighters
    [0, 1].forEach(pId => {
        const p = players[pId];
        // 2 Miners
        for (let i = 0; i < 2; i++) {
            p.units.miners.push({
                id: pId * 1000 + i,
                playerId: pId,
                x: p.homePlanet.x + (pId === 0 ? 0.6 : -0.6) * (i + 1),
                y: p.homePlanet.y + (pId === 0 ? -0.6 : 0.6) * (i + 1),
                payload: 0,
                maxPayload: 10,
                targetAsteroid: null,
                returning: false,
                health: 100,
                maxHealth: 100
            });
        }
        // 3 Fighters
        for (let i = 0; i < 3; i++) {
            p.units.fighters.push({
                id: pId * 1000 + 50 + i,
                playerId: pId,
                x: p.homePlanet.x + (pId === 0 ? 1.0 : -1.0) + (i * 0.4),
                y: p.homePlanet.y + (pId === 0 ? -1.0 : 1.0) - (i * 0.4),
                health: 150,
                maxHealth: 150,
                cooldown: 0,
                speed: 2.2,
                patrolT: i * 0.33
            });
        }
    });

    const asteroids = getAsteroidLayout();

    return {
        mapWidth: 20,
        mapHeight: 15,
        players,
        asteroids,
        projectiles: [],
        particles: [],
        gameTime: 0,
        gameSpeed: 1.0,
        isPaused: false,
        isGameOver: false,
        winner: null,
        winReason: ''
    };
}
