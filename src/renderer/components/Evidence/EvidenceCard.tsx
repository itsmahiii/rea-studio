import React, { useState } from 'react';
import {
  Star,
  Copy,
  Check,
  ExternalLink,
  MapPin,
  AlertTriangle,
  Info,
  Code2,
  FileText,
  Search,
} from 'lucide-react';
import type { EvidenceItem } from '../../lib/evidenceParser';
import { CodeSnippetViewer } from './CodeSnippetViewer';

interface EvidenceCardProps {
  item: EvidenceItem;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  onJumpToToolCall?: (toolCallId: string) => void;
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({
  item,
  isPinned,
  onTogglePin,
  onJumpToToolCall,
}) => {
  const [copiedMd, setCopiedMd] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const handleCopyMarkdown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines: string[] = [
      `### ${item.title}`,
      `- **Category:** \`${item.category}\``,
      `- **Source Tool:** \`${item.sourceTool}\``,
    ];
    if (item.location) {
      const loc: string[] = [];
      if (item.location.file) loc.push(`File: \`${item.location.file}\``);
      if (item.location.function) loc.push(`Function: \`${item.location.function}\``);
      if (item.location.address) loc.push(`Address: \`${item.location.address}\``);
      if (item.location.offset) loc.push(`Offset: \`${item.location.offset}\``);
      if (item.location.url) loc.push(`URL: \`${item.location.url}\``);
      if (loc.length > 0) lines.push(`- **Location:** ${loc.join(' | ')}`);
    }
    if (item.description) {
      lines.push(`- **Details:** ${item.description}`);
    }
    if (item.confidenceNote) {
      lines.push(`- **Confidence Note:** ${item.confidenceNote}`);
    }
    if (item.limitations && item.limitations.length > 0) {
      lines.push(`- **Limitations:** ${item.limitations.join('; ')}`);
    }
    if (item.snippet && item.snippet.code) {
      lines.push('');
      lines.push(`\`\`\`${item.snippet.language || ''}`);
      lines.push(item.snippet.code);
      lines.push('```');
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch {
      // fallback
    }
  };

  const getCategoryBadge = () => {
    switch (item.category) {
      case 'finding':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            Finding
          </span>
        );
      case 'reference':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30">
            Reference
          </span>
        );
      case 'unknown_limitation':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Unknown / Limit
          </span>
        );
    }
  };

  return (
    <div
      data-testid={`evidence-card-${item.id}`}
      className={`p-3.5 rounded-xl border transition duration-150 space-y-2.5 ${
        isPinned
          ? 'bg-slate-900/90 border-amber-500/40 shadow-sm shadow-amber-500/5'
          : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700/80'
      }`}
    >
      {/* Top row: Category, Tool, Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 min-w-0 flex-wrap gap-y-1">
          {getCategoryBadge()}
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
            {item.sourceTool}
          </span>
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0">
          {/* Copy Markdown */}
          <button
            onClick={handleCopyMarkdown}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Copy as Markdown"
            aria-label="Copy item as Markdown"
          >
            {copiedMd ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Jump to Chat Tool Call */}
          {onJumpToToolCall && item.toolCallId && (
            <button
              onClick={() => onJumpToToolCall(item.toolCallId)}
              className="p-1 rounded hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-300 transition"
              title="Jump to source in chat"
              aria-label="Jump to tool call in chat"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Pin Toggle */}
          <button
            data-testid={`pin-evidence-${item.id}`}
            onClick={() => onTogglePin(item.id)}
            className={`p-1 rounded transition ${
              isPinned
                ? 'text-amber-400 hover:bg-amber-400/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title={isPinned ? 'Unpin evidence' : 'Pin evidence'}
            aria-label={isPinned ? 'Unpin' : 'Pin'}
          >
            <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Title & Claim */}
      <div>
        <h4 className="text-xs font-semibold text-slate-100 leading-snug break-words">
          {item.title}
        </h4>
        {item.description && (
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed break-words">
            {item.description}
          </p>
        )}
      </div>

      {/* Location Chips */}
      {item.location && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
          {item.location.file && (
            <span
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono truncate max-w-full"
              title={item.location.file}
            >
              <MapPin className="w-2.5 h-2.5 text-indigo-400 flex-shrink-0" />
              <span className="truncate">{item.location.file}</span>
              {item.location.line ? `:${item.location.line}` : ''}
            </span>
          )}
          {item.location.function && (
            <span
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-purple-300 font-mono truncate"
              title={item.location.function}
            >
              <Code2 className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" />
              <span className="truncate">{item.location.function}()</span>
            </span>
          )}
          {item.location.address && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-mono">
              <span>{item.location.address}</span>
            </span>
          )}
          {item.location.offset !== undefined && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
              <span>offset: {item.location.offset}</span>
            </span>
          )}
          {item.location.url && (
            <span
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300 font-mono truncate max-w-full"
              title={item.location.url}
            >
              <span className="truncate">{item.location.url}</span>
            </span>
          )}
        </div>
      )}

      {/* Code Snippet Viewer */}
      {item.snippet && item.snippet.code && (
        <CodeSnippetViewer
          code={item.snippet.code}
          language={item.snippet.language}
          startLine={item.snippet.startLine}
        />
      )}

      {/* Limitations & Confidence Notes */}
      {(item.confidenceNote || (item.limitations && item.limitations.length > 0)) && (
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 space-y-1">
          {item.confidenceNote && (
            <div className="flex items-center space-x-1 font-medium">
              <Info className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span>{item.confidenceNote}</span>
            </div>
          )}
          {item.limitations &&
            item.limitations.map((lim, idx) => (
              <div key={idx} className="flex items-start space-x-1 text-slate-300">
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>{lim}</span>
              </div>
            ))}
        </div>
      )}

      {/* Raw Output Fallback Inspection */}
      {item.rawContent !== undefined && !item.snippet && (
        <div className="pt-1">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center space-x-1"
          >
            <FileText className="w-3 h-3" />
            <span>{showRaw ? 'Hide Raw Details' : 'View Raw Details'}</span>
          </button>
          {showRaw && (
            <CodeSnippetViewer
              code={JSON.stringify(item.rawContent, null, 2)}
              language="json"
              maxHeight="max-h-48"
            />
          )}
        </div>
      )}
    </div>
  );
};
