import React, { useState } from 'react';

export default function Sidebar() {
    const [isOpen, setIsOpen] = useState(true);

    const onDragStart = (event: React.DragEvent, nodeType: string, tier: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.setData('application/reactflow-tier', tier);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside className={`${isOpen ? 'w-64' : 'w-12'} bg-slate-800 border-r border-slate-700 py-4 shrink-0 flex flex-col items-center gap-4 text-white z-10 transition-all duration-300 h-full relative`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="absolute -right-3 top-6 bg-blue-600 hover:bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-800 z-50 text-xs shadow-lg transition-transform"
                title={isOpen ? "Collapse Toolbox" : "Expand Toolbox"}
            >
                {isOpen ? '◀' : '▶'}
            </button>

            {isOpen ? (
                <div className="w-full px-4 flex flex-col gap-4">
                    <div>
                        <h2 className="text-xl font-bold mb-1">Toolbox</h2>
                        <p className="text-xs text-slate-400 mb-4">Drag these nodes to the canvas to build your architecture manually.</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div
                            className="p-3 bg-blue-900 border-2 border-blue-500 rounded-lg cursor-grab hover:shadow-lg hover:shadow-blue-900/50 transition-all font-bold text-center text-sm text-blue-100"
                            onDragStart={(event) => onDragStart(event, 'custom', 'Core')}
                            draggable
                        >
                            ⚙️ Core Component
                        </div>

                        <div
                            className="p-3 bg-slate-700 border-2 border-slate-500 rounded-lg cursor-grab hover:shadow-lg hover:shadow-slate-700/50 transition-all font-bold text-center text-sm text-slate-200"
                            onDragStart={(event) => onDragStart(event, 'custom', 'Supporting')}
                            draggable
                        >
                            🔧 Supporting Tool
                        </div>

                        <div
                            className="p-3 bg-orange-900 border-2 border-orange-500 rounded-lg cursor-grab hover:shadow-lg hover:shadow-orange-900/50 transition-all font-bold text-center text-sm text-orange-100"
                            onDragStart={(event) => onDragStart(event, 'custom', 'Dev')}
                            draggable
                        >
                            🛠 Dev / Build
                        </div>

                        <div
                            className="p-3 bg-teal-900 border-2 border-teal-500 rounded-lg cursor-grab hover:shadow-lg hover:shadow-teal-900/50 transition-all font-bold text-center text-sm text-teal-100"
                            onDragStart={(event) => onDragStart(event, 'custom', 'External')}
                            draggable
                        >
                            ☁️ External SaaS
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-start h-full pt-10 mt-12 gap-8 w-full select-none opacity-50">
                    <h2 className="text-xl font-bold -rotate-90 tracking-widest uppercase">Toolbox</h2>
                </div>
            )}
        </aside>
    );
}
