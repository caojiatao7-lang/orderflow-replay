import {clock,fullTime} from './model.mjs';
import {esc,fmt,priceUnit,depthCards} from './charts.mjs?v=depth-rows-v1';
import {midpoint} from './mid-overlay.mjs';
import {alignedMarket,depthRowContext} from './compare.mjs?v=depth-rows-v1';
import {marketMetrics} from './market-filter.mjs';
function metricsHtml(s){const m=marketMetrics(s),val=v=>v==null?'未知':fmt(v)+' 手';return `<div class="compare-filter-metrics"><span>成交增量 <strong>${val(m.delta)}</strong></span><span>累计成交 <strong>${val(m.volume)}</strong></span><span class="buy-text">五档买量 ${val(m.buy)}</span><span class="sell-text">五档卖量 ${val(m.sell)}</span><span>买卖挂单差 <strong>${m.difference>0?'+':''}${val(m.difference)}</strong></span></div>`;}
const valid=p=>p!=null&&p>0&&p<1e20;
export function comparisonPlot(context){
  const {snaps,t,start,end,snapshot}=context,W=540,H=180,L=52,R=528,T=12,B=112,V=132,Q=158;
  const prices=snaps.flatMap(s=>[...s.bids,...s.asks].map(p=>p[0])).filter(valid);
  if(!prices.length)return '<div class="compare-plot-empty">此时间窗口内没有有效报价。</div>';
  let low=prices.reduce((a,b)=>Math.min(a,b),Infinity),high=prices.reduce((a,b)=>Math.max(a,b),-Infinity);const pad=Math.max((high-low)*.1,Math.abs(high)*.000001,.001);low-=pad;high+=pad;
  const x=at=>L+(at-start)/(end-start)*(R-L),y=p=>B-(p-low)/(high-low)*(B-T);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="共享时间轴五档价格与成交量增量"><line x1="${L}" x2="${R}" y1="${B}" y2="${B}" stroke="#dce3eb"/>`;
  for(let k=0;k<3;k++){const p=low+(high-low)*k/2;svg+=`<line x1="${L}" x2="${R}" y1="${y(p)}" y2="${y(p)}" stroke="#edf1f5"/><text x="${L-6}" y="${y(p)+3}" text-anchor="end" fill="#76828e" font-size="9">${fmt(Number(p.toPrecision(6)))}</text>`;}
  for(const side of ['bids','asks'])for(let level=4;level>=0;level--){
    let path='',previous=null;
    for(const s of snaps){const p=s[side][level][0];if(!valid(p)){previous=null;continue;}
      path+=previous&&s.t-previous.t<=2000?`L${x(s.t)},${y(previous[side][level][0])}L${x(s.t)},${y(p)}`:`M${x(s.t)},${y(p)}`;previous=s;
    }
    svg+=`<path d="${path}" fill="none" stroke="${side==='bids'?'#2c78ab':'#c47b3f'}" stroke-width="${level===0?1.5:.8}" opacity="${level===0?1:.32}"/>`;
  }
  const vmin=snaps.reduce((m,s)=>Math.min(m,s.dv??0),0),vmax=snaps.reduce((m,s)=>Math.max(m,s.dv??0),1),vy=v=>Q-(v-vmin)/(vmax-vmin)*(Q-V),width=Math.max(1,Math.min(7,(R-L)/Math.max(snaps.length,1)*.65));
  svg+=`<line x1="${L}" x2="${R}" y1="${vy(0)}" y2="${vy(0)}" stroke="#e5eaf0"/>`;
  for(const s of snaps){if(s.dv==null)continue;const h=Math.abs(vy(s.dv)-vy(0));svg+=`<rect x="${x(s.t)-width/2}" y="${Math.min(vy(s.dv),vy(0))}" width="${width}" height="${Math.max(.5,h)}" fill="${s.dv<0?'#b7524f':'#899b92'}"/>`;}
  svg+=`<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${Q}" stroke="#2458d3" stroke-dasharray="3 3"/><text x="${L}" y="${V-3}" font-size="8" fill="#76828e">逐快照成交量增量</text>`;
  if(snapshot&&snapshot.t>=start)for(const side of ['bids','asks']){const p=snapshot[side][0][0];if(valid(p))svg+=`<circle cx="${x(snapshot.t)}" cy="${y(p)}" r="3" fill="white" stroke="${side==='bids'?'#2c78ab':'#c47b3f'}" stroke-width="1.5"/>`;}
  for(let k=0;k<3;k++){const at=start+(end-start)*k/2;svg+=`<text x="${x(at)}" y="${H-5}" font-size="9" text-anchor="${k===0?'start':k===2?'end':'middle'}" fill="#76828e">${clock(at)}</text>`;}
  return svg+'</svg>';
}
export function comparisonCard(contract,context){
  const s=context.snapshot,age=context.age==null?'':`${(context.age/1000).toFixed(3)} 秒`,warning=!s||context.stale||context.afterEnd;
  const status=!s?'此时尚无快照':context.afterEnd?'已超出本文件末端':context.stale?'快照滞后':context.age===0?'时间完全对应':'使用此前快照';
  const rows=s?Array.from({length:5},(_,i)=>`<tr><td class="buy-text">${fmt(s.bids[i][1])}</td><td class="buy-text">${fmt(s.bids[i][0])}</td><th>${i+1} 档</th><td class="sell-text">${fmt(s.asks[i][0])}</td><td class="sell-text">${fmt(s.asks[i][1])}</td></tr>`).join(''):'';
  return `<article class="compare-card${warning?' compare-delayed':''}" aria-label="${esc(contract.toUpperCase())} 同步行情"><div class="compare-card-head"><h3>${esc(contract.toUpperCase())}</h3><span>${status}</span></div><div class="compare-snapshot">实际快照：<strong>${s?fullTime(s.t):'无此前数据'}</strong>${s?`<br>距共享指针 ${age} · 源行 ${s.sourceRow??'未提供'}`:''}</div><div class="compare-kpis"><span>中间价 <strong>${midpoint(s)==null?'未知':fmt(midpoint(s))}</strong></span><span>最新价 <strong>${fmt(s?.p)}</strong></span><span>较前快照成交量 <strong>${s?.dv==null?'未知':fmt(s.dv)+' 手'}</strong></span></div>${metricsHtml(s)}<div class="compare-plot">${comparisonPlot(context)}</div>${s?`<table class="compare-book"><thead><tr><th>买量（手）</th><th>买价</th><th>档位</th><th>卖价</th><th>卖量（手）</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="compare-no-snapshot">不会用之后的快照填补当前盘口。</div>'}<div class="compare-unit">价格单位：${priceUnit(contract)}${s?.valid===false?' · 本快照含无效或不完整盘口':''}</div></article>`;
}
export function comparisonDepthRow(contract,market,t){
  const a=alignedMarket(market,t,0),s=a.snapshot,context=depthRowContext(market,t);
  const status=!s?'此时尚无快照':a.afterEnd?'已超出本文件末端':a.stale?'快照滞后':a.age===0?'时间完全对应':'使用此前快照';
  const result=s?depthCards(context,context.index,contract):{html:''};
  const html=result.html.replaceAll('class="depth-card','role="button" tabindex="0" class="depth-card');
  return `<article class="compare-depth-row${!s||a.stale||a.afterEnd?' compare-delayed':''}" aria-label="${esc(contract.toUpperCase())} 逐快照五档盘口"><div class="compare-depth-heading"><div><h3>${esc(contract.toUpperCase())}</h3><span>逐快照五档盘口</span></div><div class="compare-row-mid"><span>中间价</span><strong>${midpoint(s)==null?'未知':fmt(midpoint(s))}</strong></div><div class="compare-depth-status"><strong>${status}</strong><span>${s?`实际指针快照 ${fullTime(s.t)} · 距共享指针 ${(a.age/1000).toFixed(3)} 秒`:'共享指针之前没有行情，不用未来快照替代当前盘口。'}</span></div><div class="compare-depth-legend"><span class="buy-text">买量向左</span><span class="sell-text">卖量向右</span><span>蓝框为指针快照</span></div></div>${metricsHtml(s)}${html?`<div class="compare-depth-cards">${html}</div>`:`<div class="compare-no-snapshot">${s?'本组快照没有有效的五档报价。':'此时尚无可展示的盘口。'}</div>`}<p class="compare-depth-meta">${s?`当前文件快照 ${context.absoluteIndex+1}/${context.total} · 源行 ${s.sourceRow??'未提供'} · 价格单位：${priceUnit(contract)}。${s.valid===false?'当前快照含无效或不完整盘口。':''}`:''}同一行统一价格、挂量和成交量刻度；不同行独立。左右是相邻真实快照，时间间隔按原文件保留，不补点；正时间差表示后续快照。</p></article>`;
}
