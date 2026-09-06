import { spawn } from 'child_process';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const url = 'http://localhost:8080/commander_v2.html';

const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    '--window-size=1200,800'
], { stdio: 'ignore' });

// Wait 1.5s for Chrome to start
await new Promise(r => setTimeout(r, 1500));

try {
    const listRes = await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const target = await listRes.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (msg) => {
        const res = JSON.parse(msg.data);
        if (res.id && callbacks.has(res.id)) {
            const cb = callbacks.get(res.id);
            callbacks.delete(res.id);
            cb(res);
        }
    };

    function send(method, params = {}) {
        return new Promise((resolve) => {
            const msgId = id++;
            callbacks.set(msgId, resolve);
            ws.send(JSON.stringify({ id: msgId, method, params }));
        });
    }

    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');

    // Wait for page to initialize
    await new Promise(r => setTimeout(r, 2000));

    // Test 1: Check initial game state
    const eval1 = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
            p1Stations: gameState.players[0].stations.length,
            p1Fighters: gameState.players[0].fighters.length,
            p1Miners: gameState.players[0].miners.length,
            asteroids: gameState.asteroids.length,
            p1Energy: gameState.players[0].energy
        })`,
        returnByValue: true
    });
    console.log("Initial state in browser:", eval1.result.value);

    // Test 2: Simulate clicking on ray degree 45 (which is occupied) -> should slide to 46!
    const eval2 = await send('Runtime.evaluate', {
        expression: `(() => {
            const dotBefore = gameState.players[0].distances[45];
            const stationsBefore = gameState.players[0].stations.map(s => s.degree);
            // Click ray 45
            deployStationAtDegree(0, 45, true);
            const stationsAfter = gameState.players[0].stations.map(s => s.degree);
            const dotAfter = gameState.players[0].distances[46];
            return JSON.stringify({ stationsBefore, stationsAfter, dotBefore, dotAfter });
        })()`,
        returnByValue: true
    });
    console.log("Ray click & occupied slide result:", eval2.result.value);

    // Capture screenshot of expanded territory with station
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    import('fs').then(fs => {
        fs.writeFileSync(
            '/Users/lukemeyer/.gemini/antigravity/brain/9dfc9558-7d20-4112-bb6d-d7ac2d642aaf/commander_v2_station_slid.png',
            Buffer.from(screenshot.result.data, 'base64')
        );
        console.log("Saved commander_v2_station_slid.png");
    });

    // Test 3: Set attack stance and run for 3 seconds to see combat
    await send('Runtime.evaluate', {
        expression: `setStance('attack')`
    });

    await new Promise(r => setTimeout(r, 3000));

    const eval3 = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
            p1Stance: gameState.players[0].stance,
            p1FighterPos: gameState.players[0].fighters.map(f => ({ x: Math.round(f.x), y: Math.round(f.y) })),
            projectiles: gameState.projectiles.length,
            p1Energy: gameState.players[0].energy
        })`,
        returnByValue: true
    });
    console.log("Combat state after attack stance:", eval3.result.value);

    const screenshot2 = await send('Page.captureScreenshot', { format: 'png' });
    const fs = await import('fs');
    fs.writeFileSync(
        '/Users/lukemeyer/.gemini/antigravity/brain/9dfc9558-7d20-4112-bb6d-d7ac2d642aaf/commander_v2_combat.png',
        Buffer.from(screenshot2.result.data, 'base64')
    );
    console.log("Saved commander_v2_combat.png");

    ws.close();
} catch (err) {
    console.error("Test error:", err);
} finally {
    chrome.kill();
}
