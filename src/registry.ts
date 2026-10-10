export const BASE='https://services.swpc.noaa.gov';
export const feeds={
 wind:{path:'/json/rtsw/rtsw_wind_1m.json',interval:60000,age:600000,name:'Solar-wind plasma'},
 mag:{path:'/json/rtsw/rtsw_mag_1m.json',interval:60000,age:600000,name:'GSM magnetic field'},
 scales:{path:'/products/noaa-scales.json',interval:300000,age:1800000,name:'Current NOAA scales'},
 kp:{path:'/products/noaa-planetary-k-index.json',interval:300000,age:14400000,name:'Observed Kp'},
 forecast:{path:'/products/noaa-planetary-k-index-forecast.json',interval:900000,age:21600000,name:'Kp forecast'},
 xray:{path:'/json/goes/primary/xrays-1-day.json',interval:60000,age:600000,name:'GOES long-channel X-rays'},
 proton:{path:'/json/goes/primary/integral-protons-1-day.json',interval:300000,age:1200000,name:'GOES ≥10 MeV protons'},
 aurora:{path:'/json/ovation_aurora_latest.json',interval:300000,age:1200000,name:'OVATION aurora forecast'}
} as const;
export type FeedId=keyof typeof feeds;
export const metrics={speed:['Speed','km/s'],density:['Density','cm⁻³'],temperature:['Temperature','K'],bt:['Bt','nT'],bz:['GSM Bz','nT'],xray:['X-ray flux','W/m²'],proton:['Proton flux','pfu'],kp:['Kp','index']} as const;
export type Metric=keyof typeof metrics;
export const definitions:Record<Metric,string>={speed:'Solar-wind proton bulk speed.',density:'Proton number density.',temperature:'Proton temperature.',bt:'Total interplanetary magnetic-field magnitude.',bz:'North–south component in the geocentric solar magnetospheric frame. Southward is negative.',xray:'GOES long-channel irradiance, 0.1–0.8 nm. A flux reading is not a detected flare event.',proton:'Integral flux above ≥10 MeV. One pfu is one proton per cm² per second per steradian.',kp:'Planetary geomagnetic activity index from 0 to 9 for a three-hour interval; not a local detector.'};
export const cities=[['New Delhi',28.6139,77.2090],['Bengaluru',12.9716,77.5946],['London',51.5074,-0.1278],['Tromsø',69.6492,18.9553],['Reykjavík',64.1466,-21.9426],['Tokyo',35.6762,139.6503],['New York',40.7128,-74.0060],['Fairbanks',64.8378,-147.7164],['Wellington',-41.2865,174.7762],['Hobart',-42.8821,147.3272]] as const;
