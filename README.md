# Signal Lab — Smart Traffic Signal Simulation

Signal Lab is a responsive React and FastAPI web application for exploring traffic-signal control. It combines an animated four-approach intersection with a rule-based adaptive scheduler and reproducible fixed-versus-adaptive experiments. It is an educational data-structures project, not a real-world traffic controller.

## Features

- Run, pause, reset, and speed up the live simulation; select a controller and demand preset.
- Inspect approach queues, signal phases, scheduler decisions, and live metrics.
- Compare fixed-time and adaptive controllers against the same seeded arrival schedule.
- View experiment metrics and charts based on results returned by the API.
- Use the dashboard on desktop, tablet, and mobile layouts.
- Explore the API through FastAPI's interactive documentation.

## Project structure

```text
src/                    React dashboard, styles, Canvas simulation, JS DSA modules
backend/app/            FastAPI routes, schemas, scheduler, queues, experiments, metrics
backend/tests/          Python API and algorithm tests
docs/                   Frontend, backend, and algorithm notes
index.html              Vite entry point
vite.config.js          Development server and local API proxy
render.yaml             Render API service configuration
vercel.json             Vercel build and function configuration
```

## Requirements

- Node.js compatible with the installed Vite release
- Python 3.10 or newer

## Run locally

Open two terminals in the project root. No database or external service is required.

**Terminal 1 — frontend**

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The development server proxies `/api` and `/health` to `http://127.0.0.1:8000`.

**Terminal 2 — API**

```sh
python -m venv .venv
```

Activate the environment, then install and start the API:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m uvicorn main:app --app-dir backend --reload --port 8000
```

```sh
# macOS / Linux
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m uvicorn main:app --app-dir backend --reload --port 8000
```

The API health endpoint is `http://127.0.0.1:8000/health`; interactive API docs are at `http://127.0.0.1:8000/docs`.

## Run checks

```sh
python -m pytest backend/tests -q
npm test
npm run build
```

The Python suite covers the API and backend algorithms. The Node test suite covers JavaScript simulation data structures and signal transitions. The production build writes generated files to `dist/`, which is intentionally excluded from Git.

## How the simulation works

- Each approach uses a FIFO queue backed by an array and head index. A road-name dictionary provides average O(1) lookup.
- The browser advances the visual simulation in fixed 0.05-second steps. Canvas renders the simulation; scheduling decisions are made separately.
- The API scores the compatible NS and EW phases using queue length and the oldest vehicle's wait. A phase waiting at least 45 seconds is promoted over a non-urgent competitor. A hand-built max heap selects the phase; ties consider longest wait, last-served phase, and stable phase order.
- Green duration is `clamp(8 + 0.8 × phase queue, 8, 30)` seconds. The scheduler requests an extension or a phase change; a change must pass through yellow and all-red clearance.
- The experiment creates one seeded Poisson arrival schedule and uses it for both fixed and adaptive controllers, making the comparison reproducible and paired.

### Data-structure complexity

| Operation | Complexity |
| --- | --- |
| Queue enqueue, front, dequeue | Amortized O(1) |
| Road dictionary lookup | Average O(1) |
| Max-heap insert / extract | O(log P) |
| Max-heap peek | O(1) |
| Simulation update | Approximately O(V + P log P) |

Here, `V` is the active vehicle count and `P` is the number of candidate phases. With only NS and EW candidates, vehicle processing is the dominant work.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health (also available at `/health` locally) |
| `GET` | `/api/scenarios` | Demand presets |
| `POST` | `/api/schedule` | Select a phase and green duration from approach queues and waits |
| `POST` | `/api/experiment` | Compare fixed and adaptive control on a shared seeded schedule |
| `GET` | `/api/comparison` | Run the comparison with query parameters |

`POST /api/experiment` accepts a 32-bit non-negative seed, a duration from 30 to 1,800 simulated seconds, and NS/EW arrival rates from 0 to 40 vehicles per minute. Rates are split evenly between each axis's two approaches. See [docs/backend.md](docs/backend.md) for request details and responses.

## Metric definitions and model limits

- Average wait measures time from entering the modeled approach through the start of crossing, for vehicles completing the modeled crossing. If no vehicles complete, the value is `null` and the UI shows an em dash.
- Travel time is spawn-to-exit time for completed vehicles; it is also unavailable when no vehicles complete.
- Average queue is the time-weighted total across approach queues. Maximum queue is the largest individual approach observed. Throughput is completed vehicles per simulated minute.
- Arrival rates are per axis and split evenly across its approaches. The live simulation caps active vehicles at 500 and reports arrivals dropped at capacity.
- The model omits turns, pedestrians, lane changes, sensing errors, and calibrated road geometry. It is a simplified heuristic, not machine learning or traffic-engineering software; adaptive control is not guaranteed to outperform fixed timing.

## Deployment

The repository includes a Vercel configuration for a single-origin deployment: Vite publishes `dist/`, and `api/[...path].py` routes `/api/*` requests to FastAPI. It also includes a Render service definition for hosting the API separately. For a split deployment, publish the Vite app as a static site, deploy the FastAPI service, and set the frontend build variable `VITE_API_URL` to the API's HTTPS origin. Add the deployed frontend origin to the API CORS allowlist in `backend/main.py` if it is not a `*.vercel.app` URL. Deployment still requires connecting the repository to a Vercel project and configuring any custom domains.

The API stores no accounts or experiment history. Keep real secrets out of committed files; `.env.example` is a placeholder for local or deployment configuration.

## Further documentation

- [Frontend behavior and responsive layout](docs/frontend.md)
- [Backend endpoints and validation](docs/backend.md)
- [Data structures and signal-control algorithm](docs/algorithm.md)
- [Design rationale](DESIGN.md)
