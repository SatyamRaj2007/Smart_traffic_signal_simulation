import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, json } from './api.js';
import { LaneQueue } from './simulation/queue.js';
import { assertNoConflictingGreens, isLegalSignalTransition, signalAspectForPhase } from './simulation/signalGraph.js';
import { advanceApproachLane, canServeApproach, spawnProgress } from './simulation/vehicleMovement.js';
import { applyDecisionIfCurrent, matchesDecisionCorrelation } from './simulation/schedulerDecision.js';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const DIRECTIONS = ['north', 'south', 'east', 'west'];
const PHASE_LABELS = { NS_GREEN: 'North / South green', NS_YELLOW: 'North / South yellow', ALL_RED_TO_EW: 'All red · clearing to E/W', EW_GREEN: 'East / West green', EW_YELLOW: 'East / West yellow', ALL_RED_TO_NS: 'All red · clearing to N/S' };
const PRESETS = {
  low: { label: 'Quiet morning', ns: 6, ew: 8 },
  medium: { label: 'Typical commute', ns: 12, ew: 28 },
  peak: { label: 'Peak hour', ns: 24, ew: 30 },
  asymmetric: { label: 'One-way surge', ns: 6, ew: 30 },
};
const CAR_COLORS = ['#147d75', '#e59a47', '#6071a8', '#ce6d61'];
let nextRunId = 0;

function makeEngine(controller, rates, seed = 12345) {
  return {
    runId: ++nextRunId, decisionId: 0, latestDecisionInput: null, pendingPhaseTarget: null,
    controller, rates: { ...rates }, seed: seed >>> 0 || 1, time: 0, status: 'ready',
    phase: 'NS_GREEN', phaseRemaining: controller === 'fixed' ? 20 : 8, phaseDuration: controller === 'fixed' ? 20 : 8, greenDuration: controller === 'fixed' ? 20 : 8,
    pendingGreen: 8, targetPhase: 'NS', transitionRemaining: 0, decisionPending: false,
    roads: Object.fromEntries(DIRECTIONS.map(direction => [direction, new LaneQueue()])),
    crossing: [], nextId: 1, served: 0, completedWait: 0, completedTravel: 0,
    maxQueue: 0, queueIntegral: 0, sampleTime: 0, nextService: Object.fromEntries(DIRECTIONS.map(d => [d, 0])),
    latestDecision: null, lastServed: null, warning: '', arrivalCount: 0, droppedDemand: 0,
  };
}

function random(engine) {
  let x = engine.seed;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  engine.seed = x >>> 0;
  return engine.seed / 4294967296;
}

function phaseOf(state) { return state.startsWith('NS_') ? 'NS' : state.startsWith('EW_') ? 'EW' : null; }
function roadMaxWait(queue) { let maxWait = 0; queue.forEach(vehicle => { maxWait = Math.max(maxWait, vehicle.waitingTime || 0); }); return maxWait; }
function queueCounts(engine) { return Object.fromEntries(DIRECTIONS.map(direction => [direction, engine.roads[direction].size])); }
function trafficState(engine) { return { ...Object.fromEntries(DIRECTIONS.map(direction => [direction, { queue: engine.roads[direction].size, maxWait: roadMaxWait(engine.roads[direction]) }])), lastServed: engine.lastServed }; }
function safeTransition(engine, target) {
  const current = phaseOf(engine.phase);
  if (current === target && engine.phase.endsWith('_GREEN')) {
    engine.greenDuration = engine.pendingGreen;
    engine.phaseRemaining = engine.pendingGreen;
    engine.phaseDuration = engine.pendingGreen;
    return;
  }
  if (engine.phase === 'NS_GREEN' && target === 'EW' && isLegalSignalTransition(engine.phase, 'NS_YELLOW')) {
    engine.phase = 'NS_YELLOW'; engine.phaseRemaining = 3; engine.phaseDuration = 3;
  } else if (engine.phase === 'EW_GREEN' && target === 'NS' && isLegalSignalTransition(engine.phase, 'EW_YELLOW')) {
    engine.phase = 'EW_YELLOW'; engine.phaseRemaining = 3; engine.phaseDuration = 3;
  } else {
    throw new Error(`Unsafe phase request ${target} from ${engine.phase}`);
  }
  engine.targetPhase = target;
}

function phaseDecision(engine, isCurrent = () => true) {
  const current = phaseOf(engine.phase);
  if (engine.controller === 'fixed') {
    engine.pendingGreen = 20;
    safeTransition(engine, current === 'NS' ? 'EW' : 'NS');
    return Promise.resolve();
  }
  engine.decisionPending = true;
  const decisionId = ++engine.decisionId;
  const decisionInput = trafficState(engine);
  engine.latestDecisionInput = decisionInput;
  return api('/api/schedule', json('POST', { ...decisionInput, runId: engine.runId, decisionId })).then(decision => {
    const applied = applyDecisionIfCurrent(decision, () => isCurrent() && matchesDecisionCorrelation(decision, engine.runId, decisionId), validDecision => {
      engine.latestDecision = validDecision;
      engine.lastServed = validDecision.selectedPhase;
      engine.pendingGreen = validDecision.greenDuration;
      if (engine.status === 'running') safeTransition(engine, validDecision.selectedPhase);
      else engine.pendingPhaseTarget = validDecision.selectedPhase;
    });
    if (!applied && isCurrent()) throw new Error('Scheduler response did not match the active simulation decision.');
  }).finally(() => { engine.decisionPending = false; });
}

