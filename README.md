# Neutral Zone

[![Deploy to GitHub Pages](https://github.com/lukemeyer/neutral-zone/actions/workflows/deploy.yml/badge.svg)](https://github.com/lukemeyer/neutral-zone/actions/workflows/deploy.yml)

> A tactical real-time strategy territory domination game built in pure vanilla JavaScript and HTML5 Canvas.

🎮 **[Play Live on GitHub Pages](https://lukemeyer.github.io/neutral-zone/)**

---

## 🌟 Overview

In **Neutral Zone**, two factions compete for orbital dominance across a dynamic celestial battlefield. Victory is achieved by defending your Home Planet, managing energy pipelines, expanding planar territory networks, and eliminating the opposing base.

- **Zero Build Step:** Pure Vanilla ES Modules and HTML5 Canvas.
- **Dynamic Planar Territory:** Space stations interconnect dynamically to project friendly territory polygons across the map.
- **Autonomous Tactical AI:** Advanced decision engine with role assignment (scout, expand, defend, flank), anti-clumping, and adaptive unit composition.
- **Fluid Fleet Command:** Direct waypoint drawing, box selection, unit speed modulation based on territory ownership, and defense turrets.

---

## 🚀 Live Links & Documentation

| Resource | Description | Live Link |
| :--- | :--- | :--- |
| **Play Game** | Play Human vs CPU or watch CPU vs CPU battles | [Play Neutral Zone](https://lukemeyer.github.io/neutral-zone/) |
| **Player Guide** | Visual manual with unit breakdown, rules, and strategy tips | [Player Guide](https://lukemeyer.github.io/neutral-zone/player_guide.html) |
| **Developer Guide** | Architecture overview, planar graph mechanics, and test suite specs | [Developer Guide](https://lukemeyer.github.io/neutral-zone/dev_guide.html) |
| **AI Evaluator** | Interactive in-browser scenario sandbox with speed controls | [AI Evaluator](https://lukemeyer.github.io/neutral-zone/evaluate.html) |

---

## 🛸 Units & Structures

| Unit | Cost / Build Time | Description |
| :--- | :--- | :--- |
| **Home Planet** | Initial Base | Primary energy depot, construction hub, and faction heart. Destructible (500 HP). |
| **Miner** ⏹️ | 25 E / 5s | Automated haulers that harvest neutral Asteroids and ferry energy back to base. |
| **Station** ⏺️ | 50 E / 10s | Space stations draggable across the map. Links to nearby nodes to form territorial polygons and fires defensive pulse turrets. |
| **Fighter** 🔼 | 100 E / 15s | High-mobility combat craft. Drag custom flight path waypoints to intercept, flank, and strike enemy targets. |

---

## 🎮 Controls

### Mouse & Selection
- **Select Fighter:** Left-click on an individual fighter or drag a selection box across multiple fighters.
- **Draw Flight Path:** Left-click and drag from selected fighter(s) to draw custom waypoint paths.
- **Relocate Station:** Left-click and drag friendly stations across the map.
- **Deselect All:** Left-click on empty space or click the **None** button in the UI.

### Keyboard Shortcuts
- <kbd>Esc</kbd> or <kbd>X</kbd>: Clear current flight paths and abort queued orders.
- <kbd>Space</kbd>: Pause or resume game simulation.
- <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>: Quick-queue Miner, Station, or Fighter construction.

---

## 🛠️ Local Development & Testing

Neutral Zone requires no transpilation, bundlers, or external runtime libraries.

### 1. Run Locally
Serve the directory with any local static HTTP server:
```bash
# Using Python 3
python3 -m http.server 8080

# Or using Node
npx serve .
```
Then open `http://localhost:8080` in your browser.

### 2. Automated AI Tuning & Strategy Tests
The headless test suite simulates matches in Node.js and verifies competitive balance, anti-clumping, and strategic behavior:
```bash
# Run all 6 AI tuning and playability goals
npm test

# Run individual scenario tests
npm run test:scenarios
```

The 6 test suites verify:
1. **`goal_1_no_stuck`**: Units never clump or jam together.
2. **`goal_2_balance`**: AI maintains balanced unit composition (miners, stations, fighters).
3. **`goal_3_defense`**: Proactive station defense and fighter scrambling when threatened.
4. **`goal_4_offense`**: Decisive multi-ship coordinated assaults on enemy bases.
5. **`goal_5_game_length`**: Healthy match pacing and conclusive wins without stalemates.
6. **`goal_6_no_exploit`**: Station relocation respects cooldowns and perimeter constraints.

---

## 📄 License
MIT License.
