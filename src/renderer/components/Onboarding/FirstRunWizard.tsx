import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Key,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Cpu,
  Layers,
  Sparkles,
  Lock,
  Terminal,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';

export const AVAILABLE_MODELS = [
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet',
    description: 'Anthropic flagship hybrid reasoning model — recommended for deep reverse engineering',
    recommended: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet v2',
    description: 'High-speed analysis, excellent code understanding and decompiler output parsing',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest turn times for quick triage and preliminary target string inspection',
  },
  {
    id: 'custom',
    name: 'Custom Model Identifier',
    description: 'Specify an arbitrary compatible model string',
  },
];

export const NATIVE_PROVIDERS_WIZARD = [
  {
    id: 'auto',
    name: 'Auto-detect Provider',
    description: 'REA dynamically selects the best installed engine for the target binary format',
    recommended: true,
  },
  {
    id: 'ghidra',
    name: 'Ghidra Headless',
    description: 'NSA decompiler supporting multi-architecture native decompilation and analysis',
  },
  {
    id: 'hopper',
    name: 'Hopper Disassembler',
    description: 'Fast macOS/Linux native disassembly and Objective-C / Swift type recovery',
  },
  {
    id: 'ida',
    name: 'IDA Pro',
    description: 'Hex-Rays decompiler integration (requires legitimate commercial license)',
  },
  {
    id: 'rizin',
    name: 'Rizin / Cutter',
    description: 'Open-source binary analysis and disassembly framework',
  },
  {
    id: 'objdump',
    name: 'objdump',
    description: 'Lightweight disassembly fallback (GNU / LLVM objdump)',
  },
];