function step(engine, dt) {
  assertNoConflictingGreens(engine.phase === 'NS_GREEN', engine.phase === 'EW_GREEN');
  engine.time += dt;
  const totalRate = engine.rates;
  for (const direction of DIRECTIONS) {
    const axisRate = direction === 'north' || direction === 'south' ? totalRate.ns : totalRate.ew;
    const probability = (axisRate / 120) * dt;
    if (random(engine) < probability) {
      const activeVehicles = engine.crossing.length + DIRECTIONS.reduce((count, lane) => count + engine.roads[lane].size, 0);
      if (activeVehicles < 500) {
        const id = engine.nextId++;
        engine.roads[direction].enqueue({ id, direction, progress: spawnProgress(engine.roads[direction]), spawnTime: engine.time, queueEntryTime: null, intersectionEntryTime: null, exitTime: null, waitingTime: 0, state: 'APPROACHING', color: CAR_COLORS[(id + DIRECTIONS.indexOf(direction)) % CAR_COLORS.length] });
        engine.arrivalCount += 1;
      } else {
        engine.droppedDemand += 1;
        engine.warning = 'Vehicle capacity reached; new arrivals are counted as dropped demand.';
      }
    }
  }

  for (const direction of DIRECTIONS) {
    advanceApproachLane(engine.roads[direction], dt, engine.time);
  }

  if (engine.phase.endsWith('_GREEN')) {
    const greenPhase = phaseOf(engine.phase);
    for (const direction of greenPhase === 'NS' ? ['north', 'south'] : ['east', 'west']) {
      const queue = engine.roads[direction];
      const vehicle = queue.front();
      if (vehicle && canServeApproach(direction, greenPhase, vehicle.progress) && engine.time >= engine.nextService[direction]) {
        queue.dequeue();
        vehicle.state = 'CROSSING';
        vehicle.intersectionEntryTime = engine.time;
        vehicle.progress = 0.49;
        engine.crossing.push(vehicle);
        engine.nextService[direction] = engine.time + 2.4;
      }
    }
    engine.phaseRemaining -= dt;
  } else {
    engine.phaseRemaining -= dt;
    if (engine.phaseRemaining <= 0) {
      if (engine.phase === 'NS_YELLOW' && isLegalSignalTransition(engine.phase,'ALL_RED_TO_EW')) { engine.phase = 'ALL_RED_TO_EW'; engine.phaseRemaining = 1; engine.phaseDuration = 1; }
      else if (engine.phase === 'ALL_RED_TO_EW' && isLegalSignalTransition(engine.phase,'EW_GREEN')) { engine.phase = 'EW_GREEN'; engine.greenDuration = engine.pendingGreen; engine.phaseRemaining = engine.pendingGreen; engine.phaseDuration = engine.pendingGreen; }
      else if (engine.phase === 'EW_YELLOW' && isLegalSignalTransition(engine.phase,'ALL_RED_TO_NS')) { engine.phase = 'ALL_RED_TO_NS'; engine.phaseRemaining = 1; engine.phaseDuration = 1; }
      else if (engine.phase === 'ALL_RED_TO_NS' && isLegalSignalTransition(engine.phase,'NS_GREEN')) { engine.phase = 'NS_GREEN'; engine.greenDuration = engine.pendingGreen; engine.phaseRemaining = engine.pendingGreen; engine.phaseDuration = engine.pendingGreen; }
    }
  }

  const keepCrossing = [];
  for (const vehicle of engine.crossing) {
    vehicle.progress += 0.19 * dt;
    if (vehicle.progress >= 1) {
      engine.served += 1;
      vehicle.exitTime = engine.time;
      engine.completedWait += vehicle.waitingTime;
      engine.completedTravel += vehicle.exitTime - vehicle.spawnTime;
    } else keepCrossing.push(vehicle);
  }
  engine.crossing = keepCrossing;
  const queues = queueCounts(engine);
  const totalQueue = Object.values(queues).reduce((sum, value) => sum + value, 0);
  engine.maxQueue = Math.max(engine.maxQueue, totalQueue);
  engine.queueIntegral += totalQueue * dt;
  engine.sampleTime += dt;
  return engine;
}

