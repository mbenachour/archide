import { useState } from 'react';

const TIERS = ['Core', 'Supporting', 'Dev', 'Component', 'External'];

const TIER_COLORS: Record<string, string> = {
    Core: 'bg-blue-900 text-blue-200 border-blue-500',
    Supporting: 'bg-slate-700 text-slate-200 border-slate-500',
    Dev: 'bg-orange-900 text-orange-200 border-orange-500',
    Component: 'bg-teal-900 text-teal-200 border-teal-500',
    External: 'bg-purple-900 text-purple-200 border-purple-500',
};

interface NodeData {
    label: string;
    tier?: string;
    path?: string;
    description?: string;
}

interface Props {
    nodeId: string;
    data: NodeData;
    onClose: () => void;
    onSave: (nodeId: string, newData: NodeData) => void;
}

export default function NodeDetailModal({ nodeId, data, onClose, onSave }: Props) {
    const [tab, setTab] = useState<'summary' | 'edit'>('summary');
    const [label, setLabel] = useState(data.label ?? '');
    const [tier, setTier] = useState(data.tier ?? 'Core');
    const [path, setPath] = useState(data.path ?? '');
    const [description, setDescription] = useState(data.description ?? '');

    const tierColor = TIER_COLORS[data.tier ?? ''] ?? TIER_COLORS['External'];

    const handleSave = () => {
        onSave(nodeId, { label, tier, path, description });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-[480px] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-slate-700">
                    <div>
                        <h2 className="text-white font-bold text-lg leading-tight">{data.label}</h2>
                        <span className={`mt-1 inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${tierColor}`}>
                            {data.tier ?? 'Unknown'}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none mt-0.5">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700">
                    {(['summary', 'edit'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                                tab === t
                                    ? 'text-white border-b-2 border-blue-500'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {/* Summary tab */}
                {tab === 'summary' && (
                    <div className="px-6 py-5 flex flex-col gap-4">
                        {data.path && (
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Path</p>
                                <code className="text-xs text-blue-300 font-mono break-all">{data.path}</code>
                            </div>
                        )}
                        {data.description && (
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Description</p>
                                <p className="text-sm text-slate-200 leading-relaxed">{data.description}</p>
                            </div>
                        )}
                        {!data.path && !data.description && (
                            <p className="text-slate-500 text-sm italic">No details available. Switch to Edit to add some.</p>
                        )}
                        <button
                            onClick={() => setTab('edit')}
                            className="self-start mt-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            Edit this node →
                        </button>
                    </div>
                )}

                {/* Edit tab */}
                {tab === 'edit' && (
                    <div className="px-6 py-5 flex flex-col gap-4">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Label</label>
                            <input
                                value={label}
                                onChange={e => setLabel(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Tier</label>
                            <select
                                value={tier}
                                onChange={e => setTier(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                            >
                                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Path</label>
                            <input
                                value={path}
                                onChange={e => setPath(e.target.value)}
                                placeholder="e.g. src/components/Auth.tsx"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                            />
                        </div>
                        <div className="flex gap-2 justify-end mt-1">
                            <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-400 hover:text-white transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
