import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, Legend
} from 'recharts';
import { AlertCircle, CheckCircle2, ChevronDown, Info, Save, TrendingUp, History, LayoutDashboard, Calculator, Trash2, ArrowRightLeft, Eye, EyeOff } from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type DeviceId = 'agrineb' | 'fog' | 'xlux' | 'omnigreen';

interface DeviceConfig {
  id: DeviceId;
  name: string;
  hasDot: boolean;
  canToggleDot: boolean;
  defaultDotState: boolean;
  description: string;
  resolutionNote?: string;
  color: string;
}

const DEVICES: DeviceConfig[] = [
  {
    id: 'agrineb',
    name: 'Agricontrol Agrineb (C-AGRINEB4-I)',
    hasDot: true,
    canToggleDot: true,
    defaultDotState: false,
    description: 'Valore a 3 cifre. Il puntino moltiplica per 100, altrimenti per 10.',
    resolutionNote: 'Risoluzione: 40 Lux (<10k) e 400 Lux (>10k). Arrotonda a multipli di 4 unità interne.',
    color: '#0ea5e9' // sky-500
  },
  {
    id: 'fog',
    name: 'Agricontrol Fog (C-FOG4-THR)',
    hasDot: true,
    canToggleDot: false,
    defaultDotState: true,
    description: 'Valore a 3 cifre. Moltiplicatore fisso x100 (puntino sempre attivo).',
    color: '#f59e0b' // amber-500
  },
  {
    id: 'xlux',
    name: 'Agricontrol X-LUX / X-SP',
    hasDot: true,
    canToggleDot: true,
    defaultDotState: false,
    description: 'Valore a 3 cifre. Il puntino moltiplica per 100, altrimenti per 10.',
    color: '#ec4899' // pink-500
  },
  {
    id: 'omnigreen',
    name: 'OmniGreen',
    hasDot: false,
    canToggleDot: false,
    defaultDotState: false,
    description: 'Lettura diretta (es. inserire 10000 per 10.000 Lux).',
    color: '#6366f1' // indigo-500
  },
];

interface DeviceState {
  rawValue: string;
  dotActive: boolean;
  isActive?: boolean;
}

interface Reading {
  id: string;
  timestamp: number;
  data: Record<DeviceId, {
    rawValue: string;
    totalLux: number;
  }>;
}

type TabType = 'current' | 'history' | 'analysis' | 'converter';

interface AgricontrolConfig {
  p2: string;
  pmMin: string;
  pmSec: string;
  lnot: string;
  d: string;
  numWindows?: string;
}

