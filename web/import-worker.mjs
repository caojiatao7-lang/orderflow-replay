import {parseFiles} from './model.mjs';
import {builtinDataset} from './builtin.mjs?v=market-filter-v1';
self.onmessage=async({data})=>{
  try {
    let files=data.files;
    if(data.defaultPack){
      const pack=builtinDataset(data.defaultPack===true?'synthetic':data.defaultPack);
      self.postMessage({progress:'正在加载 '+pack.label+'…'});
      const response=await fetch('./'+pack.file+'?v=market-filter-v1');
      if(!response.ok)throw Error(`默认复盘包加载失败（${response.status}）`);
      files=[new File([await response.arrayBuffer()],pack.file)];
    }
    const result=await parseFiles(files,data.calendar||{},text=>self.postMessage({progress:text}));
    self.postMessage({result});
  }
  catch(error){self.postMessage({error:error.message||String(error)});}
};
