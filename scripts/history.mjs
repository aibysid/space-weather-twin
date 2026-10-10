import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../public/history/',import.meta.url);await mkdir(root,{recursive:true});
const dataset='OMNI2_H0_MRG1HR',base='https://cdaweb.gsfc.nasa.gov/hapi/';
const windows=[['may2024','May 2024 storm observations','2024-05-09T00:00:00Z','2024-05-14T00:00:00Z'],['halloween2003','October 2003 storm observations','2003-10-28T00:00:00Z','2003-11-02T00:00:00Z'],['quiet2024','Early May 2024 comparison window','2024-05-01T00:00:00Z','2024-05-03T00:00:00Z']];
const sha=s=>createHash('sha256').update(s).digest('hex');
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${r.status} ${url}`);const text=await r.text();return {text,json:JSON.parse(text)}}
const infoUrl=base+'info?id='+dataset;const info=await get(infoUrl);await writeFile(new URL('metadata.json',root),info.text);
for(const [id,label,start,end] of windows){const params=new URLSearchParams({id:dataset,parameters:'BZ_GSM1800,N1800,V1800,KP1800','time.min':start,'time.max':end,format:'json'});const url=base+'data?'+params;let response;
 try{response=await get(url)}catch(e){console.error(e.message);throw e}
 if(response.json.status?.code!==1200||!response.json.data?.length)throw Error('NASA returned no valid records');
 await writeFile(new URL(id+'.raw.json',root),response.text);
 const parameters=response.json.parameters;const index=name=>parameters.findIndex(p=>p.name===name);const mapping={bz:'BZ_GSM1800',density:'N1800',speed:'V1800',kp:'KP1800'};
 let rejected=0;const records=response.json.data.map(row=>{const record={time:Date.parse(row[0]),timeUtc:row[0]};for(const [key,name] of Object.entries(mapping)){const i=index(name),v=row[i],fill=parameters[i]?.fill;if(i<0)throw Error('missing parameter '+name);record[key]=v===null||!Number.isFinite(v)||String(v)===String(fill)?null:key==='kp'?v/10:v;if(record[key]===null)rejected++}return record}).filter(r=>r.time>=Date.parse(start)&&r.time<Date.parse(end));
 const normalized=JSON.stringify(records);const retrievedAtUtc=new Date().toISOString();const manifest={schemaVersion:1,version:'1.0.0',id,label,dataset,queryUrl:url,metadataUrl:infoUrl,retrievedAtUtc,window:{start,end},cadenceSeconds:3600,timeBasis:'bowShockShifted',timestampConvention:'Hourly midpoint; original NASA tags retained',sourceDOI:info.json.resourceURL||'https://doi.org/10.48322/1shr-ht18',units:{speed:'km/s',density:'cm⁻³',bz:'nT',kp:'index'},transforms:['Metadata fill → null','KP1800 / 10 after fill removal'],rawSHA256:sha(response.text),normalizedSHA256:sha(normalized),sampleCount:records.length,rejectionCount:rejected,missingIntervals:records.filter(r=>Object.keys(mapping).some(k=>r[k]===null)).map(r=>r.timeUtc),parameters};
 await writeFile(new URL(id+'.json',root),JSON.stringify({manifest,records}));console.log(id,records.length,manifest.rawSHA256);
}
