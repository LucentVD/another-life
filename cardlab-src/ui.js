/* =========================================================
   CARD COMBAT LAB: interface
   ========================================================= */
const SAVE = 'cardlab.v1';
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s=>String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ROMAN = ['','I','II','III','IV','V','VI'];
const KIND_GLYPH = {kw:'◈', aura:'♛', trig:'⟳', mod:'⚗', spell:'✦'};
const KIND_NAME = {kw:'Keyword', aura:'Aura', trig:'Trigger', mod:'Modifier', spell:'Spell'};
const app = $('#app'), layer = $('#layer');

/* ---------- saved state ---------- */
const STARTER = {you:'sword', lina:'amulet', mal:'club'};
function fresh(){
  const party = ['you','lina','mal'].map(makeChar);
  for(const c of party) c.equip = [newItem(STARTER[c.key])];
  return {party, bag:[], xp:0, plvl:1, tier:1, sel:0, wins:0, losses:0, tab:'party'};
}
let ST;
try{ ST = JSON.parse(localStorage.getItem(SAVE)||'null'); }catch(e){ ST = null; }
if(!ST || !ST.party) ST = fresh();
ST.bag = ST.bag || []; for(const c of ST.party){ c.slots = c.slots || 1; c.equip = c.equip || []; }
const save = ()=>{ try{ localStorage.setItem(SAVE, JSON.stringify(ST)); }catch(e){} };
const xpNeed = ()=>XP_NEED(ST.plvl);
function gainXp(n){
  ST.xp += n; let ups = 0;
  while(ST.xp >= xpNeed()){ ST.xp -= xpNeed(); ST.plvl++; ups++; for(const ch of ST.party){ ch.lvl = ST.plvl; ch.pending++; } }
  save(); return ups;
}

/* ---------- art ---------- */
function portraitImg(art, kind){ const P = PORTRAITS_LAB[art]; if(!P) return ''; return kind==='head' ? `<img alt="" src="${P.head}" data-int="fit">` : `<img alt="" src="${P.src}" data-int="bust">`; }
/* whole device pixels per art pixel, so the pixel art stays crisp */
function fitInt(root){
  const dpr = window.devicePixelRatio||1;
  $$('img[data-int]', root||document).forEach(img=>{
    const go = ()=>{ const box = img.parentElement, W = box.clientWidth, H = box.clientHeight, pw = img.naturalWidth, ph = img.naturalHeight; if(!W||!H||!pw||!ph) return;
      const t = img.dataset.int==='bust' ? Math.min(W/pw, H/(ph*.6)) : Math.min(W/pw, H/ph);
      const m = Math.max(1, img.dataset.int==='bust' ? Math.floor(t*dpr+1e-6) : Math.round(t*dpr));
      img.style.width = pw*m/dpr+'px'; img.style.height = ph*m/dpr+'px'; };
    if(img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, {once:true});
  });
}

/* ---------- text for abilities ---------- */
function abLine(id, lvl, u, cls='', extra=''){
  const d = AB[id];
  const cd = d.kind==='spell' ? `<span class="cd">${u && ab(u,'bloodpact') ? '2 RES' : `CD ${Math.max(1, d.cd - (u?ab(u,'quick'):0))}`}</span>` : '';
  return `<div class="abl k-${d.kind} ${cls}"><span class="abg">${KIND_GLYPH[d.kind]}</span><div><b>${esc(d.name)}${d.max>1?` <i class="lv">${ROMAN[lvl]||lvl}</i>`:''}</b>${cd}<span class="abt">${esc(d.text(lvl, u))}</span>${extra}</div></div>`;
}

/* ---------- the big character card ---------- */
function bigCard(ch, hl){
  hl = hl || {};
  const e = effective(ch), lines = abilityLines(e);
  const fromItems = (id, lvl)=>{ const own = ab(ch,id); if(!e.src[id]) return ''; return `<span class="from">◆ ${own ? `+${lvl-own} ` : ''}${esc(e.src[id].join(', '))}</span>`; };
  const diff = (a,b)=>a!==b ? `<small class="itm">${a>b?'+':''}${a-b} items</small>` : '';
  return `<article class="ccard ${hl.flash?'flash':''}">
    <header class="cc-top"><span class="cc-name">${esc(ch.name)}</span><span class="cc-lv">Lv ${ch.lvl}</span></header>
    <div class="cc-art">${portraitImg(ch.art,'bust')}</div>
    <div class="cc-type">${esc(ch.title)} <span>· ${ch.absorbed.length} card${ch.absorbed.length===1?'':'s'} absorbed</span></div>
    <div class="cc-text">
      ${lines.length ? lines.map(l=>abLine(l.id, l.lvl, e, (hl.ab===l.id?'new ':'')+(ab(ch,l.id)?'':'itemonly'), fromItems(l.id, l.lvl))).join('') : '<div class="muted small">No abilities yet. Every pack is a chance to add one.</div>'}
      <div class="cc-trait">${esc(ch.trait)}</div>
    </div>
    <footer class="cc-stats">
      <span class="gem atk ${hl.atk?'pop':''}" title="Attack"><i>⚔</i><b>${e.atk}</b>${diff(e.atk,ch.atk)}${hl.atk?`<em class="${hl.atk>0?'up':'dn'}">${hl.atk>0?'+':''}${hl.atk}</em>`:''}</span>
      <span class="pips">${ch.absorbed.slice(-14).map(id=>`<i class="r-${CARD[id].rar}"></i>`).join('')}</span>
      <span class="gem res ${hl.res?'pop':''}" title="Resistance"><i>⛨</i><b>${e.res}</b>${diff(e.res,ch.res)}${hl.res?`<em class="${hl.res>0?'up':'dn'}">${hl.res>0?'+':''}${hl.res}</em>`:''}</span>
    </footer>
  </article>`;
}

