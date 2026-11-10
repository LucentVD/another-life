const E = require('./engine.js');
for(const cf of JSON.parse(process.argv[2])){
  Object.assign(E.TUNE, cf); const out = {};
  for(const s of ['smart','stats','spells','random']){ const r=[]; for(const L of [1,2,3,4,6,7,8,9,11,12]) r.push(E.simulate(s,L,L,120,500+L).win); out[s]=r; }
  console.log(JSON.stringify(cf));
  for(const s in out) console.log('  '+s.padEnd(7)+out[s].map(x=>String(Math.round(x*100)).padStart(4)).join('')+'  mean '+Math.round(out[s].reduce((a,b)=>a+b)/out[s].length*100));
  console.log('  boss T5', Math.round(E.simulate('smart',5,5,150,9).win*100), 'T10', Math.round(E.simulate('smart',10,10,150,9).win*100), ' rounds', E.simulate('smart',8,8,100,3).rounds.toFixed(1));
}
