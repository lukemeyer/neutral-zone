import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execSync } from 'child_process';

console.log('--- Testing Build Cache-Buster ---');

const testBuildId = 'test-build-99-20260905000000';
const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

// Execute build with specific test BUILD_ID
execSync(`node scripts/build.mjs`, {
    cwd: rootDir,
    env: { ...process.env, BUILD_ID: testBuildId },
    stdio: 'pipe'
});

// 1. Verify .nojekyll
assert(fs.existsSync(path.join(distDir, '.nojekyll')), 'Missing dist/.nojekyll');

// 2. Verify CSS versioning
const versionedCss = path.join(distDir, `style.${testBuildId}.css`);
assert(fs.existsSync(versionedCss), `Missing versioned CSS: ${versionedCss}`);
assert(!fs.existsSync(path.join(distDir, 'style.css')), 'Unversioned style.css should not exist in dist/');

// 3. Verify HTML files exist and have updated tags
const htmlFiles = ['commander.html', 'index.html', 'hex.html'];
for (const htmlName of htmlFiles) {
    const htmlPath = path.join(distDir, htmlName);
    assert(fs.existsSync(htmlPath), `Missing ${htmlPath}`);
    const content = fs.readFileSync(htmlPath, 'utf-8');

    // Check meta tags
    assert(content.includes('Cache-Control'), `${htmlName} missing Cache-Control meta`);
    assert(content.includes(`name="build-id" content="${testBuildId}"`), `${htmlName} missing build-id meta`);

    // Check stylesheet
    assert(content.includes(`style.${testBuildId}.css`), `${htmlName} does not reference versioned style`);
}

// 4. Check specific script tags in HTML
const commanderHtml = fs.readFileSync(path.join(distDir, 'commander.html'), 'utf-8');
assert(
    commanderHtml.includes(`src="js/commander/commander_main.${testBuildId}.js"`),
    'commander.html does not reference versioned commander_main'
);

const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
assert(
    indexHtml.includes(`src="js/main.${testBuildId}.js"`),
    'index.html does not reference versioned main.js'
);

const hexHtml = fs.readFileSync(path.join(distDir, 'hex.html'), 'utf-8');
assert(
    hexHtml.includes(`src="js/hex/hex_main.${testBuildId}.js"`),
    'hex.html does not reference versioned hex_main.js'
);

// 5. Verify JS import rewriting
const versionedCommanderMain = path.join(distDir, `js/commander/commander_main.${testBuildId}.js`);
assert(fs.existsSync(versionedCommanderMain), 'Missing versioned commander_main.js');
const commanderMainCode = fs.readFileSync(versionedCommanderMain, 'utf-8');

assert(
    commanderMainCode.includes(`./commander_math.${testBuildId}.js`),
    'commander_main did not rewrite import to commander_math'
);
assert(
    commanderMainCode.includes(`./commander_state.${testBuildId}.js`),
    'commander_main did not rewrite import to commander_state'
);
assert(
    commanderMainCode.includes(`./commander_units.${testBuildId}.js`),
    'commander_main did not rewrite import to commander_units'
);
assert(
    !commanderMainCode.includes("from './commander_math.js'"),
    'commander_main still contains unversioned import'
);

// 6. Verify all imports in every JS file in dist resolve to an existing file
function checkAllDistJs(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            checkAllDistJs(full);
        } else if (entry.name.endsWith('.js')) {
            const code = fs.readFileSync(full, 'utf-8');
            const imports = [...code.matchAll(/(?:import|from)\s+['"](\.[^'"]+)['"]/g)];
            for (const imp of imports) {
                const target = path.resolve(dir, imp[1]);
                assert(fs.existsSync(target), `Failed resolving import ${imp[1]} in ${full}`);
            }
        }
    }
}
checkAllDistJs(path.join(distDir, 'js'));

console.log('✅ All Build Cache-Buster assertions passed successfully.');
