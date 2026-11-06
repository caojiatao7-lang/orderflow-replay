import {writeFileSync} from 'node:fs';
const start=Date.parse('2025-01-06T09:00:00+08:00'),markets={};
for(let c=0;c<5;c++){const snaps=[];let v=0;for(let i=0;i<241;i++){const mid=1000+c*12+Math.round(4*Math.sin(i/14+c)),dv=i?1+(i*7+c*11)%80:null;v+=dv??0;snaps.push({t:start+i*500,p:mid,v,dv,tradingDay:'2025-01-06',sourceRow:i+2,bids:Array.from({length:5},(_,j)=>[mid-1-j,2+(i*3+j*7+c*5)%60]),asks:Array.from({length:5},(_,j)=>[mid+1+j,2+(i*5+j*3+c*7)%50])});}markets[`demo${c+1}`]={snaps};}
const order=(id,side,offset,at,filled,delay)=>({id,contract:'demo1',side,offset,price:1000,qty:1,filled,fillPrice:1000,status:filled?'全部成交':'已撤单',submit:start+at,fill:filled?start+at+delay:null,cancel:filled?null:start+at+delay,sequence:at,precision:1000,precisions:{submit:1000,fill:1000,cancel:1000}});
const ds={version:1,name:'完全虚构的订单与五合约演示',demo:true,day:'2025-01-06',defaultTimestamp:start+30000,orders:[order('SIM-001','buy','开仓',30000,1,500),order('SIM-002','sell','平仓',35000,1,2000),order('SIM-003','buy','开仓',40000,0,3000)],markets,warnings:['演示价格、数量、订单均由公式生成；费用资料缺失时净盈亏显示未知。']};
writeFileSync(new URL('../examples/synthetic-replay.json',import.meta.url),JSON.stringify(ds));