/* ---------- a card from a pack ---------- */
function packCard(c, ch, i){
  const art = c.slots ? '▤' : c.ab ? KIND_GLYPH[AB[c.ab[0]].kind] : c.atk>=c.res ? '⚔' : '⛨';
  const stat = (n, g, k)=>n ? `<span class="pd ${n>0?'up':'dn'} ${k}">${n>0?'+':''}${n} ${g}</span>` : '';
  let abl = '';
  if(c.ab){ const [id,l] = c.ab, have = ab(ch,id), to = Math.min(AB[id].max, have+l), d = AB[id];
    abl = `<div class="pc-ab"><b>${esc(d.name)}${d.max>1?` ${ROMAN[to]}`:''}</b>${have?`<span class="stack">↑ stacks on yours</span>`:`<span class="kindtag">${KIND_NAME[d.kind]}${d.kind==='spell'?` · CD ${d.cd}`:''}</span>`}<span class="abt">${esc(d.text(to, ch))}</span></div>`; }
  return `<button class="pcard r-${c.rar}" data-i="${i}" style="--d:${i}">
    <span class="pc-back"><span>✦</span></span>
    <span class="pc-face">
      <span class="pc-rar">${RAR[c.rar].name}</span>
      <span class="pc-name">${esc(c.name)}</span>
      <span class="pc-art">${art}</span>
      <span class="pc-stats">${stat(c.atk,'⚔','a')}${stat(c.res,'⛨','r')}${c.slots?`<span class="pd slot">+${c.slots} item slot${c.slots>1?'s':''}</span>`:''}${!c.atk&&!c.res&&!c.slots?'<span class="pd zero">no stats</span>':''}</span>
      ${abl}
      ${c.flav?`<span class="pc-flav">${esc(c.flav)}</span>`:''}
    </span>
  </button>`;
}

/* ---------- an item card ---------- */
function itemCard(it, i, opts={}){
  const stat = (n, g, k)=>n ? `<span class="pd ${n>0?'up':'dn'} ${k}">${n>0?'+':''}${n} ${g}</span>` : '';
  return `<button class="pcard icard flip r-${it.rar} ${opts.cls||''}" data-i="${i}">
    <span class="pc-face">
      <span class="pc-rar">${RAR[it.rar].name} ${it.kind}</span>
      <span class="pc-name">${esc(it.name)}</span>
      <span class="pc-art">${ITEM_KIND[it.kind]}</span>
      <span class="pc-stats">${stat(it.atk,'⚔','a')}${stat(it.res,'⛨','r')}${!it.atk&&!it.res?'<span class="pd zero">no stats</span>':''}</span>
      ${it.abs.map(([id,l])=>`<div class="pc-ab"><b>${esc(AB[id].name)}${AB[id].max>1?` ${ROMAN[l]}`:''}</b><span class="abt">${esc(AB[id].text(l))}</span></div>`).join('')}
      ${it.flav?`<span class="pc-flav">${esc(it.flav)}</span>`:''}
    </span>
  </button>`;
}
/* one line for an item in a list */
function itemRow(inst, owner, act){
  const it = ITEM[inst.id];
  const st = [it.atk?`${it.atk>0?'+':''}${it.atk}⚔`:'', it.res?`${it.res>0?'+':''}${it.res}⛨`:''].filter(Boolean).join(' ');
  return `<button class="irow r-${it.rar}" data-uid="${inst.uid}"><span class="ik">${ITEM_KIND[it.kind]}</span><span class="ib"><b>${esc(it.name)}</b> <small>${st}</small><span class="iab">${it.abs.map(([id,l])=>`${esc(AB[id].name)}${AB[id].max>1?' '+ROMAN[l]:''}`).join(' · ')||'<i>stats only</i>'}</span></span><span class="iact">${owner?`<small>on ${esc(owner.name)}</small>`:''}${act||''}</span></button>`;
}
const ownerOf = uid=>ST.party.find(c=>c.equip.some(x=>x.uid===uid)) || null;
/* put an item into a slot; whatever was in that slot goes back where the new item came from */
function equipInto(ch, slot, uid){
  const from = ownerOf(uid);
  if(from===ch) return;
  const fromIdx = from ? from.equip.findIndex(x=>x.uid===uid) : -1;
  const inst = from ? from.equip[fromIdx] : ST.bag.find(x=>x.uid===uid);
  if(!inst) return;
  const old = ch.equip[slot] || null;
  if(from){ if(old) from.equip[fromIdx] = old; else from.equip.splice(fromIdx, 1); }
  else { ST.bag.splice(ST.bag.indexOf(inst), 1); if(old) ST.bag.push(old); }
  if(old) ch.equip[slot] = inst; else ch.equip.push(inst);
  save();
}
function itemSheet(ch, slot){
  const cur = ch.equip[slot];
  const bag = ST.bag, others = ST.party.filter(c=>c!==ch).flatMap(c=>c.equip.map(x=>({x, c})));
  layer.innerHTML = `<div class="ov" id="isheet"><div class="win sheet">
    <div class="sh-head"><b>${esc(ch.name)} · item slot ${slot+1}</b><button class="x" id="ix">✕</button></div>
    ${cur ? `<div class="cur">${itemCard(ITEM[cur.id], 0, {cls:'wide'})}</div><button class="btn ghost wide" id="unequip">Take it off (back to the bag)</button>` : '<p class="muted small">Empty. Choose something to put here.</p>'}
    <div class="eyebrow">In the bag (${bag.length})</div>
    <div class="ilist">${bag.length ? bag.map(x=>itemRow(x, null, `<b class="teal">${cur?'Swap':'Equip'}</b>`)).join('') : '<p class="muted small">Nothing spare. Win fights for loot.</p>'}</div>
    ${others.length ? `<div class="eyebrow">Carried by the others</div><div class="ilist">${others.map(({x,c})=>itemRow(x, c, `<b class="gold">${cur?'Swap':'Take'}</b>`)).join('')}</div>` : ''}
  </div></div>`;
  const close = ()=>{ layer.innerHTML=''; render(); };
  $('#ix').onclick = close; $('#isheet').onclick = e=>{ if(e.target.id==='isheet') close(); };
  const un = $('#unequip'); if(un) un.onclick = ()=>{ ST.bag.push(ch.equip.splice(slot,1)[0]); save(); close(); };
  $$('.irow', layer).forEach(b=>b.onclick = ()=>{ equipInto(ch, slot, b.dataset.uid); close(); });
}
function bagSheet(){
  layer.innerHTML = `<div class="ov" id="bsheet"><div class="win sheet">
    <div class="sh-head"><b>The bag · ${ST.bag.length} spare item${ST.bag.length===1?'':'s'}</b><button class="x" id="bx">✕</button></div>
    <p class="muted small">Items are swapped between fights. Tap an item, then who should carry it.</p>
    <div class="ilist">${ST.bag.length ? ST.bag.map(x=>itemRow(x, null, '')).join('') : '<p class="muted small">Empty.</p>'}</div>
    <div id="bgive"></div>
  </div></div>`;
  const close = ()=>{ layer.innerHTML=''; render(); };
  $('#bx').onclick = close; $('#bsheet').onclick = e=>{ if(e.target.id==='bsheet') close(); };
  $$('.irow', layer).forEach(b=>b.onclick = ()=>{
    $$('.irow', layer).forEach(x=>x.classList.toggle('sel', x===b));
    $('#bgive').innerHTML = `<div class="give">${ST.party.map((c,i)=>{ const free = c.equip.length < c.slots; return `<button class="btn ${free?'primary':'ghost'}" data-give="${i}">${esc(c.name)}<small>${free?'free slot':'swap slot 1'}</small></button>`; }).join('')}</div>`;
    $$('[data-give]', layer).forEach(g=>g.onclick = ()=>{ const c = ST.party[+g.dataset.give]; equipInto(c, c.equip.length < c.slots ? c.equip.length : 0, b.dataset.uid); close(); });
  });
}

