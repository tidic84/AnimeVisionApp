const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');
const { federatedProvider } = loadTs('services/comics/federated.ts');
const memory = new Map();
let requests = [];
const mocks = {
  '@env': { API_ADDRESS: 'https://catalog.example' },
  '@react-native-async-storage/async-storage': { getItem:async key=>memory.get(key)||null,setItem:async(key,value)=>memory.set(key,value) },
};
const scan = loadTs('services/comics/scanmanga.ts',mocks,{fetch:async url=>{
  requests.push(url);return {ok:true,status:200,json:async()=>url.endsWith('/status')?{source:'scanmanga',comics:3}:url.endsWith('/pages')?{pages:[{url:'/api/comics/scanmanga/media/1/0'}]}:[]};
}});

(async()=>{
  assert.equal(scan.validateCatalogAddress(' https://catalog.example/ '),'https://catalog.example');
  for(const address of ['file:///x','javascript:alert(1)','https://user:pass@catalog.example','https://catalog.example/?token=x'])assert.throws(()=>scan.validateCatalogAddress(address));
  await scan.saveScanMangaAddress('https://catalog.example');assert.equal(await scan.getScanMangaAddress(),'https://catalog.example');
  const query=scan.scanSearchPath({kind:'manhwa',language:'fr',query:'solo & murim',tagIds:['Action'],order:'latest',offset:0,limit:24,cursor:'48'});
  const params=new URLSearchParams(query.split('?')[1]);assert.equal(params.get('q'),'solo & murim');assert.equal(params.get('offset'),'48');assert.deepEqual(params.getAll('tag'),['Action']);
  assert.deepEqual(await scan.default.getChapters('scanmanga:1','en'),[]);
  assert.deepEqual(await scan.default.getPages('scanmanga:chapter:1'),[{url:'https://catalog.example/api/comics/scanmanga/media/1/0'}]);
  const seen=[];
  const source=(id,n)=>({id,name:id,search:async s=>{seen.push({id,...s});const end=Math.min(s.offset+s.limit,n);return{items:Array.from({length:end-s.offset},(_,i)=>({id:id+(s.offset+i),provider:id})),total:n};}});
  const federated=federatedProvider([source('one',1),source('two',5)]);
  const search={kind:'all',language:'fr',order:'popular',offset:0,limit:4};
  const first=await federated.search(search),second=await federated.search({...search,offset:first.items.length,cursor:first.next});
  assert.equal(first.items.length,3);assert.equal(second.items.length,2);assert.ok(second.next);assert.equal(seen.filter(x=>x.id==='one').length,1,'exhausted source is not requested again');
  const last=await federated.search({...search,cursor:second.next});assert.equal(last.items.length,1);assert.equal(last.next,undefined);
  const partial=await federatedProvider([source('working',2),{id:'down',name:'Offline',search:async()=>{throw Error('offline');}}]).search(search);
  assert.equal(partial.items.length,2);assert.match(partial.warnings[0],/Offline/);
  await assert.rejects(()=>federatedProvider([{id:'down',name:'Offline',search:async()=>{throw Error('offline');}}]).search(search),/Offline/);
  console.log('comic source tests passed: configuration, query encoding, French availability, native pages, independent pagination and partial outages');
})().catch(error=>{console.error(error);process.exitCode=1;});
