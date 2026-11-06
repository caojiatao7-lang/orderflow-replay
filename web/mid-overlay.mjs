import {lowerBound} from './model.mjs';
import {upperBound} from './compare.mjs';
import {priceUnit} from './charts.mjs';
export const MID_COLORS=['#2458d3','#d7831d','#208a70','#9653b3','#ce4f69','#39879d','#8c7430','#607089'];
export function midpoint(snapshot){
  const bid=snapshot?.bids?.[0]?.[0],ask=snapshot?.asks?.[0]?.[0];
  return Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>0&&bid<1e20&&ask<1e20&&bid<=ask?(bid+ask)/2:null;
}
// Keep chronological first/last and price extremes per time bucket, separately for each uninterrupted segment.
export function sampleMidSegment(points,start,end,buckets=550){
  if(points.length<=buckets*4)return points;
  const groups=new Map();
  for(let i=0;i<points.length;i++){
    const bucket=Math.max(0,Math.min(buckets-1,Math.floor((points[i].t-start)/(end-start)*buckets))),g=groups.get(bucket);
    if(!g)groups.set(bucket,{first:i,last:i,min:i,max:i});
    else {g.last=i;if(points[i].p<points[g.min].p)g.min=i;if(points[i].p>points[g.max].p)g.max=i;}
  }
  return [...groups.values()].flatMap(g=>[...new Set([g.first,g.min,g.max,g.last])].sort((a,b)=>a-b).map(i=>points[i]));
}
export function buildMidOverlay(dataset,contracts,start,end){
  const all=Object.keys(dataset.markets).sort(),products=new Set(contracts.map(c=>c.match(/^[a-z]+/i)?.[0].toLowerCase()));
  if(!contracts.length)return {error:'请勾选需要叠加的合约。',series:[]};
  if(products.size!==1)return {error:'中间价同轴图用于比较同一品种的合约。请勾选同一品种；下方多品种盘口仍可正常查看。',series:[]};
  const series=[];let low=Infinity,high=-Infinity,rawCount=0,drawCount=0;
  for(const contract of contracts){
    const snaps=dataset.markets[contract]?.snaps||[],segments=[];let segment=[],previous=null;
    for(let i=Math.max(0,lowerBound(snaps,start)-1),to=upperBound(snaps,end);i<to;i++){
      const s=snaps[i],p=midpoint(s);
      if(p==null){if(segment.length)segments.push(segment);segment=[];previous=null;continue;}
      if(previous&&s.t-previous.t>2000){segments.push(segment);segment=[];}
      const point={t:s.t,p};segment.push(point);previous=point;
      if(s.t>=start){low=Math.min(low,p);high=Math.max(high,p);rawCount++;}
    }
    if(segment.length)segments.push(segment);
    const sampled=segments.map(points=>sampleMidSegment(points,start,end));drawCount+=sampled.reduce((n,s)=>n+s.length,0);
    series.push({contract,color:MID_COLORS[all.indexOf(contract)%MID_COLORS.length],segments:sampled});
  }
  if(!Number.isFinite(low))return {error:'此范围没有有效买一／卖一报价，无法计算中间价。',series:[]};
  const pad=Math.max((high-low)*.08,Math.abs(high)*.000001,.001);low-=pad;high+=pad;
  return {series,start,end,low,high,rawCount,drawCount,unit:priceUnit(contracts[0]),sampled:drawCount<rawCount};
}