/* =========================================================
   SCREENS
   ========================================================= */
function render(){
  if(ST.tab==='fight' && FIGHT) return renderCombat();
  const tabs = [['party','Party'],['fight','Fight'],['lab','Lab']];
  const pend = ST.party.reduce((n,c)=>n+c.pending,0);
  app.innerHTML = `<div class="screen">
    <div class="topbar win">
      <div class="tabs">${tabs.map(([k,v])=>`<button class="${ST.tab===k?'on':''}" data-tab="${k}">${v}${k==='party'&&pend?`<i class="badge">${pend}</i>`:''}</button>`).join('')}</div>
      <div class="plvl"><span>Party Lv ${ST.plvl}</span><div class="xpbar"><i style="width:${Math.round(ST.xp/xpNeed()*100)}%"></i></div><small>${ST.xp}/${xpNeed()} XP</small></div>
    </div>
    <div class="body" id="body"></div>
  </div>`;
  $$('[data-tab]').forEach(b=>b.onclick=()=>{ ST.tab = b.dataset.tab; save(); render(); });
  ({party:renderParty, fight:renderFightMenu, lab:renderLab})[ST.tab]();
}

/* ---------- party ---------- */
let SAND_OPEN = false;
function renderParty(){
  const ch = ST.party[ST.sel];
  $('#body').innerHTML = `
    <div class="chips">${ST.party.map((c,i)=>{ const e = effective(c); return `<button class="chip ${i===ST.sel?'on':''}" data-sel="${i}"><span class="chip-art">${portraitImg(c.art,'head')}</span><span>${esc(c.name)}<small>${e.atk}⚔ ${e.res}⛨</small></span>${c.pending?`<i class="badge">${c.pending}</i>`:''}</button>`; }).join('')}</div>
    <div class="cardwrap">${bigCard(ch)}</div>
    <div class="slots win">
      <div class="sl-head"><span class="eyebrow">Item slots ${ch.equip.length}/${ch.slots}</span><button class="bagbtn" id="bag">Bag <b>${ST.bag.length}</b></button></div>
      <div class="sl-row n${ch.slots}">${Array.from({length:ch.slots}, (_,i)=>{ const x = ch.equip[i]; if(!x) return `<button class="islot empty" data-slot="${i}"><span class="ik">＋</span><span class="in">Empty slot</span></button>`; const it = ITEM[x.id]; return `<button class="islot r-${it.rar}" data-slot="${i}"><span class="ik">${ITEM_KIND[it.kind]}</span><span class="in">${esc(it.name)}</span><span class="is">${[it.atk?`${it.atk>0?'+':''}${it.atk}⚔`:'', it.res?`${it.res>0?'+':''}${it.res}⛨`:''].filter(Boolean).join(' ')}${it.abs.length?` · ${it.abs.map(([id])=>esc(AB[id].name)).join(', ')}`:''}</span></button>`; }).join('')}</div>
    </div>
    <div class="row">
      ${ch.pending ? `<button class="btn primary wide glow" id="open">Open pack <small>${ch.pending} waiting</small></button>` : `<button class="btn ghost wide" id="gofight">No packs waiting · Fight to level up ▸</button>`}
    </div>
    <details class="sandbox" id="sandbox" ${SAND_OPEN?'open':''}><summary>Sandbox tools</summary>
      <div class="row2"><button class="btn ghost" id="lvlup">+1 party level</button><button class="btn ghost" id="lvl5">+5 levels</button></div>
      <div class="row2"><button class="btn ghost" id="autoall">Auto-pick all packs</button><button class="btn ghost danger" id="reset">Reset party</button></div>
      <div class="row2"><button class="btn ghost" id="additem">+ Random item</button><button class="btn ghost" id="autoeq">Auto-equip everyone</button></div>
      <p class="muted small">Levels grant every member a pack. Auto-pick uses the Balanced strategy from the Lab.</p>
    </details>`;
  fitInt($('#body'));
  $('#sandbox').ontoggle = e=>{ SAND_OPEN = e.target.open; };
  $$('[data-sel]').forEach(b=>b.onclick=()=>{ ST.sel = +b.dataset.sel; save(); renderParty(); });
  const o = $('#open'); if(o) o.onclick=()=>openPackFlow(ch);
  const g = $('#gofight'); if(g) g.onclick=()=>{ ST.tab='fight'; save(); render(); };
  $('#lvlup').onclick=()=>{ gainXp(xpNeed()-ST.xp); render(); };
  $('#lvl5').onclick=()=>{ for(let i=0;i<5;i++) gainXp(xpNeed()-ST.xp); render(); };
  $('#autoall').onclick=()=>{ for(const c of ST.party) while(c.pending>0){ c.pending--; absorb(c, STRATS.smart.pick(c, openPack(c))); } save(); render(); };
  $('#additem').onclick=()=>{ const [it] = rollLoot(ST.plvl, 1, false); ST.bag.push(newItem(it.id)); save(); renderParty(); };
  $('#autoeq').onclick=()=>{ ST.bag = autoEquip(ST.party, ST.bag); save(); renderParty(); };
  $$('[data-slot]').forEach(b=>b.onclick=()=>itemSheet(ch, +b.dataset.slot));
  $('#bag').onclick = bagSheet;
  $('#reset').onclick=()=>confirmBox('Reset the party?', 'Everyone goes back to level 1 with fresh cards.', 'Reset', ()=>{ ST = Object.assign(fresh(), {tab:'party'}); save(); render(); });
}

