import {alignedMarket} from './compare.mjs';
import {midpoint} from './mid-overlay.mjs';
export function sortContractsByMid(markets,contracts,t,mode='mid-desc'){
  const rows=contracts.map(contract=>({contract,mid:midpoint(alignedMarket(markets[contract],t,0).snapshot)}));
  rows.sort((a,b)=>{
    if(mode==='code')return a.contract.localeCompare(b.contract,'en');
    if(a.mid==null&&b.mid!=null)return 1;
    if(a.mid!=null&&b.mid==null)return -1;
    if(a.mid!=null&&b.mid!=null&&a.mid!==b.mid)return mode==='mid-asc'?a.mid-b.mid:b.mid-a.mid;
    return a.contract.localeCompare(b.contract,'en');
  });
  return rows.map(row=>row.contract);
}
