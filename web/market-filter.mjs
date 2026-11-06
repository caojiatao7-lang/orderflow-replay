import {alignedMarket,upperBound} from './compare.mjs';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function marketMetrics(s){
  const sum=side=>side?.length===5&&side.every(x=>Array.isArray(x)&&finite(x[0])&&x[0]>0&&x[0]<1e20&&finite(x[1])&&x[1]>=0)?side.reduce((a,x)=>a+x[1],0):null;
  const buy=sum(s?.bids),sell=sum(s?.asks);
  return {delta:finite(s?.dv)?s.dv:null,volume:finite(s?.v)?s.v:null,buy,sell,difference:buy==null||sell==null?null:buy-sell};
}
export function parseMarketFilter(raw){
  const result={volumeMode:raw.volumeMode==='volume'?'volume':'delta',differenceMode:raw.differenceMode==='absolute'?'absolute':'signed'};
  for(const key of ['volumeMin','volumeMax','differenceMin','differenceMax']){
    const text=String(raw[key]??'').trim();result[key]=text===''?null:Number(text);
    if(text!==''&&!Number.isFinite(result[key]))return {error:'请输入有效的筛选数值。'};
  }
  for(const prefix of ['volume','difference'])if(result[prefix+'Min']!=null&&result[prefix+'Max']!=null&&result[prefix+'Min']>result[prefix+'Max'])return {error:'下限不能大于上限，请修改后应用。'};
  if(result.differenceMode==='absolute'&&(result.differenceMin<0||result.differenceMax<0))return {error:'挂单差绝对值的上下限不能为负数。'};
  result.active=['volumeMin','volumeMax','differenceMin','differenceMax'].some(k=>result[k]!=null);
  return {filter:result};
}
export function matchesMetrics(metrics,f){
  const between=(value,min,max)=>(min==null&&max==null)||(value!=null&&(min==null||value>=min)&&(max==null||value<=max));
  const d=metrics.difference==null?null:f.differenceMode==='absolute'?Math.abs(metrics.difference):metrics.difference;
  return between(metrics[f.volumeMode],f.volumeMin,f.volumeMax)&&between(d,f.differenceMin,f.differenceMax);
}
export function matchingContracts(markets,contracts,t,f){
  if(!f.active)return [...contracts];
  return contracts.filter(c=>{const a=alignedMarket(markets[c],t,0);return a.snapshot&&!a.stale&&!a.afterEnd&&matchesMetrics(marketMetrics(a.snapshot),f);});
}
// Search original snapshots, using the same last-row rule for duplicate timestamps as the displayed book.
export function findMatchingTime(markets,contracts,t,direction,f){
  if(!f.active)return null;
  let best=null;
  for(const c of contracts){
    const snaps=markets[c]?.snaps||[];
    let i=direction>0?upperBound(snaps,t):upperBound(snaps,t-1)-1;
    while(i>=0&&i<snaps.length){
      const at=snaps[i].t,end=upperBound(snaps,at)-1;
      if(best!=null&&(direction>0?at>=best:at<=best))break;
      if(matchesMetrics(marketMetrics(snaps[end]),f)){best=at;break;}
      i=direction>0?end+1:upperBound(snaps,at-1)-1;
    }
  }
  return best;
}
