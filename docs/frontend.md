# React Frontend

## Responsibilities

React owns low-frequency controls, accessible labels, metrics snapshots, the algorithm trace, and experiment results. The simulation state lives in a mutable engine reference and advances at a fixed 0.05 simulated-second step. The Canvas reads a live snapshot reference and renders with `requestAnimationFrame`; vehicle coordinates do not trigger whole-page React renders.

## Simulation and API boundary

The lane Queue stores approach vehicles in FIFO order. A seeded xorshift generator produces reproducible live arrivals. At each adaptive green boundary, the client posts four queue lengths, their oldest waits, and the last-served phase to `POST /api/schedule`. It never calls the scheduler on each animation frame. The returned phase is passed through the local legal transition graph; backend failure pauses adaptive simulation safely and exposes a retry control.

Fixed mode alternates 20-second greens. Both modes share the same lane movement, traffic-light state graph, vehicle spacing, service interval, metrics, and Canvas. Each approach uses a stop-progress matched to its drawn stop-line coordinates; vehicles queue at that limit on red and only the matching green phase can dequeue them. New vehicles spawn behind the current lane tail to preserve spacing.

## Layout and responsive behavior

- Desktop: fixed workspace sidebar, intersection and controls side by side, then algorithm trace, telemetry, comparison, and assumptions.
- Tablet: navigation becomes a drawer and the simulation/control areas stack or form a compact two-column control layout.
- Phone: all sections stack, metrics use a two-column grid, results tables scroll horizontally, and chart labels adapt to the narrow canvas.
- The Canvas scales its 720×410 road model to its observed element size and caps its backing-store device-pixel ratio at 2.

## Interaction states and accessibility

The interface supports ready, running, paused, and safely-paused-on-error states with Start/Resume, Pause, Reset, 1×/2×/4× speed, controller choice, demand sliders, and presets. Controller and demand changes are disabled while running; changing them resets to a clear experiment state. Signal phase and countdown are always written as text, controls have accessible labels, keyboard focus remains visible, and reduced-motion preferences are respected.

## Frontend checks

`npm test` covers the JavaScript lane queue and legal signal graph. `npm run build` verifies the Vite production bundle. Responsive breakpoints are defined in `src/styles.css` at 1200, 940, 700, and 390 pixels.
