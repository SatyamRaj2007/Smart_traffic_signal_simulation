# Signal Lab Design System

## Product context

Signal Lab is an educational DSA simulation dashboard. It visualizes a simplified four-way intersection, an adaptive scheduler, reproducible experiments, and measured metrics. It is not a real traffic-control console; interface language and status treatments must not imply certified field operation.

## Visual language

Use a calm operations-workspace style: light surfaces, precise borders, small uppercase metadata labels, clear metric hierarchy, and a roadway canvas as the main visual focus. Keep decoration secondary to live queues, signal phase, scheduler reasoning, and experimental evidence.

### Tokens

| Token | Value | Use |
|---|---|---|
| Page background | `#f4f7f7` | Main canvas |
| Panel | `#ffffff` | Cards, panels, table surfaces |
| Primary text | `#1d2b2b` | Headings and values |
| Muted text | `#7c8988` | Descriptions and metadata |
| Border | `#e5eae8` | Panel and control outlines |
| Teal | `#147d75` | Primary action, selection, DSA emphasis |
| Mint | `#dff3ec` | Adaptive state background |
| Green signal | `#35c68f` | Green signal only |
| Amber signal | `#e9a443` | Yellow/clearance signal only |
| Red signal | `#e06e63` | Red signal only |
| Asphalt | `#49575a` | Canvas roadway |
| Canvas ground | `#e7eeea` | Intersection environment |

### Typography

- UI and long-form content: DM Sans, with a system sans-serif fallback.
- Counters, phase codes, seeds, and compact metadata: DM Mono, with a monospace fallback.
- Use tabular numerals for live values and keep units adjacent to their value.
- Use a clear distinction between page titles, section headings, metric values, and uppercase eyebrow labels.

## Layout

### Desktop (above 940px)

- Fixed 248px workspace sidebar.
- 65px sticky top bar.
- Main content centered at a maximum width of 1440px.
- Intersection and control panel side by side; algorithm trace, metrics, comparison, and assumptions below.

### Tablet (940px and below)

- Sidebar becomes a slide-in drawer with a scrim and close button.
- Intersection and control panels stack; controls may use a compact two-column arrangement where space permits.

### Mobile (700px and below)

- Drawer navigation, vertically stacked content, two-column metric cards, single-column comparison/documentation cards, and full-width experiment actions.
- Canvas keeps the intersection legible and retains visible direction labels, phase text, countdown, and legend.
- At 390px and below, reduce gutters and control spacing without hiding functional controls.

The page must remain vertically scrollable. Horizontal overflow is contained inside wide data tables rather than clipping the full page.

## Components

- **Navigation:** active item tint plus text; mobile drawer remains keyboard operable.
- **Simulation panel:** canvas, direction queues, text phase label, countdown, Start/Resume, Pause, Reset, and 1×/2×/4× speed.
- **Controls:** fixed/adaptive selector, axis arrival sliders, and labeled demand presets. Disable configuration edits during a running simulation.
- **Algorithm visualizer:** current lane counts and waits, NS/EW candidate scores, actual Max Heap snapshot, selected phase, and green duration returned by FastAPI.
- **Metrics:** measured values with explicit units; no fabricated result values.
- **Comparison:** seeded configuration, measured fixed/adaptive table, and Chart.js bars generated from the returned experiment metrics.
- **Documentation:** model mechanics, exact metric definitions, assumptions, and limitations in plain language.

## Accessibility and state

- Never rely on signal color alone; show phase names and countdown as text.
- All controls require visible focus, keyboard operation, labels, and useful disabled states.
- Report API errors, capacity warnings, and simulation status as text.
- Respect reduced-motion preferences. Canvas animation must not hide the readable dashboard state.
- Keep empty experiments valid and label no-sample values honestly.
