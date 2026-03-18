import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface FileOp {
    path: string;
    action: 'create' | 'modify';
    summary: string;
    content: string;
}

interface ProposalData {
    project: string;
    diagram_hash: string;
    branch_name: string;
    files: FileOp[];
}

interface ChatMessage {
    role: 'assistant' | 'user';
    content: string;
    proposal?: ProposalData;
}

type Command = 'edit' | 'save' | 'implement' | null;

function parseCommand(text: string): { command: Command; args: string } {
    if (/^\/edit(\s|$)/.test(text))      return { command: 'edit',      args: text.slice(5).trim() };
    if (/^\/save(\s|$)/.test(text))      return { command: 'save',      args: text.slice(5).trim() };
    if (/^\/implement(\s|$)/.test(text)) return { command: 'implement', args: text.slice(10).trim() };
    return { command: null, args: text };
}

function UserMessageContent({ content }: { content: string }) {
    const { command, args } = parseCommand(content);
    if (!command) return <>{content}</>;
    const styles: Record<string, string> = {
        edit:      'bg-amber-500/30 text-amber-300 border border-amber-500/40',
        save:      'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40',
        implement: 'bg-purple-500/30 text-purple-300 border border-purple-500/40',
    };
    return (
        <span>
            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mr-1.5 ${styles[command]}`}>
                /{command}
            </span>
            {args}
        </span>
    );
}

function ProposalCard({
    proposal,
    onApply,
    onDiscard,
    isApplying,
}: {
    proposal: ProposalData;
    onApply: () => void;
    onDiscard: () => void;
    isApplying: boolean;
}) {
    return (
        <div className="rounded-xl border border-purple-500/30 bg-slate-800 overflow-hidden shadow-lg w-full">
            <div className="px-3 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300">Implementation Proposal</span>
            </div>

            <div className="px-3 py-1.5 border-b border-slate-700 bg-slate-900/50">
                <span className="text-[10px] text-slate-400 font-mono">branch: </span>
                <span className="text-[10px] text-purple-300 font-mono">{proposal.branch_name}</span>
            </div>

            <div className="divide-y divide-slate-700/60">
                {proposal.files.map((f, i) => (
                    <div key={i} className="px-3 py-2 flex items-start gap-2.5">
                        <span className={`mt-0.5 shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            f.action === 'create'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                            {f.action === 'create' ? '✦ new' : '✎ edit'}
                        </span>
                        <div className="min-w-0">
                            <div className="text-xs text-slate-200 font-mono truncate">{f.path}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{f.summary}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="px-3 py-2 flex gap-2 bg-slate-900/50 border-t border-slate-700">
                <button
                    onClick={onApply}
                    disabled={isApplying}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold py-1.5 rounded-lg transition-colors"
                >
                    {isApplying ? 'Applying...' : 'Apply'}
                </button>
                <button
                    onClick={onDiscard}
                    disabled={isApplying}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-xs font-bold py-1.5 rounded-lg transition-colors"
                >
                    Discard
                </button>
            </div>
        </div>
    );
}

const COMMAND_STYLES = {
    edit:      { border: 'border-amber-500/60 focus-within:border-amber-400 focus-within:ring-amber-500/30',   dot: 'bg-amber-400',   text: 'text-amber-400',   btn: 'bg-amber-600 hover:bg-amber-500 disabled:hover:bg-amber-600',   label: 'Edit mode — describe your changes',        btnLabel: 'Edit' },
    save:      { border: 'border-emerald-500/60 focus-within:border-emerald-400 focus-within:ring-emerald-500/30', dot: 'bg-emerald-400', text: 'text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-500 disabled:hover:bg-emerald-600', label: 'Save mode — optionally add a label',       btnLabel: 'Save' },
    implement: { border: 'border-purple-500/60 focus-within:border-purple-400 focus-within:ring-purple-500/30',   dot: 'bg-purple-400',  text: 'text-purple-400',  btn: 'bg-purple-600 hover:bg-purple-500 disabled:hover:bg-purple-600',   label: 'Implement mode — optionally add a focus hint', btnLabel: 'Run' },
};

