import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  FileCode,
  PlusCircle,
  Trash2,
  Layers,
  ChevronRight,
  ShieldAlert,
  HardDrive,
  Globe,
  Binary,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  ExternalLink,
  Cpu,
  Clock,
  Sparkles,
  Link as LinkIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { TargetInfo, TargetReadinessReport } from '../../shared/ipc';

export const TARGET_TYPE_OPTIONS = [
  { value: 'javascript_electron', label: 'JavaScript/Electron' },
  { value: 'javascript_bundle', label: 'JavaScript Bundle' },
  { value: 'native_pe', label: 'Windows PE Binary' },
  { value: 'dotnet_assembly', label: '.NET Assembly' },
  { value: 'native_elf', label: 'Linux ELF Binary' },
  { value: 'native_macho', label: 'macOS Mach-O Binary' },
  { value: 'android_apk', label: 'Android APK' },
  { value: 'packet_capture', label: 'Packet Capture (PCAP)' },
  { value: 'web_archive', label: 'Web Archive (HAR/SAZ)' },
  { value: 'sqlite_database', label: 'SQLite Database' },
  { value: 'firmware_image', label: 'Firmware Image' },
  { value: 'url', label: 'Web Target / URL' },
  { value: 'unknown', label: 'Generic Target' },
];

export const NATIVE_PROVIDERS = [
  { value: 'auto', label: 'Auto-detect Provider' },
  { value: 'ghidra', label: 'Ghidra Headless' },
  { value: 'hopper', label: 'Hopper Disassembler' },
  { value: 'ida', label: 'IDA Pro' },
  { value: 'rizin', label: 'Rizin / Cutter' },
  { value: 'objdump', label: 'objdump (GNU / LLVM)' },
];

interface RecentTarget {
  path: string;
  name: string;
  targetType: string;
  displayType: string;
  timestamp: string;
}

