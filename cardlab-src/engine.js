/* =========================================================
   CARD COMBAT LAB: engine
   Every fighter is one card: ATK, RES and a list of abilities.
   Levelling up opens a pack; the chosen card is absorbed into the
   character card (stats add, abilities stack and level up).
   Combat: turn-based. An attack trades blows: the attacker deals its ATK,
   the defender hits back with its ATK (Magic-style power/toughness).
   RES is how much damage a fighter can take before falling in a fight.
   ========================================================= */

/* ---------- seeded randomness ---------- */
function rngFrom(seed){ let a = seed>>>0 || 1; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
let RNG = Math.random;
const rnd = ()=>RNG();
const rint = (a,b)=>a+Math.floor(rnd()*(b-a+1));
const pickOne = arr=>arr[Math.floor(rnd()*arr.length)];
function weighted(items, w){ let tot=0; const ws=items.map(i=>{ const x=Math.max(0,w(i)); tot+=x; return x; }); if(tot<=0) return null; let r=rnd()*tot; for(let i=0;i<items.length;i++){ r-=ws[i]; if(r<=0) return items[i]; } return items[items.length-1]; }

/* ---------- abilities ---------- */
/* kind: kw (keyword), aura (helps allies), trig (trigger), mod (changes other abilities), spell (an action with a cooldown)
   max: the most levels it can stack to. Every text() takes the level and (optionally) the unit, for spell numbers. */
const AB = {
  // keywords
  guard:    {name:'Guard', kind:'kw', max:1, text:()=>`Enemies must attack this first.`},
  swift:    {name:'First Strike', kind:'kw', max:1, text:()=>`Strikes first when it attacks. If the target falls, it can't hit back.`},
  ranged:   {name:'Ranged', kind:'kw', max:1, text:()=>`Its attacks can't be hit back.`},
  lifesteal:{name:'Lifesteal', kind:'kw', max:3, text:l=>`Heals for the damage it deals${l>1?`, +${l-1}`:''}.`},
  venom:    {name:'Venom', kind:'kw', max:5, text:l=>`Its attacks poison: ${l} damage to the target at the end of every round. Stacks.`},
  thorns:   {name:'Thorns', kind:'kw', max:6, text:l=>`When attacked, deals ${l} damage back.`},
  ward:     {name:'Ward', kind:'kw', max:4, text:l=>`Starts each fight with ${l} Ward. Each Ward blocks one hit completely.`},
  armor:    {name:'Armor', kind:'kw', max:4, text:l=>`Takes ${l} less damage from every hit.`},
  regen:    {name:'Regenerate', kind:'kw', max:5, text:l=>`Heals ${l} at the end of every round.`},
  pierce:   {name:'Pierce', kind:'kw', max:1, text:()=>`Its hits ignore Armor and Ward.`},
  cleave:   {name:'Cleave', kind:'kw', max:2, text:l=>`Attacks also hit the enemies beside the target for ${l>1?'full':'half'} damage.`},
  twin:     {name:'Twin Strike', kind:'kw', max:1, text:()=>`Attacks twice each turn.`},
  rebirth:  {name:'Rebirth', kind:'kw', max:1, text:()=>`The first time it falls each fight, it rises again with half its RES.`},
  // auras
  rally:    {name:'Rally', kind:'aura', max:4, text:l=>`Allies have +${l} ATK.`},
  bulwark:  {name:'Bulwark', kind:'aura', max:4, text:l=>`Allies have +${l} RES.`},
  // triggers
  volley:   {name:'Opening Volley', kind:'trig', max:4, text:l=>`Start of combat: deal ${2*l} damage to a random enemy.`},
  sanctuary:{name:'Sanctuary', kind:'trig', max:3, text:l=>`Start of combat: every ally gains ${l} Ward.`},
  mend:     {name:'Mend', kind:'trig', max:4, text:l=>`Start of each round: heal the most wounded ally for ${l+1}.`},
  momentum: {name:'Momentum', kind:'trig', max:4, text:l=>`Start of each round: gain +${l} ATK.`},
  frenzy:   {name:'Frenzy', kind:'trig', max:4, text:l=>`Each time it attacks, it first gains +${l} ATK.`},
  enrage:   {name:'Enrage', kind:'trig', max:4, text:l=>`Whenever it's hurt and survives: gain +${l} ATK.`},
  bloodthirst:{name:'Bloodthirst', kind:'trig', max:3, text:l=>`When it defeats an enemy: heal ${2*l} and gain +${l} ATK.`},
  avenger:  {name:'Avenger', kind:'trig', max:3, text:l=>`When an ally falls: gain +${l} ATK and +${l} RES.`},
  lastbreath:{name:'Last Breath', kind:'trig', max:4, text:l=>`When it falls: deal ${2*l} damage to every enemy.`},
  martyr:   {name:'Martyr', kind:'trig', max:3, text:l=>`When it falls: heal every ally ${3*l} and give them +${l} ATK.`},
  spellblade:{name:'Spellblade', kind:'trig', max:3, text:l=>`After it casts a spell: gain +${l} ATK.`},
  // modifiers
  arcane:   {name:'Arcane Focus', kind:'mod', max:5, text:l=>`Its spells deal and heal +${l}.`},
  quick:    {name:'Quickcast', kind:'mod', max:2, text:l=>`Its spell cooldowns are ${l} shorter (never below 1).`},
  echo:     {name:'Echo', kind:'mod', max:1, text:()=>`Its spells are cast twice.`},
  overflow: {name:'Overflow', kind:'mod', max:1, text:()=>`Its healing past full becomes Ward: 1 Ward per 3 extra.`},
  bloodpact:{name:'Blood Pact', kind:'mod', max:1, text:()=>`Its spells have no cooldown, but every cast costs it 2 RES.`},
  shieldwall:{name:'Shieldwall', kind:'mod', max:3, text:l=>`Gains +1 ATK for every ${4-l} RES it has when a fight starts.`},
  // spells: cd = rounds between casts; first cast is ready on round 1
  firebolt: {name:'Firebolt', kind:'spell', max:5, cd:2, tgt:'enemy', text:(l,u)=>`Deal ${spellN(3+2*(l-1),u)} damage to an enemy.`},
  frost:    {name:'Frost Shard', kind:'spell', max:4, cd:2, tgt:'enemy', text:(l,u)=>`Deal ${spellN(1+l,u)} damage. The target loses ${l} ATK.`},
  meteor:   {name:'Meteor', kind:'spell', max:4, cd:4, tgt:'none', text:(l,u)=>`Deal ${spellN(2+l,u)} damage to every enemy.`},
  heal:     {name:'Heal', kind:'spell', max:5, cd:2, tgt:'ally', text:(l,u)=>`Restore ${spellN(3+2*(l-1),u)} RES to an ally.`},
  barrier:  {name:'Barrier', kind:'spell', max:3, cd:4, tgt:'none', text:l=>`Every ally gains ${l} Ward.`},
  bash:     {name:'Shield Bash', kind:'spell', max:4, cd:3, tgt:'enemy', text:(l,u)=>`Deal damage equal to its current RES${l>1?` +${l-1}`:''}${u&&(ab(u,'arcane')+spellLvl(u))?` +${ab(u,'arcane')+spellLvl(u)}`:''}. No hit back.`},
  drain:    {name:'Drain Life', kind:'spell', max:4, cd:2, tgt:'enemy', text:(l,u)=>`Deal ${spellN(1+l,u)} damage and heal that much.`},
  haste:    {name:'Haste', kind:'spell', max:2, cd:3, tgt:'other', text:l=>`Another ally acts again this round${l>1?' with +2 ATK':''}.`},
  inspire:  {name:'Inspire', kind:'spell', max:4, cd:2, tgt:'ally', text:(l)=>`An ally gains +${l+1} ATK for the rest of the fight.`},
  hex:      {name:'Hex', kind:'spell', max:4, cd:3, tgt:'enemy', text:l=>`An enemy loses ${l+1} ATK and ${l} Armor/Ward.`},
  plague:   {name:'Plague Cloud', kind:'spell', max:4, cd:3, tgt:'none', text:l=>`Poison every enemy for ${l} (stacks with Venom).`},
  execute:  {name:'Execute', kind:'spell', max:4, cd:3, tgt:'enemy', text:(l,u)=>`Defeat an enemy with ${spellN(3+2*l,u)} RES or less left.`},
  warcry:   {name:'War Cry', kind:'spell', max:3, cd:2, tgt:'none', text:l=>`Gain Guard and ${l} Ward until your next turn.`}
};
const ab = (u,id)=>(u.ab && u.ab[id]) || 0;
const spellN = (n,u)=>n + (u ? ab(u,'arcane') + spellLvl(u) : 0);
const spellLvl = u=>Math.floor(((u.lvl||1)-1)/2);   // spells grow as the caster levels up
const KIND_ORDER = {kw:0, aura:1, trig:2, mod:3, spell:4};

/* ---------- character cards ---------- */
/* tags steer what a character's packs offer */
const HEROES = {
  you:{name:'You', title:'The Otherworlder', art:'you', atk:2, res:10, ab:{}, tags:['blade','stat','wild'], trait:'Otherworlder: your packs hold 4 cards instead of 3.', packSize:4},
  lina:{name:'Lina', title:'The Village Healer', art:'lina', atk:1, res:10, ab:{mend:1}, tags:['holy','ward','heal'], trait:'Kind heart: her packs lean towards healing and protection.'},
  mal:{name:'Mal', title:'The Cambion', art:'mal', atk:3, res:8, ab:{lifesteal:1}, tags:['blood','fury','fire'], trait:'Demon blood: his packs lean towards fury, fire and blood.'}
};
function makeChar(k){ const H = HEROES[k]; return {key:k, name:H.name, title:H.title, art:H.art, lvl:1, xp:0, atk:H.atk, res:H.res, ab:Object.assign({}, H.ab), tags:H.tags, trait:H.trait, packSize:H.packSize||3, absorbed:[], pending:0, slots:1, equip:[]}; }

/* ---------- the card pool ---------- */
const RAR = {c:{name:'Common', w:62}, u:{name:'Uncommon', w:27}, r:{name:'Rare', w:9.5}, l:{name:'Legendary', w:1.5}};
const C = (id, name, rar, atk, res, abl, tags, flav)=>({id, name, rar, atk, res, ab:abl||null, tags:tags||[], flav:flav||''});
const CARDS = [
  // commons: mostly raw stats, a few cheap tricks
  C('whetstone','Whetstone','c',2,0,null,['stat','blade'],'A sharper edge.'),
  C('vest','Padded Vest','c',0,4,null,['stat','ward'],'Thick, ugly, comforting.'),
  C('spar','Sparring Partner','c',1,3,null,['stat','blade'],'Bruises, mostly.'),
  C('ration','Hearty Stew','c',1,3,null,['stat','heal'],'Mama\'s recipe.'),
  C('drill','Morning Drills','c',2,2,null,['stat','blade','fury'],'Again. Again.'),
  C('hide','Boar Hide','c',0,5,null,['stat','ward'],'Smells terrible.'),
  C('thorny','Thorny Vines','c',0,2,['thorns',1],['ward','wild'],'Touch me and see.'),
  C('hooked','Hooked Blade','c',1,0,['venom',1],['poison','blade'],'Dipped in something green.'),
  C('temper','Short Temper','c',1,2,['enrage',1],['fury'],'Don\'t poke it.'),
  C('spark','Spark','c',0,0,['firebolt',1],['fire','arcane'],'A spell, not a stat in sight.'),
  C('firstaid','First Aid','c',0,2,['heal',1],['heal','holy'],'Bandages and a kind word.'),
  C('charm','Lucky Charm','c',1,2,['ward',1],['ward','wild'],'Probably works.'),
  C('frostc','Frost Shard','c',0,0,['frost',1],['arcane','wild'],'Cold enough to slow a bear.'),
  // uncommons: real abilities, modest stats
  C('tower','Tower Shield','u',0,5,['guard',1],['guard','ward','stat'],'Stand behind me.'),
  C('bow','Longbow','u',1,0,['ranged',1],['blade','wild'],'Hit them before they reach you.'),
  C('fang','Vampire Fang','u',1,0,['lifesteal',1],['blood'],'It hums when it bites.'),
  C('chain','Chainmail','u',0,3,['armor',1],['ward','stat'],'Rings within rings.'),
  C('gland','Venom Gland','u',0,0,['venom',2],['poison'],'Handle with gloves.'),
  C('regrow','Troll Blood','u',0,3,['regen',1],['blood','heal'],'It grows back.'),
  C('hymn','Healing Hymn','u',0,1,['mend',1],['holy','heal'],'Sung under the breath.'),
  C('moment','Building Momentum','u',1,0,['momentum',1],['fury','blade'],'Slow start. Then not.'),
  C('frenzy','Frenzy','u',0,1,['frenzy',1],['fury','blood'],'More. More!'),
  C('wardc','Warding Sigil','u',0,0,['ward',2],['ward','arcane'],'Drawn in chalk, holds like iron.'),
  C('banner','War Banner','u',0,1,['rally',1],['holy','wild'],'Everyone stands taller.'),
  C('bashc','Shield Bash','u',0,3,['bash',1],['guard','ward'],'The shield is also a weapon.'),
  C('drainc','Drain Touch','u',0,1,['drain',1],['blood','arcane'],'Take a little. Keep a little.'),
  C('focus','Arcane Focus','u',0,0,['arcane',1],['arcane','fire'],'Every spell, a little sharper.'),
  C('volleyc','Opening Volley','u',0,0,['volley',1],['fire','blade'],'Fire first, ask later.'),
  C('spikes','Spiked Pauldrons','u',0,3,['thorns',2],['ward','fury'],'Hugs not recommended.'),
  C('cleaver','Cleaver','u',2,0,['cleave',1],['blade','fury'],'Wide swings.'),
  C('inspirec','Inspiring Words','u',0,1,['inspire',1],['holy','wild'],'You can do this.'),
  C('hexc','Hex','u',0,0,['hex',1],['arcane','blood'],'A whispered curse.'),
  C('berserk','Berserker Rage','u',4,-1,['enrage',1],['fury','blood'],'Stronger. Angrier. Thinner.'),
  C('tome','Hermit\'s Tome','u',-1,0,['arcane',2],['arcane','holy'],'All study and no sword.'),
  C('warcryc','War Cry','u',1,2,['warcry',1],['guard','fury'],'Look at ME.'),
  // rares
  C('glass','Glass Cannon','r',5,-3,null,['stat','fury'],'Hits like a cart. Breaks like a cup.'),
  C('jugger','Juggernaut','r',3,5,null,['stat','guard'],'Simply more.'),
  C('twinc','Twin Daggers','r',-1,0,['twin',1],['blade'],'One for each hand.'),
  C('meteorc','Meteor','r',0,0,['meteor',1],['fire','arcane'],'Look up.'),
  C('hastec','Haste','r',0,0,['haste',1],['arcane','wild'],'Go. Go now.'),
  C('thirst','Bloodthirst','r',1,0,['bloodthirst',1],['blood','fury'],'Every kill a meal.'),
  C('oath','Avenger\'s Oath','r',1,2,['avenger',1],['holy','fury'],'For them.'),
  C('sanct','Sanctuary','r',0,1,['sanctuary',1],['holy','ward'],'A circle of light around everyone.'),
  C('quickc','Quickcast','r',0,0,['quick',1],['arcane'],'Words come faster now.'),
  C('overc','Overflow','r',0,1,['overflow',1],['holy','heal'],'Too much healing? There\'s no such thing.'),
  C('breath','Last Breath','r',0,3,['lastbreath',2],['fire','blood'],'Take them with you.'),
  C('martyrc','Martyr','r',0,3,['martyr',1],['holy','heal'],'So they may live.'),
  C('bladec','Spellblade','r',1,0,['spellblade',1],['arcane','blade'],'Cast, then cut.'),
  C('execc','Executioner','r',1,0,['execute',1],['blade','blood'],'Finish it.'),
  C('wallc','Shieldwall','r',0,4,['shieldwall',1],['guard','ward'],'The bigger the wall, the harder it hits.'),
  C('plaguec','Plague Cloud','r',0,0,['plague',1],['poison','arcane'],'Breathe deep.'),
  C('piercec','Piercing Edge','r',1,0,['pierce',1],['blade'],'Through the gaps.'),
  C('bulwarkc','Bulwark','r',0,1,['bulwark',1],['guard','holy'],'Everyone stands firmer.'),
  C('barrierc','Barrier','r',0,0,['barrier',1],['ward','arcane'],'Light, everywhere, at once.'),
  // legendaries
  C('echoc','Echo Crystal','l',0,0,['echo',1],['arcane'],'Everything twice.'),
  C('pact','Blood Pact','l',0,6,['bloodpact',1],['blood','arcane'],'Pay in blood. Never wait.'),
  C('titan','Titan\'s Heart','l',4,9,null,['stat'],'Pure, simple, enormous.'),
  C('phoenix','Phoenix Feather','l',1,2,['rebirth',1],['fire','holy'],'Not yet.'),
  // gear cards: more item slots
  Object.assign(C('pouch','Belt Pouch','c',0,1,null,['gear','wild'],'Room for one more thing.'), {slots:1}),
  Object.assign(C('harness','Adventurer\'s Harness','u',1,1,null,['gear','blade'],'Straps, buckles, possibilities.'), {slots:1}),
  Object.assign(C('bandolier','Bandolier','r',0,0,null,['gear'],'A loop for everything.'), {slots:2})
];
const MAX_SLOTS = 4;
const CARD = Object.fromEntries(CARDS.map(c=>[c.id,c]));

/* ---------- packs ---------- */
function cardAllowed(ch, card){ if(card.slots && (ch.slots||1) + card.slots > MAX_SLOTS) return false; if(!card.ab) return true; const [id] = card.ab, def = AB[id]; return ab(ch,id) < def.max; }
const isStatCard = c=>c.atk+c.res>=3;
function rollRarity(lvl){
  const w = {c:RAR.c.w - 2.2*lvl, u:RAR.u.w + 1.2*lvl, r:RAR.r.w + .8*lvl, l:RAR.l.w + .25*lvl};
  return weighted(Object.keys(w), k=>w[k]);
}
function drawCard(ch, filter, taken){
  for(let tries=0; tries<30; tries++){
    const rar = rollRarity(ch.lvl);
    const pool = CARDS.filter(c=>c.rar===rar && filter(c) && cardAllowed(ch,c) && !taken.has(c.id));
    const c = weighted(pool, c=>1 + (c.tags.some(t=>ch.tags.includes(t)) ? 2.2 : 0));
    if(c) return c;
  }
  return weighted(CARDS.filter(c=>cardAllowed(ch,c) && !taken.has(c.id)), ()=>1);
}
/* one card leans on stats, one on abilities, the rest are wild */
function openPack(ch){
  const taken = new Set(), out = [];
  const add = f=>{ const c = drawCard(ch, f, taken); if(c){ taken.add(c.id); out.push(c); } };
  add(isStatCard); add(c=>!!c.ab); for(let i=2;i<ch.packSize;i++) add(()=>true);
  return out.sort(()=>rnd()-.5);
}
/* absorb a card into a character card */
function absorb(ch, card){
  ch.atk = Math.max(0, ch.atk + card.atk); ch.res = Math.max(1, ch.res + card.res);
  if(card.ab){ const [id, l] = card.ab; if(l>0) ch.ab[id] = Math.min(AB[id].max, (ch.ab[id]||0) + l); }
  if(card.slots) ch.slots = Math.min(MAX_SLOTS, (ch.slots||1) + card.slots);
  ch.absorbed.push(card.id);
}

/* ---------- items ----------
   Items are cards too, but they aren't absorbed: they sit in a character's item slots
   and can be swapped, moved or taken off between fights. While equipped, their stats add on
   and their abilities stack with the character's own (up to each ability's cap). */
const I = (id, name, rar, kind, atk, res, abs, flav)=>({id, name, rar, kind, atk, res, abs:abs||[], flav:flav||''});
const ITEM_KIND = {weapon:'⚔', armor:'⛨', trinket:'❖', tome:'✎'};
const ITEMS = [
  // common
  I('sword','Iron Sword','c','weapon',2,0,[],'Plain and honest.'),
  I('jerkin','Leather Jerkin','c','armor',0,4,[],'Creaks when you move.'),
  I('boots','Travel Boots','c','armor',1,2,[],'Broken in on a hundred roads.'),
  I('amulet','Wooden Amulet','c','trinket',0,1,[['ward',1]],'Carved by a grandmother.'),
  I('herbs','Herb Pouch','c','trinket',0,1,[['regen',1]],'Chew one when it hurts.'),
  I('wand','Apprentice Wand','c','tome',0,0,[['firebolt',1]],'Points the right way, mostly.'),
  I('kit','Healer\'s Kit','c','trinket',0,1,[['heal',1]],'Clean bandages, sharp scissors.'),
  I('club','Spiked Club','c','weapon',2,0,[['thorns',1]],'Ugly. Effective.'),
  // uncommon
  I('kite','Kite Shield','u','armor',0,4,[['guard',1]],'Hide behind it. Others will too.'),
  I('mail','Chain Shirt','u','armor',0,3,[['armor',1]],'Heavier than it looks.'),
  I('bowi','Hunting Bow','u','weapon',2,0,[['ranged',1]],'For deer. Mostly.'),
  I('serpent','Serpent Dagger','u','weapon',1,0,[['venom',2]],'Green along the edge.'),
  I('focusring','Ring of Focus','u','trinket',0,0,[['arcane',1]],'Hums under your thoughts.'),
  I('cloak','Shadow Cloak','u','armor',0,2,[['ward',2]],'Light slides off it.'),
  I('brand','Burning Brand','u','weapon',2,0,[['volley',1]],'Lit at both ends.'),
  I('spellbook','Frost Primer','u','tome',0,1,[['frost',1],['arcane',1]],'Chapter one: cold.'),
  I('fangring','Fang Ring','u','trinket',1,0,[['lifesteal',1]],'It bites back.'),
  // rare
  I('greatsword','Greatsword','r','weapon',5,-1,[['cleave',1]],'Two hands, wide swings.'),
  I('vampblade','Thirsting Blade','r','weapon',2,0,[['lifesteal',1],['bloodthirst',1]],'It always wants more.'),
  I('aegis','Aegis','r','armor',0,5,[['guard',1],['armor',1]],'Nothing gets past.'),
  I('staff','Archmage\'s Staff','r','tome',0,1,[['arcane',2],['quick',1]],'Older than the tower it came from.'),
  I('thorncrown','Crown of Thorns','r','armor',0,3,[['thorns',3]],'Wear it and dare them.'),
  I('warhorn','War Horn','r','trinket',1,1,[['rally',1]],'One blast and everyone stands taller.'),
  I('standard','Holy Standard','r','trinket',0,2,[['bulwark',1],['mend',1]],'It never touches the ground.'),
  I('twinfangs','Twin Fangs','r','weapon',1,0,[['twin',1]],'A matched pair.'),
  I('stormtome','Tome of Storms','r','tome',0,0,[['meteor',1]],'Do not read aloud indoors.'),
  // legendary
  I('mirror','Mirror Orb','l','trinket',0,1,[['echo',1]],'Everything you cast, twice.'),
  I('gauntlets','Titan\'s Gauntlets','l','weapon',4,4,[['enrage',1]],'Made for hands much larger.'),
  I('plume','Phoenix Plume','l','trinket',0,2,[['rebirth',1],['lastbreath',2]],'Warm to the touch, always.')
];
const ITEM = Object.fromEntries(ITEMS.map(i=>[i.id,i]));
let ITEM_UID = 0;
const newItem = id=>({uid:'it'+Date.now().toString(36)+(ITEM_UID++)+Math.floor(rnd()*1e4), id});
/* a fighter as it walks into battle: the card plus whatever it's carrying */
function effective(ch){
  const e = Object.assign({}, ch, {ab:Object.assign({}, ch.ab), src:{}});
  for(const it of (ch.equip||[]).slice(0, ch.slots||1)){
    const d = ITEM[it.id]; if(!d) continue;
    e.atk += d.atk; e.res += d.res;
    for(const [id,l] of d.abs){ e.ab[id] = Math.min(AB[id].max, (e.ab[id]||0) + l); (e.src[id] = e.src[id]||[]).push(d.name); }
  }
  e.atk = Math.max(0, e.atk); e.res = Math.max(1, e.res);
  return e;
}
/* loot: choose one of a few; better odds from higher tiers and bosses */
function rollLoot(tier, n, boss){
  const out = [], taken = new Set();
  for(let i=0;i<n;i++){
    for(let tries=0; tries<20; tries++){
      let rar = rollRarity(tier + (boss?6:0)); if(boss && rar==='c') rar = 'u';
      const pool = ITEMS.filter(x=>x.rar===rar && !taken.has(x.id));
      if(pool.length){ const it = pickOne(pool); taken.add(it.id); out.push(it); break; }
    }
  }
  return out;
}
function itemValue(ch, it){
  let v = it.atk*1.15 + it.res; const e = effective(ch);
  for(const [id,l] of it.abs){ const room = Math.max(0, Math.min(l, AB[id].max - ab(e,id))); v += (AB_VALUE[id]||2) * room; if(['arcane','quick','echo','spellblade'].includes(id)) v += Object.keys(ch.ab).filter(k=>AB[k]&&AB[k].kind==='spell').length*1.8 - 2; }
  return v;
}
/* hand out a bag of items to whoever gets the most from each one */
function autoEquip(party, bag){
  const all = bag.concat(...party.map(c=>c.equip)); for(const c of party) c.equip = [];
  const left = [];
  for(const it of all.sort((a,b)=>Math.max(...party.map(c=>itemValue(c,ITEM[b.id])))-Math.max(...party.map(c=>itemValue(c,ITEM[a.id]))))){
    const best = party.filter(c=>c.equip.length < (c.slots||1)).sort((a,b)=>itemValue(b,ITEM[it.id])-itemValue(a,ITEM[it.id]))[0];
    if(best) best.equip.push(it); else left.push(it);
  }
  return left;
}
function abilityLines(u){
  return Object.entries(u.ab).filter(([k,l])=>l>0 && AB[k]).sort((a,b)=>KIND_ORDER[AB[a[0]].kind]-KIND_ORDER[AB[b[0]].kind]).map(([k,l])=>({id:k, lvl:l, def:AB[k]}));
}
const XP_NEED = l=>3 + 2*l;

/* ---------- enemies ---------- */
const TUNE = {fAtk:.31, fRes:.35, bAtk:.2, bRes:.24, resMul:1.85, atkMul:1.45, slotValue:4, lootPerLevel:1};
const FOES = {
  slime:{name:'Slime', glyph:'◕', atk:1, res:8, ab:{regen:1}},
  wolf:{name:'Dire Wolf', glyph:'ᛉ', atk:3, res:5, ab:{swift:1}},
  bandit:{name:'Bandit', glyph:'⚔', atk:2, res:8, ab:{}},
  archer:{name:'Goblin Archer', glyph:'➶', atk:2, res:5, ab:{ranged:1}},
  spider:{name:'Cave Spider', glyph:'※', atk:1, res:6, ab:{venom:1}},
  skel:{name:'Skeleton Guard', glyph:'☠', atk:1, res:9, ab:{guard:1, armor:1}},
  imp:{name:'Imp', glyph:'♆', atk:1, res:5, ab:{volley:1}},
  cultist:{name:'Cultist', glyph:'✶', atk:1, res:6, ab:{firebolt:1}},
  shaman:{name:'Shaman', glyph:'❂', atk:1, res:7, ab:{heal:1, mend:1}},
  wraith:{name:'Wraith', glyph:'☾', atk:2, res:6, ab:{ward:1, lifesteal:1}},
  ogre:{name:'Ogre', glyph:'▲', atk:4, res:14, ab:{}},
  knight:{name:'Black Knight', glyph:'♜', atk:3, res:11, ab:{guard:1, armor:1}},
  berserker:{name:'Berserker', glyph:'✠', atk:3, res:9, ab:{enrage:1, frenzy:1}},
  // bosses
  general:{name:'Demon General', glyph:'♛', atk:4, res:17, ab:{enrage:1, meteor:1}, boss:true},
  lich:{name:'The Lich', glyph:'♚', atk:3, res:24, ab:{firebolt:2, plague:1, ward:2, arcane:1}, boss:true}
};
const FOE_TIERS = [['slime','bandit','spider','imp','archer','wolf'], ['wolf','archer','cultist','skel','spider','wraith','shaman'], ['ogre','knight','berserker','wraith','shaman','cultist','skel']];
function makeFoe(k, tier){
  const F = FOES[k], m = 1 + (F.boss ? TUNE.bAtk : TUNE.fAtk)*(tier-1), mr = 1 + (F.boss ? TUNE.bRes : TUNE.fRes)*(tier-1), up = F.boss ? 0 : Math.floor((tier-1)/4);
  const abl = {}; for(const [id,l] of Object.entries(F.ab)) abl[id] = Math.min(AB[id].max, l + (AB[id].max>1 ? up : 0));
  return {key:k, name:F.name, glyph:F.glyph, atk:Math.round(F.atk*m*TUNE.atkMul), res:Math.round(F.res*mr*TUNE.resMul), ab:abl, boss:!!F.boss, lvl:tier};
}
function makeEncounter(tier){
  if(tier%5===0){ const boss = tier%10===0 ? 'lich' : 'general'; const n = tier>=10 ? 2 : 1; const out=[makeFoe(boss,tier)]; for(let i=0;i<n;i++) out.push(makeFoe(pickOne(FOE_TIERS[Math.min(2, Math.floor(tier/4))]), tier-1)); return out; }
  // tougher kinds of enemy drift in gradually as the tier rises
  const n = tier<=1 ? 2 : 3, f = (tier-1)/3, lo = Math.min(2, Math.floor(f)), hi = Math.min(2, lo+1), mix = f - Math.floor(f);
  const out = []; for(let i=0;i<n;i++) out.push(makeFoe(pickOne(FOE_TIERS[rnd()<mix ? hi : lo]), tier));
  return out;
}

/* ---------- combat ---------- */
function toUnit(c, side, i){
  const u = {id:side+i, side, idx:i, key:c.key, name:c.name, glyph:c.glyph, art:c.art, boss:c.boss, lvl:c.lvl,
    baseAtk:c.atk, baseRes:c.res, ab:Object.assign({}, c.ab), atk:c.atk, res:c.res, hp:c.res, ward:0, poison:0, alive:true,
    acted:false, extra:0, cds:{}, reborn:false, guardTmp:false, wardTmp:0};
  for(const [k,l] of Object.entries(u.ab)) if(l>0 && AB[k] && AB[k].kind==='spell') u.cds[k] = 0;   // ready on round 1
  return u;
}
function newBattle(party, foes){
  party = party.map(c=>c.equip ? effective(c) : c);
  const B = {round:0, units:[], ev:[], over:null, phase:'start', turn:null};
  party.forEach((c,i)=>B.units.push(toUnit(c,'p',i)));
  foes.forEach((c,i)=>B.units.push(toUnit(c,'e',i)));
  return B;
}
const side = (B,s)=>B.units.filter(u=>u.side===s);
const alive = (B,s)=>B.units.filter(u=>u.side===s && u.alive);
const foesOf = (B,u)=>alive(B, u.side==='p'?'e':'p');
const alliesOf = (B,u)=>alive(B, u.side);
const say = (B, s, cls)=>B.ev.push({t:'text', s, cls});
const vb = (u, he, you)=>u && u.name==='You' ? you : he;   // 'You attack', 'Mal attacks'
function spellCd(u, id){ if(ab(u,'bloodpact')) return 0; return Math.max(1, AB[id].cd - ab(u,'quick')); }

function heal(B, u, n, src){
  if(!u.alive || n<=0) return 0;
  const room = u.res - u.hp, got = Math.min(room, n);
  u.hp += got;
  if(got>0) B.ev.push({t:'heal', u:u.id, n:got});
  if(n>got && src && ab(src,'overflow')){ const w = Math.floor((n-got)/3); if(w>0){ u.ward += w; B.ev.push({t:'ward', u:u.id, n:w}); } }
  return got;
}
function buffAtk(B, u, n, why){ if(!u.alive || !n) return; u.atk = Math.max(0, u.atk + n); B.ev.push({t:'atk', u:u.id, n, why}); }
function buffRes(B, u, n){ if(!u.alive || !n) return; u.res += n; u.hp += n; B.ev.push({t:'res', u:u.id, n}); }

/* every hit goes through here. opts: {attack, spell, poison, noWard} */
function hurt(B, src, u, n, opts={}){
  if(!u.alive || n<=0) return 0;
  const pierce = src && ab(src,'pierce') && !opts.poison;
  if(!opts.poison && !pierce && u.ward>0){ u.ward--; B.ev.push({t:'block', u:u.id}); return 0; }
  if(!opts.poison && !pierce) n = Math.max(0, n - ab(u,'armor'));
  if(n<=0){ B.ev.push({t:'dmg', u:u.id, n:0, armor:true}); return 0; }
  u.hp -= n;
  B.ev.push({t:'dmg', u:u.id, n, src:src && src.id, poison:!!opts.poison});
  if(src && src.alive && opts.attack && ab(src,'lifesteal')) heal(B, src, n + ab(src,'lifesteal') - 1, src);
  if(u.hp<=0) fall(B, u, src);
  else if(ab(u,'enrage')) buffAtk(B, u, ab(u,'enrage'), 'Enrage');
  return n;
}
function fall(B, u, killer){
  if(ab(u,'rebirth') && !u.reborn){ u.reborn = true; u.hp = Math.max(1, Math.ceil(u.res/2)); B.ev.push({t:'reborn', u:u.id}); say(B, `${u.name} ${vb(u,'rises','rise')} again!`, 'gold'); return; }
  u.alive = false; u.hp = 0;
  B.ev.push({t:'fall', u:u.id});
  say(B, `${u.name} ${vb(u,'falls','fall')}.`, u.side==='p'?'bad':'good');
  if(ab(u,'lastbreath')) for(const e of foesOf(B,u)) hurt(B, u, 2*ab(u,'lastbreath'), {spell:true});
  if(ab(u,'martyr')) for(const a of alliesOf(B,u)){ heal(B, a, 3*ab(u,'martyr'), u); buffAtk(B, a, ab(u,'martyr'), 'Martyr'); }
  for(const a of alliesOf(B,u)) if(ab(a,'avenger')){ buffAtk(B, a, ab(a,'avenger'), 'Avenger'); buffRes(B, a, ab(a,'avenger')); }
  if(killer && killer.alive && killer.side!==u.side && ab(killer,'bloodthirst')){ heal(B, killer, 2*ab(killer,'bloodthirst'), killer); buffAtk(B, killer, ab(killer,'bloodthirst'), 'Bloodthirst'); }
  checkOver(B);
}
function checkOver(B){
  if(B.over) return;
  if(!alive(B,'e').length) B.over = 'win'; else if(!alive(B,'p').length) B.over = 'lose';
}
const hasGuard = u=>ab(u,'guard') || u.guardTmp;
function validTargets(B, u){
  const fs = foesOf(B,u), g = fs.filter(hasGuard);
  return g.length ? g : fs;
}
/* one attack: blows are traded unless the attacker is Ranged, or strikes first and kills */
function strike(B, a, t){
  if(!a.alive || !t.alive) return;
  if(ab(a,'frenzy')) buffAtk(B, a, ab(a,'frenzy'), 'Frenzy');
  B.ev.push({t:'attack', u:a.id, tgt:t.id});
  const aDmg = a.atk, tDmg = t.atk;
  const hitsBack = !ab(a,'ranged');
  const v = ab(a,'venom');
  if(ab(a,'swift')){
    const d = hurt(B, a, t, aDmg, {attack:true}); if(d>0 && v && t.alive){ t.poison += v; B.ev.push({t:'poison', u:t.id, n:v}); }
    if(hitsBack && t.alive && a.alive) hurt(B, t, a, tDmg, {attack:true});
  } else {
    const d = hurt(B, a, t, aDmg, {attack:true}); if(d>0 && v && t.alive){ t.poison += v; B.ev.push({t:'poison', u:t.id, n:v}); }
    if(hitsBack && a.alive) hurt(B, t, a, tDmg, {attack:true, back:true});   // trades blows even if the target just fell
  }
  if(ab(t,'thorns') && a.alive) hurt(B, t, a, ab(t,'thorns'), {});
  if(ab(a,'cleave') && a.alive){
    const row = side(B, t.side), i = row.indexOf(t), dmg = ab(a,'cleave')>1 ? aDmg : Math.ceil(aDmg/2);
    for(const n of [row[i-1], row[i+1]]) if(n && n.alive) hurt(B, a, n, dmg, {attack:true});
  }
}
function attack(B, a, t){
  strike(B, a, t);
  if(ab(a,'twin') && a.alive && !B.over){ const ts = validTargets(B,a); const t2 = t.alive && ts.includes(t) ? t : pickOne(ts); if(t2) strike(B, a, t2); }
}
/* spells */
function castOnce(B, u, id, t){
  const l = ab(u,id), arc = ab(u,'arcane') + spellLvl(u);
  switch(id){
    case 'firebolt': hurt(B, u, t, 3+2*(l-1)+arc, {spell:true}); break;
    case 'frost': hurt(B, u, t, 1+l+arc, {spell:true}); if(t.alive) buffAtk(B, t, -l, 'Frost'); break;
    case 'meteor': for(const e of foesOf(B,u)) hurt(B, u, e, 2+l+arc, {spell:true}); break;
    case 'heal': heal(B, t, 3+2*(l-1)+arc, u); break;
    case 'barrier': for(const a of alliesOf(B,u)){ a.ward += l; B.ev.push({t:'ward', u:a.id, n:l}); } break;
    case 'bash': hurt(B, u, t, u.hp + (l-1) + arc, {spell:true}); break;
    case 'drain': { const d = hurt(B, u, t, 1+l+arc, {spell:true}); heal(B, u, d, u); break; }
    case 'haste': t.extra++; if(l>1) buffAtk(B, t, 2, 'Haste'); B.ev.push({t:'haste', u:t.id}); break;
    case 'inspire': buffAtk(B, t, l+1, 'Inspire'); break;
    case 'hex': buffAtk(B, t, -(l+1), 'Hex'); if(t.ward){ t.ward = Math.max(0, t.ward-l); } if(t.ab.armor){ t.ab.armor = Math.max(0, t.ab.armor - l); } B.ev.push({t:'hex', u:t.id}); break;
    case 'plague': for(const e of foesOf(B,u)){ e.poison += l; B.ev.push({t:'poison', u:e.id, n:l}); } break;
    case 'execute': if(t.hp <= 3+2*l+arc){ B.ev.push({t:'execute', u:t.id}); t.hp = 0; t.ward = 0; fall(B, t, u); } else say(B, `${t.name} ${vb(t,'is','are')} too strong to finish yet.`, 'muted'); break;
    case 'warcry': u.guardTmp = true; u.ward += l; u.wardTmp += l; B.ev.push({t:'ward', u:u.id, n:l}); break;
  }
}
function cast(B, u, id, t){
  const def = AB[id];
  B.ev.push({t:'cast', u:u.id, spell:id, tgt:t && t.id});
  say(B, `${u.name} ${vb(u,'casts','cast')} ${def.name}${t && t.id!==u.id ? ` on ${t.name}` : ''}.`, 'spell');
  if(ab(u,'bloodpact')) hurt(B, null, u, 2, {poison:true});
  const times = ab(u,'echo') ? 2 : 1;
  for(let i=0;i<times && u.alive && !B.over;i++){
    let tg = t;
    if(def.tgt==='enemy' && (!tg || !tg.alive)) tg = pickOne(foesOf(B,u)); if(def.tgt==='enemy' && !tg) break;
    if((def.tgt==='ally' || def.tgt==='other') && (!tg || !tg.alive)) break;
    castOnce(B, u, id, tg);
  }
  u.cds[id] = spellCd(u, id);
  if(u.alive && ab(u,'spellblade')) buffAtk(B, u, ab(u,'spellblade'), 'Spellblade');
}
const spellReady = (u,id)=>u.cds[id]!=null && u.cds[id]<=0;
function readySpells(u){ return Object.keys(u.cds).filter(id=>spellReady(u,id)); }
function spellTargets(B, u, id){
  const t = AB[id].tgt;
  if(t==='enemy') return foesOf(B,u);
  if(t==='ally') return alliesOf(B,u);
  if(t==='other') return alliesOf(B,u).filter(a=>a!==u);
  return [];
}

/* ---------- turn structure ---------- */
function startBattle(B){
  // auras and Shieldwall are settled when the fight starts
  for(const s of ['p','e']){
    const row = side(B,s);
    const rally = row.reduce((n,u)=>n+ab(u,'rally'),0), bul = row.reduce((n,u)=>n+ab(u,'bulwark'),0);
    for(const u of row){
      const own = ab(u,'rally'), ownB = ab(u,'bulwark');
      u.atk += rally - own; u.res += bul - ownB; u.hp = u.res;
      if(ab(u,'shieldwall')) u.atk += Math.floor(u.res / (4-ab(u,'shieldwall')));
      u.ward = ab(u,'ward');
    }
  }
  say(B, 'The fight begins.', 'gold');
  for(const u of B.units) if(ab(u,'sanctuary')) for(const a of alliesOf(B,u)){ a.ward += ab(u,'sanctuary'); B.ev.push({t:'ward', u:a.id, n:ab(u,'sanctuary')}); }
  for(const u of B.units) if(u.alive && ab(u,'volley') && !B.over){ const t = pickOne(foesOf(B,u)); if(t){ say(B, `${u.name} ${vb(u,'opens','open')} with a volley.`); hurt(B, u, t, 2*ab(u,'volley'), {spell:true}); } }
  checkOver(B);
  startRound(B);
}
function startRound(B){
  if(B.over) return;
  B.round++;
  B.ev.push({t:'round', n:B.round});
  for(const u of B.units){ u.acted = false; u.extra = 0; if(u.guardTmp){ u.guardTmp = false; } if(u.wardTmp){ u.ward = Math.max(0, u.ward - u.wardTmp); u.wardTmp = 0; } }
  for(const u of B.units){
    if(!u.alive) continue;
    for(const id in u.cds) if(u.cds[id]>0 && B.round>1) u.cds[id]--;
    if(ab(u,'momentum')) buffAtk(B, u, ab(u,'momentum'), 'Momentum');
    if(ab(u,'mend')){ const hurtA = alliesOf(B,u).filter(a=>a.hp<a.res).sort((a,b)=>(a.hp-a.res)-(b.hp-b.res))[0]; if(hurtA) heal(B, hurtA, ab(u,'mend')+1, u); }
  }
  B.phase = 'p';
}
function endRound(B){
  for(const u of B.units){
    if(!u.alive) continue;
    if(u.poison>0){ hurt(B, null, u, u.poison, {poison:true}); }
    if(u.alive && ab(u,'regen')) heal(B, u, ab(u,'regen'), u);
  }
  checkOver(B);
  if(!B.over && B.round>=30){ B.over = 'draw'; say(B, 'Both sides are exhausted.', 'muted'); }
  if(!B.over) startRound(B);
}
/* whose turn is it? party members act in any order the player likes; enemies in a row */
function nextActor(B, s){ return alive(B,s).find(u=>!u.acted) || alive(B,s).find(u=>u.extra>0) || null; }
function act(B, u, action){
  if(B.over || !u.alive) return;
  if(u.acted && u.extra>0) u.extra--; else u.acted = true;
  if(action.type==='attack'){ const t = B.units.find(x=>x.id===action.tgt); say(B, `${u.name} ${vb(u,'attacks','attack')} ${t.name==='You'?'you':t.name}.`); attack(B, u, t); }
  else if(action.type==='spell'){ const t = action.tgt ? B.units.find(x=>x.id===action.tgt) : null; cast(B, u, action.id, t); }
  else say(B, `${u.name} ${vb(u,'waits','wait')}.`, 'muted');
  checkOver(B);
}
/* after an action: move the battle along to the next decision */
function advance(B){
  if(B.over) return;
  if(B.phase==='p' && !nextActor(B,'p')) B.phase = 'e';
  if(B.phase==='e' && !nextActor(B,'e')){ endRound(B); }
}

/* ---------- the AI (plays enemies, and your side on Auto) ---------- */
function threat(u){ return u.atk + (u.poison?0:0) + Object.keys(u.cds).length*1.5 + ab(u,'mend')*1.5; }
function scoreAttack(B, a, t){
  const real = n=>t.ward>0 && !ab(a,'pierce') ? 0 : Math.max(0, n - (ab(a,'pierce')?0:ab(t,'armor')));
  const dmg = real(a.atk + ab(a,'frenzy')) * (ab(a,'twin')?1.6:1);
  const kills = dmg >= t.hp;
  let s = Math.min(dmg, t.hp) + (kills ? 6 + threat(t)*1.5 : 0);
  if(!ab(a,'ranged') && !(ab(a,'swift') && kills)){
    const back = Math.max(0, t.atk - ab(a,'armor')) * (a.ward>0?0:1) + ab(t,'thorns');
    if(back >= a.hp) s -= 12 + threat(a); else s -= back*.45;
  }
  if(t.ward>0 && !ab(a,'pierce')) s += 1.5;   // stripping a ward is worth something
  return s;
}
function scoreSpell(B, u, id, t){
  const l = ab(u,id), arc = ab(u,'arcane') + spellLvl(u), echo = ab(u,'echo')?1.8:1, cost = ab(u,'bloodpact') ? (u.hp<=3 ? 99 : 2.5) : 0;
  const dmgTo = (x,n)=>x.ward>0 && !ab(u,'pierce') ? 1.5 : Math.min(n - ab(x,'armor'), x.hp) + (n - ab(x,'armor') >= x.hp ? 6 + threat(x)*1.5 : 0);
  let s = 0;
  switch(id){
    case 'firebolt': s = dmgTo(t, 3+2*(l-1)+arc); break;
    case 'frost': s = dmgTo(t, 1+l+arc) + Math.min(l, t.atk)*1.2; break;
    case 'meteor': s = foesOf(B,u).reduce((n,x)=>n+dmgTo(x, 2+l+arc),0); break;
    case 'heal': { const miss = t.res - t.hp; s = miss<2 ? -1 : Math.min(miss, 3+2*(l-1)+arc)*1.15 + (t.hp<=4 ? 4 : 0); break; }
    case 'barrier': s = alliesOf(B,u).filter(a=>a.ward===0).length*2.6*l; break;
    case 'bash': s = dmgTo(t, u.hp+(l-1)+arc); break;
    case 'drain': s = dmgTo(t, 1+l+arc) + Math.min(u.res-u.hp, 1+l+arc)*.6; break;
    case 'haste': s = t.acted && !t.extra ? Math.max(...foesOf(B,u).map(x=>scoreAttack(B,t,x)), 0) + 1 : -1; break;
    case 'inspire': s = (l+1)*(2 + Math.max(0, 6-B.round)*.25) * (t.alive?1:0); break;
    case 'hex': s = Math.min(l+1, t.atk)*1.6 + (t.ward?2:0) + (ab(t,'armor')?2:0); break;
    case 'plague': s = foesOf(B,u).length * l * 1.6; break;
    case 'execute': s = t.hp <= 3+2*l+arc ? 8 + threat(t)*1.8 + t.hp*.5 : -2; break;
    case 'warcry': s = alliesOf(B,u).some(a=>a!==u && a.hp<=4) ? 5 : 1.5; break;
  }
  return s*echo - cost;
}
function bestAction(B, u){
  let best = {type:'wait', s:-1.5};
  for(const t of validTargets(B,u)){ const s = scoreAttack(B,u,t); if(s>best.s) best = {type:'attack', tgt:t.id, s}; }
  for(const id of readySpells(u)){
    const tg = AB[id].tgt;
    if(tg==='none'){ const s = scoreSpell(B,u,id,null); if(s>best.s) best = {type:'spell', id, s}; }
    else for(const t of spellTargets(B,u,id)){ const s = scoreSpell(B,u,id,t); if(s>best.s) best = {type:'spell', id, tgt:t.id, s}; }
  }
  return best;
}
/* run a whole fight with the AI on both sides */
function autoBattle(party, foes){
  const B = newBattle(party, foes); startBattle(B);
  let guard = 0;
  while(!B.over && guard++<800){
    const s = B.phase; const u = nextActor(B, s);
    if(!u){ advance(B); continue; }
    act(B, u, bestAction(B,u)); advance(B);
  }
  return B;
}

/* ---------- building a party for the simulator ---------- */
const AB_VALUE = {guard:2.5, swift:3, ranged:3, lifesteal:3, venom:2.5, thorns:1.4, ward:2.2, armor:3.2, regen:2.2, pierce:2, cleave:3, twin:6, rebirth:5,
  rally:3.5, bulwark:3.5, volley:2, sanctuary:3, mend:2.6, momentum:3.2, frenzy:2.6, enrage:2.4, bloodthirst:2.4, avenger:2, lastbreath:1.6, martyr:1.8, spellblade:1.6,
  arcane:1.6, quick:2.5, echo:6, overflow:1, bloodpact:3, shieldwall:2.5, firebolt:3.5, frost:3, meteor:4.5, heal:3.4, barrier:3, bash:3, drain:3.2, haste:3.5, inspire:3, hex:2.4, plague:3, execute:3.4, warcry:2};
const STRATS = {
  stats:{name:'Pure stats', pick:(ch,cards)=>cards.slice().sort((a,b)=>(b.atk*1.15+b.res)-(a.atk*1.15+a.res))[0]},
  abilities:{name:'Abilities first', pick:(ch,cards)=>cards.slice().sort((a,b)=>((b.ab?10:0)+'culr'.indexOf(b.rar))-((a.ab?10:0)+'culr'.indexOf(a.rar)))[0]},
  smart:{name:'Balanced', pick:(ch,cards)=>cards.slice().sort((a,b)=>cardValue(ch,b)-cardValue(ch,a))[0]},
  spells:{name:'Spellcaster', pick:(ch,cards)=>cards.slice().sort((a,b)=>spellValue(ch,b)-spellValue(ch,a))[0]},
  random:{name:'Random', pick:(ch,cards)=>pickOne(cards)}
};
function spellValue(ch, c){
  if(!c.ab) return (c.atk+c.res)*.3;
  const [id,l] = c.ab, k = AB[id].kind;
  return (k==='spell' ? 10 : ['arcane','quick','echo','spellblade','bloodpact','overflow'].includes(id) ? 9 : 2) + l + (c.atk+c.res)*.3;
}
function cardValue(ch, c){
  let v = c.atk*1.15 + c.res + (c.slots||0)*TUNE.slotValue;
  if(c.ab){ const [id,l] = c.ab, have = ab(ch,id); v += (AB_VALUE[id]||2) * l * (have ? .85 : 1); if(AB[id].kind==='spell' && ab(ch,'arcane')) v += 1; if(['arcane','quick','echo','spellblade'].includes(id)) v += Object.keys(ch.ab).filter(k=>AB[k]&&AB[k].kind==='spell').length * 1.6 - 1.5; }
  return v;
}
function buildParty(level, strat, items=true){
  const party = ['you','lina','mal'].map(makeChar);
  for(const ch of party) for(let l=2;l<=level;l++){ ch.lvl = l; const pack = openPack(ch); absorb(ch, STRATS[strat].pick(ch, pack)); }
  if(items){
    // roughly what a party picks up on the way: a start item each, then loot from fights
    const bag = []; for(let i=0;i<3;i++) bag.push(newItem(pickOne(ITEMS.filter(x=>x.rar==='c')).id));
    for(let l=2;l<=level;l++) for(let k=0;k<TUNE.lootPerLevel;k++) if(rnd()<.8){ const [it] = rollLoot(l, 1, l%5===0); if(it) bag.push(newItem(it.id)); }
    autoEquip(party, bag);
  }
  return party;
}
function simulate(strat, level, tier, n, seed, items=true){
  RNG = rngFrom(seed || 12345);
  let w=0, rounds=0, survivors=0;
  for(let i=0;i<n;i++){
    const party = buildParty(level, strat, items);
    const B = autoBattle(party, makeEncounter(tier));
    if(B.over==='win'){ w++; survivors += alive(B,'p').length; }
    rounds += B.round;
  }
  RNG = Math.random;
  return {win:w/n, rounds:rounds/n, survivors:w?survivors/w:0};
}
if(typeof module!=='undefined') module.exports = {TUNE, ITEMS, effective, rollLoot, autoEquip, AB, CARDS, HEROES, FOES, makeChar, openPack, absorb, makeEncounter, autoBattle, simulate, buildParty, STRATS, rngFrom, setRng:f=>{RNG=f;}};
