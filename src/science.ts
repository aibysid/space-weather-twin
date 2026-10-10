export const methods={pressure:'pressure-proton-v1',proxy:'southward-proxy-v1',transport:'fixed-l1-transport-v1',cme:'cme-constant-speed-v1',compression:'illustrative-compression-v1',aurora:'aurora-nearest-cell-v1'};
export const baseline=Object.freeze({speed:400,density:5,bz:-5,cme:1000});
export function calculatePressure(n:number,v:number){return Number.isFinite(n)&&n>=0&&Number.isFinite(v)&&v>0?1.6726e-6*n*v*v:null}
export function calculateSouthwardProxy(v:number,bz:number){return Number.isFinite(v)&&v>0&&Number.isFinite(bz)?1e-3*v*Math.max(0,-bz):null}
export function calculateTransport(v:number,basis='L1'){return basis==='L1'&&Number.isFinite(v)&&v>0?1500000/v:null}
export function calculateCmeScenario(v:number,launch:number){return Number.isFinite(v)&&v>=200&&v<=3000&&Number.isFinite(launch)&&new Date(launch).getUTCFullYear()>=1900&&new Date(launch).getUTCFullYear()<=2100?{duration:149597870.7/v,arrival:launch+149597870.7/v*1000}:null}
export function compression(p:number){return Math.max(.65,Math.min(1.35,Math.pow(p/1.33808,-1/6)))}
export function normalizeUtc(value:unknown):number|null{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(value))return null;const s=value.replace(' ','T');const t=Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(s)?s:s+'Z');if(!Number.isFinite(t))return null;const normalized=new Date(t).toISOString();if(!/(Z|[+-])/.test(s.slice(19))&&normalized.slice(0,19)!==s.slice(0,19))return null;return t}
export const utc=(t:number|null|undefined)=>t==null?'Unavailable':new Date(t).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');
export function nearestPastSample<T extends {time:number}>(a:T[],time:number,maxAge:number){let lo=0,hi=a.length-1,best=-1;while(lo<=hi){const m=(lo+hi)>>1;if(a[m].time<=time){best=m;lo=m+1}else hi=m-1}return best>=0&&time-a[best].time<=maxAge?a[best]:null}
export function replayClock(cursor:number,elapsed:number,speed:number,end:number){return Math.min(end,cursor+Math.max(0,elapsed)*speed)}
export const normalizeLon=(lon:number)=>((lon+180)%360+360)%360-180;
export function angularDistance(lat:number,lon:number,a:number,b:number){const r=Math.PI/180;const x=Math.sin((lat-a)*r/2)**2+Math.cos(lat*r)*Math.cos(a*r)*Math.sin((lon-b)*r/2)**2;return 2*Math.asin(Math.sqrt(Math.min(1,x)))/r}
export function auroraGridLookup(grid:Map<string,number>,lat:number,lon:number){let best:{lat:number;lon:number;value:number;distance:number}|null=null;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const a=Math.round(lat)+dy,b=normalizeLon(Math.round(lon)+dx),v=grid.get(`${b},${a}`);if(v===undefined)continue;const distance=angularDistance(lat,lon,a,b);if(distance<=1.5&&(!best||distance<best.distance))best={lat:a,lon:b,value:v,distance}}return best}
export function matchMagnetic<T extends {time:number;value:number|null;quality:string;metric:string}>(records:T[],plasmaTime:number,cursor:number){return records.filter(s=>s.metric==='bz'&&s.quality!=='rejected'&&s.value!==null&&s.time<=cursor&&Math.abs(s.time-plasmaTime)<=90000).sort((a,b)=>Math.abs(a.time-plasmaTime)-Math.abs(b.time-plasmaTime)||a.time-b.time)[0]||null}

