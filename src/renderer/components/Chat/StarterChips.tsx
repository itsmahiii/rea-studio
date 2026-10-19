import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface StarterChipsProps {
  targetType: string;
  targetName?: string;
  onSelectPrompt: (prompt: string) => void;
}

export const StarterChips: React.FC<StarterChipsProps> = ({
  targetType,
  targetName,
  onSelectPrompt,
}) => {
  const normalizedType = targetType.toLowerCase();

  let prompts: string[] = [];

  if (normalizedType.includes('electron') || normalizedType.includes('asar')) {
    prompts = [
      'Map the main/preload/renderer boundaries and IPC channels',
      'Audit Electron security fuses and WebPreferences isolation',
      'Explain how the core feature works and show the evidence',
      'Trace web module imports and recover JavaScript entry points',
    ];
  } else if (normalizedType.includes('apk') || normalizedType.includes('android')) {
    prompts = [
      'Decompile Android manifest and inspect exported components',
      'Trace sensitive permissions, network traffic, and API endpoints',
      'Search for hardcoded secrets, tokens, and backend URLs',
      'Inspect package resources and DEX class hierarchy',
    ];
  } else if (
    normalizedType.includes('pe') ||
    normalizedType.includes('native') ||
    normalizedType.includes('binary') ||
    normalizedType.includes('mach') ||
    normalizedType.includes('elf')
  ) {
    prompts = [
      'Inspect binary overview, headers, and exploit mitigations',
      'Disassemble entry point and list imported native libraries',
      'Search for embedded strings, URLs, and potential secrets',
      'Decompile top procedures and construct the call graph',
    ];
  } else if (normalizedType.includes('pcap') || normalizedType.includes('har')) {
    prompts = [
      'Inspect network capture for authentication tokens and credentials',
      'Identify distinct HTTP endpoints and payload structures',
      'Search for anomalous API calls or unencrypted transmissions',
    ];
  } else {
    prompts = [
      'Provide a complete overview of this target and its structure',
      'Audit dependencies and highlight security boundaries',
      'Search for hardcoded secrets, tokens, and sensitive strings',
      'Explain how the primary entry point initializes',
    ];
  }

  return (
    <div className="my-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-sm">
      <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-300 mb-3">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span>Suggested Investigations for {targetName || targetType}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {prompts.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 hover:bg-indigo-950/40 text-left border border-slate-800 hover:border-indigo-500/40 text-xs text-slate-300 hover:text-indigo-200 transition group select-none"
            aria-label={`Prompt chip: ${prompt}`}
          >
            <span className="line-clamp-2 mr-2 leading-relaxed">{prompt}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};
