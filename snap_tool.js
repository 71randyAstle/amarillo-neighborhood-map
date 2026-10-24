(async()=>{
const CITY = await (await fetch('city_in.json?cb='+Date.now())).json();
const KX = 111320*Math.cos(35.2*Math.PI/180), KY = 110950;
const toM = ([lon,lat]) => [lon*KX, lat*KY];
const segs = []; // {a:[x,y], b:[x,y], art:bool}
for (const r of Object.values(window._roads)) {
  if (r.c.endsWith('link')) continue;
  const art = r.c !== 'minor';
  const pts = r.g.map(toM);
  for (let i=0;i<pts.length-1;i++) segs.push({a:pts[i], b:pts[i+1], art});
}
const CELL = 300; const G = {};
const ck = (x,y)=>Math.floor(x/CELL)+'_'+Math.floor(y/CELL);
for (const s of segs) { const x0=Math.min(s.a[0],s.b[0]), x1=Math.max(s.a[0],s.b[0]), y0=Math.min(s.a[1],s.b[1]), y1=Math.max(s.a[1],s.b[1]);
  for (let cx=Math.floor(x0/CELL); cx<=Math.floor(x1/CELL); cx++) for (let cy=Math.floor(y0/CELL); cy<=Math.floor(y1/CELL); cy++) (G[cx+'_'+cy]=G[cx+'_'+cy]||[]).push(s); }
function proj(p,s){ const bx=s.b[0]-s.a[0], by=s.b[1]-s.a[1]; const L=bx*bx+by*by; let t=L?((p[0]-s.a[0])*bx+(p[1]-s.a[1])*by)/L:0; t=Math.max(0,Math.min(1,t)); const q=[s.a[0]+t*bx, s.a[1]+t*by]; return {q, d:Math.hypot(p[0]-q[0],p[1]-q[1]), t}; }
function near(p, R){ const out=[]; const cx=Math.floor(p[0]/CELL), cy=Math.floor(p[1]/CELL); const n=Math.ceil(R/CELL);
  for (let i=-n;i<=n;i++) for (let j=-n;j<=n;j++){ const c=G[(cx+i)+'_'+(cy+j)]; if(!c) continue; for (const s of c){ const pr=proj(p,s); if (pr.d<=R) out.push({s, ...pr}); } }
  return out.sort((u,v)=>u.d-v.d); }
function ang(s){ return Math.atan2(s.b[1]-s.a[1], s.b[0]-s.a[0]); }
function angdiff(a,b){ let d=Math.abs(a-b)%Math.PI; return Math.min(d, Math.PI-d); }
function lineX(s1,s2){ const x1=s1.a[0],y1=s1.a[1],x2=s1.b[0],y2=s1.b[1],x3=s2.a[0],y3=s2.a[1],x4=s2.b[0],y4=s2.b[1];
  const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4); if (Math.abs(den)<1e-9) return null; const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den; return [x1+t*(x2-x1), y1+t*(y2-y1)]; }
// unique vertices
const V = {}; for (const [name, rings] of CITY) for (const ring of rings) for (const c of ring) { const k=c[0]+','+c[1]; if(!V[k]) V[k]={lon:c[0]/1e5-102, lat:c[1]/1e5+35}; }
const keys = Object.keys(V);
// step1: candidate displacement
function best(p, Rart, Rmin){ const cands = near(p, Math.max(Rart,Rmin)); let b=null; for (const c of cands){ if (c.s.art && c.d<=Rart){ const sc=c.d-40; if(!b||sc<b.sc) b={...c,sc}; } else if (!c.s.art && c.d<=Rmin){ const sc=c.d; if(!b||sc<b.sc) b={...c,sc}; } } return b; }
for (const k of keys){ const v=V[k]; v.m=toM([v.lon,v.lat]); const b=best(v.m,130,60); if (b) v.d=[b.q[0]-v.m[0], b.q[1]-v.m[1]]; }
// step2: smooth field
const withD = keys.filter(k=>V[k].d);
let stats={n:keys.length, withD:withD.length};
for (const k of keys){ const v=V[k]; let sx=0,sy=0,sw=0; for (const u of withD){ const w=V[u]; const dist=Math.hypot(v.m[0]-w.m[0], v.m[1]-w.m[1]); const wt=Math.exp(-(dist*dist)/(2*350*350)); sx+=wt*w.d[0]; sy+=wt*w.d[1]; sw+=wt; } v.m1 = sw>1e-6 ? [v.m[0]+sx/sw, v.m[1]+sy/sw] : v.m.slice(); }
// step3: snap
let snapped={inter:0, art:0, minor:0, none:0}; const resid=[];
for (const k of keys){ const v=V[k]; const p=v.m1; const cands=near(p,70); let out=null;
  const arts=cands.filter(c=>c.s.art&&c.d<=70); const mins=cands.filter(c=>!c.s.art&&c.d<=40);
  const pool=[...arts, ...mins];
  if (pool.length){ const first=pool[0]; const a1=ang(first.s);
    const second=pool.find(c=>angdiff(ang(c.s),a1)>Math.PI/6);
    if (second){ const X=lineX(first.s, second.s); if (X && Math.hypot(X[0]-p[0],X[1]-p[1])<=80 && proj(X,first.s).d<30 && proj(X,second.s).d<30){ out=X; snapped.inter++; } }
    if (!out){ out=first.q; if(first.s.art) snapped.art++; else snapped.minor++; } }
  if (!out){ out=p; snapped.none++; }
  resid.push(Math.hypot(out[0]-v.m[0], out[1]-v.m[1]));
  v.out=[out[0]/KX, out[1]/KY];
}
resid.sort((a,b)=>a-b); stats.snapped=snapped; stats.medianMove=resid[Math.floor(resid.length/2)].toFixed(1); stats.p90Move=resid[Math.floor(resid.length*0.9)].toFixed(1); stats.maxMove=resid[resid.length-1].toFixed(1);
const RES = CITY.map(([name,rings])=>[name, rings.map(r=>r.map(c=>{const v=V[c[0]+','+c[1]]; return [Math.round((v.out[0]+102)*1e5), Math.round((v.out[1]-35)*1e5)];}))]);
window._snapOut = JSON.stringify(RES);
return stats; })()