/* ---------- opening a pack ---------- */
function openPackFlow(ch){
  if(!ch.pending) return;
  const cards = openPack(ch);
  let picked = null;
  layer.innerHTML = `<div class="ov pack-ov">
    <div class="pack-stage" id="pstage">
      <div class="pack" id="pack"><span class="pk-top">✦</span><span class="pk-name">${esc(ch.name)}'s Pack</span><span class="pk-sub">Lv ${ch.lvl} · ${ch.packSize} cards</span><span class="pk-tap">Tap to open</span></div>
    </div>
  </div>`;
  const ov = $('.pack-ov'), stage = $('#pstage');
  $('#pack').onclick = ()=>{
    $('#pack').classList.add('burst');
    setTimeout(()=>{
      stage.innerHTML = `<div class="pk-head">Choose one card for <b>${esc(ch.name)}</b></div>
        <div class="pgrid n${cards.length}">${cards.map((c,i)=>packCard(c, ch, i)).join('')}</div>
        <div class="pk-preview" id="pprev"><span class="muted">Tap a card to see what it would do.</span></div>
        <div class="row2"><button class="btn ghost" id="pclose">Later</button><button class="btn primary" id="pabsorb" disabled>Absorb</button></div>`;
      const pcs = $$('.pcard', stage);
      pcs.forEach((el,i)=>setTimeout(()=>el.classList.add('flip'), 250 + i*230));
      pcs.forEach(el=>el.onclick=()=>{
        if(!el.classList.contains('flip')) return;
        picked = cards[+el.dataset.i];
        pcs.forEach(x=>x.classList.toggle('sel', x===el)); pcs.forEach(x=>x.classList.toggle('dim', x!==el));
        const na = Math.max(0, ch.atk+picked.atk), nr = Math.max(1, ch.res+picked.res);
        const arrow = (a,b)=>a===b ? `${a}` : `${a} → <b class="${b>a?'up':'dn'}">${b}</b>`;
        $('#pprev').innerHTML = `<span>⚔ ${arrow(ch.atk,na)}</span><span>⛨ ${arrow(ch.res,nr)}</span>${picked.ab?`<span class="gold">+ ${esc(AB[picked.ab[0]].name)}</span>`:''}${picked.slots?`<span class="teal">▤ ${ch.slots} → ${Math.min(MAX_SLOTS, ch.slots+picked.slots)} slots</span>`:''}`;
        $('#pabsorb').disabled = false; $('#pabsorb').textContent = `Absorb ${picked.name}`;
      });
      $('#pclose').onclick = ()=>{ layer.innerHTML=''; };
      $('#pabsorb').onclick = ()=>{
        if(!picked) return;
        const before = {atk:ch.atk, res:ch.res}, el = pcs.find(x=>x.classList.contains('sel'));
        el.classList.add('absorbing');
        setTimeout(()=>{
          ch.pending--; absorb(ch, picked); save();
          const hl = {atk:ch.atk-before.atk, res:ch.res-before.res, ab:picked.ab?picked.ab[0]:null, flash:true};
          stage.innerHTML = `<div class="pk-head">${esc(picked.name)} becomes part of <b>${esc(ch.name)}</b></div>
            <div class="cardwrap">${bigCard(ch, hl)}</div>
            <div class="row2"><button class="btn ghost" id="pdone">Done</button>${ch.pending?`<button class="btn primary" id="pnext">Next pack (${ch.pending})</button>`:''}</div>`;
          fitInt(stage);
          $('#pdone').onclick = ()=>{ layer.innerHTML=''; render(); };
          const nx = $('#pnext'); if(nx) nx.onclick = ()=>openPackFlow(ch);
        }, 520);
      };
    }, 520);
  };
}

