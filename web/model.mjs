export const MARKET_FIELDS = ['trading_day','instrument','exchange','exchange_instrument','last_price','pre_settlement','pre_close','pre_open_interest','open_price','high_price','low_price','volume','turnover','open_interest','close_price','settlement_price','upper_limit','lower_limit','pre_delta','curr_delta','update_time','update_millisec','bid_price1','bid_volume1','ask_price1','ask_volume1','bid_price2','bid_volume2','ask_price2','ask_volume2','bid_price3','bid_volume3','ask_price3','ask_volume3','bid_price4','bid_volume4','ask_price4','ask_volume4','bid_price5','bid_volume5','ask_price5','ask_volume5','average_price','action_day'];
const CTP = ['TradingDay','InstrumentID','ExchangeID','ExchangeInstID','LastPrice','PreSettlementPrice','PreClosePrice','PreOpenInterest','OpenPrice','HighestPrice','LowestPrice','Volume','Turnover','OpenInterest','ClosePrice','SettlementPrice','UpperLimitPrice','LowerLimitPrice','PreDelta','CurrDelta','UpdateTime','UpdateMillisec','BidPrice1','BidVolume1','AskPrice1','AskVolume1','BidPrice2','BidVolume2','AskPrice2','AskVolume2','BidPrice3','BidVolume3','AskPrice3','AskVolume3','BidPrice4','BidVolume4','AskPrice4','AskVolume4','BidPrice5','BidVolume5','AskPrice5','AskVolume5','AveragePrice','ActionDay'];
const aliases = Object.fromEntries(CTP.map((s,i)=>[s,MARKET_FIELDS[i]]));
export const n = v => v === '' || v == null || !Number.isFinite(Number(String(v).replaceAll(',',''))) || Math.abs(Number(String(v).replaceAll(',',''))) >= 1e20 ? null : Number(String(v).replaceAll(',',''));
export const clock = t => t == null ? '—' : new Date(t+8*3600000).toISOString().slice(11,23);
export const fullTime = t => t == null ? '—' : new Date(t+8*3600000).toISOString().slice(0,23).replace('T',' ');
export function fillTiming(order){
  if(!(order.filled>0)||order.fill==null)return null;
  const elapsed=order.fill-order.submit,complete=order.filled===order.qty;
  return {elapsed,complete,compact:complete&&elapsed<1000,label:complete?'全部成交':'部分成交',duration:`${Number((elapsed/1000).toFixed(3))} 秒`};
}
export function orderEventRows(orders){
  const rows=[];
  for(const order of orders){
    const events=['submit','fill','cancel'].filter(kind=>order[kind]!=null&&(kind!=='fill'||order.filled>0)).map(kind=>({kind,t:order[kind]})).sort((a,b)=>a.t-b.t);
    let group=null;
    for(const e of events){
      if(!group||e.t-group.t>=1000){group={order,t:e.t,event:e.kind,kinds:[]};rows.push(group);}
      group.kinds.push(e.kind);
    }
  }
  for(const row of rows){
    row.label=row.kinds.map(k=>k==='submit'?'报单':k==='cancel'?'撤单':row.order.filled===row.order.qty?'全部成交':'部分成交').join(' / ');
    row.delay=`${Number(((row.t-row.order.submit)/1000).toFixed(3))} 秒`;
  }
  return rows.sort((a,b)=>a.t-b.t||(a.order.sequence??0)-(b.order.sequence??0));
}
export function dateTime(date,time) {
  date=String(date).trim().replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}:\d{2}(\.\d{1,9})?$/.test(time))return null;
  const fraction=time.split('.')[1]||'';
  if(fraction.length>3&&/[1-9]/.test(fraction.slice(3)))return null;
  if(fraction.length>3)time=time.slice(0,12);
  const [h,m,s]=time.split(':').map(Number);if(h>23||m>59||s>=60)return null;
  const t=Date.parse(`${date}T${time}+08:00`);
  return Number.isFinite(t)&&new Date(t+8*3600000).toISOString().slice(0,10)===date?t:null;
}
export function eventTime(value, day, nightDate) {
  const s=String(value??'').trim();if(!s)return null;
  if(/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)){const parts=s.replaceAll('/','-').split(/[ T]/);return dateTime(parts[0],parts[1]);}
  if(!/^\d{2}:\d{2}:\d{2}(\.\d{1,9})?$/.test(s))return null;
  if(s>='18:00:00')return nightDate?dateTime(nightDate,s):null;
  if(s<'06:00:00'&&nightDate){const base=dateTime(nightDate,'12:00:00');if(base==null)return null;return dateTime(new Date(base+86400000+8*3600000).toISOString().slice(0,10),s);}
  return dateTime(day,s);
}
export function* csvRows(text) {
  text=text.replace(/^\uFEFF/,'');let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else {quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'&&cell===''&&!closed){quoted=true;continue;}
    if(c===','||c==='\n'||c==='\r'){
      row.push(cell);cell='';closed=false;
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v!==''))yield row;row=[];}
    }else {if(closed&&!/\s/.test(c))throw Error('CSV 引号后出现非法字符');cell+=c;}
  }
  if(quoted)throw Error('CSV 存在未闭合的引号');
  if(cell!==''||row.length){row.push(cell);if(row.some(v=>v!==''))yield row;}
}
const get=(row,...keys)=>{for(const k of keys)if(row[k]!=null)return String(row[k]).trim();return '';};
export function normalizeOrder(row, calendar, index=0) {
  const id=get(row,'报单编号','order_id','OrderSysID','orderId');
  const contract=get(row,'合约','instrument','InstrumentID','symbol').toLowerCase();
  if(!id||!contract)throw Error(`委托第 ${index+2} 行缺少报单编号或合约`);
  const submitRaw=get(row,'报单时间','submit_time','InsertTime');
  const submit=eventTime(submitRaw,calendar.day,calendar.nightDate);
  if(submit==null)throw Error(`订单 ${id} 报单日期或时间无法解析，请检查交易日与夜盘起始日`);
  const cancelRaw=get(row,'撤单时间','cancel_time','CancelTime'),fillRaw=get(row,'最后成交时间','fill_time','TradeTime');
  const cancel=eventTime(cancelRaw,calendar.day,calendar.nightDate),fill=eventTime(fillRaw,calendar.day,calendar.nightDate);
  if((cancelRaw&&cancel==null)||(fillRaw&&fill==null))throw Error(`订单 ${id} 的成交／撤单时间无效`);
  if((cancel!=null&&cancel<submit)||(fill!=null&&fill<submit))throw Error(`订单 ${id} 的事件日期顺序异常，请检查日历`);
  const rawSide=get(row,'买卖','side','Direction'),rawOffset=get(row,'开平','offset','CombOffsetFlag');
  const side=/买|buy|^0$/i.test(rawSide)?'buy':/卖|sell|^1$/i.test(rawSide)?'sell':null;
  if(!side)throw Error(`订单 ${id} 买卖方向无法识别`);
  const qty=n(get(row,'报单手数','quantity','VolumeTotalOriginal')),filled=n(get(row,'成交手数','filled_quantity','VolumeTraded'))??0;
  if(qty==null||qty<=0||filled<0||filled>qty)throw Error(`订单 ${id} 数量无效`);
  const timeStrings=[submitRaw,cancelRaw,fillRaw].filter(Boolean);
  const precision=submitRaw.includes('.')?1:1000;
  return {id,key:`${contract}:${id}`,contract,side,offset:rawOffset||'未提供',price:n(get(row,'报单价格','price','LimitPrice')),qty,filled,
    fillPrice:n(get(row,'成交均价','fill_price','AveragePrice')),status:get(row,'挂单状态','status','OrderStatus')||(cancel?'已撤单':filled===qty?'全部成交':'未成交'),
    submit,cancel,fill,precision,precisions:{submit:precision,cancel:cancelRaw.includes('.')?1:1000,fill:fillRaw.includes('.')?1:1000},sequence:n(get(row,'序列号','sequence'))??index,sourceRow:n(get(row,'source_row','源行'))??index+2};
}
export function normalizeSnapshot(row,index=0) {
  let t=row.beijing_timestamp?eventTime(row.beijing_timestamp,'',''):dateTime(row.action_day,`${row.update_time}.${String(row.update_millisec??'0').padStart(3,'0')}`);
  if(t==null)return null;
  const contract=String(row.instrument||'').toLowerCase().trim();if(!contract)return null;
  const bids=[],asks=[];
  for(let i=1;i<=5;i++){bids.push([n(row[`bid_price${i}`]),n(row[`bid_volume${i}`])]);asks.push([n(row[`ask_price${i}`]),n(row[`ask_volume${i}`])]);}
  return {contract,t,p:n(row.last_price),v:n(row.volume),tradingDay:String(row.trading_day),bids,asks,sourceRow:n(row.source_row)??index+2,
    valid:[...bids,...asks].every(([p,q])=>p>0&&p<1e20&&q>0)&&bids[0][0]<=asks[0][0]};
}
export function finalizeMarket(snaps,keepDeltas=false) {
  snaps.sort((a,b)=>a.t-b.t||a.sourceRow-b.sourceRow);
  for(let i=0;i<snaps.length;i++){
    const s=snaps[i],prev=snaps[i-1];
    if(!keepDeltas||s.dv===undefined)s.dv=prev&&s.tradingDay===prev.tradingDay&&s.v!=null&&prev.v!=null?s.v-prev.v:null;
  }
  return snaps;
}
export function hydrate(input) {
  if(input.version!==1||!Array.isArray(input.orders)||!input.markets||typeof input.markets!=='object')throw Error('复盘包格式不受支持');
  const orders=input.orders;
  if(orders.length>200000)throw Error('复盘包的订单数量无效');
  const keys=new Set();
  for(const o of orders){
    if(!o.id||!o.contract||!['buy','sell'].includes(o.side)||!Number.isFinite(o.submit)||o.qty<=0||o.filled<0||o.filled>o.qty)throw Error('复盘包中存在无效订单');
    o.key=`${o.contract}:${o.id}`;if(keys.has(o.key))throw Error('复盘包含重复订单编号');keys.add(o.key);
    for(const k of ['cancel','fill'])if(o[k]!=null&&(!Number.isFinite(o[k])||o[k]<o.submit))throw Error('复盘包的事件时间无效');
  }
  let total=0;
  for(const market of Object.values(input.markets)){
    if(!Array.isArray(market.snaps))throw Error('复盘包缺少行情快照');
    for(const s of market.snaps){
      total++;if(total>600000)throw Error('复盘包超过 60 万快照限制');
      if(!Number.isFinite(s.t)||!Array.isArray(s.bids)||!Array.isArray(s.asks)||s.bids.length!==5||s.asks.length!==5)throw Error('复盘包五档行情格式错误');
      for(const [p,q] of [...s.bids,...s.asks])if((p!=null&&!Number.isFinite(p))||(q!=null&&!Number.isFinite(q)))throw Error('复盘包报价无效');
    }
    finalizeMarket(market.snaps,true);
  }
  if(!orders.length&&!total)throw Error('复盘包没有委托或行情快照');
  return {...input,orders:orders.sort((a,b)=>a.submit-b.submit||a.sequence-b.sequence),marketOnly:!orders.length};
}
export async function parseFiles(files,calendar,progress=()=>{}) {
  const json=files.filter(f=>/\.json(\.gz)?$/i.test(f.name));
  if(json.length){
    if(files.length!==1)throw Error('复盘包 JSON 请单独导入');
    if(json[0].size>200*1024*1024)throw Error('压缩复盘包超过 200 MB 限制');
    let text;
    if(/\.gz$/i.test(json[0].name)){
      if(typeof DecompressionStream==='undefined')throw Error('浏览器不支持解压，请先把 .json.gz 解压成 .json 后导入');
      progress('正在浏览器内解压复盘包…');
      const compressed=new Blob([await json[0].arrayBuffer()]).stream();
      text=await new Response(compressed.pipeThrough(new DecompressionStream('gzip'))).text();
    }else text=await json[0].text();
    progress('正在建立订单和五档行情索引…');
    return hydrate(JSON.parse(text));
  }
  const orders=[],markets={},stats=[],warnings=[];let invalid=0,excluded=0,totalSnapshots=0;
  for(let fi=0;fi<files.length;fi++){
    const file=files[fi];if(file.size>200*1024*1024)throw Error(`${file.name} 超过单文件 200 MB 限制`);
    progress(`读取 ${fi+1}/${files.length}：${file.name}`);
    const bytes=await file.arrayBuffer();let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('gb18030',{fatal:true}).decode(bytes);}
    const iterator=csvRows(text);let first=iterator.next();if(first.done)throw Error(`${file.name} 为空`);
    let header=first.value.map(s=>s.trim()),raw=false;
    if(/^\d{8}$/.test(header[0])&&(header.length===44||header.length===45)) {raw=true;header=MARKET_FIELDS.concat(header.length===45?['extra']:[]);}
    header=header.map(k=>aliases[k]||k);
    const type=(header.includes('报单时间')||header.includes('submit_time')||header.includes('InsertTime'))?'orders':header.includes('bid_price1')?'market':header.includes('平仓盈亏')?'stats':null;
    if(!type)throw Error(`${file.name} 字段无法识别。请使用当前委托导出、CTP 五档行情或模板。`);
    let count=0;
    const process=cells=>{
      if(cells.length!==header.length)throw Error(`${file.name} 第 ${count+2} 行列数不一致`);
      const row=Object.fromEntries(header.map((h,i)=>[h,cells[i]]));count++;
      if(type==='orders')orders.push(normalizeOrder(row,calendar,count-1));
      if(type==='stats')stats.push(row);
      if(type==='market'){
        if(String(row.trading_day).replaceAll('-','')!==calendar.day.replaceAll('-','')){excluded++;return;}
        const s=normalizeSnapshot(row,count-1);if(!s){invalid++;return;}
        totalSnapshots++;if(totalSnapshots>600000)throw Error('导入超过 60 万快照；请按交易日分开复盘');
        (markets[s.contract]??={contract:s.contract,snaps:[]}).snaps.push(s);
      }
    };
    if(raw)process(first.value);
    for(const cells of iterator){process(cells);}
    progress(`${file.name}：已解析 ${count.toLocaleString()} 行`);
  }
  if(!Object.keys(markets).length)throw Error('没有所选交易日的行情，请核对交易日并选择行情 CSV');
  const keys=new Set();for(const o of orders){if(keys.has(o.key))throw Error(`订单编号重复：${o.key}。请不要重复导入同一委托文件。`);keys.add(o.key);}
  for(const market of Object.values(markets))finalizeMarket(market.snaps);
  if(invalid)warnings.push(`${invalid} 行时间无法解析，未显示；请检查原文件`);
  if(excluded)warnings.push(`${excluded} 行其他交易日行情未导入`);
  const missing=[...new Set(orders.map(o=>o.contract))].filter(c=>!markets[c]);
  if(missing.length)warnings.push(`缺少行情：${missing.join('、')}`);
  return hydrate({version:1,name:'本地导入',demo:false,day:calendar.day,nightDate:calendar.nightDate,orders,markets,stats,warnings,files:files.map(f=>f.name)});
}
export function lowerBound(snaps,t){let l=0,r=snaps.length;while(l<r){const m=(l+r)>>1;if(snaps[m].t<t)l=m+1;else r=m;}return l;}
export function snapshotIndexAt(snaps,t){
  if(!snaps.length)return -1;
  let i=Math.min(lowerBound(snaps,t),snaps.length-1);
  if(i>0&&Math.abs(snaps[i-1].t-t)<=Math.abs(snaps[i].t-t))i--;
  return i;
}
export function contextFor(dataset,order,event='submit',span=10){
  const t=order[event];if(t==null)return null;
  const market=dataset.markets[order.contract],all=market?.snaps||[];
  const events=[order.submit,order.cancel,order.fill].filter(at=>at!=null);
  const start=Math.min(...events)-span*1000,end=Math.max(...events)+span*1000;
  const i=lowerBound(all,start),j=lowerBound(all,end+1);
  const snaps=all.slice(i,j),markers=[];
  for(const o of dataset.orders){if(o.contract!==order.contract)continue;for(const kind of ['submit','cancel','fill']){const at=o[kind];if(at!=null&&at>=start&&at<=end)markers.push({t:at,kind,id:o.id,price:kind==='fill'?o.fillPrice:o.price,selected:o.key===order.key,precision:o.precisions?.[kind]||o.precision||1000});}}
  return {t,start,end,snaps,markers,clipped:!all.length||all[0].t>start||all.at(-1).t<end,firstIndex:i};
}
export function summarize(dataset,contract){const rows=dataset.orders.filter(o=>o.contract===contract);return {orders:rows.length,cancels:rows.filter(o=>o.cancel!=null).length,filled:rows.filter(o=>o.filled>0).length,messages:rows.length+rows.filter(o=>o.cancel!=null).length};}
