import { createHexGrid } from '../js/hex/hex_grid.js';

console.log("\n============================================================");
console.log("  Testing: Hex Grid Geometry & Sector Capture Logic");
console.log("============================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✅ [PASS] ${message}`);
    } else {
        failed++;
        console.error(`  ❌ [FAIL] ${message}`);
    }
}

const width = 20;
const height = 15;
const hexRadius = 1.6;
const grid = createHexGrid(width, height, hexRadius);

assert(grid.cells.length >= 15, `Generated hex cells across map (got ${grid.cells.length} cells)`);
assert(grid.vertices.length > grid.cells.length, `Generated unique vertices (got ${grid.vertices.length} vertices)`);
assert(grid.edges.length > grid.vertices.length, `Generated unique edges (got ${grid.edges.length} edges)`);

// Test vertex sharing: internal vertices should be shared by 3 cells
const internalVertices = grid.vertices.filter(v => v.cells.length === 3);
assert(internalVertices.length > 0, `Internal vertices are shared by 3 adjacent hex cells (${internalVertices.length} found)`);

// Test edge lengths: all edges must have length equal to hexRadius (+- epsilon)
const allEdgesValid = grid.edges.every(e => Math.abs(e.dist - hexRadius) < 0.05);
assert(allEdgesValid, `All edges have fixed grid length = ${hexRadius}`);

// Test adjacent vertex degrees: internal vertices have degree 3
const internalDegree3 = internalVertices.every(v => v.adjacentVertices.length === 3);
assert(internalDegree3, `Internal intersections have degree 3 (3 hex seams meeting)`);

// Test cell ownership capture
const testCell = grid.cells.find(c => c.type === 'neutral');
assert(testCell !== undefined, "Found neutral cell to test capture");

// Claim 5 out of 6 vertices
for (let i = 0; i < 5; i++) {
    grid.vertices[testCell.vertices[i]].owner = 0;
}
grid.updateOwnership();
assert(testCell.owner === null, "Cell is not captured with 5/6 vertices");

// Claim 6th vertex
grid.vertices[testCell.vertices[5]].owner = 0;
grid.updateOwnership();
assert(testCell.owner === 0, "Cell is captured when all 6 perimeter vertices are claimed");

console.log(`\n------------------------------------------------------------`);
console.log(`  Summary: ${passed} Passed, ${failed} Failed`);
console.log(`------------------------------------------------------------\n`);

if (failed > 0) process.exit(1);
else process.exit(0);
