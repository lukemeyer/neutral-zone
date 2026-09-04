import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const goalsDir = path.resolve(process.cwd(), 'tests', 'tuning_goals');
const goalFiles = fs.readdirSync(goalsDir).filter(f => f.startsWith('goal_') && f.endsWith('.js')).sort();

console.log(`\n======================================================`);
console.log(`  Neutral Zone: Running ${goalFiles.length} AI Tuning Goals`);
console.log(`======================================================\n`);

let passedCount = 0;
let failedCount = 0;
const results = [];

async function runGoal(file) {
    return new Promise((resolve) => {
        const fullPath = path.join(goalsDir, file);
        const start = Date.now();
        const child = spawn(process.execPath, ['tests/ai_tuner.js', `tests/tuning_goals/${file}`], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => stdout += d.toString());
        child.stderr.on('data', (d) => stderr += d.toString());

        child.on('close', (code) => {
            const elapsed = ((Date.now() - start) / 1000).toFixed(2);
            const passed = code === 0;
            if (passed) {
                passedCount++;
                console.log(`  ✅ [PASS] ${file} (${elapsed}s)`);
            } else {
                failedCount++;
                console.log(`  ❌ [FAIL] ${file} (${elapsed}s)`);
                const lines = (stdout + stderr).split('\n').filter(Boolean);
                const lastLines = lines.slice(-4).join('\n     ');
                console.log(`     ${lastLines}`);
            }
            results.push({ file, passed, elapsed });
            resolve(passed);
        });
    });
}

async function main() {
    for (const file of goalFiles) {
        await runGoal(file);
    }

    console.log(`\n------------------------------------------------------`);
    console.log(`  Summary: ${passedCount} Passed, ${failedCount} Failed out of ${goalFiles.length} Goals`);
    console.log(`------------------------------------------------------\n`);

    if (failedCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

main();
