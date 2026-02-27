console.log('state.js loaded');
export const players = [
    {
        id: 0,
        color: '#1f6feb', // Blue (Player 1)
        territoryColor: '#2ea043',
        energy: 100,
        homePlanet: { x: 128, y: 360, radius: 30, health: 1000, maxHealth: 1000 },
        units: { scouts: [], fighters: [], miners: [] },
        isCPU: false,
        aiTimer: 0,
        scoutSettleTimer: 0
    },
    {
        id: 1,
        color: '#f85149', // Red (Player 2)
        territoryColor: '#da3633',
        energy: 100,
        homePlanet: { x: 1152, y: 360, radius: 30, health: 1000, maxHealth: 1000 },
        units: { scouts: [], fighters: [], miners: [] },
        isCPU: false,
        aiTimer: 0,
        scoutSettleTimer: 0
    }
];

export const asteroids = [];

export const projectiles = [];

// Interaction State
export const state = {
    activeScout: null,
    activeScoutPlayer: null,
    selectedFighters: [], // Array for multi-select
    selectionBox: null,   // { startX, startY, endX, endY }
    currentPath: [],      // Temporary path being drawn before assignment
    drawingPath: false,
    clickedFighterClick: false,
    gameStarted: false,
    gameOver: false,
    lastTime: 0
};

export function initGameState() {
    // Generate Left Side Asteroids
    const generateAsteroids = () => {
        const leftAsteroids = [];
        // Guaranteed asteroid near P1
        leftAsteroids.push({
            x: players[0].homePlanet.x + 80,
            y: players[0].homePlanet.y,
            radius: 15, miners: 0,
            resources: Math.floor(Math.random() * 400 + 200)
        });
        // Random asteroids on left half
        for (let i = 1; i < 6; i++) {
            leftAsteroids.push({
                x: Math.random() * (640 - 250) + 250, // Keep outside initial territory
                y: Math.random() * (720 - 100) + 50,
                radius: 15, miners: 0,
                resources: Math.floor(Math.random() * 400 + 200)
            });
        }
        return leftAsteroids;
    };

    const leftAsteroids = generateAsteroids();
    // Add left side and mirrored right side (only mirror horizontally)
    leftAsteroids.forEach(a => {
        asteroids.push({ ...a });
        asteroids.push({
            x: 1280 - a.x,
            y: a.y,
            radius: 15, miners: 0,
            resources: a.resources
        });
    });

    // Setup Initial Units for both players
    players.forEach(p => {
        const dirX = p.homePlanet.x < 640 ? 1 : -1;
        p.units.scouts.push({ x: p.homePlanet.x - (100 * dirX), y: p.homePlanet.y - 100, targetX: p.homePlanet.x - (100 * dirX), targetY: p.homePlanet.y - 100, health: 50, maxHealth: 50, cooldown: 0 });
        p.units.scouts.push({ x: p.homePlanet.x + (100 * dirX), y: p.homePlanet.y - 100, targetX: p.homePlanet.x + (100 * dirX), targetY: p.homePlanet.y - 100, health: 50, maxHealth: 50, cooldown: 0 });
        p.units.scouts.push({ x: p.homePlanet.x, y: p.homePlanet.y + 120, targetX: p.homePlanet.x, targetY: p.homePlanet.y + 120, health: 50, maxHealth: 50, cooldown: 0 });
        p.units.miners.push({ x: p.homePlanet.x, y: p.homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 20, maxHealth: 20 });
    });
}
