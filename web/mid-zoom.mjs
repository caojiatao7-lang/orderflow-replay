import {dateTime,clock} from './model.mjs';
export function marketTimeBounds(markets){
  let start=Infinity,end=-Infinity;
  for(const market of Object.values(markets)){if(!market.snaps?.length)continue;start=Math.min(start,market.snaps[0].t);end=Math.max(end,market.snaps.at(-1).t);}
  return Number.isFinite(start)&&Number.isFinite(end)?{start,end}:null;
}
export function parseBeijingTime(value){
  const [day,time]=String(value||'').split('T');if(!day||!time)return null;
  return dateTime(day,time.length===5?time+':00':time);
}
export function validateMidRange(start,end,bounds){
  if(!Number.isFinite(start)||!Number.isFinite(end))return {error:'请填写有效的开始时间和结束时间（北京时间）。'};
  start=Math.round(start);end=Math.round(end);
  if(end<=start)return {error:'结束时间必须晚于开始时间。'};
  if(!bounds||start<bounds.start||end>bounds.end)return {error:'所选区间超出已导入行情范围，请核对日期与时间。'};
  return {start:Math.round(start),end:Math.round(end)};
}
export function dragMidRange(view,startFraction,endFraction,bounds){
  if(!view||!bounds||!Number.isFinite(startFraction)||!Number.isFinite(endFraction))return {error:'无法确定拖选范围。'};
  const at=f=>Math.round(view.start+Math.max(0,Math.min(1,f))*(view.end-view.start));
  const left=Math.max(bounds.start,Math.min(at(startFraction),at(endFraction))),right=Math.min(bounds.end,Math.max(at(startFraction),at(endFraction)));
  return validateMidRange(left,right,bounds);
}
export const midAxisLabel=(t,duration)=>duration<20000?clock(t):clock(t).slice(0,8);
