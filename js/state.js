console.log('state.js loaded');
export const players = [
    {
        id: 0,
        color: '#1f6feb', // Blue (Player 1)
        territoryColor: '#2ea043',
        energy: 100,
        homePlanet: { x: 0, y: 0, radius: 30, health: 1000, maxHealth: 1000, damageTime: 0 },
        units: { scouts: [], fighters: [], miners: [] },
        isCPU: false,
        aiTimer: 0,
        scoutSettleTimer: 0,
        buildCooldowns: { miner: 0, scout: 0, fighter: 0 },
        buildQueue: []
    },
    {
        id: 1,
        color: '#f85149', // Red (Player 2)
        territoryColor: '#da3633',
        energy: 100,
        homePlanet: { x: 0, y: 0, radius: 30, health: 1000, maxHealth: 1000, damageTime: 0 },
        units: { scouts: [], fighters: [], miners: [] },
        isCPU: false,
        aiTimer: 0,
        scoutSettleTimer: 0,
        buildCooldowns: { miner: 0, scout: 0, fighter: 0 },
        buildQueue: []
    }
];

export const asteroids = [];

export const projectiles = [];

export const stars = [];

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

export function initGameState(width, height) {
    // Anchor bases dynamically to 10% and 90% of screen width, centered vertically.
    players[0].homePlanet.x = width * 0.1;
    players[0].homePlanet.y = height * 0.5;
    players[1].homePlanet.x = width * 0.9;
    players[1].homePlanet.y = height * 0.5;

    // Generate Left Side Asteroids
    const generateAsteroids = () => {
        const leftAsteroids = [];
        // Guaranteed asteroid near P1
        leftAsteroids.push({
            x: players[0].homePlanet.x + 80,
            y: players[0].homePlanet.y,
            radius: 15, miners: 0,
            resources: Math.floor(Math.random() * 400 + 200),
            variant: Math.floor(Math.random() * 3)
        });
        // Random asteroids on left half
        for (let i = 1; i < 6; i++) {
            leftAsteroids.push({
                x: Math.random() * ((width / 2) - (width * 0.2)) + (width * 0.2), // Keep outside initial territory but on left half
                y: Math.random() * (height - 100) + 50,
                radius: 15, miners: 0,
                resources: Math.floor(Math.random() * 400 + 200),
                variant: Math.floor(Math.random() * 3)
            });
        }
        return leftAsteroids;
    };

    const leftAsteroids = generateAsteroids();
    // Add left side and mirrored right side (only mirror horizontally)
    leftAsteroids.forEach(a => {
        asteroids.push({ ...a });
        asteroids.push({
            x: width - a.x,
            y: a.y,
            radius: 15, miners: 0,
            resources: a.resources,
            variant: a.variant
        });
    });

    // Generate Starfield
    stars.length = 0;
    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 1.5 + 0.5,
            opacity: Math.random() * 0.5 + 0.1
        });
    }

    // Setup Initial Units for both players
    players.forEach(p => {
        const dirX = p.homePlanet.x < (width / 2) ? 1 : -1;

        let sx1 = p.homePlanet.x + (120 * dirX);
        let sy1 = p.homePlanet.y;
        p.units.scouts.push({ x: sx1, y: sy1, targetX: sx1, targetY: sy1, health: 200, maxHealth: 200, cooldown: 0, damageTime: 0 });

        let sx2 = p.homePlanet.x + (60 * dirX);
        let sy2 = Math.max(20, p.homePlanet.y - 100);
        p.units.scouts.push({ x: sx2, y: sy2, targetX: sx2, targetY: sy2, health: 200, maxHealth: 200, cooldown: 0, damageTime: 0 });

        let sx3 = p.homePlanet.x + (60 * dirX);
        let sy3 = Math.min(height - 20, p.homePlanet.y + 100);
        p.units.scouts.push({ x: sx3, y: sy3, targetX: sx3, targetY: sy3, health: 200, maxHealth: 200, cooldown: 0, damageTime: 0 });

        p.units.miners.push({ x: p.homePlanet.x, y: p.homePlanet.y, targetAsteroid: null, payload: 0, returning: false, health: 60, maxHealth: 60, damageTime: 0 });
    });
}
