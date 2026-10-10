import {Observer,Equator,Horizon,Body,SiderealTime} from 'astronomy-engine';
export function solarPosition(lat:number,lon:number,time:number){const d=new Date(time),o=new Observer(lat,lon,0),e=Equator(Body.Sun,d,o,true,true);return Horizon(d,o,e.ra,e.dec).altitude}
export function solarDirection(time:number){const d=new Date(time),e=Equator(Body.Sun,d,new Observer(0,0,0),true,true),lat=e.dec*Math.PI/180,lon=(e.ra-SiderealTime(d))*Math.PI/12;return {x:Math.cos(lat)*Math.sin(lon),y:Math.sin(lat),z:Math.cos(lat)*Math.cos(lon)}}
