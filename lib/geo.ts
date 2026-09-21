export type Point={latitude:number;longitude:number};
const R=6371000,rad=(v:number)=>v*Math.PI/180;
export function distance(a:Point,b:Point){const p1=rad(a.latitude),p2=rad(b.latitude),dp=rad(b.latitude-a.latitude),dl=rad(b.longitude-a.longitude);const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
export function bearing(a:Point,b:Point){const p1=rad(a.latitude),p2=rad(b.latitude),dl=rad(b.longitude-a.longitude);const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(Math.atan2(y,x)*180/Math.PI+360)%360}
export const direction=(b:number)=>["N","NE","L","SE","S","SO","O","NO"][Math.round(b/45)%8];