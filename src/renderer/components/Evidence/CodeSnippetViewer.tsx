import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeSnippetViewerProps {
  code: string;
  language?: string;
  startLine?: number;
  maxHeight?: string;
}

export const CodeSnippetViewer: React.FC<CodeSnippetViewerProps> = ({
  code,
  language = 'text',
  startLine = 1,
  maxHeight = 'max-h-60',
}) => {
  const [copied, setCopied] = useState(false);

  const lines = code.split('\n');

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      data-testid="code-snippet-viewer"
      className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950/90 text-xs my-2 font-mono shadow-inner group relative"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-400 select-none">
        <span className="uppercase font-semibold tracking-wider text-slate-500">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          title="Copy code snippet"
          aria-label="Copy snippet"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code with Line Numbers */}
      <div className={`overflow-x-auto overflow-y-auto ${maxHeight} text-[11px] leading-relaxed p-2`}>
        <table className="border-collapse w-full">
          <tbody>
            {lines.map((lineText, idx) => {
              const lineNum = startLine + idx;
              return (
                <tr key={idx} className="hover:bg-slate-900/40">
                  <td className="select-none text-right pr-3 text-slate-600 font-mono text-[10px] w-8 align-top">
                    {lineNum}
                  </td>
                  <td className="text-slate-200 whitespace-pre font-mono pr-2">
                    {lineText || ' '}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
