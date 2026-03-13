import { Handle, Position } from '@xyflow/react';

export default function CustomNode({ data }: any) {
    const getColors = () => {
        switch (data.tier) {
            case 'Core': return 'bg-blue-900 border-blue-500 text-blue-100';
            case 'Supporting': return 'bg-slate-800 border-slate-500 text-slate-200';
            case 'Dev': return 'bg-orange-900 border-orange-500 text-orange-100';
            case 'Component': return 'bg-teal-900 border-teal-500 text-teal-100';
            default: return 'bg-purple-900 border-purple-500 text-purple-100';
        }
    }

    return (
        <div className={`px-1.5 py-1 shadow-sm rounded-sm border ${getColors()} min-w-[80px] w-auto max-w-[120px]`}>
            <Handle type="target" position={Position.Top} className="!bg-gray-400 !border !border-gray-800 !w-1.5 !h-1.5" />
            <div className="font-bold text-[8px] mb-0.5 leading-none">{data.label}</div>
            {data.path && <div className="text-[6px] opacity-70 font-mono break-all leading-none mb-0.5">{data.path}</div>}
            {data.description && <div className="text-[6px] opacity-80 line-clamp-2 leading-tight">{data.description}</div>}
            {data.tier && <div className="text-[5px] uppercase font-bold tracking-widest mt-1 opacity-60 text-right">{data.tier}</div>}
            <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !border-2 !border-gray-800" />
        </div>
    );
}
