import { NodeResizer } from '@xyflow/react';

export default function ContainerNode({ data, selected }: any) {
    return (
        <>
            <NodeResizer
                color="#3b82f6"
                isVisible={selected}
                minWidth={200}
                minHeight={150}
            />
            <div className="w-full h-full border-2 border-dashed border-slate-500 bg-slate-800/20 rounded-xl relative">
                <div className="absolute top-0 left-0 w-full p-2 bg-slate-800/80 rounded-t-lg border-b border-slate-600 text-slate-300 font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                    🗂️ {data.label || 'Container'}
                </div>
            </div>
        </>
    );
}
