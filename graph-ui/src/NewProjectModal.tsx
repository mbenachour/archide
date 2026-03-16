import { useState, useEffect, useRef } from 'react';

interface Props {
    onClose: () => void;
    onProjectCreated: (slug: string) => void;
}

type Phase = 'form' | 'streaming' | 'done';

export default function NewProjectModal({ onClose, onProjectCreated }: Props) {
    const [phase, setPhase] = useState<Phase>('form');
    const [repo, setRepo] = useState('');
    const [detail, setDetail] = useState(false);
    const [skipValidation, setSkipValidation] = useState(false);
    const [debug, setDebug] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [createdSlug, setCreatedSlug] = useState('');
    const [error, setError] = useState('');
    const logsEndRef = useRef<HTMLDivElement>(null);
    const repoRef = useRef(repo);
    repoRef.current = repo;

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const start = () => {
        if (!repo.trim()) return;
        setPhase('streaming');
        setLogs([]);
        setError('');

        const params = new URLSearchParams({ repo: repo.trim() });
        if (detail) params.set('detail', 'true');
        if (skipValidation) params.set('skip_validation', 'true');
        if (debug) params.set('debug', 'true');

        const es = new EventSource(`http://localhost:8833/api/new_project/stream?${params}`);

        es.onmessage = (e) => {
            setLogs(prev => [...prev, e.data]);
        };

        es.addEventListener('done', (e: MessageEvent) => {
            es.close();
            setCreatedSlug(e.data);
            setPhase('done');
        });

        es.addEventListener('error_event', (e: MessageEvent) => {
            es.close();
            setError(e.data);
            setPhase('streaming'); // stay on log view, show error
        });

        es.onerror = () => {
            es.close();
            setError('Connection lost — diagram.py may have exited.');
            setPhase('streaming');
        };
    };

    const cancel = async () => {
        await fetch(`http://localhost:8833/api/new_project/cancel?repo=${encodeURIComponent(repoRef.current)}`, { method: 'POST' });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white">New Project</h2>
                    {phase !== 'streaming' && (
                        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
                    )}
                </div>

                {/* Phase: form */}
                {phase === 'form' && (
                    <div className="flex flex-col gap-5 px-6 py-5">
                        <div>
                            <label className="block text-xs uppercase font-bold text-slate-400 mb-1 tracking-wider">GitHub repo</label>
                            <input
                                type="text"
                                placeholder="owner/repo-name"
                                value={repo}
                                onChange={e => setRepo(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && start()}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                autoFocus
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Options</label>
                            {[
                                { id: 'detail', label: 'Detailed analysis (slower, more thorough)', value: detail, set: setDetail },
                                { id: 'skip-val', label: 'Skip validation pass', value: skipValidation, set: setSkipValidation },
                                { id: 'debug', label: 'Debug output', value: debug, set: setDebug },
                            ].map(opt => (
                                <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 select-none">
                                    <input
                                        type="checkbox"
                                        checked={opt.value}
                                        onChange={e => opt.set(e.target.checked)}
                                        className="accent-blue-500"
                                    />
                                    {opt.label}
                                </label>
                            ))}
                        </div>

                        <button
                            onClick={start}
                            disabled={!repo.trim()}
                            className="mt-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2 rounded-lg transition-colors"
                        >
                            Analyze Repository →
                        </button>
                    </div>
                )}

                {/* Phase: streaming */}
                {phase === 'streaming' && (
                    <div className="flex flex-col flex-1 min-h-0 px-6 py-4 gap-3">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            {!error && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />}
                            <span className="font-mono">{error ? '⚠ Error' : `Analyzing ${repo}…`}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-slate-950 rounded-lg p-3 font-mono text-xs text-slate-300 min-h-0">
                            {logs.map((line, i) => (
                                <div key={i} className="leading-5 whitespace-pre-wrap">{line || '\u00a0'}</div>
                            ))}
                            {error && <div className="mt-2 text-red-400">{error}</div>}
                            <div ref={logsEndRef} />
                        </div>

                        <button
                            onClick={cancel}
                            className="self-start text-xs text-slate-400 hover:text-red-400 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Phase: done */}
                {phase === 'done' && (
                    <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
                        <div className="text-4xl">✅</div>
                        <div>
                            <p className="text-white font-bold text-lg mb-1">Project ready!</p>
                            <p className="text-slate-400 text-sm">
                                <span className="font-mono text-blue-300">{createdSlug}</span> has been added to your architectures.
                            </p>
                        </div>
                        <button
                            onClick={() => { onProjectCreated(createdSlug); onClose(); }}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded-lg transition-colors"
                        >
                            Open Project →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
