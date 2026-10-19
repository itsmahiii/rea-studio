import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Trash2,
  Cpu,
  RefreshCw,
  FolderOpen,
  Palette,
  Sliders,
  CheckCircle2,
  Terminal,
  Lock,
  ExternalLink,
  Save,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import {
  AVAILABLE_MODELS,
  PROVIDER_OPTIONS,
  PROVIDER_MODELS,
  type ProviderId,
} from './Onboarding/FirstRunWizard';

type SettingsTab = 'models' | 'rea' | 'privacy' | 'general';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    hasApiKey,
    setHasApiKey,
    settings,
    updateSettings,
    systemInfo,
    setIsOnboardingOpen,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('models');

  // Provider & API Key state
  const [modelProvider, setModelProvider] = useState<ProviderId>('anthropic');
  const [providerBaseUrl, setProviderBaseUrl] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showReplaceKey, setShowReplaceKey] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Model & General Settings local form state
  const [selectedModel, setSelectedModel] = useState('claude-3-7-sonnet-20250219');
  const [customModel, setCustomModel] = useState('');
  const [nativeProvider, setNativeProvider] = useState('auto');
  const [reaCommandOverride, setReaCommandOverride] = useState('');
  const [analysisTimeout, setAnalysisTimeout] = useState(120);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  // Env overrides
  const [ghidraTimeout, setGhidraTimeout] = useState(60000);
  const [hopperTimeout, setHopperTimeout] = useState(30000);
  const [jebMcpUrl, setJebMcpUrl] = useState('');
  const [maxResponseBytes, setMaxResponseBytes] = useState(10485760);

  // Updates state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    updateCommand: string;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateOutput, setUpdateOutput] = useState<string | null>(null);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);

  // Clear data confirmation modal state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (settings) {
      if (settings.modelProvider) setModelProvider(settings.modelProvider as ProviderId);
      if (settings.providerBaseUrl) setProviderBaseUrl(settings.providerBaseUrl);
      setSelectedModel(settings.selectedModel || 'claude-3-7-sonnet-20250219');
      setCustomModel(settings.customModel || '');
      setNativeProvider(settings.nativeProvider || 'auto');
      setReaCommandOverride(settings.reaCommandOverride || '');
      setAnalysisTimeout(settings.analysisTimeoutSeconds || 120);
      setTheme(settings.theme || 'dark');
      if (settings.envOverrides) {
        setGhidraTimeout(settings.envOverrides.REA_GHIDRA_STARTUP_TIMEOUT_MS ?? 60000);
        setHopperTimeout(settings.envOverrides.REA_HOPPER_STARTUP_TIMEOUT_MS ?? 30000);
        setJebMcpUrl(settings.envOverrides.REA_JEB_MCP_URL ?? '');
        setMaxResponseBytes(settings.envOverrides.REA_MCP_MAX_RESPONSE_BYTES ?? 10485760);
      }
    }
  }, [settings]);

  if (!isSettingsOpen) return null;

  const handleProviderChange = (newProvider: ProviderId) => {
    setModelProvider(newProvider);
    const models = PROVIDER_MODELS[newProvider] || [];
    const recommended = models.find((m) => m.recommended) || models[0];
    if (recommended) {
      setSelectedModel(recommended.id);
    }
    if (newProvider === 'ollama' && !providerBaseUrl) {
      setProviderBaseUrl('http://localhost:11434/v1');
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    try {
      const res = await window.api.apiKey.set({ key: apiKeyInput.trim(), provider: modelProvider });
      if (res.ok) {
        setHasApiKey(true);
        setApiKeyInput('');
        setShowReplaceKey(false);
        setStatusMessage({ text: `API Key for ${modelProvider} securely stored in OS Keychain (safeStorage).` });
      } else {
        setStatusMessage({ text: res.error, error: true });
      }
    } catch (err) {
      setStatusMessage({ text: String(err), error: true });
    }
  };

  const handleClearKey = async () => {
    try {
      const res = await window.api.apiKey.clear({ provider: modelProvider });
      if (res.ok) {
        setHasApiKey(false);
        setStatusMessage({ text: `API Key for ${modelProvider} removed from OS Keychain.` });
      } else {
        setStatusMessage({ text: res.error, error: true });
      }
    } catch (err) {
      setStatusMessage({ text: String(err), error: true });
    }
  };

  const handleSaveAllSettings = async () => {
    try {
      await updateSettings({
        modelProvider,
        providerBaseUrl: modelProvider === 'ollama' ? providerBaseUrl.trim() : undefined,
        selectedModel,
        customModel: selectedModel === 'custom' ? customModel.trim() : '',
        nativeProvider,
        reaCommandOverride: reaCommandOverride.trim(),
        analysisTimeoutSeconds: Number(analysisTimeout) || 120,
        theme,
        envOverrides: {
          REA_GHIDRA_STARTUP_TIMEOUT_MS: Number(ghidraTimeout) || 60000,
          REA_HOPPER_STARTUP_TIMEOUT_MS: Number(hopperTimeout) || 30000,
          REA_JEB_MCP_URL: jebMcpUrl.trim() || undefined,
          REA_MCP_MAX_RESPONSE_BYTES: Number(maxResponseBytes) || 10485760,
        },
      });
      setStatusMessage({ text: 'Settings successfully saved.' });
    } catch (err) {
      setStatusMessage({ text: `Failed to save settings: ${String(err)}`, error: true });
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateOutput(null);
    try {
      const res = await window.api.settings.checkUpdate();
      if (res.ok) {
        setUpdateInfo(res.data);
      } else {
        setStatusMessage({ text: `Check update failed: ${res.error}`, error: true });
      }
    } catch (err) {
      setStatusMessage({ text: String(err), error: true });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleRunUpdate = async () => {
    setShowUpdateConfirm(false);
    setIsUpdating(true);
    setUpdateOutput('Executing official REA update command...');
    try {
      const res = await window.api.settings.runUpdate({ confirmed: true });
      if (res.ok) {
        setUpdateOutput(res.data.output);
        setStatusMessage({ text: 'Update completed successfully.' });
      } else {
        setUpdateOutput(`Error: ${res.error}`);
        setStatusMessage({ text: res.error, error: true });
      }
    } catch (err) {
      setUpdateOutput(`Exception: ${String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenDataDir = async () => {
    try {
      await window.api.settings.openDataDir();
    } catch (err) {
      console.error('Failed to open data directory:', err);
    }
  };

  const handleClearAllData = async () => {
    setIsClearing(true);
    try {
      const res = await window.api.settings.clearAll({ confirm: true });
      if (res.ok) {
        setShowClearConfirm(false);
        setIsSettingsOpen(false);
        setHasApiKey(false);
        setIsOnboardingOpen(true);
      } else {
        setStatusMessage({ text: res.error, error: true });
      }
    } catch (err) {
      setStatusMessage({ text: String(err), error: true });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div
      data-testid="settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-fadeIn"
    >
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">REA Studio Settings</h2>
              <p className="text-[11px] text-slate-400">
                Configure model provider, REA engine overrides, and local data
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsSettingsOpen(false);
              setStatusMessage(null);
            }}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Navigation Tabs + Pane */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-48 border-r border-slate-800 bg-slate-950/40 p-3 space-y-1">
            <button
              onClick={() => setActiveTab('models')}
              data-testid="tab-models"
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === 'models'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Model & API Key</span>
            </button>

            <button
              onClick={() => setActiveTab('rea')}
              data-testid="tab-rea"
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === 'rea'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>REA Engine</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              data-testid="tab-privacy"
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === 'privacy'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Privacy & Security</span>
            </button>

            <button
              onClick={() => setActiveTab('general')}
              data-testid="tab-general"
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === 'general'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>General & Data</span>
            </button>
          </div>

          {/* Right Tab Content View */}
          <div className="flex-1 p-5 overflow-y-auto space-y-5">
            {/* TAB: MODEL & API KEY */}
            {activeTab === 'models' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Provider Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1">
                    Model Provider
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2.5">
                    Choose which AI provider or local offline engine runs your reverse-engineering investigations.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PROVIDER_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProviderChange(p.id)}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          modelProvider === p.id
                            ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                            : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                        }`}
                      >
                        <span className="text-xs font-semibold">{p.name}</span>
                        <span className="text-[9px] mt-1 text-indigo-400">{p.badge}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {modelProvider === 'ollama' && (
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-200 block">
                      Ollama / Local Endpoint URL:
                    </label>
                    <input
                      type="text"
                      placeholder="http://localhost:11434/v1"
                      value={providerBaseUrl}
                      onChange={(e) => setProviderBaseUrl(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400">
                      Supports Ollama, LM Studio, vLLM, or any local OpenAI-compatible server.
                    </p>
                  </div>
                )}

                {/* API Key Section */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                        <Lock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>
                          {modelProvider === 'anthropic'
                            ? 'Anthropic Claude API Key'
                            : modelProvider === 'openai'
                            ? 'OpenAI API Key'
                            : modelProvider === 'gemini'
                            ? 'Google Gemini API Key'
                            : modelProvider === 'openrouter'
                            ? 'OpenRouter API Key'
                            : 'Ollama API Key (Optional)'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Stored in your OS Keychain via Electron <code className="text-indigo-400">safeStorage</code>.
                        Never written in plain text, logged, or sent to the renderer.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {hasApiKey ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                          Active in Keychain
                        </span>
                      ) : modelProvider === 'ollama' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 border border-slate-700 font-medium">
                          Optional for Local
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-medium">
                          No Key Stored
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Masked status / Replace key */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs font-mono text-slate-400">
                      {hasApiKey
                        ? '••••••••••••••••••••••••••••••••'
                        : modelProvider === 'ollama'
                        ? 'No key needed for local Ollama'
                        : 'No API key configured'}
                    </div>

                    <div className="flex items-center space-x-2">
                      {hasApiKey && (
                        <button
                          type="button"
                          onClick={handleClearKey}
                          data-testid="clear-key-btn"
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Key</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowReplaceKey(!showReplaceKey)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
                      >
                        {showReplaceKey ? 'Cancel' : hasApiKey ? 'Replace Key' : 'Enter Key'}
                      </button>
                    </div>
                  </div>

                  {showReplaceKey && (
                    <form onSubmit={handleSaveKey} className="pt-2 border-t border-slate-800/80 space-y-2">
                      <div className="flex space-x-2">
                        <input
                          type="password"
                          data-testid="api-key-input"
                          placeholder={
                            modelProvider === 'anthropic'
                              ? 'sk-ant-api03-...'
                              : modelProvider === 'openai'
                              ? 'sk-proj-...'
                              : modelProvider === 'gemini'
                              ? 'AIzaSy...'
                              : modelProvider === 'openrouter'
                              ? 'sk-or-v1-...'
                              : 'Optional for Ollama'
                          }
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={!apiKeyInput.trim()}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Model Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1">
                    Agent Model
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Choose the active model for reverse engineering orchestration.
                  </p>
                  <div className="space-y-2">
                    {(PROVIDER_MODELS[modelProvider] || []).map((m) => (
                      <div
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          selectedModel === m.id
                            ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                            : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/50'
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
                          name="model"
                          checked={selectedModel === m.id}
                          onChange={() => setSelectedModel(m.id)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                      </div>
                    ))}
                  </div>

                  {selectedModel === 'custom' && (
                    <div className="mt-2.5">
                      <label className="text-[11px] font-medium text-slate-400 block mb-1">
                        Custom Model String:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. custom-model-identifier"
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: REA ENGINE & EXECUTION */}
            {activeTab === 'rea' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Version & Update Card */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                        <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                        <span>REA Engine Version & Updates</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Runs official update flow via <code className="text-indigo-400">npx rea-agents@latest --update</code>.
                        Never modifies external agent configs.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60 font-semibold">
                        v{systemInfo?.reaVersion || '6.7.0'}
                      </span>
                      <button
                        type="button"
                        onClick={handleCheckUpdate}
                        disabled={isCheckingUpdate}
                        data-testid="check-updates-btn"
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white transition shadow-sm"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                        <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                      </button>
                    </div>
                  </div>

                  {updateInfo && (
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">
                          Installed: <strong>v{updateInfo.currentVersion}</strong> | Latest Registry: <strong>v{updateInfo.latestVersion}</strong>
                        </span>
                        {updateInfo.updateAvailable ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Update Available
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Up to date
                          </span>
                        )}
                      </div>

                      <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-indigo-300 border border-slate-800">
                        {updateInfo.updateCommand}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500">
                          Explicit user confirmation is strictly required prior to running updates.
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowUpdateConfirm(true)}
                          disabled={isUpdating}
                          data-testid="run-update-btn"
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition disabled:opacity-40"
                        >
                          {isUpdating ? 'Updating...' : 'Run Update Flow'}
                        </button>
                      </div>
                    </div>
                  )}

                  {updateOutput && (
                    <pre className="p-2.5 rounded-lg bg-slate-950 font-mono text-[10px] text-slate-300 border border-slate-800 max-h-36 overflow-y-auto whitespace-pre-wrap">
                      {updateOutput}
                    </pre>
                  )}
                </div>

                {/* REA Command Path Override */}
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1">
                    REA Command Path Override
                  </label>
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    Leave blank for default (<code className="text-indigo-400">npx -y rea-agents@latest mcp</code>) or enter custom binary/script path.
                  </p>
                  <input
                    type="text"
                    placeholder="e.g. C:\node\node.exe C:\scripts\rea.mjs mcp"
                    value={reaCommandOverride}
                    onChange={(e) => setReaCommandOverride(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Analysis Timeout */}
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1">
                    Analysis Timeout (Seconds)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={600}
                    value={analysisTimeout}
                    onChange={(e) => setAnalysisTimeout(Number(e.target.value))}
                    className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Environment Variable Overrides */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-200">
                    REA Environment Variable Overrides
                  </h4>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        REA_GHIDRA_STARTUP_TIMEOUT_MS
                      </label>
                      <input
                        type="number"
                        value={ghidraTimeout}
                        onChange={(e) => setGhidraTimeout(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        REA_HOPPER_STARTUP_TIMEOUT_MS
                      </label>
                      <input
                        type="number"
                        value={hopperTimeout}
                        onChange={(e) => setHopperTimeout(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        REA_JEB_MCP_URL
                      </label>
                      <input
                        type="text"
                        placeholder="http://localhost:5000/mcp"
                        value={jebMcpUrl}
                        onChange={(e) => setJebMcpUrl(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        REA_MCP_MAX_RESPONSE_BYTES
                      </label>
                      <input
                        type="number"
                        value={maxResponseBytes}
                        onChange={(e) => setMaxResponseBytes(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PRIVACY & SECURITY */}
            {activeTab === 'privacy' && (
              <div className="space-y-4 animate-fadeIn text-xs text-slate-300">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Local-First Architecture & Privacy Disclosure</span>
                  </div>
                  <p className="leading-relaxed text-slate-400 text-xs">
                    REA Studio is built from the ground up for strict security, target isolation, and user privacy:
                  </p>

                  <div className="space-y-2.5 pt-1">
                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="font-semibold text-slate-200">1. Analysis Runs 100% Locally</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        All binary parsing, decompilation, JavaScript bundle analysis, PCAP packet extraction,
                        and AST reconstruction execute on your host machine. No target binaries or files are
                        ever uploaded to third-party servers.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="font-semibold text-slate-200">2. Model Context Transmission</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Only relevant code snippets, tool inputs, and structured evidence findings are passed
                        to your chosen Anthropic Claude endpoint to generate conversational insights and next steps.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="font-semibold text-slate-200">3. OS Keychain Security</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        API keys are never written to unencrypted configuration files. They are encrypted
                        directly into the operating system keychain (Windows DPAPI, macOS Keychain, Linux Secret Service).
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="font-semibold text-slate-200">4. Zero Telemetry & Tracking</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        REA Studio contains no analytics, telemetry pings, crash reporting beacons, or user tracking.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: GENERAL & DATA */}
            {activeTab === 'general' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Theme Selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1">
                    Application Theme
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['dark', 'light', 'system'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTheme(t)}
                        className={`p-3 rounded-xl border text-xs font-medium capitalize transition ${
                          theme === t
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                        }`}
                      >
                        {t} Theme
                      </button>
                    ))}
                  </div>
                </div>

                {/* Local Data Storage */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Application Data Location</span>
                  </h4>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300 break-all">
                    {settings?.userDataPath || 'C:/Users/.../AppData/Roaming/rea-studio'}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleOpenDataDir}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open Data Directory</span>
                    </button>
                  </div>
                </div>

                {/* Danger Zone: Clear Local Data */}
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                  <div className="flex items-center space-x-2 text-rose-300 font-semibold text-xs">
                    <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>Danger Zone — Reset All Local Data</span>
                  </div>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed">
                    Erase all investigation sessions, chat histories, cached evidence, API keys from OS Keychain,
                    and reset settings to initial setup defaults.
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      data-testid="clear-all-data-btn"
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-md shadow-rose-600/20 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All Local Data</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Status Feedback Toast */}
            {statusMessage && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                  statusMessage.error
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                {statusMessage.error ? (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setIsSettingsOpen(false);
              setStatusMessage(null);
            }}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleSaveAllSettings}
            data-testid="save-settings-btn"
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Confirmation Sub-modal: Run Update */}
      {showUpdateConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>Confirm REA Update</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to run the official update flow? This will execute:
            </p>
            <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-xs text-indigo-300 border border-slate-800">
              npx -y rea-agents@latest --update
            </div>
            <p className="text-[11px] text-slate-500">
              This process only updates the REA tool bundle locally and will not alter configurations outside this app.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUpdateConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRunUpdate}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition"
              >
                Confirm & Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Sub-modal: Clear All Data */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-rose-300 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Confirm Permanent Reset</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This action will permanently delete all session histories, findings, stored credentials in the
              OS Keychain, and restore factory settings. This cannot be undone.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isClearing}
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={handleClearAllData}
                data-testid="confirm-clear-all-btn"
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition"
              >
                {isClearing ? 'Clearing...' : 'Yes, Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
