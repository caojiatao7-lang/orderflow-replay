import {lowerBound} from './model.mjs';
export function timeLowerBound(times,t){let l=0,r=times.length;while(l<r){const m=(l+r)>>1;if(times[m]<t)l=m+1;else r=m;}return l;}
export function upperBound(snaps,t){let l=0,r=snaps.length;while(l<r){const m=(l+r)>>1;if(snaps[m].t<=t)l=m+1;else r=m;}return l;}
export function unionTimes(markets,contracts){
  const times=new Set();for(const contract of contracts)for(const s of markets[contract]?.snaps||[])times.add(s.t);
  return [...times].sort((a,b)=>a-b);
}
export function defaultCompareTime(markets,contracts){
  const available=contracts.map(c=>markets[c]?.snaps).filter(s=>s?.length);
  if(!available.length)return null;
  const start=Math.max(...available.map(s=>s[0].t)),end=Math.min(...available.map(s=>s.at(-1).t));
  return start<=end?start:Math.min(...available.map(s=>s[0].t));
}
export function alignedMarket(market,t,span=10,staleMs=2000){
  const all=market?.snaps||[],index=upperBound(all,t)-1,snapshot=all[index]||null;
  const age=snapshot?t-snapshot.t:null,start=t-span*1000,end=t+span*1000;
  return {t,start,end,index,snapshot,age,stale:age!=null&&age>staleMs,afterEnd:!!all.length&&t>all.at(-1).t,
    snaps:all.slice(lowerBound(all,start),upperBound(all,end)),first:all[0]?.t??null,last:all.at(-1)?.t??null};
}
export function depthRowContext(market,t){
  const all=market?.snaps||[],absoluteIndex=upperBound(all,t)-1;
  if(absoluteIndex<0)return {t,snaps:[],index:-1,absoluteIndex,total:all.length};
  const start=Math.max(0,Math.min(absoluteIndex-2,all.length-5));
  return {t,snaps:all.slice(start,start+5),index:absoluteIndex-start,absoluteIndex,total:all.length};
}