function makeSnapshot(engine) {
  const queues = queueCounts(engine);
  return {
    time: engine.time, phase: engine.phase, phaseRemaining: Math.max(0, engine.phaseRemaining), phaseDuration: engine.phaseDuration,
    queues, waiting: Object.values(queues).reduce((a, b) => a + b, 0), served: engine.served,
    avgWait: engine.served ? engine.completedWait / engine.served : null,
    avgTravel: engine.served ? engine.completedTravel / engine.served : null,
    maxQueue: engine.maxQueue, avgQueue: engine.sampleTime ? engine.queueIntegral / engine.sampleTime : 0,
    throughput: engine.time ? engine.served * 60 / engine.time : 0,
    droppedDemand: engine.droppedDemand,
    vehicles: [...DIRECTIONS.flatMap(direction => engine.roads[direction].values()), ...engine.crossing],
    decision: engine.latestDecision, decisionInput: engine.latestDecisionInput, decisionPending: engine.decisionPending, status: engine.status, warning: engine.warning,
  };
}

function Icon({ children }) { return <span className="ui-icon" aria-hidden="true">{children}</span>; }
function SectionTitle({ eyebrow, title, note }) { return <div className="section-title"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div><p>{note}</p></div>; }

function TrafficCanvas({ snapshot, sourceRef }) {
  const ref = useRef(null);
  const drawRef = useRef(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const draw = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(box.width * dpr); const pixelHeight = Math.round(box.height * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scale = Math.min(box.width / 720, box.height / 410); const w = 720 * scale; const h = 410 * scale;
      ctx.save(); ctx.translate((box.width - w) / 2, (box.height - h) / 2); ctx.scale(scale, scale);
      ctx.fillStyle = '#e7eeea'; ctx.fillRect(0, 0, 720, 410); ctx.fillStyle = '#dae5dc';
      for (let x = 18; x < 720; x += 55) for (let y = 14; y < 410; y += 53) { if ((x > 260 && x < 475) || (y > 135 && y < 285)) continue; ctx.beginPath(); ctx.roundRect(x, y, 34, 22, 4); ctx.fill(); }
      ctx.fillStyle = '#b7c6bc'; ctx.fillRect(0, 171, 720, 68); ctx.fillRect(326, 0, 68, 410);
      ctx.fillStyle = '#49575a'; ctx.fillRect(0, 181, 720, 48); ctx.fillRect(336, 0, 48, 410);
      ctx.fillStyle = '#536164'; ctx.fillRect(0, 181, 720, 3); ctx.fillRect(0, 226, 720, 3); ctx.fillRect(336, 0, 3, 410); ctx.fillRect(381, 0, 3, 410);
      ctx.setLineDash([12, 12]); ctx.strokeStyle = '#a7b1ad'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 205); ctx.lineTo(720, 205); ctx.moveTo(360, 0); ctx.lineTo(360, 410); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(242,239,215,.9)';
      for (let i=0;i<6;i++) { const offset=i*10; ctx.fillRect(303+offset,153,6,13); ctx.fillRect(303+offset,244,6,13); ctx.fillRect(310,166+offset,13,6); ctx.fillRect(397,166+offset,13,6); }
      ctx.fillStyle = '#f5f1d8'; ctx.fillRect(320,166,2,78); ctx.fillRect(398,166,2,78); ctx.fillRect(320,166,80,2); ctx.fillRect(320,242,80,2);
      const current = sourceRef?.current || snapshotRef.current;
      const lamps = [{x:304,y:140,group:'NS'},{x:402,y:248,group:'NS'},{x:405,y:140,group:'EW'},{x:303,y:248,group:'EW'}];
      const aspectColors = {green:'#35c68f',yellow:'#e9a443',red:'#e06e63'};
      lamps.forEach(({x,y,group}) => { ctx.fillStyle = '#222d30'; ctx.beginPath(); ctx.roundRect(x,y,18,28,6); ctx.fill(); ctx.fillStyle = aspectColors[signalAspectForPhase(current.phase,group)]; ctx.beginPath(); ctx.arc(x+9,y+14,5,0,Math.PI*2); ctx.fill(); });
      current.vehicles.forEach(vehicle => {
        let x, y, angle;
        if (vehicle.direction === 'north') { x=345; y=20+vehicle.progress*370; angle=Math.PI/2; }
        else if (vehicle.direction === 'south') { x=375; y=390-vehicle.progress*370; angle=-Math.PI/2; }
        else if (vehicle.direction === 'east') { x=700-vehicle.progress*670; y=192; angle=Math.PI; }
        else { x=20+vehicle.progress*670; y=218; angle=0; }
        ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.fillStyle='rgba(25,37,35,.22)'; ctx.beginPath(); ctx.roundRect(-10,-4,25,13,4); ctx.fill(); ctx.fillStyle=vehicle.color; ctx.beginPath(); ctx.roundRect(-12,-7,24,12,4); ctx.fill(); ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.roundRect(-5,-5,8,8,2); ctx.fill(); ctx.fillStyle='rgba(34,45,45,.56)'; ctx.fillRect(6,-5,3,8); ctx.restore();
      });
      ctx.restore();
    };
    drawRef.current = draw;
    const observer = new ResizeObserver(draw); observer.observe(canvas);
    draw();
    return () => { observer.disconnect(); drawRef.current = null; };
  }, []);
  useEffect(() => { drawRef.current?.(); }, [snapshot]);
  useEffect(() => {
    if (snapshot.status !== 'running') return undefined;
    let frame = 0;
    let lastDraw = 0;
    const render = now => {
      if (now - lastDraw >= 1000 / 30) { drawRef.current?.(); lastDraw = now; }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [snapshot.status]);
  return <canvas ref={ref} className="traffic-canvas" aria-label="Canvas visualization of four-way traffic" />;
}

function MiniChart({ comparison }) {
  if (!comparison) return <div className="chart-empty">Run a comparison to plot measured results.</div>;
  const metrics = [
    ['Average wait', 'averageWaitingTime', 'seconds'],
    ['Average queue', 'averageQueueLength', 'vehicles'],
    ['Maximum queue', 'maximumQueueLength', 'vehicles'],
    ['Throughput', 'throughputPerMinute', 'vehicles / min'],
    ['Average travel time', 'averageTravelTime', 'seconds'],
  ];
  return <div className="metric-chart-grid">{metrics.map(([label, key, unit]) => <div className="metric-chart" key={key}><h4>{label}</h4><div className="metric-chart-canvas"><Bar data={{ labels: ['Controller'], datasets: [
    { label: 'Fixed-time', data: [comparison.fixed[key]], backgroundColor: '#9ca9a3', borderRadius: 5 },
    { label: 'Adaptive DSA', data: [comparison.adaptive[key]], backgroundColor: '#3a9a80', borderRadius: 5 },
  ] }} options={{ responsive: true, maintainAspectRatio: false, animation: { duration: 220 }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${context.raw == null ? 'N/A' : Number(context.raw).toFixed(2)} ${unit}` } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, title: { display: true, text: unit, font: { size: 9 } }, grid: { color: '#edf1ef' }, ticks: { font: { size: 9 } } } } }} /></div></div>)}</div>;
}
const fmt = (value, digits = 0) => value == null ? '—' : Number(value).toFixed(digits);

export default function App() {
  const [controller, setController] = useState('adaptive');
  const [rates, setRates] = useState({ ns: 12, ew: 28 });
  const [preset, setPreset] = useState('medium');
  const [speed, setSpeed] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [apiMessage, setApiMessage] = useState('Checking FastAPI scheduler');
  const [snapshot, setSnapshot] = useState(() => makeSnapshot(makeEngine('adaptive', { ns: 12, ew: 28 })));
  const [comparison, setComparison] = useState(null);
  const [comparisonConfig, setComparisonConfig] = useState(null);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const [seed, setSeed] = useState(12345);
  const [duration, setDuration] = useState(300);
  const [activeNav, setActiveNav] = useState('console');
  const engineRef = useRef(makeEngine('adaptive', { ns: 12, ew: 28 }));
  const runningRef = useRef(false);
  const accumulatorRef = useRef(0);
  const speedRef = useRef(speed);
  const snapshotRef = useRef(snapshot);
  const visualSnapshotRef = useRef(snapshot);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  useEffect(() => {
    let alive = true;
    api('/api/health').then(() => { if (alive) { setApiStatus('online'); setApiMessage('FastAPI DSA scheduler connected'); } }).catch(() => { if (alive) { setApiStatus('offline'); setApiMessage('Backend required for adaptive scheduling'); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    let last = performance.now(); let dashboardElapsed = 0;
    const timer = window.setInterval(() => {
      const now = performance.now(); const realDelta = Math.min((now-last)/1000, .2); last=now;
      const engine = engineRef.current;
      if (!runningRef.current || engine.decisionPending) return;
      accumulatorRef.current += realDelta * speedRef.current;
      let advanced = false;
      while (accumulatorRef.current >= .05 && runningRef.current && !engine.decisionPending) {
        accumulatorRef.current -= .05;
        step(engine, .05); advanced = true;
        visualSnapshotRef.current = makeSnapshot(engine);
        if (engine.phase.endsWith('_GREEN') && engine.phaseRemaining <= 0) {
          const pendingDecision = phaseDecision(engine, () => engineRef.current === engine);
          setSnapshot(makeSnapshot(engine));
          pendingDecision.catch(error => {
            if (engineRef.current !== engine) return;
            runningRef.current = false; engine.status = 'error'; engine.warning = error.message;
            setApiStatus('offline'); setApiMessage('Adaptive scheduling failed. Simulation paused safely.'); setSnapshot(makeSnapshot(engine));
          });
        }
        dashboardElapsed += .05;
      }
      if (advanced && dashboardElapsed >= .2) {
        dashboardElapsed = 0; setSnapshot(makeSnapshot(engine));
      }
    }, 25);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const ids = ['console','algorithm','metrics','comparison','documentation'];
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if (visible) setActiveNav(visible.target.id);
    }, {rootMargin:'-20% 0px -62% 0px',threshold:[0,.2,.5]});
    ids.forEach(id => { const el=document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const updateSnapshot = useCallback((engine = engineRef.current) => { const next=makeSnapshot(engine); visualSnapshotRef.current=next; setSnapshot(next); }, []);
  const start = () => {
    const engine = engineRef.current;
    if (engine.controller === 'adaptive' && apiStatus !== 'online') {
      engine.warning = 'FastAPI is unavailable. Adaptive scheduling is paused safely; start Fixed-time mode or reconnect the API.';
      updateSnapshot(engine); return;
    }
    engine.warning = '';
    if (engine.pendingPhaseTarget && !engine.decisionPending) {
      safeTransition(engine, engine.pendingPhaseTarget);
      engine.pendingPhaseTarget = null;
    }
    if (engine.status === 'ready' || engine.status === 'error') engine.status = 'running';
    runningRef.current = true; engine.status = 'running'; setSnapshot(makeSnapshot(engine));
  };
  const pause = () => {
    runningRef.current = false; engineRef.current.status = 'paused'; updateSnapshot();
  };
  const reset = () => {
    runningRef.current = false; accumulatorRef.current = 0;
    engineRef.current = makeEngine(controller, rates); updateSnapshot();
  };
  const selectController = value => {
    pause(); setController(value); engineRef.current = makeEngine(value, rates); updateSnapshot();
  };
  const setDemand = (key, value) => {
    const next = {...rates,[key]:Number(value)}; setRates(next); setPreset('custom');
    pause(); engineRef.current = makeEngine(controller,next); updateSnapshot();
  };
  const applyPreset = key => {
    const chosen=PRESETS[key]; setPreset(key); setRates({ns:chosen.ns,ew:chosen.ew}); pause();
    engineRef.current=makeEngine(controller,{ns:chosen.ns,ew:chosen.ew}); updateSnapshot();
  };
  const runComparison = async () => {
    setComparisonBusy(true); setComparisonError('');
    const config = { seed: Number(seed), duration: Number(duration), rates: { ...rates } };
    try {
      const result = await api('/api/experiment', json('POST',config));
      setComparison(result);
      setComparisonConfig(JSON.stringify(config));
    } catch (error) { setComparisonError(`Could not run experiment: ${error.message}`); }
    finally { setComparisonBusy(false); }
  };
  const navigate = id => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}); };
  const clock = `${String(Math.floor(snapshot.time/60)).padStart(2,'0')}:${String(Math.floor(snapshot.time%60)).padStart(2,'0')}`;
  const phaseProgress = useMemo(()=>100*Math.max(0,1-snapshot.phaseRemaining/Math.max(1,snapshot.phaseDuration)),[snapshot]);
  const comparisonIsStale = Boolean(comparison && comparisonConfig !== JSON.stringify({seed:Number(seed),duration:Number(duration),rates}));
  const comparisonRows = comparison ? [
    ['Average wait','averageWaitingTime',' sec',true],['Average queue','averageQueueLength',' veh',true],['Maximum queue','maximumQueueLength',' veh',true],['Throughput','throughputPerMinute',' veh/min',false],['Average travel time','averageTravelTime',' sec',true],['Vehicles served','vehiclesServed',' veh',false],
  ] : [];

  return <div className="app-shell">
    <aside id="workspace-navigation" className={`sidebar ${menuOpen?'sidebar-open':''}`}>
      <div className="brand"><div className="brand-mark"><span className="traffic-light"><i/><i/><i/></span></div><div><b>signal<span>lab</span></b><small>TRAFFIC CONTROL SIMULATOR</small></div><button className="icon-button sidebar-close" onClick={()=>setMenuOpen(false)} aria-label="Close navigation">×</button></div>
      <div className="intersection-card"><span className="micro-label">ACTIVE INTERSECTION</span><strong>Node 104-E</strong><span><i className="live-dot"/> Four-way · Educational model</span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{[['console','▦','Simulation console'],['algorithm','⌘','Decision trace'],['metrics','⌁','System metrics'],['comparison','↔','Controller comparison'],['documentation','▤','Documentation & assumptions']].map(([id,icon,label])=><button key={id} className={`nav-item ${activeNav===id?'active':''}`} aria-current={activeNav===id?'location':undefined} onClick={()=>navigate(id)}><span aria-hidden="true">{icon}</span><span>{label}</span>{activeNav===id&&<i className="nav-indicator"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="model-badge"><span>MODEL</span><b>DSA SIM · 01</b><small>Educational use only</small></div><p>Not calibrated or certified for real-world traffic control.</p></div>
    </aside>
    {menuOpen&&<button className="scrim" aria-label="Close menu" onClick={()=>setMenuOpen(false)}/>}
    <main className="main-content">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={()=>setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="workspace-navigation" aria-label="Open navigation">☰</button><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>Simulation console</strong></div><div className="topbar-actions">{apiStatus==='online'?<span className="api-status online"><i/>FastAPI connected</span>:<button className={`api-status ${apiStatus}`} onClick={()=>api('/api/health').then(()=>{setApiStatus('online');setApiMessage('FastAPI DSA scheduler connected');}).catch(()=>{setApiStatus('offline');setApiMessage('Backend unavailable · adaptive mode paused safely');})} aria-label="Retry FastAPI connection"><i/>{apiStatus==='checking'?'Checking API':'Retry API'}</button>}<span className="avatar" aria-label="Academic project">DSA</span></div></header>
      <div className="page-wrap">
        <section id="console" className="hero-section"><div><div className="eyebrow"><span className="eyebrow-line"/> SMART MOBILITY LAB <span className="eyebrow-dot">·</span> DSA SIMULATION</div><h1>Intersection <em>control room</em></h1><p className="hero-copy">See how queues, waiting time, and safe signal transitions shape traffic flow.</p></div><div className="run-state" role="status" aria-live="polite"><span className={`state-pulse ${snapshot.status==='running'?'is-running':''}`}/><div><strong>{snapshot.decisionPending?'Calculating next phase…':snapshot.status==='running'?'Simulation running':snapshot.status==='error'?'Simulation paused safely':snapshot.status==='ready'?'Ready to simulate':'Simulation paused'}</strong><small>{snapshot.warning||apiMessage}</small></div></div></section>

        <section className="sim-layout" aria-label="Simulation workspace">
          <div className="panel intersection-panel">
            <div className="panel-header canvas-header"><div><div className="eyebrow">LIVE ENVIRONMENT</div><h2>Node 104-E <span className="location-tag">4-WAY</span></h2></div><span className="unit-tag">SEEDED RUN · 12345</span></div>
            <div className="canvas-wrap"><TrafficCanvas snapshot={snapshot} sourceRef={visualSnapshotRef}/>{DIRECTIONS.map(direction=><div key={direction} className={`canvas-label label-${direction}`}>{direction.toUpperCase()} <span>{snapshot.queues[direction]||0} queued</span></div>)}<div className="canvas-legend"><span><i className="legend-green"/> Green</span><span><i className="legend-red"/> Red</span><span><i className="legend-car"/> Vehicle</span></div></div>
            <div className="phase-strip"><div className="phase-signal"><i className={`lamp red ${snapshot.phase.startsWith('ALL_RED')?'on':''}`}/><i className={`lamp yellow ${snapshot.phase.endsWith('YELLOW')?'on':''}`}/><i className={`lamp green ${snapshot.phase.endsWith('_GREEN')?'on':''}`}/></div><div className="phase-detail"><span className="micro-label">CANONICAL SIGNAL STATE</span><strong>{PHASE_LABELS[snapshot.phase]}</strong></div><div className="phase-timer"><b>{Math.ceil(snapshot.phaseRemaining)}<small>s</small></b><span>remaining</span></div><div className="phase-meter"><i style={{width:`${phaseProgress}%`}}/></div></div>
            <div className="playback"><div className="playback-buttons"><button className="primary-button" onClick={start} disabled={snapshot.status==='running'}>{snapshot.status==='ready'?'▶ Start':'▶ Resume'}</button><button className="secondary-button" onClick={pause} disabled={snapshot.status!=='running'}>Ⅱ Pause</button><button className="reset-button" onClick={reset} aria-label="Reset simulation">↻</button></div><div className="speed-control" role="group" aria-label="Simulation speed"><span>SPEED</span>{[1,2,4].map(value=><button key={value} className={speed===value?'active':''} aria-label={`${value} times simulation speed`} aria-pressed={speed===value} onClick={()=>setSpeed(value)}>{value}×</button>)}</div><div className="clock-readout"><b>{clock}</b><span>SIM TIME</span></div></div>
          </div>
          <aside className="panel controls-panel">
            <div className="panel-header"><div><div className="eyebrow">CONTROL STRATEGY</div><h2>Signal logic</h2></div><span className="panel-index">01</span></div>
            <div className="controller-switch" role="group" aria-label="Controller mode"><button className={controller==='adaptive'?'selected':''} aria-pressed={controller==='adaptive'} disabled={snapshot.status==='running'} onClick={()=>selectController('adaptive')}><span className="switch-icon adaptive-icon">↗</span><span><b>Adaptive</b><small>FastAPI · DSA scheduler</small></span></button><button className={controller==='fixed'?'selected':''} aria-pressed={controller==='fixed'} disabled={snapshot.status==='running'} onClick={()=>selectController('fixed')}><span className="switch-icon">◷</span><span><b>Fixed time</b><small>20 sec green baseline</small></span></button></div>
            <div className="control-divider controller-divider"/><div className="control-section-head"><div><div className="eyebrow">TRAFFIC DEMAND</div><h3>Arrival rate</h3></div><span className="unit-tag">VEH / MIN · AXIS</span></div>
            {['ns','ew'].map(key=><label className="slider-row" key={key}><span><i className={`direction-dot ${key==='ns'?'ns-dot':'ew-dot'}`}/>{key==='ns'?'North / South':'East / West'}</span><b>{rates[key]}<small> veh/min</small></b><input disabled={snapshot.status==='running'} aria-label={`${key.toUpperCase()} arrival rate`} type="range" min="0" max="40" value={rates[key]} onChange={event=>setDemand(key,event.target.value)} style={{'--range':`${rates[key]/40*100}%`}}/></label>)}
            <div className="control-divider preset-divider"/><div className="preset-heading"><span>DEMAND PRESETS</span><span className="preset-edit">{preset==='custom'?'CUSTOM':'SELECT'}</span></div><div className="preset-grid">{Object.entries(PRESETS).map(([key,item])=><button key={key} disabled={snapshot.status==='running'} className={`preset-card ${preset===key?'selected':''}`} aria-pressed={preset===key} onClick={()=>applyPreset(key)}><i className={`preset-mark ${key}`}/><span><b>{item.label}</b><small>{item.ns} / {item.ew} veh/min</small></span></button>)}</div>
            <div className="adaptive-note"><span className="spark">✳</span><p><b>{controller==='adaptive'?'Queue + oldest wait → priority':'Alternating fixed phases'}</b><br/>{controller==='adaptive'?'Scheduler decisions call FastAPI only at green boundaries.':'Both controllers share the same traffic model and safe signal transitions.'}</p></div>
          </aside>
        </section>

        <section id="algorithm" className="page-section algorithm-section"><SectionTitle eyebrow="DECISION TRACE" title="Algorithm visualizer" note="Follow real queue data through the scheduler to the returned signal decision."/><div className="algorithm-flow panel" aria-label="Scheduler decision pipeline"><span>Road queues</span><i aria-hidden="true">→</i><span>Phase demand</span><i aria-hidden="true">→</i><span>Priority + fairness</span><i aria-hidden="true">→</i><span>Max heap</span><i aria-hidden="true">→</i><strong>Selected phase</strong></div><div className="algorithm-grid panel"><div className="algorithm-queues"><h3>Road queues · oldest wait</h3>{DIRECTIONS.map(direction=><div key={direction}><span>{direction}</span><b>{snapshot.queues[direction]||0}</b><small>{fmt(roadMaxWait(engineRef.current.roads[direction]),1)} sec</small></div>)}</div><div className="algorithm-candidates"><h3>Priority = queue + wait + fairness guard</h3>{['NS','EW'].map(phase=>{const score=snapshot.decision?.candidateScores?.[phase];return <div className="candidate-row" key={phase}><b>{phase}</b><span>Queue {fmt(score?.queueScore,0)}</span><span>Wait {fmt(score?.waitingScore,1)} · guard {fmt(score?.starvationBoost,1)}</span><strong>{fmt(score?.priority,1)}</strong></div>;})}<div className="heap-label">MAX HEAP · root has highest priority</div><div className="heap-display">{snapshot.decision?.heap?.map((item,index)=><span key={`${item.value}-${index}`} className={index===0?'heap-root':'heap-child'}>{item.value} · {fmt(item.priority,1)}</span>)||<span className="heap-child">Waiting for the first adaptive scheduling decision</span>}</div><p className="decision-line">Selected: <b>{snapshot.decision?.selectedPhase||'—'}</b><span> Green: {snapshot.decision?fmt(snapshot.decision.greenDuration,1)+' sec':'—'}</span></p></div></div></section>

        <section id="metrics" className="metrics-section page-section"><SectionTitle eyebrow="LIVE TELEMETRY" title="System metrics" note="Measurements come from the simulation clock, not browser animation frames."/><div className="metric-grid">
          <MetricCard label="Vehicles waiting" value={snapshot.waiting} suffix="veh" tone="mint"/><MetricCard label="Vehicles served" value={snapshot.served} suffix="veh" tone="blue"/><MetricCard label="Average wait" value={fmt(snapshot.avgWait,1)} suffix="sec" tone="amber"/><MetricCard label="Maximum queue" value={snapshot.maxQueue} suffix="veh" tone="rose"/><MetricCard label="Average queue" value={fmt(snapshot.avgQueue,2)} suffix="veh" tone="blue"/><MetricCard label="Average travel time" value={fmt(snapshot.avgTravel,1)} suffix="sec" tone="mint"/><MetricCard label="Throughput" value={fmt(snapshot.throughput,1)} suffix="veh/min" tone="amber"/><MetricCard label="Dropped demand" value={snapshot.droppedDemand} suffix="veh" tone="rose"/>
        </div><div className="throughput-panel"><div><span className="eyebrow">CURRENT QUEUES</span><strong>{DIRECTIONS.map(direction=><small key={direction}>{direction.slice(0,1).toUpperCase()} {snapshot.queues[direction]||0} · </small>)}</strong></div><div className="throughput-chart" aria-label="Queue lengths by approach">{DIRECTIONS.map(direction=><i key={direction} title={`${direction}: ${snapshot.queues[direction]||0}`} style={{height:`${Math.min(100,(snapshot.queues[direction]||0)*12+4)}%`}}/>)}</div><div className="throughput-foot"><span><i className="chart-dot"/> Live simulation</span><span>Live arrivals: seeded Bernoulli approximation</span></div></div></section>

        <section id="comparison" className="page-section comparison-section"><SectionTitle eyebrow="REPRODUCIBLE EXPERIMENT" title="Controller comparison" note="Both controllers receive the same pre-generated seeded arrivals and simulation duration."/><div className="experiment-controls panel"><label>Random seed<input type="number" min="0" max="4294967295" value={seed} onChange={event=>setSeed(event.target.value)}/></label><label>Duration<select value={duration} onChange={event=>setDuration(event.target.value)}><option value="120">120 seconds</option><option value="300">300 seconds</option><option value="600">600 seconds</option><option value="1800">1800 seconds</option></select></label><button className="primary-button" onClick={runComparison} disabled={comparisonBusy||apiStatus!=='online'}>{comparisonBusy?'Running experiment…':'Run fixed vs adaptive'}</button></div>
          {comparisonError&&<p className="comparison-error" role="alert">{comparisonError}</p>}
          {comparison&&<><div className="experiment-meta">Seed {comparison.seed} · {comparison.duration} simulated seconds · {comparison.fixed.vehiclesDemanded} identical arrivals · schedule {comparison.arrivalScheduleHash}</div>{comparisonIsStale&&<p className="comparison-stale" role="status">These results use the earlier seed, duration, or arrival rates. Run the comparison again to refresh them.</p>}<div className="comparison-table-wrap panel"><table className="comparison-table"><thead><tr><th>Measured metric</th><th>Fixed-time</th><th>Adaptive DSA</th></tr></thead><tbody>{comparisonRows.map(([label,key,suffix])=><tr key={key}><th>{label}</th><td>{fmt(comparison.fixed[key],key.includes('Time')||key.includes('Length')||key.includes('Minute')?2:0)}{suffix}</td><td>{fmt(comparison.adaptive[key],key.includes('Time')||key.includes('Length')||key.includes('Minute')?2:0)}{suffix}</td></tr>)}</tbody></table></div><div className="panel chart-panel"><h3>Measured experiment results</h3><MiniChart comparison={comparison}/><small>{comparison.basis}. No performance outcome is assumed in advance.</small></div></>}
          {!comparison&&!comparisonBusy&&<div className="panel comparison-empty">Run the experiment to calculate real metrics. No sample results are presented as measurements.</div>}
        </section>

        <section id="documentation" className="page-section docs-section"><SectionTitle eyebrow="MODEL NOTES" title="Documentation & assumptions" note="The model stays small enough to explain, inspect, and test."/><div className="docs-grid"><article className="panel doc-card"><div className="doc-number">01</div><div><h3>Data structures and scheduler</h3><p>Each approach is represented by a FIFO queue. FastAPI groups queues by a road-name dictionary, calculates the NS and EW phase priorities, and selects from a max heap.</p><ul><li>Priority = phase queue length + 0.2 × oldest vehicle wait; a 45-second wait triggers a protection boost.</li><li>Green duration is clamped to 8–30 sec using base 8 sec + 0.8 sec per queued vehicle.</li><li>The scheduler may keep a green phase or request a change; the 2-candidate heap is chiefly educational at this scale.</li></ul></div></article><article className="panel doc-card"><div className="doc-number">02</div><div><h3>Signal safety and simulation</h3><p>Only the signal state machine changes the active signal. A phase change always passes through yellow and all-red clearance. The simulation uses a fixed 0.05 sec step and seeded arrival generation.</p><ul><li>NS and EW green states cannot be active together.</li><li>Queue time is accumulated on the simulation clock until a vehicle begins crossing.</li><li>Comparison runs reuse one arrival schedule for both controllers.</li></ul></div></article><article className="panel doc-card"><div className="doc-number">03</div><div><h3>Metrics definitions</h3><p>Results are calculated from vehicles that complete the modeled intersection and time samples recorded by the simulator.</p><ul><li>Average wait: time from approach queue entry until crossing begins for completed vehicles.</li><li>Travel time: exit time − spawn time; throughput: served vehicles per simulated minute.</li><li>Average queue: time-weighted total lane queues, sampled each fixed step.</li></ul></div></article><article className="panel doc-card"><div className="doc-number">04</div><div><h3>Limitations</h3><p>This is an educational model and not traffic-engineering software. It does not calibrate real junction geometry or represent pedestrians, turns, changing lanes, detection error, or human driving variation.</p><ul><li>The controller is a rule-based heuristic, not machine learning.</li><li>Two compatible phases simplify movement conflicts.</li><li>Results describe this simulation only; adaptive control is not guaranteed to win.</li></ul></div></article></div></section>
        <footer className="page-footer"><span><b>signal<span>lab</span></b> · Academic DSA simulation</span><span>React + FastAPI <i className="footer-dot"/> {apiStatus==='online'?'Scheduler connected':'Scheduler unavailable'}</span></footer>
      </div>
    </main>
  </div>;
}

function MetricCard({label,value,suffix,tone}) { return <article className="panel metric-card"><div className={`metric-icon ${tone}`}><Icon>{label.includes('wait')?'◷':label.includes('queue')?'▤':label.includes('served')?'↗':'⌁'}</Icon></div><div className="metric-label">{label}</div><div className="metric-value">{value}<small>{suffix}</small></div><span className={`metric-accent ${tone}`}/></article>; }