/* ---------- fight menu ---------- */
let FIGHT = null;
function renderFightMenu(){
  const t = ST.tier;
  $('#body').innerHTML = `
    <div class="win panel">
      <div class="eyebrow">Encounter</div>
      <div class="stepper"><button class="btn ghost" id="tdn">−</button><div><b>Tier ${t}</b><small>${t%5===0?(t%10===0?'Boss: The Lich':'Boss: Demon General'):t<=3?'Slimes, bandits, wolves':t<=6?'Archers, cultists, wraiths':'Ogres, knights, berserkers'}</small></div><button class="btn ghost" id="tup">+</button></div>
      <p class="muted small">Your party is level ${ST.plvl}. Fights at your own level are fair; every 5th tier is a boss. Winning gives ${2+t} XP.</p>
      <button class="btn primary wide" id="start">⚔ Fight tier ${t}</button>
      <button class="btn ghost wide" id="startauto">Watch the AI fight it ▸▸</button>
    </div>
    <div class="party-mini">${ST.party.map(c=>`<div class="pm"><span class="chip-art">${portraitImg(c.art,'head')}</span><div><b>${esc(c.name)}</b> <small>Lv ${c.lvl}</small>${(()=>{ const e = effective(c); return `<div class="small">${e.atk}⚔ ${e.res}⛨ · ${abilityLines(e).map(l=>esc(l.def.name)).join(', ')||'no abilities'}</div><div class="small muted">◆ ${c.equip.map(x=>esc(ITEM[x.id].name)).join(', ')||'no items'}</div>`; })()}</div></div>`).join('')}</div>
    <div class="muted small center">Record: ${ST.wins} won · ${ST.losses} lost</div>`;
  fitInt($('#body'));
  $('#tdn').onclick=()=>{ ST.tier = Math.max(1, ST.tier-1); save(); renderFightMenu(); };
  $('#tup').onclick=()=>{ ST.tier = Math.min(20, ST.tier+1); save(); renderFightMenu(); };
  $('#start').onclick=()=>startFight(ST.tier, false);
  $('#startauto').onclick=()=>startFight(ST.tier, true);
}

/* =========================================================
   COMBAT
   ========================================================= */
