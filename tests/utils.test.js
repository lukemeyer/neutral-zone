import { distToSegmentSquared } from '../js/utils.js';

describe('utils.js Math Tests', () => {
    describe('distToSegmentSquared', () => {
        it('calculates proper distance squared to a segment', () => {
            const P = { x: 5, y: 5 };
            const A = { x: 0, y: 0 };
            const B = { x: 10, y: 0 };

            // Perpendicular distance is 5. Squared is 25.
            const result = distToSegmentSquared(P, A, B);
            expect(result).toBe(25);
        });
    });
});
