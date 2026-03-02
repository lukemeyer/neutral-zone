import { getConvexHull, pointInPolygon, isValidScoutPlacement } from '../js/utils.js';

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

    describe('isValidScoutPlacement', () => {
        let player1, player2;

        beforeEach(() => {
            player1 = {
                id: 0,
                homePlanet: { x: 500, y: 500 },
                units: { scouts: [] }
            };
            player2 = {
                id: 1,
                homePlanet: { x: 1000, y: 500 },
                units: { scouts: [] }
            };
        });

        it('allows normal expansion', () => {
            const scout = { x: 500, y: 500, targetX: 500, targetY: 500 };
            player1.units.scouts.push(scout);

            // MAX_PERIMETER is (1+1)*175 = 350.
            // Move up by 100: perimeter = 100 + 100 = 200, valid.
            expect(isValidScoutPlacement(500, 400, scout, player1, [player1, player2], 2000, 2000)).toBe(true);
        });

        it('blocks expansion beyond MAX_PERIMETER', () => {
            const scout = { x: 500, y: 500, targetX: 500, targetY: 500 };
            player1.units.scouts.push(scout);

            // MAX_PERIMETER is (1+1)*175 = 350.
            // Move up by 200: perimeter = 200 + 200 = 400, invalid.
            expect(isValidScoutPlacement(500, 300, scout, player1, [player1, player2], 2000, 2000)).toBe(false);
        });

        it('allows SHRINKING when already severely past MAX_PERIMETER (bug fix)', () => {
            // Setup a scout that is somehow already wildly beyond bounds (e.g. lost all other scouts)
            const scout = { x: 500, y: 500, targetX: 500, targetY: 100 };
            player1.units.scouts.push(scout);

            // Current perimeter: 400 + 400 = 800. MAX limit is 350.

            // Move inwards (y: 200), perimeter becomes 300+300 = 600. Still over 350, but LESS than 800.
            // THIS SHOULD BE ALLOWED
            expect(isValidScoutPlacement(500, 200, scout, player1, [player1, player2], 2000, 2000)).toBe(true);

            // Move outwards farther (y: 0), perimeter becomes 500+500=1000. MORE than 800.
            // THIS SHOULD FAIL
            expect(isValidScoutPlacement(500, 0, scout, player1, [player1, player2], 2000, 2000)).toBe(false);
        });
    });
});
