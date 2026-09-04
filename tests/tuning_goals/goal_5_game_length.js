import { resetGameState, createDummyPlayer } from '../test_runner.js';
import { players, asteroids } from '../../js/state.js';
import { getPlayerTerritoryHulls } from '../../js/utils.js';

export default {
    maxDuration: 600, // 10m
    setup: () => {
        resetGameState();
        const p1 = createDummyPlayer(0, 2, 7.5);
        p1.isCPU = true;
        p1.type = 'cpu_expansioneer';

        const p2 = createDummyPlayer(1, 18, 7.5);
        p2.isCPU = true;
        p2.type = 'cpu_expansioneer';

        // Symmetrical layout
        asteroids.push({ x: 4, y: 5, radius: 0.3, miners: 0, resources: 400, variant: 0 });
        asteroids.push({ x: 4, y: 10, radius: 0.3, miners: 0, resources: 400, variant: 1 });
        asteroids.push({ x: 16, y: 5, radius: 0.3, miners: 0, resources: 400, variant: 2 });
        asteroids.push({ x: 16, y: 10, radius: 0.3, miners: 0, resources: 400, variant: 0 });
        asteroids.push({ x: 10, y: 7.5, radius: 0.3, miners: 0, resources: 800, variant: 1 }); // Center

        p1.units.stations.push({ x: 3, y: 7.5, targetX: 3, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 1.5, y: 5.5, targetX: 1.5, targetY: 5.5, health: 200, maxHealth: 200, cooldown: 0 });
        p1.units.stations.push({ x: 1.5, y: 9.5, targetX: 1.5, targetY: 9.5, health: 200, maxHealth: 200, cooldown: 0 });

        p2.units.stations.push({ x: 17, y: 7.5, targetX: 17, targetY: 7.5, health: 200, maxHealth: 200, cooldown: 0 });
        p2.units.stations.push({ x: 18.5, y: 5.5, targetX: 18.5, targetY: 5.5, health: 200, maxHealth: 200, cooldown: 0 });
        p2.units.stations.push({ x: 18.5, y: 9.5, targetX: 18.5, targetY: 9.5, health: 200, maxHealth: 200, cooldown: 0 });

        global.logMsg("Task: CPU vs CPU should conclude the game in an engaging timeframe (~5 mins).");
    },
    tick: (timeSeconds, ticks) => {
        const p1 = players[0];
        const p2 = players[1];

        if (Math.floor(timeSeconds) % 30 === 0 && Math.abs(timeSeconds - Math.floor(timeSeconds)) < (1 / 60)) {
            global.logMsg(`t=${timeSeconds.toFixed(0)}s | P1: HP=${p1.homePlanet.health} E=${Math.floor(p1.energy)} F=${p1.units.fighters.length} S=${p1.units.stations.length} M=${p1.units.miners.length} | P2: HP=${p2.homePlanet.health} E=${Math.floor(p2.energy)} F=${p2.units.fighters.length} S=${p2.units.stations.length} M=${p2.units.miners.length}`);
        }

        const checkDomination = (player) => {
            const hulls = getPlayerTerritoryHulls(player, players, false);
            let area = 0;
            for (let hull of hulls) {
                let subArea = 0;
                for (let i = 0; i < hull.length; i++) {
                    let j = (i + 1) % hull.length;
                    subArea += hull[i].x * hull[j].y;
                    subArea -= hull[j].x * hull[i].y;
                }
                area += Math.abs(subArea / 2);
            }
            return (area / (20 * 15)) * 100;
        };

        const p1Dead = p1.homePlanet.health <= 0 || (p1.units.stations.length + p1.units.fighters.length + p1.units.miners.length === 0 && p1.energy < 25);
        const p2Dead = p2.homePlanet.health <= 0 || (p2.units.stations.length + p2.units.fighters.length + p2.units.miners.length === 0 && p2.energy < 25);
        const p1Dom = checkDomination(p1) >= 55.0;
        const p2Dom = checkDomination(p2) >= 55.0;

        const remainingResources = asteroids.reduce((acc, a) => acc + (a.resources || 0), 0);
        const p1Exhausted = p1.energy < 100 && p1.units.fighters.length === 0 && (remainingResources === 0 || p1.units.miners.length === 0);
        const p2Exhausted = p2.energy < 100 && p2.units.fighters.length === 0 && (remainingResources === 0 || p2.units.miners.length === 0);
        const resourceExhaustion = remainingResources === 0 && p1Exhausted && p2Exhausted;

        if (p1Dead || p2Dead || p1Dom || p2Dom || resourceExhaustion) {
            // Target length is 5 mins (300s). We allow a variance between 3.5 minutes (210s) and 7.5 minutes (450s).
            if (timeSeconds < 210) {
                global.assert(false, `Game Ended Too Fast: Match concluded in ${timeSeconds.toFixed(1)}s. This implies a first-strike or snowball mechanic is too strong.`);
            } else if (timeSeconds > 450) {
                global.assert(false, `Game Too Slow: Match took ${timeSeconds.toFixed(1)}s. The CPUs are trapped in an unbreakable stalemate or lack offensive push.`);
            } else {
                let winReason = 'Destruction';
                if (p1Dom || p2Dom) winReason = 'Domination';
                else if (resourceExhaustion) {
                    const p1Score = p1.homePlanet.health + p1.units.stations.length * 50 + p1.energy;
                    const p2Score = p2.homePlanet.health + p2.units.stations.length * 50 + p2.energy;
                    winReason = `Resource Exhaustion (${p1Score >= p2Score ? 'P1' : 'P2'} win on assets ${p1Score.toFixed(0)} vs ${p2Score.toFixed(0)})`;
                }
                global.assertPass(true, `Game Length Target Met: Match engagingly concluded in ${timeSeconds.toFixed(1)}s via ${winReason}.`);
            }
        }
    }
};
