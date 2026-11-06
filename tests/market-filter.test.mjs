import test from 'node:test';import assert from 'node:assert/strict';
import {marketMetrics,parseMarketFilter,matchesMetrics,matchingContracts,findMatchingTime} from '../web/market-filter.mjs';
const q=(t,dv=10,buy=6,sell=2,v=100)=>({t,dv,v,bids:Array.from({length:5},(_,i)=>[100-i,buy]),asks:Array.from({length:5},(_,i)=>[101+i,sell])});
const filter=raw=>parseMarketFilter(raw).filter;
test('metrics distinguish signed five-level imbalance, zero, missing volume, and incomplete books',()=>{
 assert.deepEqual(marketMetrics(q(0)),{delta:10,volume:100,buy:30,sell:10,difference:20});
 const s=q(0,0,0,2,0);assert.equal(marketMetrics(s).delta,0);assert.equal(marketMetrics(s).difference,-10);
 s.asks.pop();assert.equal(marketMetrics(s).difference,null);assert.equal(marketMetrics(null).delta,null);
});
test('ranges are inclusive AND conditions, support negative delta and signed or absolute difference',()=>{
 assert(matchesMetrics(marketMetrics(q(0)),filter({volumeMin:10,volumeMax:10,differenceMin:20,differenceMax:20})));
 assert(!matchesMetrics(marketMetrics(q(0)),filter({volumeMin:11,differenceMin:20})));
 assert(matchesMetrics(marketMetrics(q(0,-2,1,5)),filter({volumeMax:0,differenceMode:'absolute',differenceMin:20})));
 assert(matchesMetrics(marketMetrics(q(0,null)),filter({volumeMode:'volume',volumeMin:100})));
 assert(!matchesMetrics(marketMetrics(q(0,null)),filter({volumeMin:0})));
 assert(matchesMetrics(marketMetrics(q(0,null)),filter({differenceMin:0})));
 assert(parseMarketFilter({volumeMin:10,volumeMax:1}).error);assert(parseMarketFilter({differenceMode:'absolute',differenceMin:-1}).error);assert(parseMarketFilter({volumeMax:'oops'}).error);assert.equal(filter({volumeMin:' '}).active,false);
});
test('as-of screening excludes future, stale and ended quotes; disabled filters retain all chosen contracts',()=>{
 const markets={a:{snaps:[q(1000),q(5000)]},b:{snaps:[q(2000)]},c:{snaps:[q(1000)]}};
 const f=filter({volumeMin:10,differenceMin:20});
 assert.deepEqual(matchingContracts(markets,['a','b','c'],1500,f),['a']);
 assert.deepEqual(matchingContracts(markets,['a','b'],4000,f),[]);
 assert.deepEqual(matchingContracts(markets,['a','b','c'],4000,filter({})),['a','b','c']);
});
test('bidirectional event search finds any selected contract original snapshot, respects duplicate last row, and strict direction',()=>{
 const markets={a:{snaps:[q(1000,50),q(1000,0),q(2000,0),q(3000,50)]},b:{snaps:[q(1500,50),q(2500,0),q(4000,50)]}};
 const f=filter({volumeMin:40});
 assert.equal(findMatchingTime(markets,['a','b'],0,1,f),1500);
 assert.equal(findMatchingTime(markets,['a','b'],1500,1,f),3000);
 assert.equal(findMatchingTime(markets,['a','b'],3000,-1,f),1500);
 assert.equal(findMatchingTime(markets,['a'],3000,-1,f),null);
 assert.equal(findMatchingTime(markets,['a','b'],4000,1,f),null);
 assert.equal(findMatchingTime(markets,[],0,1,f),null);
});