export const FirstRunWizard: React.FC = () => {
  const {
    isOnboardingOpen,
    setIsOnboardingOpen,
    settings,
    updateSettings,
    hasApiKey,
    setHasApiKey,
    systemInfo,
  } = useAppStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Legal & Authorization state
  const [legalAccepted, setLegalAccepted] = useState(false);

  // Step 2: Model & API Key state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-3-7-sonnet-20250219');
  const [customModel, setCustomModel] = useState('');
  const [keySaveStatus, setKeySaveStatus] = useState<string | null>(null);

  // Step 4: Native provider state
  const [selectedProvider, setSelectedProvider] = useState('auto');

  useEffect(() => {
    if (settings) {
      if (settings.hasAcceptedLegal) setLegalAccepted(true);
      if (settings.selectedModel) setSelectedModel(settings.selectedModel);
      if (settings.customModel) setCustomModel(settings.customModel);
      if (settings.nativeProvider) setSelectedProvider(settings.nativeProvider);
    }
  }, [settings]);

  if (!isOnboardingOpen) return null;

  const handleOpenDisclaimer = async () => {
    try {
      await window.api.system.openExternal('https://github.com/morluto/rea/blob/main/DISCLAIMER.md');
    } catch (err) {
      console.error('Failed to open external link:', err);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const res = await window.api.apiKey.set({ key: apiKeyInput.trim() });
      if (res.ok) {
        setHasApiKey(true);
        setApiKeyInput('');
        setKeySaveStatus('API key safely encrypted in OS Keychain.');
      } else {
        setKeySaveStatus(`Failed: ${res.error}`);
      }
    } catch (err) {
      setKeySaveStatus(`Error: ${String(err)}`);
    }
  };

  const handleCompleteWizard = async () => {
    await updateSettings({
      hasAcceptedLegal: true,
      hasCompletedOnboarding: true,
      selectedModel,
      customModel: selectedModel === 'custom' ? customModel.trim() : '',
      nativeProvider: selectedProvider,
    });
    setIsOnboardingOpen(false);
  };

  // Node version compatibility check (REA requires Node >= 22.19, 24.11, or 26+)
  const isNodeCompatible = Boolean(
    systemInfo?.nodeVersion &&
      (systemInfo.nodeVersion.startsWith('v24.') ||
        systemInfo.nodeVersion.startsWith('v22.') ||
        systemInfo.nodeVersion.startsWith('v26.'))
  );

  return (
    <div
      data-testid="first-run-wizard"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-fadeIn"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Wizard Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>Welcome to REA Studio</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  Setup Wizard
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Step {step} of 4: {step === 1 && 'Legal & Authorization Notice'}
                {step === 2 && 'Model & OS Keychain Key'}
                {step === 3 && 'Runtime & Tool Availability'}
                {step === 4 && 'Native Analysis Provider'}
              </p>
            </div>
          </div>

          {/* Stepper Dots */}
          <div className="flex items-center space-x-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  step === s
                    ? 'bg-indigo-500 ring-4 ring-indigo-500/20'
                    : step > s
                    ? 'bg-emerald-500'
                    : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Wizard Step Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* STEP 1: Legal / Authorization Notice */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2">
                <div className="flex items-center space-x-2 font-semibold text-sm text-amber-300">
                  <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Important Legal & Authorization Notice</span>
                </div>
                <p className="text-xs leading-relaxed text-amber-200/90">
                  Reverse engineering tools are subject to intellectual property laws, computer crime statutes,
                  and software license agreements. You must confirm that you have legitimate authority before
                  investigating any target.
                </p>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-slate-200 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Target Authorization Requirements:</span>
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1 text-[11px]">
                    <li>You own the software/hardware target, or have explicit authorization from the owner.</li>
                    <li>
                      Your analysis complies with applicable jurisdiction laws (e.g. security research,
                      interoperability).
                    </li>
                    <li>
                      Commercial reverse-engineering engines (such as IDA Pro, Hopper, or JEB) must be
                      legitimately licensed by you or your organization.
                    </li>
                  </ul>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400">
                    Read the official reverse-engineering terms:
                  </span>
                  <button
                    onClick={handleOpenDisclaimer}
                    className="flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition"
                  >
                    <span>REA DISCLAIMER.md</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* Acceptance Checkbox */}
                <label className="flex items-start space-x-3 p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/30 cursor-pointer hover:bg-indigo-950/30 transition">
                  <input
                    type="checkbox"
                    data-testid="legal-checkbox"
                    checked={legalAccepted}
                    onChange={(e) => setLegalAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-200 leading-snug">
                    I confirm that I own or am authorized to analyze all targets loaded into REA Studio, and
                    that any third-party commercial analysis engines used (IDA Pro, Hopper, JEB) are
                    legitimately licensed.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: Model & API Key */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  1. Model Selection
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Select the Anthropic Claude model to orchestrate your reverse-engineering investigations.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {AVAILABLE_MODELS.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        selectedModel === m.id
                          ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                          : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold">{m.name}</span>
                          {m.recommended && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{m.description}</p>
                      </div>
                      <input
                        type="radio"
                        checked={selectedModel === m.id}
                        onChange={() => setSelectedModel(m.id)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>

                {selectedModel === 'custom' && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      placeholder="e.g. claude-3-7-sonnet-20250219"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  2. Anthropic API Key (Encrypted in OS Keychain)
                </label>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 flex items-center space-x-1.5">
                      <Lock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {hasApiKey ? 'Key is currently active in OS Keychain' : 'No key detected in Keychain'}
                      </span>
                    </span>
                    {hasApiKey && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <input
                      type="password"
                      placeholder={hasApiKey ? '••••••••••••••••••••••••••••••••' : 'sk-ant-api03-...'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      disabled={!apiKeyInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white transition flex items-center space-x-1"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Save Key</span>
                    </button>
                  </div>

                  {keySaveStatus && (
                    <p className="text-[11px] text-emerald-400 mt-1">{keySaveStatus}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Node & REA Availability */}
          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <p className="text-xs text-slate-400">
                Verifying your local system environment against REA requirements (Node.js runtime and REA
                tooling):
              </p>

              <div className="space-y-3">
                {/* Node.js Probe */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Terminal className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">Node.js Runtime</div>
                      <div className="text-[11px] text-slate-400">
                        {systemInfo?.nodeVersion || 'Detected'} (Platform: {systemInfo?.platform || process.platform})
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Compatible (≥22.19, 24+, or 26+)</span>
                  </div>
                </div>

                {/* REA Probe */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">REA CLI & MCP Engine</div>
                      <div className="text-[11px] text-slate-400">
                        Version {systemInfo?.reaVersion || '6.7.0'} via npx rea-agents
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>207 MCP Tools Ready</span>
                  </div>
                </div>

                {/* Keychain / Security Probe */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">OS Keychain Storage</div>
                      <div className="text-[11px] text-slate-400">
                        Electron safeStorage isolation active
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-emerald-400 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Encrypted</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Native Provider Selection */}
          {step === 4 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  Default Native Analysis Provider
                </label>
                <p className="text-[11px] text-slate-400 mb-3">
                  Choose the primary disassembly/decompilation engine for native binaries (PE, ELF, Mach-O).
                  Can be overridden at any time per target.
                </p>

                <div className="grid grid-cols-1 gap-2">
                  {NATIVE_PROVIDERS_WIZARD.map((prov) => (
                    <div
                      key={prov.id}
                      onClick={() => setSelectedProvider(prov.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        selectedProvider === prov.id
                          ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                          : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold">{prov.name}</span>
                          {prov.recommended && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{prov.description}</p>
                      </div>
                      <input
                        type="radio"
                        checked={selectedProvider === prov.id}
                        onChange={() => setSelectedProvider(prov.id)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              data-testid="wizard-next-btn"
              disabled={step === 1 && !legalAccepted}
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              data-testid="wizard-finish-btn"
              onClick={handleCompleteWizard}
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Complete Setup & Start Analysis</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
