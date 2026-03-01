import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'tests', 'logs');

if (!fs.existsSync(logsDir)) {
    console.error("No logs directory found.");
    process.exit(1);
}

const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.json'));

if (files.length === 0) {
    console.log("No test logs found.");
    process.exit(0);
}

// Sort files chronologically (assuming filename has ISO string)
files.sort();

console.log(`Found ${files.length} test logs. Analyzing trends...\n`);

const testHistory = {};

files.forEach(file => {
    const raw = fs.readFileSync(path.join(logsDir, file), 'utf8');
    const data = JSON.parse(raw);

    data.results.forEach(res => {
        if (!testHistory[res.name]) {
            testHistory[res.name] = [];
        }
        testHistory[res.name].push({
            date: data.date,
            metrics: res
        });
    });
});

for (const [testName, runs] of Object.entries(testHistory)) {
    console.log(`=== ${testName} ===`);
    if (runs.length < 2) {
        console.log(`  Not enough data for trend analysis (Runs: ${runs.length})`);
        console.log(`  Latest Time: ${runs[0].metrics.timeSeconds.toFixed(2)}s`);
    } else {
        const first = runs[0].metrics;
        const last = runs[runs.length - 1].metrics;

        const timeDiff = last.timeSeconds - first.timeSeconds;
        const timeTrend = timeDiff === 0 ? "No change" : (timeDiff > 0 ? `+${timeDiff.toFixed(2)}s (Slower)` : `${timeDiff.toFixed(2)}s (Faster)`);

        console.log(`  Latest Time: ${last.timeSeconds.toFixed(2)}s (Trend: ${timeTrend})`);

        if (last.category === 'Combat') {
            const firstP1Hp = first.p1FightersHP || 0;
            const lastP1Hp = last.p1FightersHP || 0;
            const p1Trend = lastP1Hp === firstP1Hp ? "No change" : (lastP1Hp > firstP1Hp ? `+${lastP1Hp - firstP1Hp} (Stronger)` : `${lastP1Hp - firstP1Hp} (Weaker)`);
            console.log(`  P1 Remaining HP: ${lastP1Hp} (Trend: ${p1Trend})`);

            const firstP2Hp = first.p2ScoutsHP || 0;
            const lastP2Hp = last.p2ScoutsHP || 0;
            const p2Trend = lastP2Hp === firstP2Hp ? "No change" : (lastP2Hp > firstP2Hp ? `+${lastP2Hp - firstP2Hp} (Stronger)` : `${lastP2Hp - firstP2Hp} (Weaker)`);
            console.log(`  P2 Remaining HP: ${lastP2Hp} (Trend: ${p2Trend})`);
        } else if (last.category === 'Economy') {
            const firstEnergy = first.p1Energy || 0;
            const lastEnergy = last.p1Energy || 0;
            const eTrend = lastEnergy === firstEnergy ? "No change" : (lastEnergy > firstEnergy ? `+${(lastEnergy - firstEnergy).toFixed(1)} (More)` : `${(lastEnergy - firstEnergy).toFixed(1)} (Less)`);
            console.log(`  P1 Final Energy: ${lastEnergy.toFixed(1)} (Trend: ${eTrend})`);
        }
    }
    console.log('');
}
