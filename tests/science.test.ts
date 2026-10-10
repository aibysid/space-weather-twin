import {describe,it,expect} from 'vitest';
import {calculatePressure,calculateSouthwardProxy,calculateTransport,calculateCmeScenario,normalizeUtc,nearestPastSample,auroraGridLookup,replayClock} from '../src/science';
import {solarPosition} from '../src/solar';
import {adapt} from '../src/adapters';
import {shareState} from '../src/share';
import {exportSerializers} from '../src/exports';
const retrieved='2026-10-10T14:00:00Z';
const wind=(extra={})=>({time_tag:'2026-10-10T13:59:00',source:'ACE',active:true,overall_quality:0,proton_speed:400,proton_density:5,proton_temperature:100000,...extra});
describe('Known-answer science A05–A08',()=>{
 it('uses proton ram pressure and correct conversions',()=>{expect(calculatePressure(5,400)).toBeCloseTo(1.33808,8);expect(calculatePressure(5,800)).toBeCloseTo(5.35232,8);expect(calculatePressure(-1,400)).toBeNull()});
 it('has a southward-only proxy',()=>{expect(calculateSouthwardProxy(400,-5)).toBe(2);expect(calculateSouthwardProxy(400,5)).toBe(0)});
 it('disables L1 transport for bow-shock shifted history',()=>{expect(calculateTransport(400)).toBe(3750);expect(calculateTransport(400,'bowShockShifted')).toBeNull()});
 it('calculates hypothetical one-AU duration',()=>{expect(calculateCmeScenario(1000,Date.UTC(2024,0,1))!.duration).toBeCloseTo(149597.8707,4);expect(calculateCmeScenario(0,Date.now())).toBeNull()});
 it('selects past only and respects gaps',()=>{const a=[{time:100},{time:200}];expect(nearestPastSample(a,150,100)?.time).toBe(100);expect(nearestPastSample(a,90,100)).toBeNull();expect(nearestPastSample(a,301,100)).toBeNull()});
 it('uses monotonic elapsed and clamps playback',()=>{expect(replayClock(0,1000,600,500000)).toBe(500000);expect(replayClock(1,-1,600,100)).toBe(1)});
});
describe('NOAA adapters A02–A04 A09–A11',()=>{
 it('requires strict active source and quality zero',()=>{for(const extra of [{active:false},{active:'true'},{overall_quality:null},{overall_quality:1}])expect(adapt('wind',[wind(extra)],retrieved).samples.every(s=>s.quality==='rejected')).toBe(true)});
 it('accepts source switches but rejects concurrent ambiguity',()=>{const a=adapt('wind',[wind(),wind({time_tag:'2026-10-10T13:58:00',source:'DSCOVR'})],retrieved);expect(a.samples.filter(s=>s.metric==='speed').map(s=>s.spacecraft)).toEqual(['DSCOVR','ACE']);expect(adapt('wind',[wind(),wind({source:'DSCOVR'})],retrieved).samples.every(s=>s.quality==='rejected')).toBe(true)});
 it('does not substitute GSE for GSM',()=>{const a=adapt('mag',[{...wind(),bt:5,bz_gse:-5}],retrieved);expect(a.samples.find(s=>s.metric==='bz')?.quality).toBe('rejected')});
 it('selects long X-ray band and handles contamination spellings',()=>{const base={time_tag:'2026-10-10T13:59:00Z',satellite:18,energy:'0.1-0.8nm',flux:1e-5};expect(adapt('xray',[base,{...base,energy:'0.05-0.4nm'}],retrieved).samples).toHaveLength(1);for(const key of ['electron_contaminaton','electron_contamination'])expect(adapt('xray',[{...base,[key]:true}],retrieved).samples[0].quality).toBe('rejected')});
 it('selects >=10 MeV integral flux and rejects log zero',()=>{const r={time_tag:'2026-10-10T13:59:00Z',satellite:18,energy:'>=10 MeV',flux:0};const a=adapt('proton',[r,{...r,energy:'>=1 MeV'}],retrieved);expect(a.samples).toHaveLength(1);expect(a.samples[0].quality).toBe('rejected')});
 it('uses branch zero with null distinct from zero',()=>{const a=adapt('scales',{'0':{DateStamp:'2026-10-10',TimeStamp:'13:59:00',G:{Scale:'0'},R:{Scale:null},S:{Scale:'2'}},'1':{G:{Scale:'5'}}},retrieved);expect(a.scales).toMatchObject({G:0,R:null,S:2})});
 it('respects Kp casing and status allowlist',()=>{const rows=['observed','estimated','predicted','alien'].map((status,i)=>({time_tag:`2026-10-10T${String(12+i).padStart(2,'0')}:00:00`,kp:3,observed:status}));const a=adapt('forecast',rows,retrieved);expect(a.samples.map(s=>s.evidenceType)).toEqual(['observation','forecast','forecast','observation']);expect(a.samples.at(-1)?.quality).toBe('rejected');expect(adapt('kp',[{time_tag:'2026-10-10T12:00:00',kp:3}],retrieved).samples[0].quality).toBe('rejected')});
 it('marks conflicting duplicates and preserves missing',()=>{const a=adapt('wind',[wind(),wind({proton_speed:500})],retrieved);expect(a.samples.find(s=>s.metric==='speed')?.qualityReasons).toContain('duplicate-conflict');expect(adapt('wind',[wind({proton_density:null})],retrieved).samples.find(s=>s.metric==='density')?.value).toBeNull()});
 it('rejects malformed and excessive arrays',()=>{expect(()=>adapt('wind',{},retrieved)).toThrow();expect(()=>adapt('wind',Array(100001).fill({}),retrieved)).toThrow()});
});
describe('Aurora, UTC, solar geometry, sharing and exports',()=>{
 it('normalizes seam and rejects conflicting cells',()=>{const raw={'Observation Time':retrieved,'Forecast Time':retrieved,'Data Format':'[Longitude, Latitude, Aurora]',coordinates:[[180,60,10],[180,-60,30],[360,70,2],[0,70,3]]};const a=adapt('aurora',raw,retrieved).aurora!;expect(a.grid.get('-180,60')).toBe(10);expect(a.grid.has('0,70')).toBe(false);expect(auroraGridLookup(a.grid,-60,180)?.value).toBe(30);expect(auroraGridLookup(a.grid,0,0)).toBeNull()});
 it('handles poles and circular nearest distance',()=>{const g=new Map([['-180,90',5],['179,-90',6],['-180,60',9]]);expect(auroraGridLookup(g,60,180)?.value).toBe(9);expect(auroraGridLookup(g,90,180)?.value).toBe(5);expect(auroraGridLookup(g,-90,179)?.value).toBe(6)});
 it('parses zone-less NOAA as UTC and rejects impossible time',()=>{expect(normalizeUtc('2024-05-10T00:00:00')).toBe(Date.UTC(2024,4,10));expect(normalizeUtc('2024-02-30T00:00:00')).toBeNull();expect(normalizeUtc('2024-02-30T00:00:00Z')).toBeNull();expect(normalizeUtc('bogus')).toBeNull()});
 it('checks independent geometric expectations',()=>{expect(solarPosition(0,0,Date.UTC(2024,2,20,12))).toBeGreaterThan(87);expect(solarPosition(0,0,Date.UTC(2024,2,20,0))).toBeLessThan(-87);expect(solarPosition(0,180,Date.UTC(2024,2,20,12))).toBeLessThan(-87);expect(solarPosition(90,0,Date.UTC(2024,5,21,12))).toBeGreaterThan(23);expect(solarPosition(-90,0,Date.UTC(2024,5,21,12))).toBeLessThan(-23)});
 it('bounds hostile share inputs',()=>{const a=shareState('?v=99&lat=999&speed=Infinity&cme=-1&cursor=bad&url=https://evil.test');expect(a.errors.length).toBeGreaterThan(3);expect(a.lat).toBe(28.6139);expect(a.scenario.speed).toBe(400);expect((a as any).url).toBeUndefined()});
 it('escapes formula injection without rounding numeric values',()=>{const s=adapt('wind',[wind({source:'=CMD()'})],retrieved).samples;const csv=exportSerializers(s);expect(csv).toContain("\"'=CMD()\"");expect(csv).toContain(',400,');expect(csv).toContain('\r\n')});
});
it('matches active magnetic inputs within 90 seconds, tie earlier and no future cursor data',async()=>{const {matchMagnetic}=await import('../src/science');const rows=[{time:100000,value:-5,quality:'eligible',metric:'bz'},{time:120000,value:-6,quality:'eligible',metric:'bz'}];expect(matchMagnetic(rows,110000,120000)?.time).toBe(100000);expect(matchMagnetic(rows,110000,110000)?.time).toBe(100000);expect(matchMagnetic(rows,220001,230000)).toBeNull()});
