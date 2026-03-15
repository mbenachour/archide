import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
    role: 'assistant' | 'user';
    content: string;
}

type Command = 'edit' | 'save' | null;

function parseCommand(text: string): { command: Command; args: string } {
    if (/^\/edit(\s|$)/.test(text)) return { command: 'edit', args: text.slice(5).trim() };
    if (/^\/save(\s|$)/.test(text)) return { command: 'save', args: text.slice(5).trim() };
    return { command: null, args: text };
}

function UserMessageContent({ content }: { content: string }) {
    const { command, args } = parseCommand(content);
    if (!command) return <>{content}</>;
    const pillClass = command === 'edit'
        ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
        : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40';
    return (
        <span>
            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mr-1.5 ${pillClass}`}>
                /{command}
            </span>
            {args}
        </span>
    );
}

export default function ChatPanel({ selectedProject, onDiagramUpdate }: { selectedProject: string | null; onDiagramUpdate: (graphData: any) => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: 'Hello! I am your Architecture Assistant. How can I help you design today?\n\nTip: use `/edit <instruction>` to modify the diagram, or `/save <label>` to commit it.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isIndexing, setIsIndexing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeCommand = parseCommand(input).command;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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
                const res = await fetch('http://localhost:8833/api/diagram/edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: args, project: selectedProject }),
                });
                if (!res.ok) throw new Error((await res.json()).detail || `Server error ${res.status}`);
                const data = await res.json();
                onDiagramUpdate(data.diagram);
                const saved = data.commit_hash ? ` Committed as \`${data.commit_hash}\` on \`diagramedits\`.` : '';
                setMessages(prev => [...prev, { role: 'assistant', content: `Diagram updated.${saved}` }]);

            } else if (command === 'save') {
                if (!selectedProject) throw new Error('No project selected.');
                const res = await fetch('http://localhost:8833/api/diagram/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: selectedProject, label: args || undefined }),
                });
                if (!res.ok) throw new Error((await res.json()).detail || `Server error ${res.status}`);
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', content: `Saved as commit \`${data.commit_hash}\` on branch \`diagramedits\`.` }]);

            } else {
                const res = await fetch('http://localhost:8833/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userMessage.content, project: selectedProject }),
                });
                if (!res.ok) throw new Error(`Server returned ${res.status}`);
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${String(error)}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIndexCode = async () => {
        if (!selectedProject || isIndexing) return;
        setIsIndexing(true);
        try {
            const res = await fetch('http://localhost:8833/api/index_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: selectedProject }),
            });
            if (!res.ok) throw new Error('Failed to index codebase');
            setMessages(prev => [...prev, { role: 'assistant', content: `Successfully indexed codebase for ${selectedProject}!` }]);
        } catch (error) {
            console.error('Index error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: `Error indexing codebase: ${String(error)}` }]);
        } finally {
            setIsIndexing(false);
        }
    };

    const inputBorderClass = activeCommand === 'edit'
        ? 'border-amber-500/60 focus-within:border-amber-400 focus-within:ring-amber-500/30'
        : activeCommand === 'save'
        ? 'border-emerald-500/60 focus-within:border-emerald-400 focus-within:ring-emerald-500/30'
        : 'border-slate-600 focus-within:border-blue-500 focus-within:ring-blue-500/30';

    return (
        <aside className="w-80 bg-slate-800 border-l border-slate-700 h-full flex flex-col shrink-0 relative z-20">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/80 backdrop-blur shrink-0 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        AI Agent
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Assistance with your diagram</p>
                    {selectedProject && (
                        <div className="mt-2 text-[10px] font-bold tracking-wider text-blue-400 uppercase border border-blue-500/30 bg-blue-500/10 px-2 py-1 rounded inline-block">
                            {selectedProject}
                        </div>
                    )}
                </div>
                {selectedProject && (
                    <button
                        onClick={handleIndexCode}
                        disabled={isIndexing}
                        className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold transition-all"
                    >
                        {isIndexing ? 'Indexing...' : 'Index Code'}
                    </button>
                )}
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col max-w-[90%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                        <div className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${msg.role === 'user' ? 'text-blue-400' : 'text-emerald-400'}`}>
                            {msg.role}
                        </div>
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
                    </div>
                ))}

                {isLoading && (
                    <div className="flex flex-col self-start max-w-[85%]">
                        <div className="text-[10px] uppercase font-bold tracking-widest mb-1 text-emerald-400">
                            assistant
                        </div>
                        <div className="p-3 bg-slate-700 text-slate-400 rounded-2xl rounded-tl-none flex gap-1 items-center">
                            <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></span>
                            <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                            <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className="p-4 bg-slate-800 border-t border-slate-700 shrink-0">
                <form
                    onSubmit={e => { e.preventDefault(); handleSend(); }}
                    className={`flex flex-col gap-2 relative bg-slate-900 border rounded-xl overflow-hidden focus-within:ring-1 transition-all shadow-inner ${inputBorderClass}`}
                >
                    {activeCommand && (
                        <div className={`px-3 pt-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${activeCommand === 'edit' ? 'text-amber-400' : 'text-emerald-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${activeCommand === 'edit' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                            {activeCommand === 'edit' ? 'Edit mode — describe your changes' : 'Save mode — optionally add a label'}
                        </div>
                    )}
                    <textarea
                        className="w-full bg-transparent text-white p-3 text-sm focus:outline-none resize-none placeholder:text-slate-500"
                        rows={2}
                        placeholder="Ask questions, or /edit /save..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <div className="flex justify-between items-center p-2 bg-slate-800/50">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold px-2">
                            Enter to send
                        </span>
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className={`disabled:opacity-50 text-white p-1.5 px-4 rounded-lg text-xs font-bold transition-colors ${
                                activeCommand === 'edit' ? 'bg-amber-600 hover:bg-amber-500 disabled:hover:bg-amber-600'
                                : activeCommand === 'save' ? 'bg-emerald-600 hover:bg-emerald-500 disabled:hover:bg-emerald-600'
                                : 'bg-blue-600 hover:bg-blue-500 disabled:hover:bg-blue-600'
                            }`}
                        >
                            {activeCommand === 'edit' ? 'Edit' : activeCommand === 'save' ? 'Save' : 'Send'}
                        </button>
                    </div>
                </form>
            </div>
        </aside>
    );
}
