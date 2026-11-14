import { ComicProvider, ComicSearch, ComicSearchResult, ComicTag } from './types';

/** Au-delà, une source est signalée indisponible pour cette page : les autres s'affichent sans l'attendre. */
export const SOURCE_TIMEOUT = 8000;
const withTimeout = <T,>(promise: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('trop lente, réessayez')), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

/** Each source keeps its own cursor; a short page from one source cannot end another. */
export function federatedProvider(sources: ComicProvider[]): ComicProvider {
  // Genres partagés par leur nom (les identifiants diffèrent d'une source à l'autre) ; liste de chaque source mise en cache.
  const tagCache=new Map<string,Promise<ComicTag[]>>();
  const tagsOf=(source:ComicProvider)=>{
    if(!tagCache.has(source.id)){const value=source.listTags().catch(()=>[] as ComicTag[]);tagCache.set(source.id,value);value.then(list=>{if(!list.length)tagCache.delete(source.id);});}
    return tagCache.get(source.id)!;
  };
  return {
    id:'online',name:'Toutes les sources',credit:sources.map(source=>source.name).join(' · '),
    async listTags(){
      const names=new Set((await Promise.all(sources.map(tagsOf))).flat().map(tag=>tag.name));
      return [...names].sort((a,b)=>a.localeCompare(b,'fr')).map(name=>({id:name,name}));
    },
    async search(search: ComicSearch): Promise<ComicSearchResult> {
      let state: Record<string,{offset:number;cursor?:string;done?:boolean}>={};
      if(search.cursor){try{state=JSON.parse(search.cursor);}catch{throw new Error('Pagination invalide. Relancez la recherche.');}}
      const count=Math.max(1,Math.ceil(search.limit/sources.length));
      const results=await Promise.all(sources.map(async source=>{
        const current=state[source.id]||{offset:0};
        if(current.done)return {source,current,result:null};
        try{
          let tagIds:string[]=[];
          if(search.tagIds?.length){
            const tags=await tagsOf(source);
            tagIds=search.tagIds.flatMap(name=>tags.filter(tag=>tag.name===name).map(tag=>tag.id));
            // Tous les genres demandés doivent exister dans cette source, sinon elle n'a aucun résultat.
            if(tagIds.length<search.tagIds.length)return {source,current,result:{items:[],total:0}};
          }
          return {source,current,result:await withTimeout(source.search({...search,tagIds,offset:current.offset,cursor:current.cursor,limit:count}),SOURCE_TIMEOUT)};
        }
        catch(error:any){return {source,current,result:null,error:`${source.name} : ${error?.message||'indisponible'}`};}
      }));
      const failures=results.filter(row=>row.error);
      if(failures.length===sources.length)throw new Error(failures.map(row=>row.error).join('\n'));
      const next={...state}, items=[] as ComicSearchResult['items'];
      for(const row of results){
        if(!row.result){next[row.source.id]={...row.current,done:true};continue;}
        const {result,current,source}=row;
        items.push(...result.items);
        const offset=current.offset+result.items.length;
        next[source.id]={offset,cursor:result.next,done:!result.next&&(offset>=result.total||result.items.length<count)};
      }
      return {items,total:Number.NaN,next:Object.values(next).some(value=>!value.done)?JSON.stringify(next):undefined,warnings:failures.map(row=>row.error!)};
    },
    getComic:async()=>{throw new Error('Choisissez la source de cette œuvre.');},
    getChapters:async()=>[],getPages:async()=>[],
  };
}
