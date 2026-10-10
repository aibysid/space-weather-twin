import {z} from 'zod';
import {BASE,feeds,metrics,type FeedId,type Metric} from './registry';
import {normalizeUtc,normalizeLon} from './science';
export const ADAPTER='noaa-v1';
export type Transport='direct'|'snapshot'|'bundled';
export interface Sample {id:string;feedId:string;time:number;timeUtc:string;retrievedAtUtc:string;observedAtUtc:string|null;validAtUtc:string|null;spacecraft:string|null;sourceUrl:string;metric:Metric;value:number|null;unit:string;coordinateFrame:'GSM'|null;evidenceType:'observation'|'forecast';quality:'eligible'|'rejected'|'unspecified';qualityReasons:string[];rawFlags:Record<string,unknown>;timeBasis:'L1'|'nearEarth'|'bowShockShifted';adapterVersion:string;transport:Transport;status?:string}
export interface Envelope {schemaVersion:number;feedId:string;retrievedAtUtc:string;providerIssuedAtUtc:string|null;transport:Transport;adapterVersion:string;recordCount:number;rejectionCount:number;sourceUrl:string}
export interface Aurora {grid:Map<string,number>;coordinates:number[][];observation:number;forecast:number;format:string}
export interface Normalized {envelope:Envelope;samples:Sample[];aurora?:Aurora;scales?:{time:number;G:number|null;R:number|null;S:number|null}}
const object=z.record(z.string(),z.unknown());
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function adapt(feedId:FeedId,raw:unknown,retrievedAtUtc=new Date().toISOString(),transport:Transport='direct'):Normalized{
 const envelope:Envelope={schemaVersion:1,feedId,retrievedAtUtc,providerIssuedAtUtc:null,transport,adapterVersion:ADAPTER,recordCount:0,rejectionCount:0,sourceUrl:BASE+feeds[feedId].path};
 const result:Normalized={envelope,samples:[]};
 if(feedId==='scales'){
  const d=object.parse(raw),r=object.parse(d['0']),time=normalizeUtc(`${r.DateStamp}T${r.TimeStamp}Z`);if(time===null)throw new Error('schema');
  const scale=(key:string)=>{const x=object.parse(r[key]).Scale;if(x===null)return null;const n=typeof x==='string'&&/^[0-5]$/.test(x)?Number(x):num(x);return n!==null&&n>=0&&n<=5?n:null};
  result.scales={time,G:scale('G'),R:scale('R'),S:scale('S')};envelope.recordCount=1;return result;
 }
 if(feedId==='aurora'){
  const d=object.parse(raw),observation=normalizeUtc(d['Observation Time']),forecast=normalizeUtc(d['Forecast Time']);
  const cells=z.array(z.tuple([z.number().finite(),z.number().finite(),z.number().finite()])).max(100000).parse(d.coordinates);
  if(observation===null||forecast===null)throw new Error('schema');
  const grid=new Map<string,number>();const conflict=new Set<string>();
  for(const [lon,lat,v] of cells){if(lon<0||lon>360||lat< -90||lat>90||v<0||v>100){envelope.rejectionCount++;continue}const key=`${normalizeLon(lon)},${lat}`;if(grid.has(key)&&grid.get(key)!==v){conflict.add(key);envelope.rejectionCount++}else grid.set(key,v)}
  for(const k of conflict)grid.delete(k);
  result.aurora={grid,coordinates:[...grid].map(([k,v])=>[...k.split(',').map(Number),v]),observation,forecast,format:String(d['Data Format'])};envelope.recordCount=grid.size;return result;
 }
 const rows=z.array(z.unknown()).max(100000).parse(raw);
 const activeAt=new Map<number,Set<string>>();
 if(feedId==='wind'||feedId==='mag')for(const row of rows){const r=object.safeParse(row);if(!r.success)continue;const d=r.data,t=normalizeUtc(d.time_tag);if(d.active===true&&t!==null){const set=activeAt.get(t)||new Set<string>();set.add(String(d.source));activeAt.set(t,set)}}
 const specs:Partial<Record<FeedId,[Metric,string][]>>={wind:[['speed','proton_speed'],['density','proton_density'],['temperature','proton_temperature']],mag:[['bt','bt'],['bz','bz_gsm']],xray:[['xray','flux']],proton:[['proton','flux']],kp:[['kp','Kp']],forecast:[['kp','kp']]};
 for(const row of rows){
  const parsed=object.safeParse(row);if(!parsed.success){envelope.rejectionCount++;continue}const d=parsed.data;
  if(feedId==='xray'&&d.energy!=='0.1-0.8nm'||feedId==='proton'&&d.energy!=='>=10 MeV')continue;
  const time=normalizeUtc(d.time_tag);if(time===null){envelope.rejectionCount++;continue}
  const status=feedId==='forecast'?String(d.observed):'observed';const forecast=status==='predicted'||status==='estimated';
  for(const [metric,field] of specs[feedId]||[]){const reasons:string[]=[];const value=num(d[field]);
   if(value===null)reasons.push('missing or non-finite');
   if(value!==null&&(metric==='speed'&&value<=0||['density','temperature','bt'].includes(metric)&&value<0||metric==='kp'&&(value<0||value>9)||['xray','proton'].includes(metric)&&value<=0))reasons.push('invalid value');
   if(feedId==='wind'||feedId==='mag'){if(d.active!==true)reasons.push('inactive or unspecified source');if(d.overall_quality!==0)reasons.push('quality not eligible');if((activeAt.get(time)?.size||0)>1)reasons.push('ambiguous active sources');if(typeof d.source!=='string')reasons.push('missing source')}
   if(feedId==='xray'&&(d.electron_contaminaton===true||d.electron_contamination===true))reasons.push('electron contamination');
   if(feedId==='forecast'&&!['observed','estimated','predicted'].includes(status))reasons.push('unknown provider status');
   if(!forecast&&time>Date.parse(retrievedAtUtc)+300000)reasons.push('future observation');
   const quality=reasons.length?'rejected':feedId==='xray'&&d.electron_contaminaton===undefined&&d.electron_contamination===undefined||feedId==='proton'?'unspecified':'eligible';
   const spacecraft=typeof d.source==='string'?d.source:d.satellite!=null?`GOES ${d.satellite}`:null;
   result.samples.push({id:`${feedId}:${time}:${spacecraft}:${metric}:${status}`,feedId,time,timeUtc:new Date(time).toISOString(),retrievedAtUtc,observedAtUtc:forecast?null:new Date(time).toISOString(),validAtUtc:forecast?new Date(time).toISOString():null,spacecraft,sourceUrl:envelope.sourceUrl,metric,value,unit:metrics[metric][1],coordinateFrame:metric==='bz'?'GSM':null,evidenceType:forecast?'forecast':'observation',quality,qualityReasons:reasons,rawFlags:d,timeBasis:feedId==='wind'||feedId==='mag'?'L1':'nearEarth',adapterVersion:ADAPTER,transport,status});
  }
 }
 const unique=new Map<string,Sample>();for(const s of result.samples){const prior=unique.get(s.id);if(prior&&prior.value!==s.value){prior.quality='rejected';prior.qualityReasons.push('duplicate-conflict')}else if(!prior)unique.set(s.id,s)}
 result.samples=[...unique.values()].sort((a,b)=>a.time-b.time);envelope.recordCount=result.samples.length;envelope.rejectionCount+=result.samples.filter(s=>s.quality==='rejected').length;return result;
}
export function series(n:Normalized|undefined,metric:Metric){return n?.samples.filter(s=>s.metric===metric)||[]}
export function eligible(a:Sample[]){return a.filter(s=>s.quality!=='rejected'&&s.value!==null)}
