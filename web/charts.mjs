import {clock,fullTime} from './model.mjs';
const BID='#2c78ab',ASK='#c47b3f',MUTED='#8997a3',GRID='#edf1f5';
export const fmt=v=>v==null||!Number.isFinite(v)?'—':Number.isInteger(v)?v.toLocaleString('en-US'):v.toLocaleString('en-US',{maximumFractionDigits:3});
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function priceUnit(contract){return contract.startsWith('ag')?'元／千克':contract.startsWith('au')?'元／克':/^(fu|sn)\d/.test(contract)?'元／吨':'合约报价单位';}
export function drawTimeline(canvas,ctxData,cursor,order,filters){
  const box=canvas.getBoundingClientRect(),w=box.width,h=box.height,dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const c=canvas.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);
  if(!ctxData?.snaps.length)return null;
  const {snaps,start,end,t}=ctxData,L=58,R=w-20,P=32,Q=h*.68,V=Q+24,B=h-30;
  const prices=snaps.flatMap(s=>[...s.bids,...s.asks].map(p=>p[0])).filter(v=>v>0&&v<1e20);
  if(!prices.length)return null;
  let lo=Math.min(...prices),hi=Math.max(...prices);const padding=Math.max((hi-lo)*.08,order.contract.startsWith('au')?.02:1);
  lo-=padding;hi+=padding;
  const x=at=>L+(at-start)/(end-start)*(R-L),y=p=>Q-(p-lo)/(hi-lo)*(Q-P);
  c.font='10px -apple-system, "PingFang SC", sans-serif';c.lineWidth=1;
  c.fillStyle=MUTED;c.fillText(`价格（${priceUnit(order.contract)}）`,L,15);
  for(let i=0;i<=4;i++){const p=lo+(hi-lo)*i/4,at=y(p);c.strokeStyle=GRID;c.beginPath();c.moveTo(L,at);c.lineTo(R,at);c.stroke();c.textAlign='right';c.fillText(fmt(Number(p.toFixed(order.contract.startsWith('au')?2:0))),L-8,at+3);}
  c.textAlign='left';c.fillStyle='rgba(189,142,47,.09)';c.fillRect(x(t),P,Math.max(1,x(t+(order.precisions?.[filters.event]||order.precision||1000))-x(t)),B-P);
  for(const side of ['bids','asks'])for(let level=0;level<5;level++){
    c.strokeStyle=side==='bids'?'rgba(44,120,171,.32)':'rgba(196,123,63,.33)';c.lineWidth=.9;c.beginPath();let prev=null;
    for(const s of snaps){const p=s[side][level][0];if(!(p>0&&p<1e20)){prev=null;continue;}if(prev&&s.t-prev.t<=2000){c.lineTo(x(s.t),y(prev[side][level][0]));c.lineTo(x(s.t),y(p));}else c.moveTo(x(s.t),y(p));prev=s;}c.stroke();
    for(const s of snaps){const [p,q]=s[side][level];if(!(p>0&&p<1e20&&q>0))continue;c.fillStyle=side==='bids'?'rgba(44,120,171,.68)':'rgba(196,123,63,.68)';c.beginPath();c.arc(x(s.t),y(p),Math.min(5,1.5+Math.sqrt(q)*.25),0,Math.PI*2);c.fill();}
  }
  if(order.price>lo&&order.price<hi){c.setLineDash([4,4]);c.strokeStyle='#b7954b';c.beginPath();c.moveTo(L,y(order.price));c.lineTo(R,y(order.price));c.stroke();c.setLineDash([]);}
  const dvs=snaps.map(s=>s.dv).filter(v=>v!=null&&Number.isFinite(v)),vmin=Math.min(0,...dvs),vmax=Math.max(1,...dvs),vy=v=>B-(v-vmin)/(vmax-vmin)*(B-V);
  c.fillStyle=MUTED;c.textAlign='left';c.fillText('较前一快照成交量增量（手）',L,V-7);
  for(const val of [...new Set([0,vmax,vmin].filter(v=>v!==0||vmin<=0))]){c.strokeStyle=GRID;c.beginPath();c.moveTo(L,vy(val));c.lineTo(R,vy(val));c.stroke();c.textAlign='right';c.fillText(fmt(val),L-8,vy(val)+3);}
  const barWidth=Math.max(1,Math.min(12,(R-L)/Math.max(snaps.length,1)*.65));
  for(const s of snaps){if(s.dv==null)continue;c.fillStyle=s.dv<0?'#b55c58':'#899b92';c.fillRect(x(s.t)-barWidth/2,Math.min(vy(0),vy(s.dv)),barWidth,Math.max(.6,Math.abs(vy(s.dv)-vy(0))));}
  c.textAlign='center';c.fillStyle=MUTED;
  for(let i=0;i<=5;i++){const at=start+(end-start)*i/5;c.fillText(clock(at).slice(0,8),x(at),h-10);}
  const hit=[];
  for(const marker of ctxData.markers){
    if(!filters[marker.kind]||(!marker.selected&&!filters.others))continue;
    const xx=x(marker.t),yy=marker.price>lo&&marker.price<hi?y(marker.price):P+10;
    const color=marker.kind==='fill'?'#288571':marker.kind==='cancel'?'#a07475':'#657bbb';
    c.save();c.globalAlpha=marker.selected?1:.45;c.strokeStyle=color;c.fillStyle=color;c.lineWidth=marker.selected?1.8:1.1;
    if(marker.kind==='submit'){c.beginPath();c.moveTo(xx,yy-5);c.lineTo(xx-4.5,yy+3.5);c.lineTo(xx+4.5,yy+3.5);c.closePath();c.stroke();}
    if(marker.kind==='fill'){c.beginPath();c.arc(xx,yy,marker.selected?4.5:3,0,Math.PI*2);c.fill();}
    if(marker.kind==='cancel'){c.beginPath();c.moveTo(xx-3.5,yy-3.5);c.lineTo(xx+3.5,yy+3.5);c.moveTo(xx-3.5,yy+3.5);c.lineTo(xx+3.5,yy-3.5);c.stroke();}
    c.restore();hit.push({...marker,x:xx,y:yy});
  }
  const s=snaps[Math.min(cursor,snaps.length-1)];if(s){
    const xx=x(s.t);c.strokeStyle='#2458d3';c.lineWidth=1.5;c.setLineDash([3,3]);c.beginPath();c.moveTo(xx,P);c.lineTo(xx,B);c.stroke();c.setLineDash([]);
    for(const side of ['bids','asks']){const p=s[side][0][0];if(!(p>lo&&p<hi))continue;c.beginPath();c.arc(xx,y(p),4.5,0,Math.PI*2);c.fillStyle='white';c.fill();c.strokeStyle=side==='bids'?BID:ASK;c.lineWidth=2;c.stroke();}
    c.font='10px -apple-system, "PingFang SC", sans-serif';const label=`当前 ${clock(s.t)}`,tw=c.measureText(label).width+12,lx=Math.max(L,Math.min(xx-tw/2,R-tw));
    c.fillStyle='#2458d3';c.fillRect(lx,P-18,tw,16);c.fillStyle='white';c.textAlign='left';c.fillText(label,lx+6,P-6);
  }
  return {L,R,start,end,x,markers:hit};
}
export function depthCards(context,index,contract){
  if(!context?.snaps.length)return {html:'',meta:''};
  const snaps=context.snaps,start=Math.max(0,Math.min(index-2,snaps.length-5)),chosen=snaps.slice(start,start+5);
  const prices=chosen.flatMap(s=>[...s.bids,...s.asks].map(p=>p[0])).filter(v=>v>0&&v<1e20);
  if(!prices.length)return {html:'',meta:'当前快照没有有效盘口价格。'};
  const allQty=chosen.flatMap(s=>[...s.bids,...s.asks].map(p=>p[1])).filter(v=>v>0&&v<1e20),maxQty=Math.max(1,...allQty);
  const maxDv=Math.max(1,...chosen.map(s=>Math.abs(s.dv??0)));
  const lo=Math.min(...prices),hi=Math.max(...prices),pad=Math.max((hi-lo)*.12,contract.startsWith('au')?.02:1),ylo=lo-pad,yhi=hi+pad;
  const W=220,H=300,L=43,R=202,T=24,B=268,C=(L+R)/2,y=p=>B-(p-ylo)/(yhi-ylo)*(B-T),scale=q=>Math.log1p(Math.abs(q))/Math.log1p(maxQty)*((R-L)/2-18);
  const html=chosen.map((s,j)=>{
    const actual=start+j,focus=actual===index,offset=(s.t-context.t)/1000,mid=s.bids[0][0]>0&&s.asks[0][0]>0?(s.bids[0][0]+s.asks[0][0])/2:null;
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(clock(s.t))} 五档盘口"><line x1="${C}" y1="${T}" x2="${C}" y2="${B}" stroke="#c9d2dc"/>`;
    for(let tick=0;tick<=4;tick++){const p=ylo+(yhi-ylo)*tick/4,yy=y(p);svg+=`<line x1="${L}" x2="${R}" y1="${yy}" y2="${yy}" stroke="${GRID}"/><text x="${L-5}" y="${yy+3}" text-anchor="end" fill="${MUTED}" font-size="8">${fmt(Number(p.toFixed(contract.startsWith('au')?2:0)))}</text>`;}
    if(mid!=null)svg+=`<line x1="${L}" x2="${R}" y1="${y(mid)}" y2="${y(mid)}" stroke="#9eaab4" stroke-dasharray="2 2"/>`;
    const distinct=[...new Set(prices)].sort((a,b)=>a-b),tickGap=Math.min(...distinct.slice(1).map((p,i)=>p-distinct[i]).filter(v=>v>0));
    const bh=Math.max(1,Math.min(10,Number.isFinite(tickGap)?(B-T)/(yhi-ylo)*tickGap*.7:8));
    for(const side of ['bids','asks'])for(const [p,q] of s[side]){
      if(!(p>0&&p<1e20&&q>0&&q<1e20))continue;const buy=side==='bids',width=scale(q),xx=buy?C-width:C,yy=y(p),color=buy?BID:ASK;
      svg+=`<rect x="${xx}" y="${yy-bh/2}" width="${width}" height="${bh}" fill="${color}" opacity=".86"/><text x="${buy?xx-3:xx+width+3}" y="${yy+3}" text-anchor="${buy?'end':'start'}" fill="${color}" font-size="8">${fmt(q)}</text>`;
    }
    const ticks=[1,10,100,1000].filter(v=>v<=maxQty);
    for(const v of ticks)for(const sign of [-1,1]){const xx=C+scale(v)*sign;svg+=`<text x="${xx}" y="${B+13}" text-anchor="middle" fill="${MUTED}" font-size="8">${v}</text>`;}
    svg+=`<text x="${C}" y="${B+13}" text-anchor="middle" fill="${MUTED}" font-size="8">0</text><text x="${C}" y="${H-3}" text-anchor="middle" fill="${MUTED}" font-size="9">← 买量（手） 卖量 →</text><text x="${L}" y="12" fill="${MUTED}" font-size="8">买一 ${fmt(s.bids[0][0])} / 卖一 ${fmt(s.asks[0][0])}</text></svg>`;
    return `<article class="depth-card${focus?' focus':''}" data-snapshot="${actual}" data-snapshot-time="${s.t}" title="${fullTime(s.t)}"><div class="depth-title"><strong class="mono">${clock(s.t)}</strong><small>${offset>=0?'+':''}${offset.toFixed(3)}s</small></div><div class="delta-label"><span>${focus?'指针快照':'成交量增量'}</span><strong>${s.dv==null?'未知':`${fmt(s.dv)} 手`}</strong></div><div class="delta-track"><span style="width:${s.dv==null?0:Math.abs(s.dv)/maxDv*100}%;background:${s.dv<0?'#b55c58':'#8798a2'}"></span></div>${svg}</article>`;
  }).join('');
  const selected=snaps[index];
  return {html,meta:`当前 ${clock(selected.t)} · 真实快照 ${index+1}/${snaps.length} · 源文件行 ${selected.sourceRow??'未提供'} · 价格单位：${priceUnit(contract)}。${selected.valid===false?'此快照含无效或不完整盘口，请谨慎解释。':''}下排挂量采用对称对数刻度，灰条采用统一线性刻度；同时间戳不同快照均保留。`};
}
