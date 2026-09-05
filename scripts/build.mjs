import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

function getBuildId() {
    if (process.env.BUILD_ID) {
        return process.env.BUILD_ID;
    }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
    const buildNum = process.env.GITHUB_RUN_NUMBER ? `b${process.env.GITHUB_RUN_NUMBER}` : 'b0';
    return `${buildNum}-${timestamp}`;
}

const BUILD_ID = getBuildId();
console.log(`[build] Building for production with BUILD_ID: ${BUILD_ID}`);

// 1. Clean and initialize dist directory
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// GitHub Pages .nojekyll flag
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

// 2. Copy static assets if exists
const assetsSrcDir = path.join(rootDir, 'assets');
const assetsDistDir = path.join(distDir, 'assets');
if (fs.existsSync(assetsSrcDir)) {
    fs.cpSync(assetsSrcDir, assetsDistDir, { recursive: true });
    console.log(`[build] Copied assets directory.`);
}

// 3. Process and version CSS files
const cssFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.css'));
const cssMap = new Map(); // e.g. "style.css" -> "style.<BUILD_ID>.css"

for (const cssFile of cssFiles) {
    const baseName = cssFile.slice(0, -4);
    const versionedName = `${baseName}.${BUILD_ID}.css`;
    const content = fs.readFileSync(path.join(rootDir, cssFile), 'utf-8');
    fs.writeFileSync(path.join(distDir, versionedName), content);
    cssMap.set(cssFile, versionedName);
    console.log(`[build] CSS: ${cssFile} -> ${versionedName}`);
}

// 4. Collect and version all JS files in js/
function getAllJsFiles(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllJsFiles(fullPath));
        } else if (entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

const jsSrcDir = path.join(rootDir, 'js');
const jsFiles = getAllJsFiles(jsSrcDir);

// Mapping of relative source path from root (e.g. "js/commander/commander_math.js")
// to versioned filename ("commander_math.<BUILD_ID>.js")
const jsMap = new Map();

for (const fullPath of jsFiles) {
    const relFromRoot = path.relative(rootDir, fullPath); // e.g. "js/commander/commander_math.js"
    const parsed = path.parse(relFromRoot);
    const versionedBase = `${parsed.name}.${BUILD_ID}${parsed.ext}`;
    const targetRelPath = path.join(parsed.dir, versionedBase); // e.g. "js/commander/commander_math.<BUILD_ID>.js"
    
    jsMap.set(relFromRoot, {
        srcFullPath: fullPath,
        targetRelPath,
        distFullPath: path.join(distDir, targetRelPath),
        versionedBase
    });
}

// 5. Rewrite JS files with versioned import statements and write to dist
const importRegexFrom = /(from\s+['"])(\.[^'"]*?)\.js(['"])/g;
const importRegexBare = /(import\s+['"])(\.[^'"]*?)\.js(['"])/g;

for (const [relPath, info] of jsMap.entries()) {
    let code = fs.readFileSync(info.srcFullPath, 'utf-8');
    
    // Replace relative imports ending in .js with .<BUILD_ID>.js
    code = code.replace(importRegexFrom, `$1$2.${BUILD_ID}.js$3`);
    code = code.replace(importRegexBare, `$1$2.${BUILD_ID}.js$3`);
    
    // Ensure destination directory exists
    fs.mkdirSync(path.dirname(info.distFullPath), { recursive: true });
    fs.writeFileSync(info.distFullPath, code);
    console.log(`[build] JS: ${relPath} -> ${info.targetRelPath}`);
}

// 6. Process and rewrite HTML files
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

const metaCacheControl = `
    <!-- Cache-busting meta headers for fresh HTML loading -->
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <meta name="build-id" content="${BUILD_ID}">
`;

for (const htmlFile of htmlFiles) {
    let content = fs.readFileSync(path.join(rootDir, htmlFile), 'utf-8');
    
    // Inject cache control in <head>
    if (content.includes('<head>')) {
        content = content.replace('<head>', `<head>${metaCacheControl}`);
    }
    
    // Rewrite CSS links
    for (const [origCss, versionedCss] of cssMap.entries()) {
        const cssRegex = new RegExp(`(<link\\b[^>]*?\\bhref=["'])${origCss}(["'])`, 'g');
        content = content.replace(cssRegex, `$1${versionedCss}$2`);
    }
    
    // Rewrite JS script tags
    for (const [origJs, info] of jsMap.entries()) {
        const jsRegex = new RegExp(`(<script\\b[^>]*?\\bsrc=["'])${origJs}(["'])`, 'g');
        content = content.replace(jsRegex, `$1${info.targetRelPath}$2`);
    }
    
    fs.writeFileSync(path.join(distDir, htmlFile), content);
    console.log(`[build] HTML: ${htmlFile} (rewritten)`);
}

// 7. Rigorous Verification Check
console.log(`[build] Running integrity checks on dist output...`);
let integrityErrors = 0;

// Verify HTML script & link references
for (const htmlFile of htmlFiles) {
    const content = fs.readFileSync(path.join(distDir, htmlFile), 'utf-8');
    
    // Check all script src attributes
    const scriptSrcMatches = [...content.matchAll(/<script\b[^>]*?\bsrc=["']([^"']+)["']/g)];
    for (const match of scriptSrcMatches) {
        const scriptPath = match[1];
        if (scriptPath.startsWith('http://') || scriptPath.startsWith('https://')) continue;
        const targetPath = path.join(distDir, scriptPath);
        if (!fs.existsSync(targetPath)) {
            console.error(`[build ERROR] ${htmlFile} references missing script: ${scriptPath}`);
            integrityErrors++;
        }
    }
    
    // Check all link href attributes
    const linkHrefMatches = [...content.matchAll(/<link\b[^>]*?\bhref=["']([^"']+)["']/g)];
    for (const match of linkHrefMatches) {
        const hrefPath = match[1];
        if (hrefPath.startsWith('http://') || hrefPath.startsWith('https://')) continue;
        const targetPath = path.join(distDir, hrefPath);
        if (!fs.existsSync(targetPath)) {
            console.error(`[build ERROR] ${htmlFile} references missing stylesheet/link: ${hrefPath}`);
            integrityErrors++;
        }
    }
}

// Verify all JS import statements resolve to existing files
for (const [relPath, info] of jsMap.entries()) {
    const code = fs.readFileSync(info.distFullPath, 'utf-8');
    const importMatches = [...code.matchAll(/(?:import|from)\s+['"](\.[^'"]+)['"]/g)];
    
    for (const match of importMatches) {
        const importSpecifier = match[1];
        const dir = path.dirname(info.distFullPath);
        const resolvedPath = path.resolve(dir, importSpecifier);
        if (!fs.existsSync(resolvedPath)) {
            console.error(`[build ERROR] ${info.targetRelPath} imports missing file: ${importSpecifier} (resolved: ${resolvedPath})`);
            integrityErrors++;
        }
    }
}

if (integrityErrors > 0) {
    console.error(`[build FAILED] Encountered ${integrityErrors} integrity error(s).`);
    process.exit(1);
}

console.log(`[build SUCCESS] Build completed successfully with 0 errors. All assets and imports verified!`);
