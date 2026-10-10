import {adapt,type Normalized} from './adapters';
import {BASE,feeds,type FeedId} from './registry';
export interface FeedState {data?:Normalized;state:'idle'|'loading'|'ready'|'empty'|'error-with-cache'|'unavailable';error?:string;lastAttempt?:number;lastSuccess?:number;next:number;failures:number}
export async function boundedJson(response:Response){if(!response.ok)throw new Error(`HTTP ${response.status}`);const reader=response.body?.getReader();if(!reader)throw new Error('empty');const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>15000000){await reader.cancel();throw new Error('size limit')}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Error('malformed JSON')}}
export class FetchCoordinator {
 states=Object.fromEntries(Object.keys(feeds).map(id=>[id,{state:'idle',next:Date.now()+Math.random()*5000,failures:0}])) as Record<FeedId,FeedState>;
 controllers=new Map<FeedId,AbortController>();listeners=new Set<()=>void>();enabled=true;manualAt=0;timer?:ReturnType<typeof setInterval>;
 emit(){for(const f of this.listeners)f()}
 start(){this.timer=setInterval(()=>this.tick(),1000);this.tick()}
 stop(){clearInterval(this.timer);for(const c of this.controllers.values())c.abort();this.controllers.clear()}
 tick(force=false){if(!this.enabled||document.hidden)return;for(const id of Object.keys(feeds) as FeedId[])if((force||this.states[id].next<=Date.now())&&!this.controllers.has(id))void this.fetch(id)}
 manual(){if(Date.now()-this.manualAt<30000)return false;this.manualAt=Date.now();this.tick(true);return true}
 async fetch(id:FeedId){const old=this.states[id],controller=new AbortController();this.controllers.set(id,controller);const timeout=setTimeout(()=>controller.abort(),12000);this.states[id]={...old,state:old.data?old.state:'loading',lastAttempt:Date.now()};this.emit();
  try{let data:Normalized;let directError='';let retryAfter=0;
   try{const r=await fetch(BASE+feeds[id].path,{signal:controller.signal,credentials:'omit',cache:'no-cache'});if(r.status===429){const h=r.headers.get('Retry-After');retryAfter=h?(/^\d+$/.test(h)?Number(h)*1000:Math.max(0,Date.parse(h)-Date.now())):60000}const raw=await boundedJson(r);data=adapt(id,raw);if(!data.envelope.recordCount||data.samples.length&&data.samples.every(s=>s.quality==='rejected'))throw new Error('empty or all rejected')}
   catch(e){if(!this.enabled)throw e;directError=e instanceof Error?e.message:'network / CORS suspected';const r=await fetch(`${import.meta.env.BASE_URL}snapshots/${id}.json`,{signal:AbortSignal.timeout(12000)});const snapshot=await boundedJson(r);data=adapt(id,snapshot.raw,snapshot.retrievedAtUtc,'snapshot')}
   const now=Date.now();this.states[id]={data,state:data.envelope.recordCount?'ready':'empty',lastAttempt:now,lastSuccess:now,next:now+(directError?Math.max(60000,retryAfter):feeds[id].interval),failures:directError?old.failures+1:0,error:directError||undefined};
  }catch(e){const delay=[60000,120000,300000,900000][Math.min(old.failures,3)];this.states[id]={...old,state:old.data?'error-with-cache':'unavailable',lastAttempt:Date.now(),next:Date.now()+delay+Math.random()*5000,failures:old.failures+1,error:e instanceof Error?e.message:'network / CORS suspected'}}
  finally{clearTimeout(timeout);this.controllers.delete(id);this.emit()}
 }
}
export const coordinator=new FetchCoordinator();
