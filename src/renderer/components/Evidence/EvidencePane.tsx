import React, { useState, useMemo } from 'react';
import {
  FileText,
  Download,
  Settings,
  Search,
  Star,
  CheckCircle,
  FileCode,
  Shield,
  HelpCircle,
  Code2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { extractSessionEvidence, type EvidenceCategory, type EvidenceItem } from '../../lib/evidenceParser';
import { generateMarkdownReport } from '../../lib/reportGenerator';
import { EvidenceCard } from './EvidenceCard';

type FilterTab = 'all' | 'pinned' | 'findings' | 'references' | 'unknowns';

export const EvidencePane: React.FC = () => {
  const { activeSession, setIsSettingsOpen, hasApiKey, systemInfo } = useAppStore();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('rea_pinned_evidence');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  // Extract all evidence from activeSession tool calls
  const allEvidence = useMemo(() => {
    if (!activeSession) return [];
    return extractSessionEvidence(activeSession);
  }, [activeSession]);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem('rea_pinned_evidence', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const jumpToToolCall = (toolCallId: string) => {
    const el = document.getElementById(`tool-call-${toolCallId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-indigo-500');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-indigo-500');
      }, 2000);
    }
  };

  // Group counts
  const findingsCount = allEvidence.filter((e) => e.category === 'finding').length;
  const referencesCount = allEvidence.filter((e) => e.category === 'reference').length;
  const unknownsCount = allEvidence.filter((e) => e.category === 'unknown_limitation').length;
  const pinnedCount = allEvidence.filter((e) => pinnedIds.has(e.id)).length;

  // Filtered evidence items
  const filteredEvidence = useMemo(() => {
    let items = allEvidence;

    // Filter by tab
    if (activeTab === 'pinned') {
      items = items.filter((e) => pinnedIds.has(e.id));
    } else if (activeTab === 'findings') {
      items = items.filter((e) => e.category === 'finding');
    } else if (activeTab === 'references') {
      items = items.filter((e) => e.category === 'reference');
    } else if (activeTab === 'unknowns') {
      items = items.filter((e) => e.category === 'unknown_limitation');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((e) => {
        const inTitle = e.title.toLowerCase().includes(q);
        const inDesc = e.description?.toLowerCase().includes(q) ?? false;
        const inTool = e.sourceTool.toLowerCase().includes(q);
        const inLoc =
          (e.location?.file?.toLowerCase().includes(q) ?? false) ||
          (e.location?.function?.toLowerCase().includes(q) ?? false) ||
          (e.location?.address?.toLowerCase().includes(q) ?? false);
        const inCode = e.snippet?.code.toLowerCase().includes(q) ?? false;
        return inTitle || inDesc || inTool || inLoc || inCode;
      });
    }

    // Sort pinned items to the top
    return [...items].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedIds.has(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });
  }, [allEvidence, activeTab, searchQuery, pinnedIds]);

  // Export Markdown Report
  const handleExportMarkdown = async () => {
    if (!activeSession) return;
    setIsExporting(true);
    setExportStatus('Generating report...');
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const defaultFileName = `REA_Report_${activeSession.target.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.md`;

      const markdown = generateMarkdownReport(activeSession, allEvidence, {
        reaVersion: systemInfo?.reaVersion ?? '6.7.0',
        nodeVersion: systemInfo?.nodeVersion,
        platform: systemInfo?.platform,
        arch: systemInfo?.arch,
        provider: activeSession.provider,
      });

      const res = await window.api.export.saveReport({
        sessionId: activeSession.id,
        markdown,
        defaultFileName,
      });

      if (res.ok && res.data.savedPath) {
        setExportStatus(`Report saved to ${res.data.savedPath}`);
      } else {
        setExportStatus(null);
      }
    } catch (err) {
      setExportStatus(`Export failed: ${String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Export Session JSON for Debugging
  const handleExportJson = async () => {
    if (!activeSession) return;
    setIsExporting(true);
    setExportStatus('Exporting session JSON...');
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const defaultFileName = `REA_Session_${activeSession.target.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.json`;

      const jsonContent = JSON.stringify(activeSession, null, 2);

      const res = await window.api.export.saveSessionJson({
        sessionId: activeSession.id,
        jsonContent,
        defaultFileName,
      });

      if (res.ok && res.data.savedPath) {
        setExportStatus(`Session JSON saved to ${res.data.savedPath}`);
      } else {
        setExportStatus(null);
      }
    } catch (err) {
      setExportStatus(`Export JSON failed: ${String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <aside
      data-testid="evidence-pane"
      className="w-96 border-l border-slate-800 bg-slate-900/90 flex flex-col h-full select-none overflow-hidden"
    >
      {/* Pane Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Evidence & Findings
          </h2>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-indigo-300">
            {allEvidence.length}
          </span>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Target & Environment Collapsible Summary */}
      {activeSession && (
        <div className="border-b border-slate-800/80 bg-slate-950/40">
          <button
            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <div className="flex items-center space-x-2 truncate">
              <span className="font-semibold text-slate-200 truncate">{activeSession.target.name}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                {activeSession.target.targetType}
              </span>
            </div>
            {isDetailsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {isDetailsExpanded && (
            <div className="px-4 pb-3 pt-1 space-y-2 text-[11px] text-slate-400 border-t border-slate-800/40">
              <div className="flex justify-between items-center">
                <span>Path:</span>
                <span className="font-mono text-slate-300 truncate max-w-[200px]" title={activeSession.target.path}>
                  {activeSession.target.path}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Size:</span>
                <span className="font-mono text-slate-300">{formatBytes(activeSession.target.size)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Provider:</span>
                <span className="font-mono text-indigo-300">{activeSession.provider || 'auto'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>REA MCP Server:</span>
                <span className="font-mono text-emerald-400">v{systemInfo?.reaVersion ?? '6.7.0'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Bar & Group Filter Tabs */}
      <div className="p-3 border-b border-slate-800/80 space-y-2.5">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            data-testid="evidence-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search findings, locations, code..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 text-[11px]">
          <button
            data-testid="tab-all"
            onClick={() => setActiveTab('all')}
            className={`px-2 py-1 rounded-md transition whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            All ({allEvidence.length})
          </button>
          <button
            data-testid="tab-findings"
            onClick={() => setActiveTab('findings')}
            className={`px-2 py-1 rounded-md transition whitespace-nowrap ${
              activeTab === 'findings'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Findings ({findingsCount})
          </button>
          <button
            data-testid="tab-references"
            onClick={() => setActiveTab('references')}
            className={`px-2 py-1 rounded-md transition whitespace-nowrap ${
              activeTab === 'references'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            References ({referencesCount})
          </button>
          <button
            data-testid="tab-unknowns"
            onClick={() => setActiveTab('unknowns')}
            className={`px-2 py-1 rounded-md transition whitespace-nowrap ${
              activeTab === 'unknowns'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Unknowns ({unknownsCount})
          </button>
          {pinnedCount > 0 && (
            <button
              data-testid="tab-pinned"
              onClick={() => setActiveTab('pinned')}
              className={`px-2 py-1 rounded-md transition whitespace-nowrap flex items-center space-x-1 ${
                activeTab === 'pinned'
                  ? 'bg-amber-500 text-slate-950 font-medium'
                  : 'text-amber-400 hover:bg-slate-800/60'
              }`}
            >
              <Star className="w-3 h-3 fill-current" />
              <span>Pinned ({pinnedCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Evidence Items Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredEvidence.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-500">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-slate-400">
              {allEvidence.length === 0
                ? 'No evidence captured yet'
                : 'No matching evidence found'}
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              {allEvidence.length === 0
                ? 'Ask the agent to investigate your target. Findings, decompiled code, and unknowns will populate here automatically.'
                : 'Try adjusting your search query or switching category filters.'}
            </p>
          </div>
        ) : (
          <>
            {filteredEvidence.slice(0, visibleCount).map((item) => (
              <EvidenceCard
                key={item.id}
                item={item}
                isPinned={pinnedIds.has(item.id)}
                onTogglePin={togglePin}
                onJumpToToolCall={jumpToToolCall}
              />
            ))}
            {filteredEvidence.length > visibleCount && (
              <div className="pt-2 pb-1 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 50)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition border border-slate-700"
                >
                  Load more evidence (showing {Math.min(visibleCount, filteredEvidence.length)} of {filteredEvidence.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Export Section Footer */}
      {activeSession && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              data-testid="export-markdown-btn"
              onClick={handleExportMarkdown}
              disabled={isExporting}
              className="py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Report</span>
            </button>

            <button
              data-testid="export-json-btn"
              onClick={handleExportJson}
              disabled={isExporting}
              className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center space-x-1.5 border border-slate-700/80 transition disabled:opacity-50"
            >
              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export JSON</span>
            </button>
          </div>

          {exportStatus && (
            <p className="text-[10px] text-indigo-300 bg-indigo-950/40 border border-indigo-900/60 p-1.5 rounded truncate">
              {exportStatus}
            </p>
          )}
        </div>
      )}
    </aside>
  );
};
