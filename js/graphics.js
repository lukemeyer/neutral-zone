export const graphicsCache = {
    p1: {},
    p2: {},
    asteroids: [],
    planet1: null,
    planet2: null
};

// Generates an SVG string into a dataURI ready for an Image source
function svgToImage(svgString) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    });
}

// Ensure proper spacing and attributes for embedded SVG usage in the HTML
export const rawGraphics = {
    // 24x24 Top-down spaceship
    fighter: (color) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <!-- Engine Flame -->
            <path d="M10 18 L12 23 L14 18 Z" fill="#ff7700" />
            <!-- Left Wing -->
            <path d="M12 5 L4 18 L9 18 L12 14 Z" fill="${color}" opacity="0.8" />
            <!-- Right Wing -->
            <path d="M12 5 L20 18 L15 18 L12 14 Z" fill="${color}" opacity="0.6" />
            <!-- Main Fuselage -->
            <path d="M12 2 L15 18 L9 18 Z" fill="#eceff1" />
            <!-- Cockpit -->
            <path d="M12 6 Q14 10 12 12 Q10 10 12 6 Z" fill="${color}" />
        </svg>`,

    // 24x24 Boxy drone
    miner: (color, isCollecting = false) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <!-- Storage Box -->
            <rect x="6" y="8" width="12" height="12" fill="#30363d" stroke="${color}" stroke-width="2" rx="2" />
            <!-- Cockpit/Bridge -->
            <rect x="8" y="2" width="8" height="6" fill="#eceff1" />
            <rect x="10" y="3" width="4" height="3" fill="${color}" />
            <!-- Thrusters -->
            <rect x="4" y="16" width="3" height="4" fill="#8b949e" />
            <rect x="17" y="16" width="3" height="4" fill="#8b949e" />
            <!-- Collection Apparatus -->
            ${isCollecting ? `
            <path d="M 12 8 L 12 24" stroke="#ffea00" stroke-width="2" stroke-dasharray="2 2">
                <animate attributeName="stroke-dashoffset" from="4" to="0" dur="0.2s" repeatCount="indefinite"/>
            </path>
            ` : `
            <path d="M 10 20 L 14 20" stroke="#8b949e" stroke-width="2" />
            `}
        </svg>`,

    // 24x24 Round satellite
    scout: (color) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <!-- Solar Panels -->
            <rect x="1" y="10" width="8" height="4" fill="#21262d" stroke="${color}" stroke-width="1" />
            <rect x="15" y="10" width="8" height="4" fill="#21262d" stroke="${color}" stroke-width="1" />
            <!-- Central Core -->
            <circle cx="12" cy="12" r="5" fill="#eceff1" stroke="#8b949e" stroke-width="1" />
            <circle cx="12" cy="12" r="2" fill="${color}" />
            <!-- Antenna -->
            <path d="M12 7 L12 2" stroke="#8b949e" stroke-width="2" />
            <circle cx="12" cy="2" r="1.5" fill="#ff7b72" />
        </svg>`,

    planet: (color, isBase = true) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
            <!-- Glow -->
            <circle cx="32" cy="32" r="30" fill="${color}" opacity="0.1" />
            <!-- Atmosphere -->
            <circle cx="32" cy="32" r="24" fill="${color}" opacity="0.3" />
            <!-- Surface -->
            <circle cx="32" cy="32" r="22" fill="#21262d" />
            <!-- Continents/Craters -->
            <path d="M 16 28 Q 24 16 34 24 T 46 22 Q 40 40 30 46 T 16 38 Z" fill="${color}" opacity="0.6" />
            <circle cx="44" cy="38" r="4" fill="${color}" opacity="0.4" />
            <circle cx="20" cy="44" r="3" fill="${color}" opacity="0.5" />
            <!-- Shadow (Bottom Right) -->
            <path d="M 16 46 A 22 22 0 0 0 46 16 A 22 22 0 0 1 16 46 Z" fill="#000000" opacity="0.5" />
            <!-- Central Base Structure -->
            ${isBase ? `
            <polygon points="32,20 38,36 26,36" fill="#eceff1" />
            <line x1="32" y1="20" x2="32" y2="10" stroke="#eceff1" stroke-width="2" />
            <circle cx="32" cy="10" r="2" fill="#ff7b72" />
            ` : ''}
        </svg>`,

    // 48x48 Irregular Asteroids
    asteroid: [
        // Variant 0: Blocky
        () => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
            <path d="M 12 10 L 28 6 L 40 18 L 36 34 L 20 42 L 8 28 Z" fill="#6e7681" stroke="#484f58" stroke-width="2" />
            <path d="M 12 10 L 20 22 L 36 34" stroke="#484f58" stroke-width="2" fill="none" opacity="0.5" />
            <circle cx="28" cy="18" r="3" fill="#484f58" />
            <circle cx="16" cy="28" r="1.5" fill="#484f58" />
        </svg>`,
        // Variant 1: Jagged
        () => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
            <path d="M 22 4 L 38 12 L 44 26 L 36 40 L 16 44 L 4 30 L 8 14 Z" fill="#8b949e" stroke="#6e7681" stroke-width="2" />
            <path d="M 22 4 L 26 24 L 36 40" stroke="#6e7681" stroke-width="2" fill="none" opacity="0.5" />
            <circle cx="16" cy="30" r="4" fill="#6e7681" />
            <circle cx="34" cy="22" r="2" fill="#6e7681" />
        </svg>`,
        // Variant 2: Roundish with big craters
        () => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
            <path d="M 14 8 C 28 2, 42 12, 44 26 C 46 40, 32 46, 18 42 C 4 38, 2 18, 14 8 Z" fill="#484f58" stroke="#30363d" stroke-width="2" />
            <ellipse cx="28" cy="20" rx="8" ry="6" fill="#30363d" />
            <ellipse cx="18" cy="32" rx="5" ry="4" fill="#30363d" />
            <ellipse cx="36" cy="36" rx="3" ry="2" fill="#30363d" />
        </svg>`
    ]
};

export async function pregenerateGraphics() {
    console.log("Pre-generating SVG graphics...");

    // Player 1 (Blueish #1f6feb or custom defined)
    const p1Color = '#1f6feb';
    graphicsCache.p1.fighter = await svgToImage(rawGraphics.fighter(p1Color));
    graphicsCache.p1.miner = await svgToImage(rawGraphics.miner(p1Color, false));
    graphicsCache.p1.minerActive = await svgToImage(rawGraphics.miner(p1Color, true));
    graphicsCache.p1.scout = await svgToImage(rawGraphics.scout(p1Color));
    graphicsCache.planet1 = await svgToImage(rawGraphics.planet(p1Color));

    // Player 2 (Reddish #f85149 or custom defined)
    const p2Color = '#f85149';
    graphicsCache.p2.fighter = await svgToImage(rawGraphics.fighter(p2Color));
    graphicsCache.p2.miner = await svgToImage(rawGraphics.miner(p2Color, false));
    graphicsCache.p2.minerActive = await svgToImage(rawGraphics.miner(p2Color, true));
    graphicsCache.p2.scout = await svgToImage(rawGraphics.scout(p2Color));
    graphicsCache.planet2 = await svgToImage(rawGraphics.planet(p2Color));

    // Asteroids
    for (let i = 0; i < 3; i++) {
        graphicsCache.asteroids.push(await svgToImage(rawGraphics.asteroid[i]()));
    }

    console.log("Graphics caching complete!");
}