export default function ChatPanel({ selectedProject, onDiagramUpdate, onUnimplementedEditsChange, statusRefreshKey }: {
    selectedProject: string | null;
    onDiagramUpdate: (graphData: any) => void;
    onUnimplementedEditsChange?: (has: boolean) => void;
    statusRefreshKey?: number;
}) {
    const WELCOME_MSG: ChatMessage = { role: 'assistant', content: 'Hello! I am your Architecture Assistant. How can I help you design today?\n\nTip: use `/edit`, `/save`, or `/implement` to modify and version the diagram.' };

    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isIndexing, setIsIndexing] = useState(false);
    const [isIndexed, setIsIndexed] = useState<boolean | null>(null);
    const [applyingFor, setApplyingFor] = useState<string | null>(null);
    const [hasUnimplementedEdits, setHasUnimplementedEdits] = useState(false);
    const [showEditHistory, setShowEditHistory] = useState(false);
    const [pendingCommits, setPendingCommits] = useState<{ hash: string; time: string; message: string }[]>([]);
    const [sessionId, setSessionId] = useState<string>(() => {
        const key = `session:${selectedProject ?? '__default'}`;
        const existing = localStorage.getItem(key);
        if (existing) return existing;
        const id = crypto.randomUUID();
        localStorage.setItem(key, id);
        return id;
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const startNewSession = () => {
        const key = `session:${selectedProject ?? '__default'}`;
        const id = crypto.randomUUID();
        localStorage.setItem(key, id);
        setSessionId(id);
        setMessages([WELCOME_MSG]);
    };

    const activeCommand = parseCommand(input).command;

    const fetchStatus = (project: string) => {
        fetch(`http://localhost:8833/api/diagram/status/${project}`)
            .then(r => r.json())
            .then(d => {
                setHasUnimplementedEdits(d.has_unimplemented_edits);
                onUnimplementedEditsChange?.(d.has_unimplemented_edits);
            })
            .catch(() => {});
    };

    useEffect(() => {
        if (!selectedProject) return;
        setIsIndexed(null);
        setHasUnimplementedEdits(false);
        fetch(`http://localhost:8833/api/index_status/${selectedProject}`)
            .then(r => r.json())
            .then(d => setIsIndexed(d.indexed))
            .catch(() => setIsIndexed(false));
        fetchStatus(selectedProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProject]);

    useEffect(() => {
        if (selectedProject && statusRefreshKey) fetchStatus(selectedProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusRefreshKey]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const post = async (url: string, body: object) => {
        const res = await fetch(`http://localhost:8833${url}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).detail || `Server error ${res.status}`);
        return res.json();
    };

    const handleSend = async () => {
        if (!input.trim()) return;
        const { command, args } = parseCommand(input);
        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            if (command === 'edit') {
                if (!selectedProject) throw new Error('No project selected.');
                const data = await post('/api/diagram/edit', { message: args, project: selectedProject });
                onDiagramUpdate(data.diagram);
                const saved = data.commit_hash ? ` Committed as \`${data.commit_hash}\` on \`diagramedits\`.` : '';
                setMessages(prev => [...prev, { role: 'assistant', content: `Diagram updated.${saved}` }]);
                fetchStatus(selectedProject);

            } else if (command === 'save') {
                if (!selectedProject) throw new Error('No project selected.');
                const data = await post('/api/diagram/save', { project: selectedProject, label: args || undefined });
                setMessages(prev => [...prev, { role: 'assistant', content: `Saved as commit \`${data.commit_hash}\` on branch \`diagramedits\`.` }]);

            } else if (command === 'implement') {
                if (!selectedProject) throw new Error('No project selected.');
                const data = await post('/api/diagram/implement', { project: selectedProject, hint: args || undefined });
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Here's my implementation plan for \`${data.branch_name}\`:`,
                    proposal: data as ProposalData,
                }]);

            } else {
                const data = await post('/api/chat', { message: userMessage.content, project: selectedProject, session_id: sessionId });
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${String(error)}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = async (proposal: ProposalData) => {
        setApplyingFor(proposal.project);
        try {
            const data = await post('/api/diagram/confirm', { project: proposal.project });
            setMessages(prev => prev.map(m =>
                m.proposal?.branch_name === proposal.branch_name
                    ? { ...m, proposal: undefined, content: `Applied. Branch \`${data.branch}\` created with commit \`${data.commit_hash}\`.\n\nFiles written:\n${data.files_written.map((f: string) => `- \`${f}\``).join('\n')}` }
                    : m
            ));
            if (proposal.project) fetchStatus(proposal.project);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Failed to apply: ${String(error)}` }]);
        } finally {
            setApplyingFor(null);
        }
    };

    const handleDiscard = async (proposal: ProposalData) => {
        await post('/api/diagram/discard', { project: proposal.project }).catch(() => {});
        setMessages(prev => prev.map(m =>
            m.proposal?.branch_name === proposal.branch_name
                ? { ...m, proposal: undefined, content: 'Proposal discarded.' }
                : m
        ));
    };

    const handleIndexCode = async () => {
        if (!selectedProject || isIndexing) return;
        setIsIndexing(true);
        try {
            await post('/api/index_code', { project: selectedProject });
            setIsIndexed(true);
            setMessages(prev => [...prev, { role: 'assistant', content: `Successfully indexed codebase for ${selectedProject}!` }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Error indexing codebase: ${String(error)}` }]);
        } finally {
            setIsIndexing(false);
        }
    };

    const cmdStyle = activeCommand ? COMMAND_STYLES[activeCommand] : null;
    const inputBorder = cmdStyle?.border ?? 'border-slate-600 focus-within:border-blue-500 focus-within:ring-blue-500/30';

    return (
        <aside className="w-80 bg-slate-800 border-l border-slate-700 h-full flex flex-col shrink-0 relative z-20">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/80 backdrop-blur shrink-0">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">ArchIDE Agent</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={startNewSession}
                            title="Start a new conversation"
                            className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-2 py-1 rounded-lg transition-colors font-bold"
                        >
                            New Chat
                        </button>
                        {selectedProject && (
                            <button
                                onClick={handleIndexCode}
                                disabled={isIndexing || isIndexed === true}
                                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all text-white ${
                                    isIndexed
                                        ? 'bg-slate-600 opacity-60 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50'
                                }`}
                            >
                                {isIndexing ? 'Indexing...' : isIndexed ? 'Indexed ✓' : 'Index Code'}
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Assistance with your diagram</p>
                {selectedProject && (
                    <div className="mt-2 text-[10px] font-bold tracking-wider text-blue-400 uppercase border border-blue-500/30 bg-blue-500/10 px-2 py-1 rounded inline-block">
                        {selectedProject}
                    </div>
                )}
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col max-w-[95%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start w-full'}`}>
                        <div className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${msg.role === 'user' ? 'text-blue-400' : 'text-emerald-400'}`}>
                            {msg.role}
                        </div>

                        {msg.proposal ? (
                            <ProposalCard
                                proposal={msg.proposal}
                                onApply={() => handleApply(msg.proposal!)}
                                onDiscard={() => handleDiscard(msg.proposal!)}
                                isApplying={applyingFor === msg.proposal.project}
                            />
                        ) : (
                            <div className={`p-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-200 rounded-tl-none'} shadow-sm`}>
                                {msg.role === 'assistant' ? (
                                    <ReactMarkdown
                                        components={{
                                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                            code: ({ children, className }) =>
                                                className ? (
                                                    <pre className="bg-slate-900 rounded p-2 overflow-x-auto text-xs my-2"><code>{children}</code></pre>
                                                ) : (
                                                    <code className="bg-slate-900 rounded px-1 text-xs">{children}</code>
                                                ),
                                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                                            h1: ({ children }) => <h1 className="font-bold text-base mb-1">{children}</h1>,
                                            h2: ({ children }) => <h2 className="font-bold text-sm mb-1">{children}</h2>,
                                            h3: ({ children }) => <h3 className="font-semibold text-sm mb-1">{children}</h3>,
                                            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                ) : <UserMessageContent content={msg.content} />}
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && (
                    <div className="flex flex-col self-start max-w-[85%]">
                        <div className="text-[10px] uppercase font-bold tracking-widest mb-1 text-emerald-400">assistant</div>
                        <div className="p-3 bg-slate-700 text-slate-400 rounded-2xl rounded-tl-none flex gap-1 items-center">
                            <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                            <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Unimplemented edits banner */}
            {hasUnimplementedEdits && (
                <div className="bg-amber-500/10 border-t border-amber-500/30 shrink-0">
                    <div className="px-4 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider truncate">Unimplemented diagram edits</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => {
                                    const next = !showEditHistory;
                                    setShowEditHistory(next);
                                    if (next && selectedProject) {
                                        fetch(`http://localhost:8833/api/diagram/pending_commits/${selectedProject}`)
                                            .then(r => r.json())
                                            .then(d => setPendingCommits(d.commits ?? []))
                                            .catch(() => setPendingCommits([]));
                                    }
                                }}
                                className="text-[10px] font-bold text-amber-400 hover:text-amber-200 transition-colors"
                            >
                                {showEditHistory ? 'Hide ▲' : 'Show ▼'}
                            </button>
                            <button
                                onClick={() => setInput('/implement ')}
                                className="text-[10px] font-bold text-amber-300 border border-amber-500/40 hover:bg-amber-500/20 px-2 py-0.5 rounded transition-colors"
                            >
                                Implement →
                            </button>
                        </div>
                    </div>

                    {showEditHistory && (
                        <div className="px-4 pb-3 flex flex-col gap-1">
                            {pendingCommits.length === 0 ? (
                                <p className="text-[10px] text-slate-500 italic">No commits found.</p>
                            ) : pendingCommits.map((c, i) => (
                                <div key={i} className="flex items-start gap-2 py-0.5">
                                    <span className="shrink-0 w-1 h-1 mt-1.5 rounded-full bg-amber-500/60" />
                                    <span className="font-mono text-[10px] text-amber-500/80 shrink-0">{c.hash}</span>
                                    <span className="text-[10px] text-slate-300 flex-1 leading-tight">{c.message.replace(/^auto-save:\s*/i, '')}</span>
                                    <span className="text-[10px] text-slate-500 shrink-0">{c.time}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Input Form */}
            <div className="p-4 bg-slate-800 border-t border-slate-700 shrink-0">
                <form
                    onSubmit={e => { e.preventDefault(); handleSend(); }}
                    className={`flex flex-col gap-2 relative bg-slate-900 border rounded-xl overflow-hidden focus-within:ring-1 transition-all shadow-inner ${inputBorder}`}
                >
                    {cmdStyle && (
                        <div className={`px-3 pt-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${cmdStyle.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cmdStyle.dot}`} />
                            {cmdStyle.label}
                        </div>
                    )}
                    <textarea
                        className="w-full bg-transparent text-white p-3 text-sm focus:outline-none resize-none placeholder:text-slate-500"
                        rows={2}
                        placeholder="Ask questions, or /edit /save /implement..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                        }}
                    />
                    <div className="flex justify-between items-center p-2 bg-slate-800/50">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold px-2">Enter to send</span>
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className={`disabled:opacity-50 text-white p-1.5 px-4 rounded-lg text-xs font-bold transition-colors ${
                                cmdStyle?.btn ?? 'bg-blue-600 hover:bg-blue-500 disabled:hover:bg-blue-600'
                            }`}
                        >
                            {cmdStyle?.btnLabel ?? 'Send'}
                        </button>
                    </div>
                </form>
            </div>
        </aside>
    );
}
