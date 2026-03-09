import fs from 'fs';
import path from 'path';
import { resetGameState, createDummyPlayer, runSimulation } from './test_runner.js';
import { players, asteroids, GRID_W, GRID_H } from '../js/state.js';
import { updateAI } from '../js/ai.js';

const scenarioFile = process.argv[2];

if (!scenarioFile) {
    console.error("Usage: node tests/ai_tuner.js <path_to_scenario.js>");
    process.exit(1);
}

const scenarioPath = path.resolve(process.cwd(), scenarioFile);

if (!fs.existsSync(scenarioPath)) {
    console.error(`Scenario file not found: ${scenarioPath}`);
    process.exit(1);
}

// Emulate a minimal evaluator API so scenarios can be written simply
global.logMsg = (msg) => console.log(`[LOG] ${msg}`);

global.assert = function (condition, message) {
    if (!condition) {
        console.error(`\x1b[31m[ASSERT FAILED]\x1b[0m ${message}`);
        throw new Error("ASSERTION_FAILED");
    }
};

global.assertPass = function (condition, message) {
    if (condition) {
        console.log(`\x1b[32m[SCENARIO PASSED]\x1b[0m ${message}`);
        process.exit(0);
    }
};

async function runTuner() {
    console.log(`\n--- Running Tuner Scenario: ${path.basename(scenarioFile)} ---`);
    const scenarioModule = await import(scenarioPath);
    const scenario = scenarioModule.default;

    if (!scenario || typeof scenario.setup !== 'function' || typeof scenario.tick !== 'function') {
        console.error("Scenario file must export default object with { setup: fn, tick: fn }");
        process.exit(1);
    }

    try {
        scenario.setup();

        const maxGameLengthSeconds = scenario.maxDuration || 600; // 10 minutes default max

        const stopCondition = (ticks) => {
            const timeSeconds = ticks * (1 / 60);

            // Apply the scenario's own internal logic checks
            scenario.tick(timeSeconds, ticks);

            // Force stop if we hit the wall clock limit
            return timeSeconds >= maxGameLengthSeconds;
        };

        const res = runSimulation(stopCondition, (ticks) => {
            // Run AI ticks for active CPU players
            players.forEach(p => {
                if (p.isCPU) {
                    updateAI(p, 1 / 60, GRID_W, GRID_H);
                }
            });
        });

        console.log(`\x1b[33m[TIMEOUT]\x1b[0m Scenario reached max duration (${maxGameLengthSeconds}s) without explicitly passing or failing.`);
        process.exit(1);

    } catch (e) {
        if (e.message === "ASSERTION_FAILED") {
            process.exit(1);
        } else {
            console.error("Unexpected Error running scenario:", e);
            process.exit(1);
        }
    }
}

runTuner();
