export const BUILTIN_DATASETS={synthetic:{label:'虚构订单与五合约演示',file:'../examples/synthetic-replay.json',day:'2025-01-06',mode:'replay'}};
export const DEFAULT_DATASET='synthetic';
export function builtinDataset(id){if(!Object.hasOwn(BUILTIN_DATASETS,id))throw Error('未知演示数据');return BUILTIN_DATASETS[id];}
