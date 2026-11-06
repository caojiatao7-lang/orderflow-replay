import {clock,fullTime} from './model.mjs';
import {esc,fmt} from './charts.mjs';
export const money=c=>c==null?'无法完整计算':`${c>0?'+':''}${(c/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const tone=c=>c==null?'':c>0?'pnl-positive':c<0?'pnl-negative':'';
export function closureTable(rows,selectedKey){
  if(!rows.length)return '<tr><td colspan="9" class="pnl-empty">没有符合条件的平仓记录。</td></tr>';
  return rows.map(r=>`<tr class="${r.key===selectedKey?'pnl-selected':''}"><td class="mono" title="${fullTime(r.t)}">${clock(r.t)}</td><td>#${esc(r.closeId)}</td><td>${r.direction==='long'?'平多':'平空'} · ${fmt(r.qty)} 手</td><td><details><summary>${r.pairs.length} 笔开仓配对${r.unmatched?` · 缺 ${r.unmatched} 手`:''}</summary>${r.pairs.map(p=>`<div class="pnl-pair"><button data-pnl-order="${esc(p.openKey)}">查看开仓 #${esc(p.openId)}</button><span>${clock(p.openTime)} · ${fmt(p.qty)} 手 · ${fmt(p.openPrice)} → ${fmt(p.closePrice)}</span><span>价差 × ${fmt(p.qty)} 手 × 合约乘数 = ${money(p.grossCents)} 元</span></div>`).join('')}</details></td><td class="${tone(r.grossCents)}">${money(r.grossCents)}</td><td>${r.openFeeCents==null?'未知':(r.openFeeCents/100).toFixed(2)}</td><td>${r.closeFeeCents==null?'未知':(r.closeFeeCents/100).toFixed(2)}</td><td class="pnl-net ${tone(r.netCents)}">${money(r.netCents)}</td><td><button data-pnl-order="${esc(r.key)}">查看平仓盘口</button></td></tr>`).join('');
}
