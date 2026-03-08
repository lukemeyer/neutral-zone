import { getPlayerTerritoryHulls } from './js/utils.js';

const player = {
    id: 0,
    homePlanet: { x: 0, y: 0, health: 100 },
    units: {
        stations: [
            { x: 100, y: 0, health: 100 },
            { x: 100, y: 100, health: 100 },
            { x: 0, y: 100, health: 100 }
        ]
    }
};

const playerReverse = {
    id: 0,
    homePlanet: { x: 0, y: 0, health: 100 },
    units: {
        stations: [
            { x: 0, y: 100, health: 100 },
            { x: 100, y: 100, health: 100 },
            { x: 100, y: 0, health: 100 }
        ]
    }
};

console.log("CW Hulls:", getPlayerTerritoryHulls(player, [player]).length);
console.log("CCW Hulls:", getPlayerTerritoryHulls(playerReverse, [playerReverse]).length);
