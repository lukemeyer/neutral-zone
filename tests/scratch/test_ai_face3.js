import { resetGameState, createDummyPlayer, runSimulation } from './tests/test_runner.js';
import { players, asteroids } from './js/state.js';
import { updateAI } from './js/ai.js';
import { getPlayerTerritoryHulls } from './js/utils.js';

resetGameState();
const p1 = createDummyPlayer(0, 100, 400);
asteroids.push({ x: 200, y: 300, radius: 15, miners: 0, resources: 400, variant: 0 });
p1.isCPU = true;

const stopCondition = (ticks) => {
    if (ticks === 1200) {
        console.log("Stations at tick 1200:");
        p1.units.stations.forEach(s => console.log(s.x, s.y, s.aiState, s.aiTargetAst ? "Has Target" : "No Target"));
        const hulls = getPlayerTerritoryHulls(p1, players, false);
        console.log("Hulls detected:", hulls.length);
        if (hulls.length > 0) {
            console.log("Hull nodes area:");
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
            console.log("Area array is", String(area));
        }
    }
    return false;
};

runSimulation(stopCondition, (ticks) => {
    if (p1.isCPU) updateAI(p1, 1 / 60, 1000, 800);
    if (ticks >= 1205) {
        console.log("Exiting normally");
        process.exit(0);
    }
});
