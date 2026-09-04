import { doPolygonsIntersect } from './js/utils.js';

// Setup Mock Poly A (say, Player A's territory)
const polyA = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 }
];

// Setup Mock Poly B (Player B's territory far away)
const polyB = [
    { x: 400, y: 400 },
    { x: 500, y: 400 },
    { x: 500, y: 500 },
    { x: 400, y: 500 }
];

// Setup Mock Poly C (Player B's territory colliding)
const polyC = [
    { x: 150, y: 150 },
    { x: 300, y: 150 },
    { x: 300, y: 300 },
    { x: 150, y: 300 }
];


console.log("polyA vs polyB: ", doPolygonsIntersect(polyA, polyB)); // Should be false
console.log("polyA vs polyC: ", doPolygonsIntersect(polyA, polyC)); // Should be true

const polyD = [
    { x: 341.2828362630501, y: 500 },
    { x: 191.076823908868, y: 147.2889218731326 },
    { x: 494.3986047102029, y: 512.6393710595332 },
    { x: 500, y: 500 }
];

const polyE = [
    { x: 865.050497070276, y: 500 },
    { x: 588.4682121773095, y: 466.863378523318 },
    { x: 742.7933611130666, y: 133.00311288277254 },
    { x: 1000, y: 500 }
];

console.log("real scenario:", doPolygonsIntersect(polyD, polyE));
