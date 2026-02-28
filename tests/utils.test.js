import { getConvexHull, pointInPolygon } from '../js/utils.js';

describe('utils.js Math Tests', () => {
    describe('getConvexHull', () => {
        it('should return a triangle unchanged', () => {
            const points = [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 0, y: 10 }
            ];

            const result = getConvexHull(points);
            expect(result.length).toBe(3);
        });

        it('should create a proper convex hull ignoring internal points', () => {
            const points = [
                { x: 0, y: 0 },
                { x: 10, y: -10 },
                { x: 10, y: 10 },
                { x: -10, y: 10 },
                { x: -10, y: -10 },
                { x: 2, y: 2 } // Internal point
            ];

            const result = getConvexHull(points);
            // 4 corners, internal point is ignored
            expect(result.length).toBe(4);
        });
    });

    describe('pointInPolygon', () => {
        it('should correctly identify points inside a convex shape', () => {
            const poly = [
                { x: 10, y: -10 },
                { x: -10, y: -10 },
                { x: -10, y: 10 },
                { x: 10, y: 10 }
            ];

            expect(pointInPolygon({ x: 0, y: 0 }, poly)).toBe(true);  // Inside
            expect(pointInPolygon({ x: 20, y: 0 }, poly)).toBe(false); // Outside
        });
    });
});
