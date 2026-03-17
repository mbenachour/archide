import { useState, useEffect } from 'react';

const API = 'http://localhost:8833';

const OPENAI_MODELS = ['gpt-5-nano-2025-08-07', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
const CODING_AGENTS = [{ value: 'claude-code', label: 'Claude Code' }];

interface Settings {
    provider: string;
    openai_api_key: string;
    openai_model: string;
    ollama_url: string;
    ollama_api_key: string;
    ollama_model: string;
    diagram_detail: boolean;
    diagram_skip_validation: boolean;
    coding_agent: string;
    agent_path: string;
}

const DEFAULTS: Settings = {
    provider: 'ollama',
    openai_api_key: '',
    openai_model: 'gpt-4o-mini',
    ollama_url: 'http://localhost:11434',
    ollama_api_key: '',
    ollama_model: '',
    diagram_detail: false,
    diagram_skip_validation: false,
    coding_agent: 'claude-code',
    agent_path: '/usr/local/bin/claude',
};

interface Props {
    onClose: () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">{label}</label>
            {hint && <p className="text-[10px] text-slate-500 mb-1">{hint}</p>}
            {children}
        </div>
    );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
    return (
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
        />
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-300">
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
                className="accent-blue-500"
            />
            {label}
        </label>
    );
}

export default function SettingsModal({ onClose }: Props) {
    const [settings, setSettings] = useState<Settings>(DEFAULTS);
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API}/api/settings`)
            .then(r => r.json())
            .then(d => setSettings({ ...DEFAULTS, ...d }))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const set = (key: keyof Settings, value: any) =>
        setSettings(prev => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch(`${API}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
                    <h2 className="text-lg font-bold text-white">Settings</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

                        {/* LLM Provider */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 pb-1 border-b border-slate-700">LLM Provider</h3>
                            <div className="flex gap-4">
                                {(['ollama', 'openai'] as const).map(p => (
                                    <label key={p} className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 select-none">
                                        <input
                                            type="radio"
                                            name="provider"
                                            value={p}
                                            checked={settings.provider === p}
                                            onChange={() => set('provider', p)}
                                            className="accent-blue-500"
                                        />
                                        {p === 'openai' ? 'OpenAI' : 'Ollama'}
                                    </label>
                                ))}
                            </div>
                        </section>

                        {/* OpenAI */}
                        {settings.provider === 'openai' && (
                            <section>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 pb-1 border-b border-slate-700">OpenAI</h3>
                                <div className="flex flex-col gap-4">
                                    <Field label="API Key">
                                        <div className="flex gap-2">
                                            <input
                                                type={showKey ? 'text' : 'password'}
                                                value={settings.openai_api_key}
                                                onChange={e => set('openai_api_key', e.target.value)}
                                                placeholder="sk-..."
                                                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKey(v => !v)}
                                                className="px-3 py-2 text-xs text-slate-400 hover:text-white border border-slate-600 rounded-lg transition-colors"
                                            >
                                                {showKey ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                    </Field>
                                    <Field label="Model">
                                        <select
                                            value={settings.openai_model}
                                            onChange={e => set('openai_model', e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                        >
                                            {OPENAI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </Field>
                                </div>
                            </section>
                        )}

                        {/* Ollama */}
                        {settings.provider === 'ollama' && (
                            <section>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 pb-1 border-b border-slate-700">Ollama</h3>
                                <div className="flex flex-col gap-4">
                                    <Field label="Ollama URL">
                                        <TextInput
                                            value={settings.ollama_url}
                                            onChange={v => set('ollama_url', v)}
                                            placeholder="http://localhost:11434"
                                        />
                                    </Field>
                                    <Field label="Model" hint="e.g. llama3, mistral, qwen2.5">
                                        <TextInput
                                            value={settings.ollama_model}
                                            onChange={v => set('ollama_model', v)}
                                            placeholder="llama3"
                                        />
                                    </Field>
                                    <Field label="API Key" hint="Only needed for hosted Ollama endpoints">
                                        <TextInput
                                            value={settings.ollama_api_key}
                                            onChange={v => set('ollama_api_key', v)}
                                            placeholder="(optional)"
                                            type="password"
                                        />
                                    </Field>
                                </div>
                            </section>
                        )}

                        {/* Diagram generation defaults */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 pb-1 border-b border-slate-700">Diagram Generation Defaults</h3>
                            <div className="flex flex-col gap-2">
                                <Toggle
                                    checked={settings.diagram_detail}
                                    onChange={v => set('diagram_detail', v)}
                                    label="Detailed analysis (slower, more thorough)"
                                />
                                <Toggle
                                    checked={settings.diagram_skip_validation}
                                    onChange={v => set('diagram_skip_validation', v)}
                                    label="Skip validation pass"
                                />
                            </div>
                        </section>

                        {/* Implementation */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 pb-1 border-b border-slate-700">Implementation</h3>
                            <div className="flex flex-col gap-4">
                                <Field label="Coding Agent">
                                    <select
                                        value={settings.coding_agent}
                                        onChange={e => set('coding_agent', e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                        {CODING_AGENTS.map(a => (
                                            <option key={a.value} value={a.value}>{a.label}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Agent Path" hint="Path to the agent binary on your system">
                                    <TextInput
                                        value={settings.agent_path}
                                        onChange={v => set('agent_path', v)}
                                        placeholder="/usr/local/bin/claude"
                                    />
                                </Field>
                            </div>
                        </section>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between shrink-0">
                    <span className={`text-xs font-bold transition-opacity duration-300 ${saved ? 'text-emerald-400 opacity-100' : 'opacity-0'}`}>
                        ✓ Saved
                    </span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-400 hover:text-white transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="px-5 py-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
