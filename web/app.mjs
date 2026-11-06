import {hydrate,contextFor,summarize,snapshotIndexAt,clock,fullTime,orderEventRows,MARKET_FIELDS} from './model.mjs';
import {drawTimeline,depthCards,esc,fmt} from './charts.mjs';
import {calculateClosures} from './pnl.mjs';
import {closureTable,money} from './pnl-view.mjs';
import {createComparison} from './compare-ui.mjs?v=market-filter-v1';
import {BUILTIN_DATASETS,DEFAULT_DATASET,builtinDataset} from './builtin.mjs?v=market-filter-v1';
const $=id=>document.getElementById(id),labels={submit:'报单',cancel:'撤单',fill:'最后成交'};
const state={dataset:null,contract:'',order:null,event:'submit',span:10,filter:'all',search:'',page:0,context:null,cursor:0,playing:false,timer:null,geometry:null,files:[],pnlCache:new Map(),pnlPage:0,pnlSearch:'',pnlFilter:'all',mode:new URLSearchParams(location.search).get('view')==='market'?'compare':'replay'};
const comparison=createComparison();
const initialDataset=new URLSearchParams(location.search).get('dataset');
$('builtinDataset').innerHTML=Object.entries(BUILTIN_DATASETS).map(([id,pack])=>`<option value="${id}">${pack.label}</option>`).join('');
$('builtinDataset').value=Object.hasOwn(BUILTIN_DATASETS,initialDataset)?initialDataset:DEFAULT_DATASET;
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function stop(){state.playing=false;clearTimeout(state.timer);$('play').textContent='▶ 播放';$('play').setAttribute('aria-label','播放行情');}
function ordersForContract(){return state.dataset?.orders.filter(o=>o.contract===state.contract)||[];}
function filteredOrders(){return ordersForContract().filter(o=>(state.filter==='all'||(state.filter==='fill'?o.filled>0:o.cancel!=null))&&(!state.search||`${o.id} ${clock(o.submit)} ${clock(o.fill)} ${clock(o.cancel)}`.includes(state.search)));}
function renderList(){
  const all=filteredOrders(),entries=orderEventRows(all),size=35,maxPage=Math.max(0,Math.ceil(entries.length/size)-1);state.page=Math.min(state.page,maxPage);
  $('filteredCount').textContent=`${all.length.toLocaleString()} 笔 · ${entries.length.toLocaleString()} 行事件`;
  $('orderList').innerHTML=entries.length?entries.slice(state.page*size,(state.page+1)*size).map(row=>{
    const o=row.order,selected=o.key===state.order?.key;
    return `<button class="order-row${selected?' selected':''}${selected&&row.kinds.includes(state.event)?' active-event':''}" data-key="${esc(o.key)}" data-event="${row.event}" aria-label="订单 ${esc(o.id)} ${esc(row.label)}"><span><strong>${clock(row.t).slice(0,8)}</strong><small>#${esc(o.id)}</small></span><span><span class="direction ${o.side==='buy'?'buy-text':'sell-text'}">${o.side==='buy'?'买':'卖'}${esc(o.offset)}</span><small>${fmt(o.price)} · ${fmt(o.qty)} 手</small></span><span class="order-status${row.kinds.includes('fill')?' filled':''}">${esc(row.label)}<small>${row.kinds.includes('fill')?`成交 ${fmt(o.filled)} 手`:row.kinds.includes('cancel')?'已撤单':`委托 ${fmt(o.qty)} 手`}</small>${row.t>o.submit?`<small class="fill-lag">距报单 ${row.delay}</small>`:''}</span></button>`;
  }).join(''):'<div class="empty-list">没有符合筛选条件的委托。<br>请清空搜索或切换筛选。</div>';
  $('pageLabel').textContent=entries.length?`${state.page+1} / ${maxPage+1}`:'0 / 0';$('prevPage').disabled=state.page===0;$('nextPage').disabled=state.page>=maxPage;
}
function renderDataset(){
  const ds=state.dataset,contracts=[...new Set(ds.orders.length?ds.orders.map(o=>o.contract):Object.keys(ds.markets))].sort();
  $('contract').innerHTML=contracts.map(c=>`<option value="${esc(c)}"${c===state.contract?' selected':''}>${esc(c.toUpperCase())}</option>`).join('');
  $('sourceBadge').textContent=ds.hostedDefault?(ds.marketOnly?'内置行情':'默认复盘包'):ds.demo?'虚构演示数据':'本地会话';$('datasetName').textContent=ds.name||'本地导入';
  const times=ds.orders.length?ds.orders.flatMap(o=>[o.submit,o.cancel,o.fill]).filter(t=>t!=null):Object.values(ds.markets).flatMap(m=>m.snaps.length?[m.snaps[0].t,m.snaps.at(-1).t]:[]);
  const timeMin=times.reduce((a,b)=>Math.min(a,b),Infinity),timeMax=times.reduce((a,b)=>Math.max(a,b),-Infinity);
  $('datasetRange').textContent=`交易日 ${ds.day} · ${fullTime(timeMin)} — ${fullTime(timeMax).slice(11)}`;
  const warnings=[...(ds.demo?[`当前数据完全虚构，由公式生成，仅演示功能。`]:[]),...(ds.warnings||[])];
  $('dataWarning').hidden=!warnings.length;$('dataWarning').textContent=warnings.join('；');
  const m=summarize(ds,state.contract);$('orderCount').textContent=fmt(m.orders);$('filledCount').textContent=fmt(m.filled);$('cancelCount').textContent=fmt(m.cancels);$('messageCount').textContent=fmt(m.messages);
  const snaps=ds.markets[state.contract]?.snaps;
  $('marketRange').textContent=snaps?.length?`${clock(snaps[0].t)} — ${clock(snaps.at(-1).t)}`:'未导入此合约行情';
  if(ds.orders.length){renderList();renderOrder();}
}
function selectOrder(order,event='submit'){if(!order)return;stop();state.order=order;state.contract=order.contract;state.event=order[event]==null?'submit':event;renderList();renderOrder();}
function setDataset(ds,preferredMode=state.mode){
  stop();state.dataset=hydrate(ds);state.pnlCache=new Map();state.pnlPage=0;state.pnlSearch='';state.pnlFilter='all';$('pnlSearch').value='';$('pnlFilter').value='all';state.search='';state.page=0;state.filter='all';$('search').value='';
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
  const first=ds.orders.find(o=>o.id===ds.defaultOrderId)||ds.orders.find(o=>ds.markets[o.contract]?.snaps.length&&o.filled>0)||ds.orders[0];
  state.order=first||null;state.contract=first?.contract||Object.keys(ds.markets)[0]||'';state.event='submit';renderDataset();
  comparison.setDataset(state.dataset,first?.submit);setMode(ds.marketOnly?'compare':preferredMode);
}
function setMode(mode){
  stop();comparison.stop();if(mode==='replay'&&!state.dataset?.orders.length)mode='compare';state.mode=mode;
  $('replayView').hidden=mode!=='replay';$('compareView').hidden=mode!=='compare';
  $('introTitle').textContent=mode==='compare'?'多个合约，看同一时刻。':'订单与行情，在同一条时间线上。';
  $('introDescription').textContent=mode==='compare'?'只导入行情也能使用：不同品种并排查看，共用一个时间指针。':'选一笔委托，逐快照查看它的报单、撤单、成交与五档盘口。';
  $('replayMode').disabled=!state.dataset?.orders.length;
  for(const [id,value] of [['replayMode','replay'],['compareMode','compare']]){$(id).classList.toggle('active',mode===value);$(id).setAttribute('aria-pressed',String(mode===value));}
  if(mode==='replay'&&state.context)renderChart();
}
function renderOrder(){
  const o=state.order;if(!o)return;
  $('orderDetail').innerHTML=`<div><h2><span class="${o.side==='buy'?'buy-text':'sell-text'}">${o.side==='buy'?'买':'卖'}${esc(o.offset)}</span><span>${esc(o.contract.toUpperCase())}</span><span class="status-pill">${esc(o.status)}</span></h2><div class="detail-sub">订单 #${esc(o.id)} · ${fullTime(o.submit)} · 委托源行 ${o.sourceRow??'未提供'}</div></div><div class="order-facts"><div><span>报单价格</span><strong>${fmt(o.price)}</strong></div><div><span>报单 / 成交手数</span><strong>${fmt(o.qty)} / ${fmt(o.filled)}</strong></div>${o.filled?`<div><span>成交均价</span><strong>${fmt(o.fillPrice)}</strong></div>`:''}</div>`;
  const events=orderEventRows([o]);$('executionTiming').hidden=false;
  $('executionTiming').innerHTML=events.map((row,i)=>`${i?`<div class="execution-gap"><span>→</span><strong>间隔 ${Number(((row.t-events[i-1].t)/1000).toFixed(3))} 秒</strong><span>→</span></div>`:''}<button data-event="${row.event}">${esc(row.label)}<strong class="mono">${fullTime(row.t)}</strong></button>`).join('');
  $('eventTabs').innerHTML=Object.entries(labels).map(([kind,name])=>`<button data-event="${kind}" class="${state.event===kind?'active':''}" ${o[kind]==null?'disabled':''}>${name}<span>${o[kind]==null?'无记录':clock(o[kind])}</span></button>`).join('');
  const precision=o.precisions?.[state.event]||o.precision||1000;
  $('precisionNote').textContent=precision===1000?'订单事件仅精确到秒。黄色区间表示所记时间所在的一秒，不能确定同秒内订单与快照的先后顺序。':'事件字段包含毫秒，但仍不代表与行情时钟严格同步；同时间戳的撮合先后顺序无法据此确定。';
  state.context=contextFor(state.dataset,o,state.event,state.span);const snaps=state.context?.snaps||[];
  state.cursor=Math.max(0,snapshotIndexAt(snaps,state.context?.t??0));
  $('cursor').max=Math.max(0,snaps.length-1);$('cursor').disabled=!snaps.length;
  for(const id of ['play','stepBack','stepForward','eventFocus','exportBtn'])$(id).disabled=!snaps.length;
  $('chartEmpty').hidden=!!snaps.length;
  $('chartEmpty').textContent=state.dataset.markets[o.contract]?'此事件附近没有行情快照。请扩大时间窗口，或导入覆盖此时段的行情文件。':'当前合约尚未导入行情。请同时导入对应合约的行情 CSV。';
  $('contextScope').textContent=snaps.length?`${snaps.length} 张真实快照 · ${clock(snaps[0].t)} — ${clock(snaps.at(-1).t)}${state.context.clipped?' · 文件未覆盖完整请求窗口':''}`:'未找到对应行情';
  updateCursor(state.cursor);renderPnl();
}
function chartFilters(){return {submit:$('showSubmit').checked,cancel:$('showCancel').checked,fill:$('showFill').checked,others:$('showOthers').checked,event:state.event};}
function renderChart(){state.geometry=drawTimeline($('timeline'),state.context,state.cursor,state.order,chartFilters());}
function updateCursor(index){
  const snaps=state.context?.snaps||[];state.cursor=Math.max(0,Math.min(index,snaps.length-1));$('cursor').value=state.cursor;
  $('cursorTime').textContent=snaps[state.cursor]?clock(snaps[state.cursor].t):'—';renderChart();
  const {html,meta}=depthCards(state.context,state.cursor,state.contract);$('depthGrid').innerHTML=html;$('snapshotMeta').textContent=meta;
}
function currentPnl(){
  if(!state.dataset)return null;
  if(!state.pnlCache.has(state.contract))state.pnlCache.set(state.contract,calculateClosures(state.dataset,state.contract));
  return state.pnlCache.get(state.contract);
}
function renderPnl(){
  const pnl=currentPnl();if(!pnl)return;
  $('pnlScope').textContent=`${state.contract.toUpperCase()} · ${pnl.rows.length} 张平仓委托 / ${pnl.rows.reduce((s,r)=>s+r.qty,0)} 手 · 乘数 ${pnl.multiplier??'未知'} · 金额单位：人民币元`;
  const lots=pnl.rows.reduce((s,r)=>s+r.qty,0);
  $('pnlSummary').innerHTML=[['已平仓委托 / 手数',`${pnl.rows.length} / ${lots}`],['已平仓毛盈亏',money(pnl.grossCents)],['对应开平手续费（分摊）',pnl.feeCents==null?'无法完整计算':(pnl.feeCents/100).toLocaleString('zh-CN',{minimumFractionDigits:2})],['扣费后净盈亏（估算）',money(pnl.netCents)]].map(([label,value],i)=>`<div><span>${label}</span><strong class="${i===3?(pnl.netCents>0?'pnl-positive':pnl.netCents<0?'pnl-negative':''):''}">${value}</strong></div>`).join('');
  $('pnlWarnings').hidden=!pnl.warnings.length;$('pnlWarnings').textContent=pnl.warnings.join('；');
  const rows=pnl.rows.filter(r=>(!state.pnlSearch||r.closeId.includes(state.pnlSearch))&&(state.pnlFilter==='all'||(state.pnlFilter==='win'?r.netCents>0:state.pnlFilter==='loss'?r.netCents!=null&&r.netCents<0:r.netCents==null)));
  const last=Math.max(0,Math.ceil(rows.length/20)-1);state.pnlPage=Math.max(0,Math.min(state.pnlPage,last));
  $('pnlRows').innerHTML=closureTable(rows.slice(state.pnlPage*20,(state.pnlPage+1)*20),state.order?.key);
  $('pnlPage').textContent=rows.length?`${state.pnlPage+1} / ${last+1} · ${rows.length} 张平仓委托`:'0 / 0';
  $('pnlPrev').disabled=state.pnlPage===0;$('pnlNext').disabled=state.pnlPage>=last;
  $('pnlExport').disabled=!pnl.rows.length;
}
function exportPnl(){
  const pnl=currentPnl();if(!pnl)return;
  const cell=v=>`"${String(v??'').replaceAll('"','""')}"`,amount=v=>v==null?'未知':(v/100).toFixed(2);
  const header=['合约','平仓单号','最后成交时间','方向','平仓手数','配对开仓单号','毛盈亏元','开仓费分摊估算元','平仓费分摊估算元','净盈亏估算元','缺失开仓手数'];
  const rows=pnl.rows.map(r=>[state.contract,r.closeId,fullTime(r.t),r.direction==='long'?'平多':'平空',r.qty,r.pairs.map(p=>p.openId).join(' / '),amount(r.grossCents),amount(r.openFeeCents),amount(r.closeFeeCents),amount(r.netCents),r.unmatched]);
  save(`${state.contract}_逐次平仓扣费盈亏.csv`,'\uFEFF'+[header,...rows].map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function playTick(){
  if(!state.playing)return;const snaps=state.context.snaps;
  if(state.cursor>=snaps.length-1){stop();return;}
  const delay=Math.max(40,Math.min(1800,(snaps[state.cursor+1].t-snaps[state.cursor].t)/Number($('speed').value)));
  state.timer=setTimeout(()=>{updateCursor(state.cursor+1);playTick();},delay);
}
function togglePlay(){if(state.playing){stop();return;}if(!state.context?.snaps.length)return;if(state.cursor>=state.context.snaps.length-1)updateCursor(0);state.playing=true;$('play').textContent='Ⅱ 暂停';$('play').setAttribute('aria-label','暂停行情');playTick();}
function save(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportContext(){
  const ctx=state.context;if(!ctx?.snaps.length)return;
  const keys=new Set(ctx.markers.map(m=>m.id));keys.add(state.order.id);
  const pack={version:1,name:`${state.contract.toUpperCase()} 观察窗口`,demo:false,day:state.dataset.day,nightDate:state.dataset.nightDate,
    orders:state.dataset.orders.filter(o=>o.contract===state.contract&&keys.has(o.id)),markets:{[state.contract]:{contract:state.contract,snaps:ctx.snaps}},
    warnings:['此复盘包只包含导出时的观察窗口，不是完整交易日。'],stats:[],defaultOrderId:state.order.id};
  save(`${state.contract}_${state.order.id}_观察窗口.json`,JSON.stringify(pack));toast('已导出窗口复盘包，可在本页再次导入。');
}
function openImport(){stop();$('tradingDay').value=state.dataset?.day||'2025-01-06';$('nightDate').value=state.dataset?.nightDate||'';$('importDialog').showModal();}
function showFiles(files){state.files=[...files];$('fileList').innerHTML=state.files.map(f=>`<div>${esc(f.name)} <span class="muted">${(f.size/1024/1024).toFixed(2)} MB</span></div>`).join('');}
async function importFiles(event){
  event.preventDefault();if(!state.files.length){$('importProgress').textContent='请选择行情 CSV（可多选）、复盘包，或委托与行情文件。';return;}
  $('startImport').disabled=true;$('importProgress').classList.remove('error');$('importProgress').textContent='正在启动本地解析…';
  const worker=new Worker('./import-worker.mjs?v=market-filter-v1',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.progress)$('importProgress').textContent=data.progress;
    if(data.error){$('importProgress').textContent=data.error;$('importProgress').classList.add('error');$('startImport').disabled=false;worker.terminate();}
    if(data.result){try{setDataset(data.result);$('importDialog').close();toast('数据已在浏览器内加载，没有上传文件。');}catch(e){$('importProgress').textContent=e.message;$('importProgress').classList.add('error');}$('startImport').disabled=false;worker.terminate();}
  };
  worker.onerror=e=>{$('importProgress').textContent=`解析失败：${e.message}`;$('importProgress').classList.add('error');$('startImport').disabled=false;worker.terminate();};
  worker.postMessage({files:state.files,calendar:{day:$('tradingDay').value,nightDate:$('nightDate').value}});
}
function templates(){
  const orders='\uFEFF报单编号,合约,买卖,开平,挂单状态,报单价格,报单手数,未成交手数,成交手数,成交均价,报单时间,最后成交时间,撤单时间,序列号\r\n';
  save('委托字段模板.csv',orders,'text/csv;charset=utf-8');setTimeout(()=>save('CTP五档行情字段模板.csv','\uFEFF'+MARKET_FIELDS.join(',')+'\r\n','text/csv;charset=utf-8'),150);
}
async function loadDefault(){
  const datasetId=$('builtinDataset').value,pack=builtinDataset(datasetId);
  stop();comparison.stop();$('builtinDataset').disabled=true;$('demoBtn').disabled=true;$('importBtn').disabled=true;$('compareImport').disabled=true;$('contract').disabled=true;
  if(!state.dataset){$('datasetName').textContent='正在加载 '+pack.label;for(const id of ['exportBtn','eventFocus','play','stepBack','stepForward','cursor','prevPage','nextPage'])$(id).disabled=true;}
  $('sourceBadge').textContent='正在加载';
  const worker=new Worker('./import-worker.mjs?v=market-filter-v1',{type:'module'});
  return new Promise(resolve=>{
    const finish=()=>{worker.terminate();$('builtinDataset').disabled=false;$('demoBtn').disabled=false;$('importBtn').disabled=false;$('compareImport').disabled=false;$('contract').disabled=false;resolve();};
    const fail=message=>{$('sourceBadge').textContent='加载失败';$('dataWarning').hidden=false;$('dataWarning').textContent=message+'。可点击“重新载入所选数据”重试，或手动导入文件。';finish();};
    worker.onmessage=({data})=>{
      if(data.progress)$('sourceBadge').textContent=data.progress;
      if(data.error){fail(data.error);return;}
      if(data.result){try{if(data.result.day!==pack.day)throw Error('所选数据与返回数据的交易日不一致，请刷新后重试');setDataset({...data.result,hostedDefault:true},pack.mode);const url=new URL(location.href);url.searchParams.set('dataset',datasetId);if(pack.mode==='compare')url.searchParams.set('view','market');else url.searchParams.delete('view');history.replaceState(null,'',url);finish();}catch(e){fail(e.message);}}
    };
    worker.onerror=e=>fail('默认复盘包解析失败：'+e.message);
    worker.postMessage({defaultPack:datasetId});
  });
}
$('importBtn').onclick=openImport;$('compareImport').onclick=openImport;$('replayMode').onclick=()=>setMode('replay');$('compareMode').onclick=()=>setMode('compare');$('helpBtn').onclick=()=>{$('helpDialog').showModal();};$('demoBtn').onclick=loadDefault;$('builtinDataset').onchange=loadDefault;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('contract').onchange=()=>{stop();state.pnlPage=0;state.pnlSearch='';$('pnlSearch').value='';state.contract=$('contract').value;state.page=0;state.search='';$('search').value='';state.order=ordersForContract().find(o=>o.filled>0)||ordersForContract()[0];renderDataset();};
$('search').oninput=()=>{state.search=$('search').value.trim();state.page=0;renderList();};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;state.page=0;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderList();});
$('orderList').onclick=e=>{const row=e.target.closest('[data-key]');if(row)selectOrder(state.dataset.orders.find(o=>o.key===row.dataset.key),row.dataset.event);};
$('prevPage').onclick=()=>{state.page--;renderList();$('orderList').scrollTop=0;};$('nextPage').onclick=()=>{state.page++;renderList();$('orderList').scrollTop=0;};
$('executionTiming').onclick=e=>{const b=e.target.closest('[data-event]');if(b){stop();state.event=b.dataset.event;renderList();renderOrder();}};
$('eventTabs').onclick=e=>{const b=e.target.closest('[data-event]');if(b&&!b.disabled){stop();state.event=b.dataset.event;renderList();renderOrder();}};
$('span').onchange=()=>{stop();state.span=Number($('span').value);renderOrder();};
for(const id of ['showSubmit','showCancel','showFill','showOthers'])$(id).onchange=renderChart;
$('cursor').oninput=()=>{stop();updateCursor(Number($('cursor').value));};$('play').onclick=togglePlay;
$('stepBack').onclick=()=>{stop();updateCursor(state.cursor-1);};$('stepForward').onclick=()=>{stop();updateCursor(state.cursor+1);};
$('eventFocus').onclick=()=>{stop();updateCursor(snapshotIndexAt(state.context.snaps,state.context.t));};
$('speed').onchange=()=>{if(state.playing){stop();togglePlay();}};$('exportBtn').onclick=exportContext;
$('depthGrid').onclick=e=>{const card=e.target.closest('[data-snapshot]');if(card){stop();updateCursor(Number(card.dataset.snapshot));}};
$('timeline').onpointermove=e=>{
  if(!state.geometry)return;const box=$('timeline').getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top,g=state.geometry;
  if(x<g.L||x>g.R){$('chartTip').hidden=true;return;}
  const marker=g.markers.find(m=>Math.abs(m.x-x)<7&&Math.abs(m.y-y)<8);
  const tip=$('chartTip');tip.hidden=!marker;
  if(marker){tip.textContent=`${labels[marker.kind]} #${marker.id} · ${clock(marker.t)} · 点击查看订单`;tip.style.left=`${Math.max(8,Math.min(x+12,box.width-250))}px`;tip.style.top=`${Math.max(0,y-35)}px`;}
};
$('timeline').onpointerleave=()=>{$('chartTip').hidden=true;};
$('timeline').onclick=e=>{
  if(!state.geometry)return;const box=$('timeline').getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top,g=state.geometry;
  const marker=g.markers.find(m=>Math.abs(m.x-x)<7&&Math.abs(m.y-y)<8);
  if(marker){selectOrder(state.dataset.orders.find(o=>o.contract===state.contract&&o.id===marker.id),marker.kind);return;}
  if(x<g.L||x>g.R)return;
  stop();updateCursor(snapshotIndexAt(state.context.snaps,g.start+(x-g.L)/(g.R-g.L)*(g.end-g.start)));
};
new ResizeObserver(()=>{if(state.context&&state.mode==='replay')renderChart();}).observe($('chartContainer'));
document.onkeydown=e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;if(state.mode==='compare'){comparison.handleKey(e);return;}if(e.key==='ArrowLeft'){e.preventDefault();stop();updateCursor(state.cursor-1);}if(e.key==='ArrowRight'){e.preventDefault();stop();updateCursor(state.cursor+1);}if(e.code==='Space'){e.preventDefault();togglePlay();}};
$('pnlSearch').oninput=()=>{state.pnlSearch=$('pnlSearch').value.trim();state.pnlPage=0;renderPnl();};
$('pnlFilter').onchange=()=>{state.pnlFilter=$('pnlFilter').value;state.pnlPage=0;renderPnl();};
$('pnlPrev').onclick=()=>{state.pnlPage--;renderPnl();};$('pnlNext').onclick=()=>{state.pnlPage++;renderPnl();};$('pnlExport').onclick=exportPnl;
$('pnlRows').onclick=e=>{const b=e.target.closest('[data-pnl-order]');if(!b)return;const o=state.dataset.orders.find(o=>o.key===b.dataset.pnlOrder);selectOrder(o,'fill');$('replayWorkspace').scrollIntoView({behavior:'smooth',block:'start'});};
$('files').onchange=e=>showFiles(e.target.files);$('importForm').onsubmit=importFiles;$('templateBtn').onclick=templates;
for(const kind of ['dragenter','dragover'])$('fileDrop').addEventListener(kind,e=>{e.preventDefault();$('fileDrop').classList.add('dragging');});
for(const kind of ['dragleave','drop'])$('fileDrop').addEventListener(kind,e=>{e.preventDefault();$('fileDrop').classList.remove('dragging');if(kind==='drop')showFiles(e.dataTransfer.files);});
await loadDefault();
