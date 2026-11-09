const E = require('./engine.js');
const N = +process.argv[2] || 200;
const strats = Object.keys(E.STRATS);
console.log('level=tier  ' + strats.map(s=>s.padStart(10)).join(''));
for(let L=1; L<=12; L++){
  const row = strats.map(s=>{ const r = E.simulate(s, L, L, N, 1000+L); return (Math.round(r.win*100)+'%').padStart(10); });
  console.log(('L'+L+' T'+L).padEnd(12) + row.join(''));
}
console.log('\nlevel vs tier+2 (harder)');
for(const L of [3,6,9]){ console.log(('L'+L+' T'+(L+2)).padEnd(12) + strats.map(s=>(Math.round(E.simulate(s,L,L+2,N,77+L).win*100)+'%').padStart(10)).join('')); }
console.log('\nrounds per fight at L=T=6:', E.simulate('smart',6,6,N,5).rounds.toFixed(1));