function startFight(tier, auto){
  const foes = makeEncounter(tier);
  const B = newBattle(ST.party, foes);
  FIGHT = {B, foes, tier, auto, actor:null, mode:null, seen:0, busy:false, speed:1, log:[]};
  startBattle(B);
  renderCombat();
  play(()=>go());
}
const U = id=>FIGHT.B.units.find(u=>u.id===id);
function miniCard(u){
  const F = FIGHT, B = F.B, pct = Math.max(0, Math.round(u.hp/u.res*100));
  const st = [];
  if(hasGuard(u)) st.push('<i class="s-g" title="Guard">⛨</i>');
  if(u.ward) st.push(`<i class="s-w" title="Ward">◈${u.ward}</i>`);
  if(ab(u,'armor')) st.push(`<i class="s-a" title="Armor">▣${ab(u,'armor')}</i>`);
  if(u.poison) st.push(`<i class="s-p" title="Poison">☣${u.poison}</i>`);
  if(ab(u,'swift')) st.push('<i title="First Strike">»</i>');
  if(ab(u,'ranged')) st.push('<i title="Ranged">➶</i>');
  const art = u.side==='p' ? portraitImg(u.art,'head') : `<span class="glyph">${u.glyph}</span>`;
  const isActor = F.actor===u.id, done = u.side==='p' && u.acted && !u.extra;
  const tgt = F.targets && F.targets.includes(u.id);
  return `<button class="mc s-${u.side} ${u.alive?'':'dead'} ${u.boss?'boss':''} ${isActor?'actor':''} ${done?'done':''} ${tgt?'tgt':''}" data-u="${u.id}">
    <span class="mc-art">${art}</span>
    <span class="mc-name">${esc(u.name)}</span>
    <span class="mc-stats"><span class="a">⚔${u.atk}</span><span class="r">⛨${Math.max(0,u.hp)}<small>/${u.res}</small></span></span>
    <span class="hpbar"><i style="width:${pct}%" class="${pct<=30?'low':''}"></i></span>
    <span class="mc-st">${st.join('')}</span>
  </button>`;
}
function renderCombat(){
  const F = FIGHT, B = F.B;
  app.innerHTML = `<div class="screen combat">
    <div class="cbar"><button class="btn ghost sm" id="flee">✕</button><span class="ctitle">Tier ${F.tier} · Round ${B.round}</span><button class="btn ghost sm ${F.auto?'on':''}" id="autobtn">${F.auto?'Auto ▸▸':'Auto'}</button></div>
    <div class="row-e">${side(B,'e').map(miniCard).join('')}</div>
    <div class="clog" id="clog">${F.log.slice(-3).map(l=>`<div class="${l.cls||''}">${esc(l.s)}</div>`).join('')}</div>
    <div class="row-p">${side(B,'p').map(miniCard).join('')}</div>
    <div class="actbar win" id="actbar"></div>
  </div>`;
  fitInt(app);
  drawActions();
  $('#flee').onclick=()=>confirmBox('Leave this fight?', 'It counts as a loss.', 'Leave', ()=>{ ST.losses++; save(); FIGHT = null; render(); });
  $('#autobtn').onclick=()=>{ F.auto = !F.auto; F.actor = null; F.targets = null; renderCombat(); if(F.auto && !F.busy) go(); };
  $$('.mc').forEach(el=>{
    el.onclick = ()=>tapUnit(el.dataset.u);
    let t = 0; el.addEventListener('pointerdown', ()=>{ t = setTimeout(()=>{ t = -1; inspect(el.dataset.u); }, 480); });
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev, ()=>{ if(t>0) clearTimeout(t); }));
    el.addEventListener('click', e=>{ if(t===-1){ e.stopImmediatePropagation(); t = 0; } }, true);
  });
}
function drawActions(){
  const F = FIGHT, B = F.B, bar = $('#actbar'); if(!bar) return;
  if(B.over){ bar.innerHTML = ''; return; }
  if(F.auto || B.phase!=='p' || F.busy || !F.actor){ bar.innerHTML = `<div class="waiting">${B.phase==='e' ? 'The enemy is acting…' : F.auto ? 'The AI is fighting for you. Tap Auto to take over.' : '…'}</div>`; return; }
  const u = U(F.actor), mode = F.mode || {type:'attack'};
  const spells = Object.keys(u.cds);
  bar.innerHTML = `<div class="ab-head"><b>${esc(u.name)}</b> <span class="muted">${mode.type==='attack' ? 'Tap an enemy to attack' : `Choose a target for ${AB[mode.id].name}`}</span></div>
    <div class="ab-btns">
      <button class="act ${mode.type==='attack'?'on':''}" data-act="attack">⚔ Attack<small>${u.atk} dmg${ab(u,'ranged')?' · ranged':''}</small></button>
      ${spells.map(id=>{ const ready = spellReady(u,id); return `<button class="act sp ${mode.id===id?'on':''}" data-spell="${id}" ${ready?'':'disabled'}>✦ ${esc(AB[id].name)}<small>${ready?esc(spellShort(u,id)):`ready in ${u.cds[id]}`}</small></button>`; }).join('')}
      <button class="act ghost" data-act="ai">Let AI pick</button>
      <button class="act ghost" data-act="wait">Wait</button>
    </div>`;
  $$('[data-act]', bar).forEach(b=>b.onclick=()=>{
    const k = b.dataset.act;
    if(k==='attack'){ F.mode = {type:'attack'}; setTargets(); }
    if(k==='wait') return doAct({type:'wait'});
    if(k==='ai') return doAct(bestAction(B, u));
  });
  $$('[data-spell]', bar).forEach(b=>b.onclick=()=>{
    const id = b.dataset.spell;
    if(AB[id].tgt==='none') return doAct({type:'spell', id});
    F.mode = {type:'spell', id}; setTargets();
  });
}
function spellShort(u, id){
  const t = AB[id].text(ab(u,id), u);
  return t.length>34 ? t.slice(0,33)+'…' : t;
}
function setTargets(){
  const F = FIGHT, B = F.B, u = U(F.actor), m = F.mode || {type:'attack'};
  F.targets = m.type==='attack' ? validTargets(B,u).map(x=>x.id) : spellTargets(B,u,m.id).map(x=>x.id);
  renderCombat();
}
function tapUnit(id){
  const F = FIGHT, B = F.B; if(!F || B.over || F.busy || F.auto || B.phase!=='p') return;
  if(F.targets && F.targets.includes(id)){
    const m = F.mode || {type:'attack'};
    return doAct(m.type==='attack' ? {type:'attack', tgt:id} : {type:'spell', id:m.id, tgt:id});
  }
  const u = U(id);
  if(u && u.side==='p' && u.alive && (!u.acted || u.extra>0)){ F.actor = id; F.mode = {type:'attack'}; setTargets(); return; }
  inspect(id);
}
function doAct(action){
  const F = FIGHT, B = F.B, u = U(F.actor);
  F.targets = null; F.mode = null; F.busy = true;
  act(B, u, action); advance(B);
  F.actor = null;
  play(()=>{ F.busy = false; go(); });
}
/* keep the fight moving: enemies, and your side when Auto is on */
function go(){
  const F = FIGHT; if(!F || FIGHT!==F) return;
  const B = F.B;
  if(B.over) return finish();
  if(B.phase==='p' && !F.auto){
    if(!F.actor || !U(F.actor).alive || (U(F.actor).acted && !U(F.actor).extra)){ const n = nextActor(B,'p'); F.actor = n ? n.id : null; }
    if(!F.actor){ advance(B); return play(()=>go()); }
    F.mode = {type:'attack'}; F.busy = false; setTargets(); return;
  }
  F.busy = true;
  const u = nextActor(B, B.phase);
  if(!u){ advance(B); return play(()=>go()); }
  F.actor = u.id; renderCombat();
  setTimeout(()=>{ if(FIGHT!==F) return; act(B, u, bestAction(B,u)); advance(B); F.actor = null; play(()=>setTimeout(go, 120/F.speed)); }, 330/F.speed);
}
/* show what just happened: floating numbers, hits, the log */
function play(done){
  const F = FIGHT, B = F.B, evs = B.ev.slice(F.seen); F.seen = B.ev.length;
  for(const e of evs) if(e.t==='text') F.log.push(e);
  // positions before the board redraws
  renderCombat();
  let delay = 0;
  const fl = (id, txt, cls)=>{ const d = delay; setTimeout(()=>floatAt(id, txt, cls), d); delay += 110; };
  for(const e of evs){
    if(e.t==='attack'){ const a = $(`.mc[data-u="${e.u}"]`), t = $(`.mc[data-u="${e.tgt}"]`); if(a) a.classList.add(a.classList.contains('s-p')?'lunge-up':'lunge-dn'); if(t) setTimeout(()=>t.classList.add('hit'), 120); }
    if(e.t==='dmg') fl(e.u, e.n ? `-${e.n}` : 'blocked', e.poison ? 'f-poison' : 'f-dmg');
    if(e.t==='heal') fl(e.u, `+${e.n}`, 'f-heal');
    if(e.t==='block') fl(e.u, 'Ward!', 'f-ward');
    if(e.t==='ward') fl(e.u, `+${e.n} ◈`, 'f-ward');
    if(e.t==='atk') fl(e.u, `${e.n>0?'+':''}${e.n} ⚔`, e.n>0 ? 'f-buff' : 'f-dmg');
    if(e.t==='res') fl(e.u, `+${e.n} ⛨`, 'f-buff');
    if(e.t==='poison') fl(e.u, `☣${e.n}`, 'f-poison');
    if(e.t==='cast'){ const a = $(`.mc[data-u="${e.u}"]`); if(a) a.classList.add('casting'); fl(e.u, AB[e.spell].name, 'f-spell'); }
    if(e.t==='reborn') fl(e.u, 'Rebirth!', 'f-buff');
    if(e.t==='execute') fl(e.u, 'Executed', 'f-dmg');
    if(e.t==='haste') fl(e.u, 'Haste!', 'f-buff');
  }
  setTimeout(done, Math.min(900, 260 + delay*.6)/F.speed);
}
function floatAt(id, txt, cls){
  const el = $(`.mc[data-u="${id}"]`); if(!el) return;
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float '+cls; f.textContent = txt;
  f.style.left = (r.left + r.width/2 + (Math.random()*24-12))+'px'; f.style.top = (r.top + r.height*.35)+'px';
  document.body.appendChild(f); setTimeout(()=>f.remove(), 1100);
}
function inspect(id){
  const u = U(id); if(!u) return;
  const lines = abilityLines(u);
  layer.innerHTML = `<div class="ov" id="insp"><div class="win sheet">
    <div class="sh-head"><b>${esc(u.name)}</b>${u.boss?' <span class="gold">Boss</span>':''}<button class="x" id="ix">✕</button></div>
    <div class="sh-stats"><span>⚔ ${u.atk} ATK</span><span>⛨ ${u.hp}/${u.res} RES</span>${u.ward?`<span>◈ ${u.ward} Ward</span>`:''}${u.poison?`<span>☣ ${u.poison} poison</span>`:''}</div>
    ${lines.length ? lines.map(l=>abLine(l.id, l.lvl, u)).join('') : '<div class="muted small">No abilities.</div>'}
    ${Object.keys(u.cds).length ? `<div class="muted small">Spells: ${Object.keys(u.cds).map(k=>`${AB[k].name} ${spellReady(u,k)?'ready':`in ${u.cds[k]}`}`).join(', ')}</div>` : ''}
  </div></div>`;
  const close = ()=>{ layer.innerHTML=''; };
  $('#ix').onclick = close; $('#insp').onclick = e=>{ if(e.target.id==='insp') close(); };
}
function finish(){
  const F = FIGHT, B = F.B;
  const win = B.over==='win', xp = win ? 2 + F.tier : B.over==='draw' ? 1 : 0;
  if(win) ST.wins++; else ST.losses++;
  const ups = gainXp(xp);
  if(win && ST.tier < ST.plvl + 1) ST.tier = Math.min(20, ST.tier + 1);
  const boss = F.tier%5===0, loot = win && (boss || Math.random() < .7) ? rollLoot(F.tier, boss ? 3 : 2, boss) : [];
  let took = null;
  save();
  layer.innerHTML = `<div class="ov"><div class="win result ${win?'won':'lost'}">
    <div class="res-big">${win ? 'Victory' : B.over==='draw' ? 'Stalemate' : 'Defeat'}</div>
    <div class="small">${B.round} round${B.round===1?'':'s'} · ${alive(B,'p').length} of ${side(B,'p').length} standing</div>
    ${xp?`<div class="gold">+${xp} XP</div>`:''}
    ${ups?`<div class="lvlup">Party level ${ST.plvl}! Everyone has ${ups>1?ups+' new packs':'a new pack'}.</div>`:''}
    ${loot.length?`<div class="loot"><div class="eyebrow">Loot · take one</div><div class="pgrid n${loot.length} lootgrid">${loot.map((it,i)=>itemCard(it,i)).join('')}</div></div>`:''}
    <div class="row2">${win?'':`<button class="btn ghost" id="retry">Try again</button>`}<button class="btn primary" id="cont">${loot.length ? 'Choose loot first' : ups?'Open packs ▸':'Continue'}</button></div>
  </div></div>`;
  $$('.lootgrid .pcard', layer).forEach(el=>el.onclick=()=>{ took = loot[+el.dataset.i]; $$('.lootgrid .pcard', layer).forEach(x=>{ x.classList.toggle('sel', x===el); x.classList.toggle('dim', x!==el); }); $('#cont').textContent = `Take ${took.name}`; });
  $('#cont').onclick=()=>{ if(loot.length && !took){ $('.loot .eyebrow').textContent = 'Loot · tap one to take it'; $('.loot').classList.add('nudge'); return; }
    if(took){ ST.bag.push(newItem(took.id)); }
    layer.innerHTML=''; FIGHT = null; if(ups || took){ ST.tab='party'; if(ups) ST.sel = 0; save(); } render(); };
  const r = $('#retry'); if(r) r.onclick=()=>{ layer.innerHTML=''; const t = F.tier, a = F.auto; FIGHT = null; startFight(t, a); };
}