export const TargetsPane: React.FC = () => {
  const {
    sessions,
    activeSession,
    setSessions,
    setActiveSession,
    setIsLoadingSession,
    setIsSettingsOpen,
  } = useAppStore();

  const [currentTarget, setCurrentTarget] = useState<TargetInfo | null>(null);
  const [selectedTypeOverride, setSelectedTypeOverride] = useState<string>('');
  const [nativeProvider, setNativeProvider] = useState<string>(() => {
    return localStorage.getItem('rea_native_provider') || 'auto';
  });
  const [readiness, setReadiness] = useState<TargetReadinessReport | null>(null);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState<boolean>(false);
  const [recentTargets, setRecentTargets] = useState<RecentTarget[]>(() => {
    try {
      const saved = localStorage.getItem('rea_recent_targets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [urlInput, setUrlInput] = useState('');
  const [isUrlInputVisible, setIsUrlInputVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync activeSession target to currentTarget if empty
  useEffect(() => {
    if (activeSession && !currentTarget) {
      setCurrentTarget(activeSession.target);
      setSelectedTypeOverride(activeSession.target.targetType);
      if (activeSession.provider) {
        setNativeProvider(activeSession.provider);
      }
    }
  }, [activeSession, currentTarget]);

  // Save native provider selection
  const handleProviderChange = (newProvider: string) => {
    setNativeProvider(newProvider);
    localStorage.setItem('rea_native_provider', newProvider);
  };

  // Determine effective target type
  const effectiveType =
    selectedTypeOverride || currentTarget?.targetType || 'unknown';

  // Fetch readiness whenever currentTarget or effectiveType changes
  useEffect(() => {
    if (!currentTarget) {
      setReadiness(null);
      return;
    }

    let isCancelled = false;
    setIsLoadingReadiness(true);

    window.api.target
      .getReadiness({
        targetType: effectiveType,
        targetPath: currentTarget.path,
      })
      .then((res) => {
        if (!isCancelled && res.ok) {
          setReadiness(res.data);
        }
      })
      .catch((err) => {
        console.error('Failed to load readiness:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingReadiness(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTarget, effectiveType]);

  const addRecentTarget = (target: TargetInfo, targetType: string) => {
    const display =
      TARGET_TYPE_OPTIONS.find((t) => t.value === targetType)?.label ||
      target.displayType ||
      targetType;
    const newEntry: RecentTarget = {
      path: target.path,
      name: target.name,
      targetType,
      displayType: display,
      timestamp: new Date().toISOString(),
    };
    const updated = [
      newEntry,
      ...recentTargets.filter((r) => r.path !== target.path),
    ].slice(0, 10);
    setRecentTargets(updated);
    localStorage.setItem('rea_recent_targets', JSON.stringify(updated));
  };

  const removeRecentTarget = (e: React.MouseEvent, pathToRemove: string) => {
    e.stopPropagation();
    const updated = recentTargets.filter((r) => r.path !== pathToRemove);
    setRecentTargets(updated);
    localStorage.setItem('rea_recent_targets', JSON.stringify(updated));
  };

  const handlePickFile = async () => {
    try {
      setErrorMessage(null);
      const res = await window.api.target.pickFile();
      if (res.ok && res.data) {
        setCurrentTarget(res.data);
        setSelectedTypeOverride(res.data.targetType);
        addRecentTarget(res.data, res.data.targetType);
      } else if (!res.ok) {
        setErrorMessage(res.error);
      }
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  const handlePickDirectory = async () => {
    try {
      setErrorMessage(null);
      const res = await window.api.target.pickDirectory();
      if (res.ok && res.data) {
        setCurrentTarget(res.data);
        setSelectedTypeOverride(res.data.targetType);
        addRecentTarget(res.data, res.data.targetType);
      } else if (!res.ok) {
        setErrorMessage(res.error);
      }
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  const handleAddUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setErrorMessage('Please enter a valid URL starting with http:// or https://');
      return;
    }
    setErrorMessage(null);
    try {
      const res = await window.api.target.validate({ path: trimmed });
      if (res.ok && res.data) {
        setCurrentTarget(res.data);
        setSelectedTypeOverride('url');
        addRecentTarget(res.data, 'url');
        setUrlInput('');
        setIsUrlInputVisible(false);
      } else if (!res.ok) {
        setErrorMessage(res.error);
      }
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMessage(null);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const targetPath = (file as unknown as { path?: string }).path || file.name;
      try {
        const valRes = await window.api.target.validate({ path: targetPath });
        if (valRes.ok && valRes.data) {
          setCurrentTarget(valRes.data);
          setSelectedTypeOverride(valRes.data.targetType);
          addRecentTarget(valRes.data, valRes.data.targetType);
        } else if (!valRes.ok) {
          setErrorMessage(valRes.error);
        }
      } catch (err) {
        setErrorMessage(String(err));
      }
    }
  };

  const handleStartInvestigation = async () => {
    if (!currentTarget) return;
    setIsLoadingSession(true);
    setErrorMessage(null);
    try {
      const isNative =
        effectiveType === 'native_pe' ||
        effectiveType === 'native_elf' ||
        effectiveType === 'native_macho' ||
        effectiveType === 'dotnet_assembly' ||
        effectiveType === 'unknown';

      const res = await window.api.session.create({
        targetPath: currentTarget.path,
        targetName: currentTarget.name,
        targetType: effectiveType,
        provider: isNative ? nativeProvider : undefined,
      });

      if (res.ok) {
        setActiveSession(res.data);
        const listRes = await window.api.session.list();
        if (listRes.ok) {
          setSessions(listRes.data);
        }
      } else {
        setErrorMessage(res.error);
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleSelectRecent = async (recent: RecentTarget) => {
    try {
      const valRes = await window.api.target.validate({ path: recent.path });
      if (valRes.ok && valRes.data) {
        setCurrentTarget(valRes.data);
        setSelectedTypeOverride(recent.targetType || valRes.data.targetType);
      } else {
        setCurrentTarget({
          path: recent.path,
          name: recent.name,
          isDirectory: false,
          targetType: recent.targetType,
          exists: true,
          displayType: recent.displayType,
        });
        setSelectedTypeOverride(recent.targetType);
      }
    } catch {
      // fallback
      setCurrentTarget({
        path: recent.path,
        name: recent.name,
        isDirectory: false,
        targetType: recent.targetType,
        exists: true,
        displayType: recent.displayType,
      });
      setSelectedTypeOverride(recent.targetType);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setIsLoadingSession(true);
    try {
      const res = await window.api.session.get({ sessionId });
      if (res.ok && res.data) {
        setActiveSession(res.data);
        setCurrentTarget(res.data.target);
        setSelectedTypeOverride(res.data.target.targetType);
        if (res.data.provider) {
          setNativeProvider(res.data.provider);
        }
      }
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const res = await window.api.session.delete({ sessionId });
    if (res.ok) {
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
      }
      const listRes = await window.api.session.list();
      if (listRes.ok) {
        setSessions(listRes.data);
      }
    }
  };

  const openDocLink = (url?: string) => {
    if (url && window.api?.system?.openExternal) {
      window.api.system.openExternal(url);
    }
  };

  const isNativeType =
    effectiveType === 'native_pe' ||
    effectiveType === 'native_elf' ||
    effectiveType === 'native_macho' ||
    effectiveType === 'dotnet_assembly' ||
    effectiveType === 'unknown';

  const getTypeBadgeClass = (type: string) => {
    if (type.includes('electron')) return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    if (type.includes('apk')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (type.includes('pe') || type.includes('dotnet')) return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    if (type.includes('elf') || type.includes('macho') || type.includes('native')) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    if (type.includes('url')) return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    if (type.includes('pcap')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
  };

  const getTargetIcon = (type: string) => {
    if (type.includes('apk') || type.includes('app')) return <HardDrive className="w-4 h-4 text-emerald-400" />;
    if (type.includes('pe') || type.includes('elf') || type.includes('macho') || type.includes('native'))
      return <Binary className="w-4 h-4 text-purple-400" />;
    if (type.includes('url')) return <Globe className="w-4 h-4 text-indigo-400" />;
    return <FileCode className="w-4 h-4 text-cyan-400" />;
  };

  return (
    <aside
      data-testid="targets-pane"
      className="w-84 border-r border-slate-800 bg-slate-900/90 flex flex-col h-full select-none overflow-hidden"
    >
      {/* App Branding Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white">REA Studio</h1>
            <p className="text-[11px] text-slate-400 font-medium">Reverse Engineer Anything</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          data-testid="open-settings-btn"
          className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          title="Open Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {/* Target Ingestion Section */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Add Target
            </span>
            <button
              onClick={() => setIsUrlInputVisible(!isUrlInputVisible)}
              className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
            >
              <LinkIcon className="w-3 h-3" />
              <span>{isUrlInputVisible ? 'Close URL' : 'Paste URL'}</span>
            </button>
          </div>

          {/* URL Input Form */}
          {isUrlInputVisible && (
            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-indigo-500/30 space-y-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                placeholder="https://example.com/target"
                className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleAddUrl}
                className="w-full py-1.5 px-3 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition flex items-center justify-center space-x-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Load Web Target</span>
              </button>
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-all duration-200 cursor-pointer ${
              isDragging
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40'
            }`}
          >
            <div className="w-9 h-9 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-300 mb-2">
              <PlusCircle className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-xs font-medium text-slate-200">Drag & drop target here</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Electron app, ASAR, binary, APK, HAR, PCAP</p>
          </div>

          {/* File & Folder Pick Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePickFile}
              className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-xs font-medium text-slate-200 border border-slate-700/60 transition shadow-sm"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>Open File</span>
            </button>
            <button
              onClick={handlePickDirectory}
              className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-xs font-medium text-slate-200 border border-slate-700/60 transition shadow-sm"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Open Folder</span>
            </button>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2 text-rose-300 text-xs">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <span className="break-all">{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Selected Active Target & Pre-Flight Card */}
        {currentTarget && (
          <div className="p-4 space-y-3.5 bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Active Target</span>
              </span>
              <button
                onClick={() => setCurrentTarget(null)}
                className="text-[10px] text-slate-500 hover:text-slate-300"
                title="Clear current target"
              >
                Clear
              </button>
            </div>

            {/* Target Details Card */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-white truncate" title={currentTarget.name}>
                    {currentTarget.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5 font-mono" title={currentTarget.path}>
                    {currentTarget.path}
                  </div>
                </div>
                <div
                  data-testid="target-type-badge"
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${getTypeBadgeClass(
                    effectiveType
                  )}`}
                >
                  {TARGET_TYPE_OPTIONS.find((t) => t.value === effectiveType)?.label ||
                    currentTarget.displayType ||
                    effectiveType}
                </div>
              </div>

              {/* Type Override Dropdown */}
              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <label htmlFor="target-type-override" className="text-[10px] font-medium text-slate-400 block">
                  Target Type Override
                </label>
                <select
                  id="target-type-override"
                  data-testid="type-override-select"
                  value={effectiveType}
                  onChange={(e) => setSelectedTypeOverride(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {TARGET_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Native Provider Selector (if applicable) */}
              {isNativeType && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium text-slate-400 flex items-center space-x-1">
                      <Cpu className="w-3 h-3 text-purple-400" />
                      <span>Decompiler Provider</span>
                    </span>
                    <span className="text-slate-500 text-[9px]">Persisted</span>
                  </div>
                  <select
                    data-testid="provider-select"
                    value={nativeProvider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {NATIVE_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Pre-Flight Readiness Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
                  <span>Pre-Flight Readiness</span>
                  {readiness && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                        readiness.isReady
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {readiness.isReady ? 'READY' : 'ACTION REQUIRED'}
                    </span>
                  )}
                </span>
                <span className="text-[9px] text-slate-500">best effort probe</span>
              </div>

              {isLoadingReadiness ? (
                <div className="p-3 text-center text-xs text-slate-500 animate-pulse">
                  Probing environment prerequisites...
                </div>
              ) : readiness ? (
                <div className="space-y-1.5">
                  {readiness.checks.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-lg border text-xs transition ${
                        item.status === 'passed'
                          ? 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                          : item.status === 'failed'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      }`}
                    >
                      <div className="flex items-start space-x-2">
                        {item.status === 'passed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : item.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[11px] text-slate-100">{item.name}</div>
                          {item.detail && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{item.detail}</div>
                          )}

                          {/* Fix Hint & REA Doc Link */}
                          {item.fixHint && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 text-[10px] text-slate-300 space-y-1">
                              <div>💡 {item.fixHint}</div>
                              {item.docUrl && (
                                <button
                                  onClick={() => openDocLink(item.docUrl)}
                                  className="inline-flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 font-medium"
                                >
                                  <span>View REA Documentation</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Start Investigation Button */}
            <button
              data-testid="start-investigation-btn"
              onClick={handleStartInvestigation}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs shadow-lg shadow-indigo-500/25 transition flex items-center justify-center space-x-2 active:scale-[0.99]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Investigation</span>
            </button>
          </div>
        )}

        {/* Recent Targets Section */}
        {recentTargets.length > 0 && (
          <div className="p-3">
            <div className="flex items-center justify-between px-1 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Recent Targets</span>
              </span>
              <span className="text-slate-500 text-[10px]">{recentTargets.length}</span>
            </div>

            <div className="space-y-1 mt-1">
              {recentTargets.map((rec) => (
                <div
                  key={rec.path}
                  onClick={() => handleSelectRecent(rec)}
                  className={`group flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition border ${
                    currentTarget?.path === rec.path
                      ? 'bg-slate-800/90 border-slate-700 text-white shadow-sm'
                      : 'border-transparent hover:bg-slate-800/50 text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="p-1 rounded bg-slate-900 border border-slate-800">
                      {getTargetIcon(rec.targetType)}
                    </div>
                    <div className="truncate">
                      <div className="truncate font-medium text-[11px]">{rec.name}</div>
                      <div className="text-[9px] text-slate-500 truncate">{rec.displayType}</div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => removeRecentTarget(e, rec.path)}
                    className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition"
                    title="Remove from recents"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Existing Investigation Sessions */}
        <div className="p-3 pb-6">
          <div className="flex items-center justify-between px-1 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <span>Investigation Sessions</span>
            <span className="text-slate-500 text-[10px]">{sessions.length}</span>
          </div>

          <div className="space-y-1 mt-1">
            {sessions.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No active sessions.<br />Select a target to begin.
              </div>
            ) : (
              sessions.map((sess) => {
                const isActive = activeSession?.id === sess.id;
                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSelectSession(sess.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition border ${
                      isActive
                        ? 'bg-indigo-600/15 border-indigo-500/40 text-white font-medium shadow-sm'
                        : 'border-transparent hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="p-1.5 rounded-md bg-slate-800 border border-slate-700/50">
                        {getTargetIcon(sess.targetType)}
                      </div>
                      <div className="truncate">
                        <div className="truncate font-medium">{sess.targetName}</div>
                        <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                          <span className="capitalize">{sess.targetType.replace('_', ' ')}</span>
                          <span>•</span>
                          <span>{sess.messageCount} msgs</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDeleteSession(e, sess.id)}
                        className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition"
                        title="Delete Session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
