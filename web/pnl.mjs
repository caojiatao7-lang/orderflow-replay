// Contract price units verified against SHFE product rules; unknown products remain unpriced.
export const MULTIPLIERS={ag:15,au:1000,fu:10,sn:1};
const number=v=>v==null||String(v).trim()===''?null:Number(String(v).replaceAll(',','').trim());
const cents=v=>Math.round(v*100);
const bucket=o=>`${o.side}:${o.offset==='开仓'?'open':'close'}`;
function allocate(total,weights){
  const sum=weights.reduce((a,b)=>a+b,0);
  if(!(sum>0)||!Number.isFinite(sum)||weights.some(w=>!Number.isFinite(w)||w<0)||!Number.isSafeInteger(total))return null;
  const exact=weights.map(w=>total*w/sum),out=exact.map(Math.floor);
  const ranked=exact.map((v,i)=>({i,r:v-out[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
  const remaining=total-out.reduce((a,b)=>a+b,0);
  for(let i=0;i<remaining;i++)out[ranked[i].i]++;
  return out;
}
export function calculateClosures(dataset,contract){
  const multiplier=MULTIPLIERS[contract.match(/^[a-z]+/i)?.[0].toLowerCase()],warnings=[];
  if(!multiplier)return {rows:[],warnings:['尚未配置此品种的合约乘数，未计算盈亏。'],multiplier:null};
  const orders=dataset.orders.filter(o=>o.contract===contract&&o.filled>0).sort((a,b)=>(a.fill??a.submit)-(b.fill??b.submit)||(a.sequence??0)-(b.sequence??0));
  const groups=new Map(),stats=new Map(),fees=new Map();
  for(const o of orders){if(!groups.has(bucket(o)))groups.set(bucket(o),[]);groups.get(bucket(o)).push(o);}
  const rawStats=(dataset.stats||[]).filter(r=>String(r['合约']||'').trim().toLowerCase()===contract);
  for(const r of rawStats){
    const side=String(r['买卖']||'').includes('买')?'buy':String(r['买卖']||'').includes('卖')?'sell':null;
    const offset=String(r['开平']||'').trim(),qty=number(r['成交手数']),fee=number(r['手续费']);
    if(!side||!['开仓','平仓','平今','平昨'].includes(offset)||!Number.isInteger(qty)||qty<0||fee==null||!Number.isFinite(fee)||fee<0){warnings.push('成交统计含无效的手续费字段，相关分组不作扣费计算。');continue;}
    const key=`${side}:${offset==='开仓'?'open':'close'}`,previous=stats.get(key)||{qty:0,fee:0};
    stats.set(key,{qty:previous.qty+qty,fee:previous.fee+cents(fee)});
  }
  for(const [key,group] of groups){
    const s=stats.get(key),qty=group.reduce((a,o)=>a+o.filled,0);
    if(!s||s.qty!==qty){warnings.push(`${key} 缺少匹配的成交统计或手数不一致，手续费未知。`);continue;}
    const fixedFee=/^(au|sn)\d/i.test(contract);
    const values=allocate(s.fee,group.map(o=>fixedFee?o.filled:o.fillPrice*o.filled));
    if(!values){warnings.push(`${key} 成交价格或费用无效，手续费未知。`);continue;}
    group.forEach((o,i)=>fees.set(o.key,values[i]));
  }
  const queues={long:[],short:[]},heads={long:0,short:0},rows=[];
  const portion=(lot,q)=>lot.fee==null?null:Math.round((lot.used+q)*lot.fee/lot.order.filled)-Math.round(lot.used*lot.fee/lot.order.filled);
  for(const o of orders){
    if(!Number.isFinite(o.fillPrice)||!Number.isInteger(o.filled)){warnings.push(`订单 ${o.id} 缺少有效成交均价或整数手数。`);continue;}
    const isOpen=o.offset==='开仓',direction=(o.side==='buy')===isOpen?'long':'short';
    if(!isOpen&&!/平/.test(o.offset)){warnings.push(`订单 ${o.id} 开平方向未知。`);continue;}
    if(isOpen){queues[direction].push({order:o,used:0,fee:fees.get(o.key)??null});continue;}
    const row={key:o.key,closeId:o.id,t:o.fill,qty:o.filled,direction,pairs:[],unmatched:0,grossCents:0,openFeeCents:0,closeFeeCents:fees.get(o.key)??null,feeCents:null,netCents:null};
    let remaining=o.filled,openFeesKnown=true;
    while(remaining>0&&heads[direction]<queues[direction].length){
      const lot=queues[direction][heads[direction]],q=Math.min(remaining,lot.order.filled-lot.used),openFee=portion(lot,q);
      const gross=cents((o.fillPrice-lot.order.fillPrice)*multiplier*q*(direction==='long'?1:-1));
      row.pairs.push({openId:lot.order.id,openKey:lot.order.key,openTime:lot.order.fill,openPrice:lot.order.fillPrice,closePrice:o.fillPrice,qty:q,grossCents:gross,openFeeCents:openFee});
      row.grossCents+=gross;if(openFee==null)openFeesKnown=false;else row.openFeeCents+=openFee;
      lot.used+=q;remaining-=q;if(lot.used===lot.order.filled)heads[direction]++;
    }
    row.unmatched=remaining;
    if(remaining){row.grossCents=null;row.openFeeCents=null;warnings.push(`平仓单 ${o.id} 有 ${remaining} 手找不到此前开仓记录。`);}
    if(!openFeesKnown)row.openFeeCents=null;
    if(!remaining&&row.openFeeCents!=null&&row.closeFeeCents!=null){row.feeCents=row.openFeeCents+row.closeFeeCents;row.netCents=row.grossCents-row.feeCents;}
    rows.push(row);
  }
  let unclosedLots=0,unclosedFeeCents=0;
  for(const lots of Object.values(queues))for(const lot of lots){const q=lot.order.filled-lot.used;if(q){unclosedLots+=q;const fee=portion(lot,q);if(fee!=null)unclosedFeeCents+=fee;}}
  if(unclosedLots)warnings.push(`尚有 ${unclosedLots} 手未平仓，其开仓手续费未计入已平仓净盈亏。`);
  const complete=rows.every(r=>r.grossCents!=null),netComplete=rows.every(r=>r.netCents!=null);
  const grossCents=complete?rows.reduce((s,r)=>s+r.grossCents,0):null,feeCents=netComplete?rows.reduce((s,r)=>s+r.feeCents,0):null;
  const reportedGross=rawStats.length&&rawStats.every(r=>number(r['平仓盈亏'])!=null)?cents(rawStats.reduce((s,r)=>s+number(r['平仓盈亏']),0)):null;
  const reconciliation=reportedGross==null||grossCents==null?null:grossCents-reportedGross;
  if(reconciliation)warnings.push(`配对毛盈亏与成交统计相差 ${(reconciliation/100).toFixed(2)} 元，请核对均价、缺失历史及同秒顺序。`);
  return {rows,multiplier,warnings:[...new Set(warnings)],grossCents,feeCents,netCents:netComplete?grossCents-feeCents:null,unclosedLots,unclosedFeeCents,reportedGross,reconciliation};
}
