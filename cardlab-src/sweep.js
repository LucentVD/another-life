const E = require('./engine.js');
const configs = JSON.parse(process.argv[2]);
for(const cf of configs){
  Object.assign(E.TUNE, cf);
  const res = {}; let rounds=0;
  for(const s of ['stats','smart','random']){ const r=[]; for(const L of [1,2,3,4,6,7,8,9,11,12]){ const x=E.simulate(s,L,L,120,500+L); r.push(x.win); if(s==='smart') rounds+=x.rounds; } res[s]=r; }
  const fmt = a=>a.map(x=>String(Math.round(x*100)).padStart(3)).join('');
  console.log(JSON.stringify(cf), 'rounds', (rounds/10).toFixed(1));
  for(const s in res) console.log('  '+s.padEnd(7)+fmt(res[s])+'  mean '+Math.round(res[s].reduce((a,b)=>a+b)/res[s].length*100));
  const b5 = E.simulate('smart',5,5,150,9).win, b10 = E.simulate('smart',10,10,150,9).win; console.log('  boss T5 smart', Math.round(b5*100), 'T10', Math.round(b10*100));
}
