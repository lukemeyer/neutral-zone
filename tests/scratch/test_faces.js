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

const allPlayers = [player];

console.log("Running hull extraction...");
const hulls = getPlayerTerritoryHulls(player, allPlayers);
console.log("Hulls found:", hulls.length);
console.log(JSON.stringify(hulls, null, 2));