/* =========================================================
   LAB: simulations and the card library
   ========================================================= */
function renderLab(){
  $('#body').innerHTML = `
    <div class="win panel">
      <div class="eyebrow">Test your party</div>
      <div class="stepper"><button class="btn ghost" id="ltdn">−</button><div><b>Tier <span id="lt">${ST.tier}</span></b><small>100 fights, the AI plays both sides</small></div><button class="btn ghost" id="ltup">+</button></div>
      <button class="btn primary wide" id="ltest">Run 100 fights</button>
      <div id="lres" class="lres"></div>
    </div>
    <div class="win panel">
      <div class="eyebrow">Build strategies</div>
      <p class="muted small">Fresh parties are built to each level by always picking cards one way, then fight a tier of the same level. This shows whether raw stats, abilities or spells come out ahead.</p>
      <button class="btn ghost wide" id="lmatrix">Run the matrix (levels 1–12)</button>
      <div id="lmat"></div>
    </div>
    <div class="win panel">
      <div class="eyebrow">Card library · ${CARDS.length} cards</div>
      <div class="seg" id="lfilt">${['all','c','u','r','l'].map(k=>`<button data-f="${k}" class="${k==='all'?'on':''}">${k==='all'?'All':RAR[k].name}</button>`).join('')}</div>
      <div id="llib"></div>
    </div>`;
  let lt = ST.tier;
  $('#ltdn').onclick=()=>{ lt = Math.max(1,lt-1); $('#lt').textContent = lt; };
  $('#ltup').onclick=()=>{ lt = Math.min(20,lt+1); $('#lt').textContent = lt; };
  $('#ltest').onclick=()=>{
    const out = $('#lres'); out.textContent = 'Fighting…';
    setTimeout(()=>{ let w=0, r=0, s=0; for(let i=0;i<100;i++){ const B = autoBattle(ST.party, makeEncounter(lt)); if(B.over==='win'){ w++; s += alive(B,'p').length; } r += B.round; }
      out.innerHTML = `<div class="bigpct ${w>=70?'good':w>=40?'mid':'bad'}">${w}%</div><div class="small">won at tier ${lt} · ${(r/100).toFixed(1)} rounds per fight · ${w?(s/w).toFixed(1):0} of 3 standing after wins</div>`; }, 30);
  };
  $('#lmatrix').onclick=()=>runMatrix();
  const lib = f=>{ $('#llib').innerHTML = CARDS.filter(c=>f==='all'||c.rar===f).map(c=>`<div class="libc r-${c.rar}"><b>${esc(c.name)}</b><span class="lib-st">${c.atk||c.res?`${c.atk>=0?'+':''}${c.atk}⚔ ${c.res>=0?'+':''}${c.res}⛨`:'—'}</span>${c.ab?`<div class="small"><b class="teal">${esc(AB[c.ab[0]].name)}</b> ${esc(AB[c.ab[0]].text(c.ab[1]))}</div>`:''}</div>`).join(''); };
  lib('all');
  $$('#lfilt [data-f]').forEach(b=>b.onclick=()=>{ $$('#lfilt button').forEach(x=>x.classList.toggle('on', x===b)); lib(b.dataset.f); });
}
function runMatrix(){
  const strats = ['stats','smart','spells','abilities','random'], levels = [1,2,3,4,5,6,7,8,9,10,11,12], N = 60;
  const box = $('#lmat');
  box.innerHTML = `<table class="mat"><thead><tr><th>Lv</th>${strats.map(s=>`<th>${STRATS[s].name.replace(' first','')}</th>`).join('')}</tr></thead><tbody>${levels.map(l=>`<tr><td>${l}${l%5===0?'★':''}</td>${strats.map(s=>`<td id="m-${s}-${l}">·</td>`).join('')}</tr>`).join('')}</tbody></table><div class="muted small">★ boss tier. ${N} fights per cell.</div>`;
  const jobs = []; for(const l of levels) for(const s of strats) jobs.push([s,l]);
  const step = ()=>{
    const j = jobs.shift(); if(!j) return;
    const [s,l] = j, r = simulate(s, l, l, N, 900+l), p = Math.round(r.win*100), td = $(`#m-${s}-${l}`);
    if(td){ td.textContent = p+'%'; td.style.background = `hsl(${Math.round(p*1.2)},55%,${22+p*.12}%)`; }
    setTimeout(step, 0);
  };
  step();
}

/* ---------- small shared bits ---------- */
function confirmBox(title, text, yes, fn){
  layer.innerHTML = `<div class="ov"><div class="win sheet"><div class="sh-head"><b>${esc(title)}</b></div><p class="small">${esc(text)}</p><div class="row2"><button class="btn ghost" id="cn">Cancel</button><button class="btn primary" id="cy">${esc(yes)}</button></div></div></div>`;
  $('#cn').onclick=()=>{ layer.innerHTML=''; }; $('#cy').onclick=()=>{ layer.innerHTML=''; fn(); };
}
render();