export default function App() {
  const [agriConfig, setAgriConfig] = useState<AgricontrolConfig>(() => {
    try {
      const saved = localStorage.getItem('lux_agri_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading agri config', e);
    }
    return { p2: '60', pmMin: '5', pmSec: '0', lnot: '2000', d: '10', numWindows: '4' };
  });

  const [calcInput, setCalcInput] = useState<string>('');
  const [calcDirection, setCalcDirection] = useState<'toRef' | 'toDev'>('toRef');

  const [deviceStates, setDeviceStates] = useState<Record<DeviceId, DeviceState>>(() => {
    try {
      const saved = localStorage.getItem('lux_device_states');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading device states', e);
    }
    return {
      agrineb: { rawValue: '', dotActive: false },
      fog: { rawValue: '', dotActive: true },
      xlux: { rawValue: '', dotActive: false },
      omnigreen: { rawValue: '', dotActive: false },
    };
  });

  const [referenceSource, setReferenceSource] = useState<DeviceId>(() => {
    return (localStorage.getItem('lux_reference_source') as DeviceId) || 'omnigreen';
  });

  const [analysisDevice, setAnalysisDevice] = useState<DeviceId>(() => {
    return (localStorage.getItem('lux_analysis_device') as DeviceId) || 'agrineb';
  });

  const [readings, setReadings] = useState<Reading[]>(() => {
    try {
      const saved = localStorage.getItem('lux_readings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading readings', e);
    }
    return [];
  });
  
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return (localStorage.getItem('lux_active_tab') as TabType) || 'current';
  });

  useEffect(() => {
    localStorage.setItem('lux_device_states', JSON.stringify(deviceStates));
  }, [deviceStates]);

  useEffect(() => {
    localStorage.setItem('lux_reference_source', referenceSource);
  }, [referenceSource]);

  useEffect(() => {
    localStorage.setItem('lux_analysis_device', analysisDevice);
  }, [analysisDevice]);

  useEffect(() => {
    localStorage.setItem('lux_readings', JSON.stringify(readings));
  }, [readings]);

  useEffect(() => {
    localStorage.setItem('lux_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('lux_agri_config', JSON.stringify(agriConfig));
  }, [agriConfig]);

  const handleValueChange = (id: DeviceId, value: string) => {
    setDeviceStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], rawValue: value },
    }));
  };

  const handleDotToggle = (id: DeviceId, dotActive: boolean) => {
    setDeviceStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], dotActive },
    }));
  };

  const handleToggleActive = (id: DeviceId) => {
    setDeviceStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], isActive: prev[id].isActive === false ? true : false },
    }));
  };

  const computedCurrentData = useMemo(() => {
    return DEVICES.map((device) => {
      const state = deviceStates[device.id];
      const parsedValue = parseFloat(state.rawValue);
      const isInvalid = isNaN(parsedValue);

      let multiplier = 1;
      let totalLux = 0;
      let isOverRange = false;

      if (!isInvalid) {
        if (device.id === 'omnigreen') {
          multiplier = 1;
          totalLux = parsedValue;
        } else {
          multiplier = state.dotActive ? 100 : 10;
          totalLux = parsedValue * multiplier;
          isOverRange = parsedValue > 996;
        }
      }

      return {
        ...device,
        state,
        isActive: state.isActive !== false,
        parsedValue: isInvalid ? 0 : parsedValue,
        multiplier,
        totalLux,
        isOverRange,
        isInvalid,
      };
    });
  }, [deviceStates]);

  const recordReading = () => {
    const newReading: Reading = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      data: computedCurrentData.reduce((acc, curr) => {
        acc[curr.id] = {
          rawValue: curr.state.rawValue,
          totalLux: curr.totalLux
        };
        return acc;
      }, {} as Record<DeviceId, { rawValue: string; totalLux: number }>)
    };

    setReadings(prev => [...prev, newReading]);
    
    // Optional: Switch to history to see the newly added reading
    setActiveTab('history');
  };

  const deleteReading = (id: string) => {
    setReadings(prev => prev.filter(r => r.id !== id));
  };

  const clearAllReadings = () => {
    if (confirm('Sei sicuro di voler cancellare tutte le letture?')) {
      setReadings([]);
    }
  };

  const currentRefLux = computedCurrentData.find((d) => d.id === referenceSource)?.totalLux || 0;

  const comparisonData = computedCurrentData.filter(d => d.isActive).map((d) => {
    let diffPercent = 0;
    if (currentRefLux > 0) {
      diffPercent = ((d.totalLux - currentRefLux) / currentRefLux) * 100;
    } else if (d.totalLux > 0 && currentRefLux === 0) {
      diffPercent = 100;
    }
    
    return { ...d, diffPercent };
  });

  // --- ANALYSIS LOGIC ---
  const analyzeTrend = (devId: DeviceId, refId: DeviceId) => {
    const points = readings
      .map(r => ({
        x: r.data[refId].totalLux, // reference x
        y: r.data[devId].totalLux  // device y
      }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x > 0 && p.y > 0);

    if (points.length < 2) return null;

    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
    const sumYY = points.reduce((s, p) => s + p.y * p.y, 0);

    const meanX = sumX / n;
    const meanY = sumY / n;

    const ssXY = sumXY - n * meanX * meanY;
    const ssXX = sumXX - n * meanX * meanX;
    const ssYY = sumYY - n * meanY * meanY;

    const slope = ssXX === 0 ? 0 : ssXY / ssXX;
    const intercept = meanY - slope * meanX;
    const rSquared = (ssXX === 0 || ssYY === 0) ? 0 : (ssXY * ssXY) / (ssXX * ssYY);

    // Prepare line points for plotting the trendline
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    
    // Add margin
    const marginRange = Math.max(10, (maxX - minX) * 0.1);
    const trendlinePoints = [
      { x: Math.max(0, minX - marginRange) },
      { x: maxX + marginRange }
    ].map(p => ({
      x: p.x,
      y: p.x * slope + intercept
    }));

    return { slope, intercept, rSquared, points, trendlinePoints };
  };

  const trendData = useMemo(() => {
    if (analysisDevice === referenceSource) return null;
    return analyzeTrend(analysisDevice, referenceSource);
  }, [readings, analysisDevice, referenceSource]);

  const computedConverter = useMemo(() => {
    const p2 = parseFloat(agriConfig.p2) || 0;
    const pmMin = parseFloat(agriConfig.pmMin) || 0;
    const pmSec = parseFloat(agriConfig.pmSec) || 0;
    const pmTotal = pmMin + (pmSec / 60);
    const lnot = parseFloat(agriConfig.lnot) || 0;
    const d = parseFloat(agriConfig.d) || 0;
    const numWindows = parseInt(agriConfig.numWindows || '4', 10);

    const limiteSommaSoglia = 10;
    const intervalloMassimo = p2;

    const maxLux = 100000;
    const windows = [];

    if (p2 > 0 && pmTotal > 0 && maxLux > lnot && p2 > pmTotal && numWindows > 1) {
      const step = (maxLux - lnot) / numWindows;
      for (let i = 0; i < numWindows; i++) {
          const startLux = lnot + (i * step);
          const endLux = i === numWindows - 1 ? maxLux : startLux + step;
          const midLux = (startLux + endLux) / 2;
          
          // Ora assegniamo esattamente P2 alla prima finestra e PM all'ultima, distribuendo in modo lineare i gradini.
          // In precedenza calcolavamo il punto medio dei Lux (midLux), il cui valore si avvicinava senza mai toccare gli estremi assoluti P2 e PM.
          const targetPause = p2 - ((p2 - pmTotal) * (i / (numWindows - 1)));
          
          // Frequenza in minuti = Pausa bersaglio divisa per il limite soglia (10)
          const frequenza = targetPause / limiteSommaSoglia;

          windows.push({
              startLux: Math.round(startLux),
              endLux: Math.round(endLux),
              frequenza: Math.max(0.1, frequenza).toFixed(1), // minimo 0.1 min
              targetPause: targetPause.toFixed(1)
          });
      }
    }

    // Status Calibrazione della Sonda basato su trendData corrente
    let isSondaInvertita = false;
    let anomalyMessage = '';
    
    if (trendData) {
      if (trendData.slope < -0.1) {
        isSondaInvertita = true;
        anomalyMessage = 'ATTENZIONE: La sonda Agricontrol sembra fornire letture INVERTITE rispetto al riferimento globale (Lux scendono quando dovrebbero salire). Controllare collegamento fili.';
      } else if (trendData.rSquared < 0.3 && trendData.points.length > 3) {
        anomalyMessage = 'ATTENZIONE: I dati della sonda Agricontrol sono molto instabili rispetto al riferimento. La conversione potrebbe non essere accurata nei casi reali.';
      }
    }

    return { windows, limiteSommaSoglia, intervalloMassimo, d, isSondaInvertita, anomalyMessage };
  }, [agriConfig, trendData]);

  const formatLux = (val: number) => new Intl.NumberFormat('it-IT').format(Math.round(val));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 selection:bg-indigo-100 pb-24">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Lab Dati Serre</h1>
              <p className="text-slate-500 mt-1 max-w-2xl">
                Sincronizza, confronta e analizza i gap di lettura tra i sistemi di misurazione Lux.
              </p>
            </div>
            
            <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl shadow-sm border border-slate-200">
              <label htmlFor="ref-source-global" className="text-sm font-medium text-slate-600 whitespace-nowrap">
                Riferimento Globale:
              </label>
              <div className="relative">
                <select
                  id="ref-source-global"
                  value={referenceSource}
                  onChange={(e) => setReferenceSource(e.target.value as DeviceId)}
                  className="appearance-none bg-indigo-50 border-none rounded-lg pl-3 pr-8 py-1.5 text-sm font-semibold text-indigo-700 outline-none hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  {DEVICES.filter(d => deviceStates[d.id].isActive !== false).map(d => (
                    <option key={d.id} value={d.id}>{d.name.split(' ')[0]} {d.name.split(' ').length > 1 ? d.name.split(' ')[1] : ''}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-indigo-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Panel: Input */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Nuova Lettura</h2>
              </div>
              <div className="p-6 space-y-6">
                {DEVICES.map((device) => {
                  const state = deviceStates[device.id];
                  const overRange = computedCurrentData.find((d) => d.id === device.id)?.isOverRange;
                  const currentLux = computedCurrentData.find((d) => d.id === device.id)?.totalLux;
                  const isRef = device.id === referenceSource;
                  const isActive = state.isActive !== false;

                  return (
                    <div key={device.id} className={cn("p-4 rounded-xl border transition-colors", 
                      !isActive ? "bg-slate-50/50 border-slate-100 opacity-60" :
                      (isRef ? "bg-indigo-50/50 border-indigo-100" : "bg-white border-slate-100")
                    )}>
                      <div className="flex justify-between items-start mb-3">
                        <label className="font-medium text-sm text-slate-700 flex flex-col gap-0.5" htmlFor={`input-${device.id}`}>
                          <span className="flex items-center gap-1.5">
                            {isRef && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                            {device.name}
                          </span>
                          {currentLux !== undefined && !isNaN(currentLux) && currentLux > 0 && isActive && (
                            <span className="text-xs font-mono text-slate-500">= {formatLux(currentLux)} Lux</span>
                          )}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(device.id)}
                          className={cn("p-1.5 rounded-md transition-colors", isActive ? "text-indigo-600 hover:bg-indigo-50 bg-indigo-50/50" : "text-slate-400 hover:bg-slate-200 bg-slate-100")}
                          title={isActive ? 'Disattiva sensore' : 'Attiva sensore'}
                        >
                          {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      <div className={cn("flex flex-col xl:flex-row xl:items-center gap-3 transition-opacity", !isActive && "pointer-events-none")}>
                        <div className="relative flex-1">
                          <input
                            id={`input-${device.id}`}
                            type="number"
                            value={state.rawValue}
                            onChange={(e) => handleValueChange(device.id, e.target.value)}
                            className={cn(
                              "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300",
                              overRange && "border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200"
                            )}
                            placeholder="Es. 120"
                          />
                        </div>
                        
                        {device.hasDot && (
                          <label className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none transition-colors",
                            state.dotActive 
                              ? "bg-slate-800 border-slate-800 text-white" 
                              : "bg-white border-slate-200 text-slate-600",
                            !device.canToggleDot && "opacity-60 cursor-not-allowed"
                          )}>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={state.dotActive}
                              disabled={!device.canToggleDot}
                              onChange={(e) => handleDotToggle(device.id, e.target.checked)}
                            />
                            <div className={cn(
                              "w-3.5 h-3.5 rounded-full border flex items-center justify-center bg-white",
                              state.dotActive ? "border-transparent" : "border-slate-300"
                            )}>
                              {state.dotActive && <div className="w-2 h-2 bg-slate-800 rounded-full" />}
                            </div>
                            <span className="text-xs font-medium whitespace-nowrap">Pt. ON</span>
                          </label>
                        )}
                      </div>

                      <AnimatePresence>
                        {overRange && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="flex items-start gap-1.5 text-red-600 bg-red-50 p-2 rounded text-xs mt-2">
                              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <p>Fondo scala superato (&gt;996).</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                <button
                  onClick={recordReading}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl font-medium transition-colors shadow-sm active:scale-[0.98]"
                >
                  <Save className="w-4 h-4" />
                  Registra Lettura
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel: Visualization & Analytics */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Tabs Navigation */}
            <div className="bg-slate-200/50 p-1 rounded-xl flex flex-wrap items-center gap-1 text-sm font-medium">
              <button 
                onClick={() => setActiveTab('current')} 
                className={cn("flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all min-w-[120px]", activeTab === 'current' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                <LayoutDashboard className="w-4 h-4" /> Istantanea
              </button>
              <button 
                onClick={() => setActiveTab('history')} 
                className={cn("flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all min-w-[120px]", activeTab === 'history' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                <History className="w-4 h-4" /> Storico <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-xs ml-1">{readings.length}</span>
              </button>
              <button 
                onClick={() => setActiveTab('analysis')} 
                className={cn("flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all min-w-[120px]", activeTab === 'analysis' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                <TrendingUp className="w-4 h-4" /> Analisi
              </button>
              <button 
                onClick={() => setActiveTab('converter')} 
                className={cn("flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all min-w-[120px]", activeTab === 'converter' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                <ArrowRightLeft className="w-4 h-4" /> Conversione Program.
              </button>
            </div>

            {/* TAB CONTENT: CURRENT */}
            {activeTab === 'current' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-800 mb-6 flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5 text-indigo-500" />
                    Comparazione Valori Inseriti
                  </h3>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="id" 
                          tickFormatter={(val) => DEVICES.find(d => d.id === val)?.name.split(' ')[0] || val}
                          axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => new Intl.NumberFormat('it-IT', { notation: "compact" }).format(val)} />
                        <RechartsTooltip 
                          cursor={{ fill: '#f8fafc' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-sm border border-slate-700">
                                  <p className="font-medium mb-1">{data.name}</p>
                                  <p className="text-slate-300 font-mono">{formatLux(data.totalLux)} Lux</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="totalLux" radius={[4, 4, 0, 0]} maxBarSize={60} animationDuration={500}>
                          {comparisonData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.id === referenceSource ? DEVICES.find(d=>d.id===entry.id)!.color : '#94a3b8'} opacity={entry.id === referenceSource ? 1 : 0.7}/>
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto p-1">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="px-6 py-4 font-medium">Sensore</th>
                          <th className="px-6 py-4 text-right font-medium">Input</th>
                          <th className="px-6 py-4 text-right font-medium text-slate-900">Lux Calcolati</th>
                          <th className="px-6 py-4 text-right font-medium">Scostamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {comparisonData.map((row) => (
                          <tr key={row.id} className={cn("transition-colors hover:bg-slate-50/50", row.id === referenceSource && "bg-indigo-50/20")}>
                            <td className="px-6 py-3 font-medium text-slate-700 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                              {row.name.split(' ')[0]} <span className="font-normal text-slate-400 hidden sm:inline">{row.name.substring(row.name.indexOf(' '))}</span>
                            </td>
                            <td className="px-6 py-3 text-right text-slate-500 font-mono">
                              {row.state.rawValue || '-'} <span className="text-xs text-slate-300">x{row.multiplier}</span>
                            </td>
                            <td className="px-6 py-3 text-right font-mono font-semibold text-slate-900">
                              {formatLux(row.totalLux)}
                            </td>
                            <td className="px-6 py-3 text-right">
                              {row.id === referenceSource ? (
                                <span className="inline-flex items-center text-indigo-600 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50">
                                  Riferimento
                                </span>
                              ) : (
                                <span className={cn(
                                  "inline-flex items-center font-mono font-medium px-2 py-0.5 rounded text-xs",
                                  row.diffPercent === 0 ? "text-slate-500 bg-slate-100" :
                                  row.diffPercent > 0 ? "text-rose-700 bg-rose-50" : "text-emerald-700 bg-emerald-50"
                                )}>
                                  {row.diffPercent > 0 ? '+' : ''}{row.diffPercent.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT: HISTORY */}
            {activeTab === 'history' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-500" />
                      Andamento nel Tempo
                    </h3>
                    {readings.length > 0 && (
                      <button 
                        onClick={clearAllReadings}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-rose-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Svuota Storico
                      </button>
                    )}
                  </div>
                  {readings.length === 0 ? (
                    <div className="h-[280px] flex items-center justify-center text-slate-400 flex-col gap-2">
                      <History className="w-8 h-8 opacity-50" />
                      <p>Nessuna lettura registrata.</p>
                    </div>
                  ) : (
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={readings} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="timestamp" 
                            tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10}
                          />
                          <YAxis 
                            axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }}
                            tickFormatter={(val) => new Intl.NumberFormat('it-IT', { notation: "compact" }).format(val)}
                          />
                          <RechartsTooltip
                            labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number, name: string) => [formatLux(value) + ' Lux', DEVICES.find(d=>d.id===name)?.name.split(' ')[0]]}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
                          {DEVICES.filter(d => deviceStates[d.id].isActive !== false).map(device => (
                            <Line 
                              key={device.id}
                              type="monotone"
                              dataKey={`data.${device.id}.totalLux`}
                              name={device.id}
                              stroke={device.color}
                              strokeWidth={2}
                              dot={{ r: 4, fill: device.color, strokeWidth: 0 }}
                              activeDot={{ r: 6 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto p-1">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="px-6 py-4 font-medium">Ora</th>
                          {DEVICES.filter(d => deviceStates[d.id].isActive !== false).map(d => (
                            <th key={d.id} className="px-6 py-4 text-right font-medium">
                              {d.name.split(' ')[0]} 
                              {d.id === referenceSource && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[10px] ml-1 uppercase">Rif</span>}
                            </th>
                          ))}
                          <th className="px-6 py-4 w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {readings.slice().reverse().map((r) => (
                          <tr key={r.id} className="transition-colors hover:bg-slate-50/50 group">
                            <td className="px-6 py-3 font-medium text-slate-700">
                              {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            {DEVICES.filter(d => deviceStates[d.id].isActive !== false).map(d => {
                              const val = r.data[d.id]?.totalLux;
                              const isRef = d.id === referenceSource;
                              const refVal = r.data[referenceSource]?.totalLux;
                              let diffText = '';
                              if (!isRef && val && refVal) {
                                const diff = ((val - refVal) / refVal) * 100;
                                diffText = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
                              }

                              return (
                                <td key={d.id} className="px-6 py-3 text-right">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className={cn("font-mono font-medium", isRef ? "text-indigo-600" : "text-slate-700")}>
                                      {val ? formatLux(val) : '-'}
                                    </span>
                                    {!isRef && val > 0 && refVal > 0 && (
                                      <span className={cn("text-[10px] font-mono", diffText.startsWith('+') ? "text-rose-500" : "text-emerald-500")}>
                                        {diffText}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-6 py-3 text-right">
                              <button
                                onClick={() => deleteReading(r.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Elimina lettura"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {readings.length === 0 && (
                          <tr>
                            <td colSpan={DEVICES.length + 2} className="px-6 py-8 text-center text-slate-400">
                              Nessun dato registrato. Aggiungi una lettura dal pannello laterale.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT: ANALYSIS */}
            {activeTab === 'analysis' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-indigo-500" />
                        Analisi Divergenza Lineare
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Verifica se l'errore del sensore è costante (gap fisso) o proporzionale.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                      <span className="text-sm text-slate-500">Analizza</span>
                      <select
                        value={analysisDevice}
                        onChange={(e) => setAnalysisDevice(e.target.value as DeviceId)}
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-sm font-medium outline-none"
                      >
                        {DEVICES.filter(d => d.id !== referenceSource && deviceStates[d.id].isActive !== false).map(d => (
                          <option key={d.id} value={d.id}>{d.name.split(' ')[0]}</option>
                        ))}
                      </select>
                      <span className="text-sm text-slate-500">rispetto a</span>
                      <span className="text-sm font-medium text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                        {DEVICES.find(d => d.id === referenceSource)?.name.split(' ')[0]}
                      </span>
                    </div>
                  </div>

                  {readings.filter(r => r.data[analysisDevice]?.totalLux > 0 && r.data[referenceSource]?.totalLux > 0).length < 2 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-500 border border-slate-100 border-dashed">
                      <Calculator className="w-8 h-8 opacity-20 mx-auto mb-3" />
                      <p>Servono almeno 2 letture con valori per entrambi i sensori per calcolare l'andamento.</p>
                    </div>
                  ) : trendData ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50 p-6 flex flex-col justify-center">
                        <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">Risultati Regressione</h4>
                        
                        <div className="space-y-4">
                          <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                            <span className="text-sm text-slate-500">Fattore di Scala (Moltiplicatore)</span>
                            <span className="font-mono font-medium text-indigo-700">{trendData.slope.toFixed(3)}x</span>
                          </div>
                          
                          <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                            <span className="text-sm text-slate-500">Offset (Gap fisso in Lux)</span>
                            <span className="font-mono font-medium text-indigo-700">
                              {trendData.intercept > 0 ? '+' : ''}{formatLux(trendData.intercept)}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                            <span className="text-sm text-slate-500">Indice di Linearità (R²)</span>
                            <span className={cn("font-mono font-medium", trendData.rSquared > 0.9 ? "text-emerald-600" : trendData.rSquared > 0.7 ? "text-amber-600" : "text-rose-600")}>
                              {(trendData.rSquared * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-900 leading-relaxed">
                          <strong>Diagnosi: </strong>
                          {trendData.rSquared < 0.8 ? (
                            "Le letture hanno una deviazione molto variabile e imprevedibile rispetto al riferimento."
                          ) : Math.abs(trendData.slope - 1) < 0.05 ? (
                            `L'errore è prevalentemente lineare. Il sensore legge in modo allineato, con uno scostamento fisso di circa ${Math.round(trendData.intercept)} Lux.`
                          ) : (
                            `L'errore è proporzionale. Il sensore legge mediamente il ${Math.round(trendData.slope * 100)}% del riferimento reale, con un offset di ${Math.round(trendData.intercept)} Lux.`
                          )}
                          <br/><br/>
                          <strong>Calcolo Correzione Reale:</strong><br/>
                          <span className="font-mono text-indigo-700">Valore Reale ≈ (Sensore - {Math.round(trendData.intercept)}) / {trendData.slope.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                              type="number" 
                              dataKey="x" 
                              name="Riferimento" 
                              unit=" Lx" 
                              tick={{ fill: '#64748b', fontSize: 12 }}
                              tickFormatter={(val) => new Intl.NumberFormat('it-IT', { notation: "compact" }).format(val)}
                              domain={['dataMin - 100', 'dataMax + 100']}
                              label={{ value: 'Lux Riferimento', position: 'bottom', fill: '#94a3b8', fontSize: 12 }}
                            />
                            <YAxis 
                              type="number" 
                              dataKey="y" 
                              name="Sensore" 
                              unit=" Lx" 
                              tick={{ fill: '#64748b', fontSize: 12 }}
                              tickFormatter={(val) => new Intl.NumberFormat('it-IT', { notation: "compact" }).format(val)}
                              domain={['auto', 'auto']}
                              label={{ value: 'Lux Sensore', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                            />
                            <ZAxis range={[40, 40]} />
                            <RechartsTooltip 
                              cursor={{ strokeDasharray: '3 3' }} 
                              formatter={(value: number, name: string) => [formatLux(value) + ' Lux', name]}
                              labelFormatter={() => ''}
                            />
                            
                            {/* Trendline */}
                            <Line 
                              data={trendData.trendlinePoints} 
                              dataKey="y" 
                              stroke="#6366f1" 
                              strokeWidth={2} 
                              dot={false}
                              activeDot={false}
                              legendType="none"
                              tooltipType="none"
                              strokeDasharray="4 4"
                            />

                            {/* Scatter Points */}
                            <Scatter 
                              name="Letture" 
                              data={trendData.points} 
                              fill={DEVICES.find(d => d.id === analysisDevice)?.color || '#3b82f6'} 
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : null}

                  {trendData && (
                    <div className="mt-8 border-t border-slate-200 pt-8">
                      <h4 className="flex items-center gap-2 font-semibold text-slate-800 mb-4">
                        <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
                        Calcolatore di Conversione Lux (basato sul trend calcolato)
                      </h4>
                      <div className="flex flex-col md:flex-row gap-6 items-start rounded-xl p-6 bg-slate-50 border border-slate-100">
                        <div className="flex-1 w-full space-y-4">
                           <div className="flex flex-wrap bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-max gap-1">
                             <button onClick={() => setCalcDirection('toRef')} className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", calcDirection === 'toRef' ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-700")}>
                               Da {DEVICES.find(d => d.id === analysisDevice)?.name.split(' ')[0]} a Riferimento
                             </button>
                             <button onClick={() => setCalcDirection('toDev')} className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", calcDirection === 'toDev' ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-700")}>
                               Da Riferimento a {DEVICES.find(d => d.id === analysisDevice)?.name.split(' ')[0]}
                             </button>
                           </div>

                           <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1.5">
                               {calcDirection === 'toRef' 
                                 ? `Se il sensore ${DEVICES.find(d => d.id === analysisDevice)?.name.split(' ')[0]} legge:`
                                 : `Se il riferimento (${DEVICES.find(d => d.id === referenceSource)?.name.split(' ')[0]}) legge:`
                               }
                             </label>
                             <div className="relative max-w-xs">
                               <input 
                                 type="number"
                                 value={calcInput}
                                 onChange={(e) => setCalcInput(e.target.value)}
                                 placeholder="Es. 10000"
                                 className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                               />
                               <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Lux</span>
                             </div>
                           </div>
                        </div>

                        <div className="md:w-64 w-full bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-center">
                          <p className="text-sm text-slate-500 mb-2">
                            Il valore {calcDirection === 'toRef' ? 'reale' : 'del sensore'} corrisponde a:
                          </p>
                          <div className={cn("text-3xl font-mono font-semibold", calcInput && !isNaN(parseFloat(calcInput)) ? "text-indigo-700" : "text-slate-300")}>
                            {calcInput && !isNaN(parseFloat(calcInput)) ? (
                              calcDirection === 'toRef' 
                                ? formatLux((parseFloat(calcInput) - trendData.intercept) / trendData.slope)
                                : formatLux((parseFloat(calcInput) * trendData.slope) + trendData.intercept)
                            ) : '0'} <span className="text-lg text-slate-400 font-sans">Lux</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* TAB CONTENT: CONVERTER */}
            {activeTab === 'converter' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                
                {computedConverter.anomalyMessage && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-start gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-sm font-medium">{computedConverter.anomalyMessage}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Left: Agricontrol Input */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-6">
                    <div>
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
                        Programmazione Agricontrol
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Inserisci i parametri attuali della centralina (Agrineb/Fog).
                      </p>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">P2 (Pausa Massima)</label>
                        <div className="relative">
                          <input type="number" value={agriConfig.p2} onChange={e => setAgriConfig({...agriConfig, p2: e.target.value})} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">min</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">PM (Pausa Minima)</label>
                          <div className="relative">
                            <input type="number" value={agriConfig.pmMin} onChange={e => setAgriConfig({...agriConfig, pmMin: e.target.value})} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">min</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">&nbsp;</label>
                          <div className="relative">
                            <input type="number" value={agriConfig.pmSec} onChange={e => setAgriConfig({...agriConfig, pmSec: e.target.value})} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">sec</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">L.not (Soglia Inizio Notte)</label>
                        <div className="relative">
                          <input type="number" value={agriConfig.lnot} onChange={e => setAgriConfig({...agriConfig, lnot: e.target.value})} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Lux</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">d (Durata bagnatura)</label>
                        <div className="relative">
                          <input type="number" value={agriConfig.d} onChange={e => setAgriConfig({...agriConfig, d: e.target.value})} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">sec</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Numero di Finestre</label>
                        <div className="relative">
                          <input type="number" value={agriConfig.numWindows || '4'} onChange={e => setAgriConfig({...agriConfig, numWindows: e.target.value})} min="2" max="20" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: OmniGreen Output */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-6">
                    <div>
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        Configurazione OmniGreen
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Copia questi valori nella "Regola Impianto".
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-slate-200 gap-4">
                        <span className="text-sm font-medium text-slate-600">Intervallo massimo somma soglia:</span>
                        <span className="font-mono font-semibold text-slate-900">{computedConverter.intervalloMassimo} min</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-slate-200 gap-4">
                        <span className="text-sm font-medium text-slate-600">Limite somma soglia:</span>
                        <span className="font-mono font-semibold text-slate-900">{computedConverter.limiteSommaSoglia}</span>
                      </div>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-sm font-medium text-slate-600">Durata Azione (Apri stazione):</span>
                        <span className="font-mono font-semibold text-slate-900">{computedConverter.d} sec</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">Tabella Finestre (Punti/Frequenza)</h4>
                      <div className="overflow-hidden border border-slate-200 rounded-xl">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 font-medium text-slate-600">Da (Lux)</th>
                              <th className="px-3 py-2 font-medium text-slate-600">A (Lux)</th>
                              <th className="px-3 py-2 text-right font-medium text-slate-600 border-l border-slate-200" title="Target pausa derivata">Pausa</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-700 font-semibold bg-indigo-50/50">+1 Punto (Freq)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {computedConverter.windows.length === 0 ? (
                              <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500 bg-slate-50/50 italic">Compila tutti i campi correttamente per calcolare le finestre. (Assicurati che P2 sia maggiore di PM)</td></tr>
                            ) : computedConverter.windows.map((w, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-3 py-2 font-mono text-slate-600">{formatLux(w.startLux)}</td>
                                <td className="px-3 py-2 font-mono text-slate-600">{formatLux(w.endLux)}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-400 border-l border-slate-100">{w.targetPause}m</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-indigo-700 bg-indigo-50/30">
                                  {w.frequenza} min
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 p-3 rounded-xl flex flex-col gap-2 mt-auto">
                      <p className="font-medium text-blue-800 flex items-center gap-1.5"><Info className="w-3.5 h-3.5"/> Note Informative</p>
                      <p className="leading-relaxed">• L'<b>Intervallo massimo</b> garantisce l'irrigazione di sicurezza anche quando rimane poca luce (ma superiore alla soglia L.not).</p>
                      <p className="leading-relaxed">• Se i Lux scendono sotto la soglia <b>L.not</b> impostata, la regola base si ferma (ed entra in gioco l'eventuale programmazione notturna separata).</p>
                    </div>

                  </div>
                </div>
              </motion.div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
