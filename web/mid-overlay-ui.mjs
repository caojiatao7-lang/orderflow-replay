import {clock,fullTime} from './model.mjs';import {alignedMarket} from './compare.mjs';import {esc,fmt} from './charts.mjs';
import {buildMidOverlay,midpoint} from './mid-overlay.mjs';
import {marketTimeBounds,parseBeijingTime,validateMidRange,dragMidRange,midAxisLabel} from './mid-zoom.mjs';
const W=1200,H=290,L=78,R=1178,T=22,B=250;
export function createMidOverlay(setTime,pause=()=>{}){
  const $=id=>document.getElementById(id),state={dataset:null,key:'',geometry:null,args:null,mode:'all',custom:null,bounds:null,history:[],dirty:false,drag:null,skipClickUntil:0};
  const fieldTime=t=>fullTime(t).replace(' ','T');
  function status(message,error=false){$('midZoomStatus').textContent=message;$('midZoomStatus').classList.toggle('error',error);}
  function remember(){state.history.push({mode:state.mode,custom:state.custom&&{...state.custom},t:state.args?.t});if(state.history.length>20)state.history.shift();}
  function redraw(){state.key='';if(state.args)update(state.args.contracts,state.args.t,state.args.span);}
  function applyCustom(range){
    if(range.error){status(range.error,true);return;}
    pause();remember();state.custom={start:range.start,end:range.end};state.mode='custom';state.dirty=false;$('midRange').value='custom';
    redraw();status(`已放大：${fullTime(range.start)} — ${fullTime(range.end)}。可继续拖选放大，或点击“上一级”返回。`);
    if(state.args&&(state.args.t<range.start||state.args.t>range.end))setTime(Math.round((range.start+range.end)/2));
  }
  function update(contracts,t,span){
    state.args={contracts,t,span};if(!state.dataset||!Number.isFinite(t))return;$('midCurrent').textContent='当前指针 '+fullTime(t);
    const range=state.mode,all=contracts.map(c=>state.dataset.markets[c]?.snaps).filter(s=>s?.length);
    const radius=range==='5m'?300000:range==='30m'?1800000:span*1000;
    let start=range==='all'&&all.length?Math.min(...all.map(s=>s[0].t)):t-radius,end=range==='all'&&all.length?Math.max(...all.map(s=>s.at(-1).t)):t+radius;
    if(range==='custom'&&state.custom){start=state.custom.start;end=state.custom.end;}
    if(start===end){start-=500;end+=500;}
    $('midUndo').disabled=!state.history.length;$('midReset').disabled=range==='all';
    const key=JSON.stringify([contracts,start,end]);
    if(key!==state.key){
      if(!state.dirty&&state.bounds){$('midStart').value=fieldTime(Math.max(start,state.bounds.start));$('midEnd').value=fieldTime(Math.min(end,state.bounds.end));}
      state.key=key;const g=buildMidOverlay(state.dataset,contracts,start,end);state.geometry=g;
      if(g.error){$('midChart').innerHTML=`<div class="mid-empty">${esc(g.error)}</div>`;$('midLegend').innerHTML='';$('midScope').textContent=fullTime(start)+' — '+fullTime(end);return;}
      const x=at=>L+(at-start)/(end-start)*(R-L),y=p=>B-(p-g.low)/(g.high-g.low)*(B-T);
      let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="所选合约中间价同轴叠加图"><defs><clipPath id="midClip"><rect x="${L}" y="${T}" width="${R-L}" height="${B-T}"/></clipPath></defs><text x="${L}" y="13" fill="#76828e" font-size="12">中间价（${esc(g.unit)}）</text>`;
      for(let i=0;i<=5;i++){const p=g.low+(g.high-g.low)*i/5,yy=y(p);svg+=`<line x1="${L}" x2="${R}" y1="${yy}" y2="${yy}" stroke="#edf1f5"/><text x="${L-10}" y="${yy+4}" text-anchor="end" fill="#76828e" font-size="12">${fmt(Number(p.toFixed(3)))}</text>`;}
      svg+='<g clip-path="url(#midClip)">';
      for(const line of g.series){let d='';for(const points of line.segments){let previous=null;for(const p of points){d+=previous?`L${x(p.t).toFixed(2)},${y(previous.p).toFixed(2)}L${x(p.t).toFixed(2)},${y(p.p).toFixed(2)}`:`M${x(p.t).toFixed(2)},${y(p.p).toFixed(2)}`;previous=p;}}
        svg+=`<path d="${d}" fill="none" stroke="${line.color}" stroke-width="1.65" stroke-linejoin="round"><title>${esc(line.contract.toUpperCase())}</title></path>`;
      }
      svg+='<rect data-mid-selection x="0" y="22" width="0" height="228" fill="#2458d3" fill-opacity=".14" stroke="#2458d3" stroke-width="1" style="display:none"/><line data-mid-cursor x1="0" x2="0" y1="22" y2="250" stroke="#203246" stroke-dasharray="4 3"/>';
      for(const line of g.series)svg+=`<circle data-mid-dot="${esc(line.contract)}" r="4" fill="white" stroke="${line.color}" stroke-width="2" style="display:none"/>`;
      svg+='</g>';
      for(let i=0;i<=5;i++){const at=start+(end-start)*i/5;svg+=`<text x="${x(at)}" y="${H-16}" text-anchor="${i===0?'start':i===5?'end':'middle'}" fill="#76828e" font-size="12">${midAxisLabel(at,end-start)}</text>`;}
      $('midChart').innerHTML=svg+'</svg>';
      $('midScope').textContent=`${fullTime(start)} — ${fullTime(end)} · ${g.series.length} 个合约共用价格轴${g.sampled?' · 长区间保留实际快照极值抽样显示':''}`;
    }
    const g=state.geometry;if(!g||g.error)return;
    const x=at=>L+(at-g.start)/(g.end-g.start)*(R-L),y=p=>B-(p-g.low)/(g.high-g.low)*(B-T),line=$('midChart').querySelector('[data-mid-cursor]');
    line.setAttribute('x1',x(t));line.setAttribute('x2',x(t));
    $('midLegend').innerHTML=g.series.map(series=>{
      const a=alignedMarket(state.dataset.markets[series.contract],t,0),value=midpoint(a.snapshot),dot=[...$('midChart').querySelectorAll('[data-mid-dot]')].find(n=>n.dataset.midDot===series.contract);
      const visible=value!=null&&a.age<=2000&&a.snapshot.t>=g.start&&a.snapshot.t<=g.end;
      dot.style.display=visible?'':'none';if(visible){dot.setAttribute('cx',x(a.snapshot.t));dot.setAttribute('cy',y(value));}
      return `<span class="mid-legend-item${!a.snapshot||a.stale||a.afterEnd?' mid-stale':''}" title="${a.snapshot?fullTime(a.snapshot.t):'此时尚无快照'}"><i style="background:${series.color}"></i>${esc(series.contract.toUpperCase())}<strong>${value==null?'未知':fmt(value)}</strong><small>${a.age==null?'无此前快照':a.age===0?'同时刻':`距指针 ${(a.age/1000).toFixed(3)} 秒`}</small></span>`;
    }).join('');
    $('midCurrent').textContent='当前指针 '+fullTime(t);
  }
  $('midRange').onchange=()=>{
    const mode=$('midRange').value;
    if(mode==='custom'){
      const g=state.geometry;if(!state.custom&&g&&!g.error)state.custom={start:Math.max(g.start,state.bounds.start),end:Math.min(g.end,state.bounds.end)};
      if(!state.custom){$('midRange').value=state.mode;return;}
    }
    pause();remember();state.mode=mode;state.dirty=false;redraw();status('');
  };
  $('midStart').oninput=$('midEnd').oninput=()=>{state.dirty=true;};
  $('midZoomForm').onsubmit=e=>{e.preventDefault();applyCustom(validateMidRange(parseBeijingTime($('midStart').value),parseBeijingTime($('midEnd').value),state.bounds));};
  $('midReset').onclick=()=>{pause();remember();state.mode='all';state.dirty=false;$('midRange').value='all';redraw();status('已恢复全部行情。');};
  $('midUndo').onclick=()=>{const previous=state.history.pop();if(!previous)return;pause();state.mode=previous.mode;state.custom=previous.custom;state.dirty=false;$('midRange').value=previous.mode;redraw();if(Number.isFinite(previous.t))setTime(previous.t);status('已返回上一级时间范围。');};
  const plotPoint=e=>{const svg=$('midChart').querySelector('svg');if(!svg)return null;const box=svg.getBoundingClientRect();return {x:(e.clientX-box.left)/box.width*W,y:(e.clientY-box.top)/box.height*H};};
  function cancelDrag(){
    const drag=state.drag;state.drag=null;const rect=$('midChart').querySelector('[data-mid-selection]');if(rect)rect.style.display='none';
    if(drag&&$('midChart').hasPointerCapture(drag.id))$('midChart').releasePointerCapture(drag.id);
  }
  $('midChart').onpointerdown=e=>{
    const g=state.geometry,p=plotPoint(e);if(e.button!==0||!g||g.error||!p||p.x<L||p.x>R||p.y<T||p.y>B)return;
    pause();state.drag={id:e.pointerId,x:p.x,lastX:p.x,clientX:e.clientX,moved:false,view:{start:g.start,end:g.end}};$('midChart').setPointerCapture(e.pointerId);e.preventDefault();
  };
  $('midChart').onpointermove=e=>{
    const d=state.drag,p=plotPoint(e);if(!d||e.pointerId!==d.id||!p)return;
    d.lastX=Math.max(L,Math.min(R,p.x));d.moved=d.moved||Math.abs(e.clientX-d.clientX)>=6;
    if(d.moved){const rect=$('midChart').querySelector('[data-mid-selection]');rect.style.display='';rect.setAttribute('x',Math.min(d.x,d.lastX));rect.setAttribute('width',Math.abs(d.x-d.lastX));
      const r=dragMidRange(d.view,(d.x-L)/(R-L),(d.lastX-L)/(R-L),state.bounds);status(r.error||`拖选：${fullTime(r.start)} — ${fullTime(r.end)}`,!!r.error);}
  };
  $('midChart').onpointerup=e=>{
    const d=state.drag;if(!d||d.id!==e.pointerId)return;const p=plotPoint(e);if(p)d.lastX=Math.max(L,Math.min(R,p.x));cancelDrag();
    if(d.moved){state.skipClickUntil=Date.now()+300;applyCustom(dragMidRange(d.view,(d.x-L)/(R-L),(d.lastX-L)/(R-L),state.bounds));}
  };
  $('midChart').onpointercancel=()=>{cancelDrag();status('已取消拖选。');};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.drag){cancelDrag();status('已取消拖选。');}});
  $('midChart').onclick=e=>{if(Date.now()<state.skipClickUntil)return;const p=plotPoint(e),g=state.geometry;if(!p||!g||g.error||p.x<L||p.x>R)return;setTime(g.start+(p.x-L)/(R-L)*(g.end-g.start));};
  return {update,setDataset(dataset){
    cancelDrag();state.dataset=dataset;state.bounds=marketTimeBounds(dataset.markets);state.key='';state.geometry=null;state.args=null;state.custom=null;state.mode='all';state.history=[];state.dirty=false;$('midRange').value='all';status('横向拖选图表可放大；也可输入开始时间和结束时间。');
    for(const id of ['midStart','midEnd']){$(id).value='';$(id).disabled=!state.bounds;if(state.bounds){$(id).min=fieldTime(state.bounds.start);$(id).max=fieldTime(state.bounds.end);}}
    $('midUndo').disabled=true;
  }};
}
