# FastAPI Service

## Responsibilities

FastAPI validates traffic snapshots and experiment settings, calls the DSA scheduler or seeded experiment service, and returns measured decisions/results. It stores no database records. The browser owns the live animation; the API is contacted only for adaptive scheduling decisions or an explicit comparison run.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service health |
| GET | `/api/scenarios` | Demand presets |
| POST | `/api/schedule` | Select phase and green duration from road queues and maximum waits |
| POST | `/api/experiment` | Run fixed/adaptive comparison with a shared seeded schedule |
| GET | `/api/comparison` | Same comparison using query parameters |

`POST /api/schedule` requires `north`, `south`, `east`, and `west`. Each contains a non-negative `queue` and `maxWait`; `lastServed` may be `NS`, `EW`, or null. The response contains `selectedPhase`, priority components, candidate scores, a heap snapshot, and `greenDuration`.

`POST /api/experiment` accepts a 32-bit non-negative seed, duration from 30 to 1800 simulated seconds, and NS/EW axis arrival rates from 0 to 40 vehicles per minute. Each axis rate is split between its two approaches. The result includes input seed/configuration, an arrival-schedule digest, both measured controller results, and each controller's scheduler trace.

If an experiment completes no vehicles, average waiting and travel time are returned as `null` (no sample exists); queue lengths and throughput remain numeric zero where appropriate. Signal timing configuration and metric inputs reject non-finite or invalid values.

## Running and testing

From the repository root:

```powershell
python -m uvicorn main:app --app-dir backend --reload --port 8000
python -m pytest backend\tests -q
```

The Vite development server proxies `/api` and `/health` to port 8000. FastAPI's interactive schema is available at `/docs`.
