import {fullTime,dateTime} from './model.mjs';
import {unionTimes,defaultCompareTime,alignedMarket,timeLowerBound} from './compare.mjs';
import {comparisonCard,comparisonDepthRow} from './compare-view.mjs?v=market-filter-v1';
import {esc} from './charts.mjs';
import {parseMarketFilter,matchingContracts,findMatchingTime} from './market-filter.mjs';
import {sortContractsByMid} from './compare-sort.mjs';
import {createMidOverlay} from './mid-overlay-ui.mjs?v=ag-mid-zoom-v1';
export function createComparison(){
  const $=id=>document.getElementById(id),s={dataset:null,contracts:[],selected:new Set(),times:[],t:null,index:0,span:10,playing:false,timer:null};
  const midOverlay=createMidOverlay(setTime,stop);
  let activeFilter=parseMarketFilter({}).filter;
  const filterFields=['volumeMode','volumeMin','volumeMax','differenceMode','differenceMin','differenceMax'];
  const inputId=k=>'filter'+k[0].toUpperCase()+k.slice(1);
  function stop(){s.playing=false;clearTimeout(s.timer);$('comparePlay').textContent='▶ 播放';}
  function show(){
    if(!s.dataset||s.t==null)return;
    $('compareTime').textContent=fullTime(s.t);$('compareJump').value=fullTime(s.t).replace(' ','T');
    s.index=Math.max(0,Math.min(s.times.length-1,timeLowerBound(s.times,s.t+1)-1));$('compareCursor').value=s.index;
    $('comparePrev').disabled=s.index===0;$('compareNext').disabled=s.index>=s.times.length-1;
    $('compareSummary').textContent=`已选 ${s.selected.size} / ${s.contracts.length} 个合约 · ${s.times.length.toLocaleString()} 个联合时间点 · 北京时间`;
    midOverlay.update([...s.selected],s.t,s.span);
    const matched=matchingContracts(s.dataset.markets,[...s.selected],s.t,activeFilter);
    const displayContracts=sortContractsByMid(s.dataset.markets,matched,s.t,$('compareSort').value);
    $('marketFilterResult').textContent=`${activeFilter.active?'筛选已启用':'未启用筛选'} · 当前命中 ${matched.length} / ${s.selected.size} 个已选合约`;
    for(const id of ['marketFilterPrev','marketFilterNext'])$(id).disabled=!activeFilter.active||!s.selected.size;
    $('compareGrid').innerHTML=displayContracts.length?displayContracts.map(c=>$('compareColumns').value==='rows'?comparisonDepthRow(c,s.dataset.markets[c],s.t):comparisonCard(c,alignedMarket(s.dataset.markets[c],s.t,s.span))).join(''):`<div class="compare-no-snapshot">${s.selected.size?'当前时刻没有符合条件的合约。可用“下一个命中”寻找其他时刻，或调整筛选。':'请至少勾选一个合约。'}</div>`;
  }
  function setTime(t){if(!Number.isFinite(t)||!s.times.length)return;stop();s.t=Math.max(s.times[0],Math.min(s.times.at(-1),Math.round(t)));$('compareStatus').textContent='';show();}
  function step(direction){if(!s.times.length)return;const i=direction>0?timeLowerBound(s.times,s.t+1):timeLowerBound(s.times,s.t)-1;setTime(s.times[Math.max(0,Math.min(s.times.length-1,i))]);}
  function tick(){
    if(!s.playing)return;const next=timeLowerBound(s.times,s.t+1);if(next>=s.times.length){stop();return;}
    s.timer=setTimeout(()=>{s.t=s.times[next];show();tick();},500/Number($('compareSpeed').value));
  }
  function toggle(){if(s.playing){stop();return;}if(!s.times.length)return;if(s.t>=s.times.at(-1)){s.t=s.times[0];show();}s.playing=true;$('comparePlay').textContent='Ⅱ 暂停';tick();}
  $('comparePrev').onclick=()=>step(-1);$('compareNext').onclick=()=>step(1);$('comparePlay').onclick=toggle;
  $('compareCursor').oninput=()=>setTime(s.times[Number($('compareCursor').value)]);
  $('compareSpan').onchange=()=>{s.span=Number($('compareSpan').value);show();};
  $('compareSpeed').onchange=()=>{if(s.playing){stop();toggle();}};
  $('compareJumpForm').onsubmit=e=>{e.preventDefault();const [date,time]=$('compareJump').value.split('T'),t=dateTime(date,time?.length===5?time+':00':time||'');
    if(t==null||t<s.times[0]||t>s.times.at(-1)){$('compareStatus').textContent='请选择导入行情范围内的有效北京时间。';return;}setTime(t);
  };
  $('compareContracts').onchange=e=>{const input=e.target.closest('[data-compare-contract]');if(!input)return;if(input.checked)s.selected.add(input.dataset.compareContract);else s.selected.delete(input.dataset.compareContract);show();};
  $('compareAll').onclick=()=>{s.selected=new Set(s.contracts);$('compareContracts').querySelectorAll('input').forEach(i=>i.checked=true);show();};
  $('compareNone').onclick=()=>{s.selected.clear();$('compareContracts').querySelectorAll('input').forEach(i=>i.checked=false);show();};
  function applyLayout(){const value=$('compareColumns').value;$('compareGrid').classList.toggle('five-board',value==='5');$('compareGrid').classList.toggle('rows-board',value==='rows');$('compareGrid').style.gridTemplateColumns=value==='rows'?'1fr':value==='auto'||value==='5'?'':`repeat(${value}, minmax(260px,1fr))`;}
  function clearFilters(){activeFilter=parseMarketFilter({}).filter;for(const k of filterFields)$(inputId(k)).value=k==='volumeMode'?'delta':k==='differenceMode'?'signed':'';$('marketFilterError').textContent='';}
  $('marketFilterForm').onsubmit=e=>{e.preventDefault();stop();const raw=Object.fromEntries(filterFields.map(k=>[k,$(inputId(k)).value]));
    if(filterFields.some(k=>$(inputId(k)).validity.badInput)){$('marketFilterError').textContent='请输入有效数值；当前筛选未更改。';return;}
    const parsed=parseMarketFilter(raw);if(parsed.error){$('marketFilterError').textContent=parsed.error+' 当前筛选未更改。';return;}
    activeFilter=parsed.filter;$('marketFilterError').textContent='';$('compareStatus').textContent='';show();};
  $('marketFilterReset').onclick=()=>{clearFilters();$('compareStatus').textContent='';show();};
  function seekMatch(direction){stop();if(!s.dataset)return;const t=findMatchingTime(s.dataset.markets,[...s.selected],s.t,direction,activeFilter);
    if(t==null){$('marketFilterError').textContent=direction>0?'当前指针之后没有命中快照。':'当前指针之前没有命中快照。';return;}
    $('marketFilterError').textContent='';setTime(t);
  }
  $('marketFilterPrev').onclick=()=>seekMatch(-1);$('marketFilterNext').onclick=()=>seekMatch(1);
  $('compareSort').onchange=show;
  $('compareColumns').onchange=()=>{applyLayout();show();};
  $('compareGrid').onclick=e=>{
    const card=e.target.closest('[data-snapshot-time]');if(card){setTime(Number(card.dataset.snapshotTime));return;}
    const svg=e.target.closest('svg');if(!svg||!s.dataset||$('compareColumns').value==='rows')return;const box=svg.getBoundingClientRect(),x=(e.clientX-box.left)/box.width*540;if(x<52||x>528)return;setTime(s.t-s.span*1000+(x-52)/(528-52)*s.span*2000);
  };
  $('compareGrid').onkeydown=e=>{const card=e.target.closest('[data-snapshot-time]');if(card&&(e.key==='Enter'||e.code==='Space')){e.preventDefault();e.stopPropagation();setTime(Number(card.dataset.snapshotTime));}};
  return {stop,setTime,handleKey(e){if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}if(e.key==='ArrowRight'){e.preventDefault();step(1);}if(e.code==='Space'){e.preventDefault();toggle();}},
    setDataset(dataset,initialTime){
      stop();clearFilters();s.dataset=dataset;$('compareSort').value='mid-desc';midOverlay.setDataset(dataset);$('compareColumns').value='rows';applyLayout();s.contracts=Object.keys(dataset.markets).filter(c=>dataset.markets[c].snaps.length).sort();s.selected=new Set(s.contracts);s.times=unionTimes(dataset.markets,s.contracts);
      $('compareContracts').innerHTML=s.contracts.map(c=>`<label><input type="checkbox" data-compare-contract="${esc(c)}" checked>${esc(c.toUpperCase())}</label>`).join('');
      const ready=!!s.times.length;for(const id of ['comparePlay','comparePrev','compareNext','compareJump','compareGo','compareCursor'])$(id).disabled=!ready;
      $('compareCursor').max=Math.max(0,s.times.length-1);
      $('compareRange').textContent=ready?`${fullTime(s.times[0])} — ${fullTime(s.times.at(-1))}`:'尚未导入可用行情，请点击“只导入行情”。';
      if(ready){s.t=initialTime??dataset.defaultTimestamp??defaultCompareTime(dataset.markets,s.contracts);setTime(s.t);}
      else {$('compareGrid').innerHTML='<div class="compare-no-snapshot">当前数据没有行情快照。</div>';$('compareSummary').textContent='没有可用行情';$('compareTime').textContent='—';}
    }};
}
