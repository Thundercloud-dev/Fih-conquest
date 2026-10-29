import {createClient} from '@supabase/supabase-js';

/* ================= SETTINGS ================= */
const SUPABASE_URL = 'https://ucxustzrevjlktcfsmfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DlflO5eJAotVhCv-q16Ceg_-fWZQ8Kr';
const SCALE = 28, LAND = 390, SHORE = 435; // larger landmasses; distances remain in world units
const WORLD_LIMIT_X = 1000000000, WORLD_LIMIT_Y = 1000000000;
const CHUNK_SIZE = 1900, GENERATED_ISLANDS_PER_CHUNK = 4;
const GENERATED_BIOMES = ['tropical','reef','mist','beach','rocky','remote'];
const PRICE = {Sardine:4, Mackerel:7, Clownfish:10, Tuna:18, 'Golden Koi':35}; // display only, the database sets real prices
const FCOL = {Sardine:'#9fb7c9', Mackerel:'#5fa8d3', Clownfish:'#ff8c42', Tuna:'#e74c3c', 'Golden Koi':'#ffd700'};
const RARE = ['Tuna', 'Golden Koi'];
const EMO = ['👋', '🎣', '🎉', '❓'];
const BIO = {tropical:'#4caf50', reef:'#2bb6a8', mist:'#9fb7c9', beach:'#e8d27a', rocky:'#8d8d8d', remote:'#8a6bbd'};
const FISH_CATALOG = ["Sardine","Anchovy","Herring","Sprat","Mackerel","Atlantic Mackerel","Blue Runner","Horse Mackerel","Smelt","Capelin","Minnow","Shiner","Gudgeon","Whitebait","Pilchard","Needlefish","Halfbeak","Flying Fish","Silverside","Butterfish","Clownfish","Blue Tang","Yellow Tang","Surgeonfish","Parrotfish","Damselfish","Chromis","Wrasse","Cleaner Wrasse","Butterflyfish","Angelfish","Bannerfish","Triggerfish","Pufferfish","Porcupinefish","Boxfish","Filefish","Rabbitfish","Moorish Idol","Cardinalfish","Royal Gramma","Firefish","Gobies","Blenny","Hawkfish","Dottyback","Anthias","Fusilier","Rainbowfish","Mandarinfish","Lionfish","Moray Eel","Barracuda","Grouper","Snapper","Red Snapper","Sea Bass","Tuna","Yellowfin Tuna","Albacore","Swordfish","Marlin","Sailfish","Wahoo","Mahi-Mahi","Amberjack","Trevally","Bonito","Kingfish","Cobia","Tarpon","Bonefish","Permit","Flounder","Halibut","Sole","Stingray","Eagle Ray","Reef Shark","Nurse Shark","Golden Koi","Moon Koi","Pearl Betta","Crystal Guppy","Blue Dragonfish","Ghost Lanternfish","Abyssal Anglerfish","Glasswing Butterflyfish","Prism Seahorse","Royal Lionfish","Starry Puffer","Sunset Discus","Aurora Trout","Frostfin Salmon","Ember Arowana","Crown Triggerfish","Phantom Manta","Opal Octopusfish","Sapphire Marlin","Leviathan Grouper"];
const FISH_RARITY = Object.fromEntries(FISH_CATALOG.map((name, i) => [name, i < 20 ? 'Common' : i < 50 ? 'Uncommon' : i < 80 ? 'Rare' : 'Legendary']));
const BUILDINGS = {
  mainhall: {name:'Main Hall', max:3, costs:[0,25,45], desc:'Upgrades the island settlement headquarters.'},
  cottage: {name:'Cottage', max:2, costs:[8,16], desc:'Adds homes for island residents.'},
  worker: {name:'Worker Station', max:3, costs:[12,24,40], desc:'Improves island work output.'},
  farm: {name:'Farm Station', max:3, costs:[10,20,35], desc:'A worker station focused on food.'},
  lumber: {name:'Lumber Station', max:3, costs:[10,22,38], desc:'A worker station focused on timber.'},
  mine: {name:'Mine Station', max:3, costs:[14,28,45], desc:'A worker station focused on ore.'},
  aquarium: {name:'Aquarium', max:3, costs:[18,32,50], desc:'Displays your discovered fish collection.'},
  dock: {name:'Harbor Dock', max:3, costs:[12,25,42], desc:'Expands the island harbor.'}
};
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id), cv = $('c'), g = cv.getContext('2d');

/* ================= STATE ================= */
let me = null, st = {coins:0, xp:0, level:1, name:'Sailor'}, inv = {}, isl = [];
let ch = null, started = false, gameMode = 'multiplayer', online = {}, remotes = {}, tab = null;
let P = {x:0, y:0, a:0, boat:false, e:'', eUntil:0, say:'', sayUntil:0, n:'', c:''};
let keys = {}, fs = null, busy = false, lastFish = 0, lastChat = 0, pops = [], camx = 0, camy = 0;
let development = {materials:25, buildings:{}, discovered:[]};
const devKey = () => 'fih-conquest-development-v1:' + me.id;
function saveDevelopment() { if (!me) return; try { localStorage.setItem(devKey(), JSON.stringify(development)); } catch (_) {} }
function loadDevelopment() { try { const d = JSON.parse(localStorage.getItem(devKey()) || 'null'); if (d && typeof d === 'object') development = {materials:Math.max(0, Number(d.materials)||0), buildings:d.buildings && typeof d.buildings==='object' ? d.buildings : {}, discovered:Array.isArray(d.discovered) ? d.discovered.filter(n => FISH_CATALOG.includes(n)) : []}; } catch (_) {} }
const islandBuilds = id => { const b = development.buildings[id] || (development.buildings[id] = {}); if (!Number.isFinite(b.mainhall)) b.mainhall = 1; return b; };
function discoverFish() {
  const undiscovered = FISH_CATALOG.filter(n => !development.discovered.includes(n));
  if (!undiscovered.length || Math.random() > 0.34) return null;
  const roll = Math.random();
  const wanted = roll > .97 ? 'Legendary' : roll > .78 ? 'Rare' : roll > .38 ? 'Uncommon' : 'Common';
  const pool = undiscovered.filter(n => FISH_RARITY[n] === wanted);
  const pick = (pool.length ? pool : undiscovered)[Math.floor(Math.random() * (pool.length ? pool : undiscovered).length)];
  development.discovered.push(pick); development.materials += FISH_RARITY[pick] === 'Legendary' ? 5 : FISH_RARITY[pick] === 'Rare' ? 3 : 1;
  saveDevelopment(); feed('Aquarium discovery: ' + pick + ' (' + FISH_RARITY[pick] + ')!'); return pick;
}

/* ================= HELPERS ================= */
const toast = m => { const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(t.h); t.h = setTimeout(() => t.style.opacity = 0, 2600); };
const err = m => $('err').textContent = m || '';
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const hue = id => `hsl(${hash(id) % 360},70%,55%)`;
const flagCol = o => o ? (o === me.id ? '#00e5ff' : '#ffc107') : '#cccccc';
const nm = id => id === me.id ? 'You' : (online[id]?.name || 'Another sailor');
function feed(msg) {
  const d = document.createElement('div'); d.textContent = msg; $('feed').append(d);
  while ($('feed').children.length > 7) $('feed').firstChild.remove();
  setTimeout(() => d.remove(), 15000);
}
const islandRadius = i => LAND * (i.generated ? i.size : 1);
const landAt = (x, y) => isl.some(i => Math.hypot(x - i.wx, y - i.wy) < islandRadius(i));
const islandAt = (x, y) => isl.find(i => Math.hypot(x-i.wx,y-i.wy) < islandRadius(i));
const here = () => islandAt(P.x, P.y);
// look around the player for land (want=true) or water (want=false)
const probe = (want, r) => {
  for (let d = 20; d <= r; d += 20)
    for (let a = 0; a < 6.28; a += .5) {
      const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
      if (landAt(x, y) === want) return [x, y];
    }
};

/* ================= ACCOUNTS ================= */
const creds = () => {
  const email = $('em').value.trim(), password = $('pw').value;
  if (!email || password.length < 6) { err('Enter an email and a password of 6+ characters.'); return null; }
  return {email, password};
};
if ($('bin')) $('bin').onclick = async () => { err(); const c = creds(); if (!c) return; const {error} = await sb.auth.signInWithPassword(c); if (error) err(error.message); };
if ($('bup')) $('bup').onclick = async () => {
  err(); const c = creds(); if (!c) return;
  const username = $('un').value.trim();
  if (username.length < 2) return err('Pick a username (2-20 characters).');
  const {data, error} = await sb.auth.signUp({...c, options:{data:{username}, emailRedirectTo: location.href.split('#')[0]}});
  if (error) return err(error.message);
  if (!data.session) err('Check your email to confirm your account, then sign in.');
};
if ($('bout')) $('bout').onclick = () => sb.auth.signOut();
sb.auth.onAuthStateChange((e, s) => {
  me = s?.user || null;
  if (!me && started) { location.reload(); return; }
  $('auth').classList.toggle('hide', !!me); $('ready').classList.toggle('hide', !me);
  if (me) $('who').textContent = 'Signed in as ' + me.email;
});

/* ================= SAVED PROGRESS ================= */
async function load() {
  const [p, s, i, o] = await Promise.all([
    sb.from('fih_profiles').select('username').eq('user_id', me.id).maybeSingle(),
    sb.from('fih_player_state').select('coins,xp,level').eq('user_id', me.id).maybeSingle(),
    sb.from('fih_inventory').select('fish_type,quantity').eq('user_id', me.id),
    sb.from('fih_islands').select('*').order('claim_cost'),
  ]);
  let name = p.data?.username || 'Sailor';
  const md = me.user_metadata?.username;
  if (name === 'Sailor' && md && md !== 'Sailor') { const r = await sb.rpc('fih_set_username', {p_username: md}); if (!r.error) name = md; }
  st = {...st, ...(s.data || {}), name}; inv = {};
  (i.data || []).forEach(r => inv[r.fish_type] = r.quantity);
  return o.data || [];
}
const hud = () => { $('stats').innerHTML = `<b>${st.name}</b> &nbsp; ${st.coins} coins &nbsp; Lv ${st.level} <progress max="100" value="${st.xp % 100}"></progress>`; };

/* ================= PANELS ================= */
function render() {
  const p = $('panel');
  if (!tab) { p.classList.add('hide'); return; }
  p.classList.remove('hide'); let h = '';
  if (tab === 'inv') {
    const total = Object.keys(PRICE).reduce((a, f) => a + (inv[f] || 0), 0);
    h = '<h3>Inventory &amp; Shop</h3>' + Object.keys(PRICE).map(f => {
      const q = inv[f] || 0;
      return `<div class="row"><span>${f} x${q} <small>(about ${PRICE[f]} coins each)</small></span>
        <button data-s="${f}|${q}" ${q ? '' : 'disabled'}>Sell all</button></div>`;
    }).join('') + `<p><button data-all="1" ${total ? '' : 'disabled'}>Sell every fish</button></p>`;
  }
  if (tab === 'map') {
    const settledIslands = isl.filter(i => !i.generated);
    h = '<h3>Island conquest</h3><small>Stand on a settled island to claim it. The ocean beyond them is procedurally generated for exploration.</small>' + settledIslands.map(i => {
      const o = i.row.owner_id, cost = i.row.claim_cost;
      const act = i.generated ? '<small>Uncharted · explore</small>' : (o ? '' : (here() === i ? `<button data-c="${i.row.id}" ${st.coins < cost ? 'disabled' : ''}>Claim</button>` : '<small>Sail there</small>'));
      return `<div class="row"><span><b>${i.row.name}</b> <small>${i.row.biome}, ${cost ? cost + ' coins' : 'free'}</small><br><small>${o ? 'Owner: ' + nm(o) : 'Unclaimed'}</small></span>${act}</div>`;
    }).join('');
  }
  if (tab === 'build') {
    const island = here();
    const owned = isl.filter(i => i.row.owner_id === me.id);
    h = '<h3>Island Development</h3><p><b>Materials:</b> ' + development.materials + '</p><p><small>Materials are earned by fishing and discovering new species. Buildings are saved in this browser for your account.</small></p>';
    if (!owned.length) h += '<p>Claim an island before building on it.</p>';
    else {
      if (!island || island.row.owner_id !== me.id) h += '<p><small>Travel onto one of your islands to construct or upgrade buildings.</small></p>';
      h += owned.map(i => {
        const levels = islandBuilds(i.row.id);
        const selected = island === i;
        return '<div class="row"><span><b>' + i.row.name + (selected ? ' · HERE' : '') + '</b><br><small>' + Object.entries(BUILDINGS).map(([k,b]) => b.name + ' Lv ' + (levels[k]||0)).join(' · ') + '</small></span>' + (selected ? '<span>Selected</span>' : '<small>Travel here</small>') + '</div>';
      }).join('');
      if (island && island.row.owner_id === me.id) {
        const levels = islandBuilds(island.row.id);
        h += '<h3>Construct on ' + island.row.name + '</h3>' + Object.entries(BUILDINGS).map(([key,b]) => {
          const level = levels[key] || 0, cost = b.costs[level];
          return '<div class="row"><span><b>' + b.name + '</b><br><small>Lv ' + level + '/' + b.max + ' · ' + b.desc + '</small></span><button data-build="' + key + '" ' + (level >= b.max || development.materials < cost ? 'disabled' : '') + '>' + (level >= b.max ? 'MAX' : (level ? 'Upgrade ' : 'Build ') + cost + ' mat.') + '</button></div>';
        }).join('');
      }
    }
  }
  if (tab === 'aquarium') {
    const owned = isl.filter(i => i.row.owner_id === me.id);
    const aqLevel = owned.reduce((n,i) => n + (islandBuilds(i.row.id).aquarium || 0), 0);
    const discovered = new Set(development.discovered);
    h = '<h3>Aquarium Collection</h3><p><b>Discovered:</b> ' + discovered.size + ' / ' + FISH_CATALOG.length + ' species</p><p><small>Catch fish to discover new species. Rare and legendary discoveries give extra building materials.</small></p><div class="row"><span>Common</span><b>' + FISH_CATALOG.filter(n => FISH_RARITY[n] === 'Common' && discovered.has(n)).length + ' / 20</b></div><div class="row"><span>Uncommon</span><b>' + FISH_CATALOG.filter(n => FISH_RARITY[n] === 'Uncommon' && discovered.has(n)).length + ' / 30</b></div><div class="row"><span>Rare</span><b>' + FISH_CATALOG.filter(n => FISH_RARITY[n] === 'Rare' && discovered.has(n)).length + ' / 30</b></div><div class="row"><span>Legendary</span><b>' + FISH_CATALOG.filter(n => FISH_RARITY[n] === 'Legendary' && discovered.has(n)).length + ' / 20</b></div><p><small>Aquarium levels built on your islands: ' + aqLevel + '</small></p>';
    h += FISH_CATALOG.map((name,i) => '<div class="row"><span>' + (discovered.has(name) ? '🐟 ' + name : '🔒 Unknown species #' + (i+1)) + '</span><small>' + (discovered.has(name) ? FISH_RARITY[name] : 'Not discovered') + '</small></div>').join('');
  }
  if (tab === 'fleet') {
    const owned = isl.filter(i => i.row.owner_id === me.id);
    h = '<h3>Naval Command</h3><p><small>Every island you control receives a defensive destroyer garrison.</small></p>'
      + (owned.length ? owned.map((i, n) => {
          const fleet = ['Destroyer escort', ...(owned.length >= 2 ? ['Patrol boat'] : []), ...(owned.length >= 3 ? ['Battleship support'] : [])];
          return '<div class="row"><span><b>' + i.row.name + '</b><br><small>' + fleet.join(' · ') + '</small></span><span>DEFENDED</span></div>';
        }).join('') : '<p>No islands under your flag yet. Claim territory to establish your navy.</p>')
      + '<p><small>Destroyers patrol the waters around your islands. Larger empires field more support vessels.</small></p>';
  }
  if (tab === 'ppl') {
    const cnt = {}; isl.forEach(i => i.row.owner_id && (cnt[i.row.owner_id] = (cnt[i.row.owner_id] || 0) + 1));
    const board = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id, n], k) => `<div class="row"><span>#${k + 1} ${nm(id)}</span><span>${n} island${n > 1 ? 's' : ''}</span></div>`).join('');
    h = '<h3>Online now</h3>' + Object.values(online).map(o => `<div class="row"><span>${o.name}</span><span>Lv ${o.lv}</span></div>`).join('')
      + '<h3>Island leaderboard</h3>' + (board || '<small>No islands claimed yet.</small>');
  }
  if (tab === 'set') h = '<h3>Field Manual</h3><p><small>WASD / arrows: move. B: board boat. F: fish. M: territory. N: naval command. G: develop. A: aquarium. P: players. I: supplies. Enter: chat.</small></p><button id="lo">Sign out</button>';
  p.innerHTML = h + '<p><button class="alt" id="cl">Close</button></p>';
}
async function sell(f, q) {
  const {data, error} = await sb.rpc('fih_sell_fish', {p_fish_type: f, p_quantity: q});
  if (error) { toast(error.message); return 0; }
  st.coins = data.coins; inv[f] -= q; return data.earned;
}
if ($('panel')) $('panel').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'cl') { tab = null; return render(); }
  if (b.id === 'lo') return sb.auth.signOut();
  if (b.dataset.build) {
    const island = here();
    if (!island || island.row.owner_id !== me.id) return toast('Stand on an island you own to build.');
    const key = b.dataset.build, spec = BUILDINGS[key], levels = islandBuilds(island.row.id), level = levels[key] || 0, cost = spec?.costs[level];
    if (!spec || level >= spec.max || development.materials < cost) return toast('Not enough materials or building is max level.');
    development.materials -= cost; levels[key] = level + 1; saveDevelopment();
    feed(spec.name + ' upgraded to level ' + (level + 1) + ' on ' + island.row.name + '.'); toast(spec.name + ' upgraded to Lv ' + (level + 1));
  }
  if (b.dataset.s) { const [f, q] = b.dataset.s.split('|'); const n = await sell(f, +q); if (n) toast(`Sold for ${n} coins`); }
  if (b.dataset.all) { let n = 0; for (const f of Object.keys(PRICE)) if (inv[f] > 0) n += await sell(f, inv[f]); toast(`Sold everything for ${n} coins`); }
  if (b.dataset.c) {
    const {data, error} = await sb.rpc('fih_claim_island', {p_island_id: b.dataset.c});
    if (error) return toast(error.message);
    st.coins = data.coins; setOwner(data.island_id, data.owner_id); toast('Island claimed!');
  }
  hud(); render();
};
document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = tab === b.dataset.t ? null : b.dataset.t; render(); });
function setOwner(id, o) {
  const i = isl.find(i => i.row.id === id);
  if (!i || i.row.owner_id === o) return;
  i.row.owner_id = o;
  if (o) feed(`${nm(o)} claimed ${i.row.name}!`);
  if (tab) render();
}

/* ================= ACTIONS ================= */
function boat() {
  if (!P.boat) { const p = probe(false, 80); if (!p) return toast('Walk to the shore to board your boat.'); [P.x, P.y] = p; P.boat = true; }
  else { const p = probe(true, 90); if (!p) return toast('Sail closer to an island to dock.'); [P.x, P.y] = p; P.boat = false; }
}
function cast() {                       // F: cast, then reel in when "!" shows
  if (busy) return;
  const n = performance.now();
  if (!fs) {
    if (!(P.boat || probe(false, 70))) return toast('Stand by the water or board your boat.');
    if (n - lastFish < 3000) return toast('Rod is cooling down...');
    fs = {ph:'wait', bite: n + 1000 + Math.random() * 2200}; return;
  }
  if (fs.ph === 'wait') { fs = null; return toast('Too early! The fish got spooked.'); }
  reel();
}
async function reel() {
  fs = null; busy = true;
  const {data, error} = await sb.rpc('fih_fish');
  busy = false; lastFish = performance.now();
  if (error) return toast(error.message);
  inv[data.fish] = data.quantity; st.xp = data.xp; st.level = data.level;
  development.materials += 1; discoverFish(); saveDevelopment();
  pops.push({x: P.x, y: P.y - 30, t: performance.now(), text: `+1 ${data.fish}`, c: FCOL[data.fish] || '#fff'});
  toast(`You caught a ${data.fish}! +5 XP`);
  if (RARE.includes(data.fish)) { feed(`You caught a ${data.fish}!`); ch?.send({type:'broadcast', event:'catch', payload:{id: me.id, n: st.name, f: data.fish}}); }
  ch?.track({name: st.name, lv: st.level});
  hud(); if (tab) render();
}
function emote(i) { P.e = EMO[i]; P.eUntil = performance.now() + 3000; }
function sendChat() {
  const t = $('chat').value.trim().slice(0, 80), n = performance.now(); $('chat').value = '';
  if (!t || n - lastChat < 1000) return;
  lastChat = n; P.say = t; P.sayUntil = n + 4000; feed(`${st.name}: ${t}`);
  ch?.send({type:'broadcast', event:'chat', payload:{id: me.id, n: st.name, t}});
}

/* ================= MULTIPLAYER ================= */
function join() {
  ch = sb.channel('fih-world', {config:{presence:{key: me.id}, broadcast:{self:false}}});
  ch.on('presence', {event:'sync'}, () => {
      online = {};
      for (const [id, a] of Object.entries(ch.presenceState())) online[id] = {name: a[0]?.name || 'Sailor', lv: a[0]?.lv || 1};
      for (const id in remotes) if (!online[id]) delete remotes[id];
      if (tab) render();
    })
    .on('broadcast', {event:'pos'}, ({payload: d}) => {
      if (d.id === me.id) return;
      let r = remotes[d.id];
      if (!r) r = remotes[d.id] = {x: d.x, y: d.y, c: hue(d.id), say: '', sayUntil: 0};
      Object.assign(r, {tx: d.x, ty: d.y, a: d.a, boat: !!d.b, e: String(d.e || '').slice(0, 4), n: String(d.n).slice(0, 16), seen: performance.now()});
    })
    .on('broadcast', {event:'chat'}, ({payload: d}) => {
      if (d.id === me.id) return;
      const t = String(d.t).slice(0, 80); feed(`${String(d.n).slice(0, 16)}: ${t}`);
      const r = remotes[d.id]; if (r) { r.say = t; r.sayUntil = performance.now() + 4000; }
    })
    .on('broadcast', {event:'catch'}, ({payload: d}) => { if (d.id !== me.id && RARE.includes(d.f)) feed(`${String(d.n).slice(0, 16)} caught a ${d.f}!`); })
    .on('postgres_changes', {event:'UPDATE', schema:'public', table:'fih_islands'}, p => setOwner(p.new.id, p.new.owner_id))
    .subscribe(s => {
      if (s === 'SUBSCRIBED') ch.track({name: st.name, lv: st.level});
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { toast('Connection lost, reconnecting...'); setTimeout(() => { sb.removeChannel(ch); join(); }, 3000); }
    });
}


/* ================= PROCEDURAL WORLD =================
   Seeded chunks are generated locally around the player. Existing Supabase islands
   remain the shared/claimable starter locations; generated islands are personal
   exploration landforms until a server-side world table is added. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function chunkSeed(cx, cy) { return (Math.imul(cx + 12000, 73856093) ^ Math.imul(cy + 12000, 19349663) ^ 0x51F1C0DE) >>> 0; }
function ensureWorldAround(x, y) {
  const cx = Math.floor(x / CHUNK_SIZE), cy = Math.floor(y / CHUNK_SIZE);
  const radius = 2;
  for (let dx=-radius; dx<=radius; dx++) for (let dy=-radius; dy<=radius; dy++) {
    const gx=cx+dx, gy=cy+dy;
    if (Math.abs(gx*CHUNK_SIZE) > WORLD_LIMIT_X || Math.abs(gy*CHUNK_SIZE) > WORLD_LIMIT_Y) continue;
    const key = 'gen:' + gx + ':' + gy;
    if (isl.some(i => i.worldKey === key)) continue;
    const rand = seededRandom(chunkSeed(gx,gy));
    for (let n=0; n<GENERATED_ISLANDS_PER_CHUNK; n++) {
      const wx = gx*CHUNK_SIZE + (rand()-.5)*CHUNK_SIZE*.8;
      const wy = gy*CHUNK_SIZE + (rand()-.5)*CHUNK_SIZE*.8;
      if (isl.some(i => Math.hypot(i.wx-wx,i.wy-wy) < 900)) continue;
      const biome = GENERATED_BIOMES[Math.floor(rand()*GENERATED_BIOMES.length)];
      const size = .75 + rand()*.9;
      const seed = Math.floor(rand()*1e9);
      isl.push({key:key+':'+n,worldKey:key,row:{id:key+':'+n,name:['Driftwood Isle','Northwind Reach','Silver Shoal','Whisper Cay','Stormglass Key','Tidewatch','Seafarer’s Rest','Bluehaven'][Math.floor(rand()*8)],biome,x:wx,y:wy,claim_cost:0,owner_id:null,generated:true},wx,wy,generated:true,size,seed,palms:[]});
    }
  }
  // Keep only nearby procedural chunks loaded; distant terrain regenerates deterministically when revisited.
  isl = isl.filter(i => !i.generated || (Math.abs(i.wx-x) <= CHUNK_SIZE*4 && Math.abs(i.wy-y) <= CHUNK_SIZE*4));
}
function shapeIsland(i, x, y, now) {
  const r = islandRadius(i), seed = i.seed || hash(i.row.id || i.key || i.row.name);
  const points = 18, noise = (a) => 1 + .085*Math.sin(a*3+seed*.001) + .055*Math.cos(a*5+seed*.0007) + .035*Math.sin(a*9+seed*.002);
  g.beginPath();
  for (let n=0;n<=points;n++) {
    const a=n/points*Math.PI*2, d=r*noise(a), px=x+Math.cos(a)*d, py=y+Math.sin(a)*d*.78;
    if (n===0) g.moveTo(px,py); else g.lineTo(px,py);
  }
  g.closePath();
}

/* ================= DRAWING ================= */
function circle(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function text(s, x, y, size = 13, c = '#fff') { g.font = `bold ${size}px system-ui,sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(s, x + 1, y + 1); g.fillStyle = c; g.fillText(s, x, y); }
function drawPlayer(p, now) {
  const x = p.x - camx, y = p.y - camy;
  // Wooden rowboat with rim, planks, seat and a small paddle.
  if (p.boat) {
    g.save(); g.translate(x, y); g.rotate(p.a || 0);
    g.fillStyle = '#5a351e'; g.beginPath(); g.ellipse(0, 7, 31, 17, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a96d35'; g.beginPath(); g.ellipse(0, 4, 27, 13, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6b401f'; g.lineWidth = 2;
    for (let py = -7; py <= 9; py += 7) { g.beginPath(); g.moveTo(-18, py); g.lineTo(18, py); g.stroke(); }
    g.fillStyle = '#e7c18a'; g.fillRect(-7, -4, 14, 4);
    g.strokeStyle = '#e9dfb4'; g.lineWidth = 3; g.beginPath(); g.moveTo(17, 13); g.lineTo(32, 21); g.stroke();
    g.restore();
  }
  // Shadow, boots and legs.
  circle(x, y + 10, 14, 'rgba(0,0,0,.22)');
  g.strokeStyle = '#26384a'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - 4, y + 1); g.lineTo(x - 5, y + 10); g.moveTo(x + 4, y + 1); g.lineTo(x + 6, y + 10); g.stroke();
  g.strokeStyle = '#3a2a20'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(x - 5, y + 10); g.lineTo(x - 8, y + 11); g.moveTo(x + 6, y + 10); g.lineTo(x + 9, y + 11); g.stroke();
  // Arms and shirt.
  g.strokeStyle = '#d99d70'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x - 13, y); g.moveTo(x + 8, y - 8); g.lineTo(x + 13, y); g.stroke();
  g.fillStyle = p.c || '#277ac4'; g.beginPath(); g.roundRect(x - 9, y - 13, 18, 18, 5); g.fill();
  g.fillStyle = 'rgba(255,255,255,.24)'; g.fillRect(x - 5, y - 11, 3, 12);
  // Neck and face.
  g.fillStyle = '#c9875b'; g.fillRect(x - 3, y - 16, 6, 5);
  g.fillStyle = '#f0bd8f'; g.beginPath(); g.ellipse(x, y - 20, 8, 9, 0, 0, Math.PI * 2); g.fill();
  // Hair cap and fringe.
  g.fillStyle = '#4a2c1d'; g.beginPath(); g.arc(x, y - 23, 8, Math.PI, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x - 8, y - 23); g.quadraticCurveTo(x - 2, y - 30, x + 1, y - 22); g.quadraticCurveTo(x + 5, y - 26, x + 8, y - 22); g.fill();
  // Eyes, brows and smile.
  g.fillStyle = '#2c201b'; circle(x - 3, y - 20, 1.1, '#2c201b'); circle(x + 3, y - 20, 1.1, '#2c201b');
  g.strokeStyle = '#8b4b36'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y - 17, 2.5, .2, Math.PI - .2); g.stroke();
  text(p.n, x, y - 38, 13);
  if (p.say && now < p.sayUntil) text(p.say, x, y - 55, 14, '#fff6c0');
  else if (p.e && now < (p.eUntil ?? now + 1)) text(p.e, x, y - 56, 22);
  g.restore();
}
function drawWarship(x, y, type, color, angle) {
  g.save(); g.translate(x, y); g.rotate(angle || 0);
  const length = type === 'battleship' ? 36 : type === 'destroyer' ? 29 : 21;
  g.fillStyle = '#1e2529'; g.beginPath();
  g.moveTo(-length, -5); g.lineTo(length - 5, -5); g.lineTo(length, 0); g.lineTo(length - 7, 6); g.lineTo(-length + 4, 6); g.closePath(); g.fill();
  g.fillStyle = color; g.fillRect(-length + 5, -3, length * 1.35, 5);
  g.fillStyle = '#c6c7bb'; g.fillRect(-5, -8, 13, 7);
  g.fillStyle = '#4a5458'; g.fillRect(-1, -13, 3, 5);
  g.strokeStyle = '#d6d4c7'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(5, -6); g.lineTo(13, -11); g.stroke();
  g.restore();
}
// A wooden rod, metal guides, a small reel and a taut line from its tip.
function drawFishingRod(x, y, angle, casting, now) {
  g.save(); g.translate(x, y); g.rotate(angle || 0);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(4, -5); g.lineTo(27, -19); g.stroke();
  g.strokeStyle = '#8c5b32'; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(3, -7); g.quadraticCurveTo(17, -14, 29, -23); g.stroke();
  g.strokeStyle = '#d6b17a'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(7, -10); g.lineTo(26, -21); g.stroke();
  for (const [gx, gy] of [[12,-12],[20,-17],[27,-22]]) {
    g.fillStyle = '#c9d0c6'; g.beginPath(); g.arc(gx, gy, 2, 0, Math.PI*2); g.fill();
  }
  g.fillStyle = '#b8b9ad'; g.beginPath(); g.ellipse(5,-5,4,5,-.4,0,Math.PI*2); g.fill();
  g.fillStyle = '#394a4c'; g.beginPath(); g.arc(5,-5,2,0,Math.PI*2); g.fill();
  g.restore();
  if (casting) {
    const tipX = x + Math.cos(angle) * 29 + Math.sin(angle) * 23;
    const tipY = y + Math.sin(angle) * 29 - Math.cos(angle) * 23;
    const bobX = x + Math.cos(angle) * 88, bobY = y + Math.sin(angle) * 88 + 12;
    g.strokeStyle = 'rgba(240,246,231,.88)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(tipX, tipY); g.quadraticCurveTo((tipX+bobX)/2, (tipY+bobY)/2-9, bobX, bobY); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.42)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(bobX,bobY+2,10+Math.sin(now/180)*2,3,0,0,Math.PI*2); g.stroke();
    g.fillStyle = '#dce6d7'; g.beginPath(); g.ellipse(bobX,bobY,3.5,5,.15,0,Math.PI*2); g.fill();
    g.fillStyle = casting && fs?.ph === 'bite' ? '#ff5b4d' : '#e6c65f';
    g.beginPath(); g.arc(bobX,bobY-2,3.3,0,Math.PI*2); g.fill();
    if (casting && fs?.ph === 'bite') {
      g.strokeStyle = '#fff4cf'; g.lineWidth = 2;
      g.beginPath(); g.arc(bobX,bobY-2,8+Math.sin(now/45)*2,0,Math.PI*2); g.stroke();
    }
  }
}
// Small settlement and harbor details make claimed islands read like territories.
function drawIslandSettlement(x, y, ownerId, hallLevel = 1, radius = LAND) {
  const owned = !!ownerId;
  const flag = flagCol(ownerId);
  // A low-contrast territorial boundary follows the island's interior coast.
  if (owned) {
    g.save();
    g.strokeStyle = flag;
    g.globalAlpha = ownerId === me?.id ? 0.72 : 0.48;
    g.lineWidth = 3;
    g.setLineDash([9, 7]);
    g.beginPath(); g.arc(x, y, radius - 34, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.restore();
  }
  // Main hall and two cottages, drawn as tiny top-down buildings.
  const scale = radius / 155;
  g.save(); g.translate(x,y); g.scale(scale,scale); g.translate(-x,-y);
  const buildings = [[-20, 12, 17, 13], [4, 2, 13, 11], [17, 21, 12, 10]];
  for (let n = 0; n < buildings.length; n++) {
    const [bx, by, bw, bh] = buildings[n];
    g.fillStyle = 'rgba(32,31,25,.42)'; g.fillRect(x + bx - 2, y + by + 2, bw + 4, bh + 3);
    g.fillStyle = n === 0 && owned ? '#d8c46a' : '#d8c3a0';
    g.fillRect(x + bx, y + by, bw, bh);
    g.fillStyle = '#6b4530';
    g.beginPath(); g.moveTo(x + bx - 2, y + by + 2); g.lineTo(x + bx + bw / 2, y + by - 5); g.lineTo(x + bx + bw + 2, y + by + 2); g.closePath(); g.fill();
    g.fillStyle = '#5b4532'; g.fillRect(x + bx + bw / 2 - 2, y + by + bh - 6, 4, 6);
  }
  // A short wooden pier at the east coast, with a small mooring post.
  g.save(); g.translate(x + 103, y + 28); g.rotate(-0.22);
  g.fillStyle = '#76502e'; g.fillRect(-3, -8, 42, 15);
  g.strokeStyle = '#bd8a52'; g.lineWidth = 2;
  for (let px = 2; px < 37; px += 8) { g.beginPath(); g.moveTo(px, -7); g.lineTo(px, 6); g.stroke(); }
  g.fillStyle = '#4a3927'; g.fillRect(34, -12, 5, 23);
  g.restore();
}

function draw(t) {
  const W = cv.width, Hh = cv.height; camx = P.x - W / 2; camy = P.y - Hh / 2;
  ensureWorldAround(P.x,P.y);
  g.fillStyle = '#1e90c8'; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 2;
  for (let y = -(camy % 60) - 60; y < Hh; y += 60) { g.beginPath(); for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin((x + camx) / 50 + t / 700 + y) * 6); g.stroke(); }
  // Slightly angled map presentation gives the world a subtle tabletop feel.
  g.save(); g.translate(W / 2, Hh / 2); g.rotate(-0.018); g.translate(-W / 2, -Hh / 2);
  for (const i of isl) {
    const x = i.wx - camx, y = i.wy - camy;
    const r = islandRadius(i); if (x < -r-100 || y < -r-100 || x > W + r+100 || y > Hh + r+100) continue;
    const radius = islandRadius(i);
    shapeIsland(i,x,y,t); g.fillStyle = '#e8d27a'; g.fill();
    g.save(); shapeIsland(i,x,y,t); g.clip();
    g.fillStyle = BIO[i.row.biome] || '#4caf50'; g.fillRect(x-radius-2,y-radius-2,radius*2+4,radius*2+4);
    // Terrain patches create visual variety across much larger islands.
    const rng = seededRandom(i.seed || hash(i.row.id || i.key || i.row.name));
    for (let patch=0;patch<30;patch++) {
      const px=x+(rng()-.5)*radius*1.65, py=y+(rng()-.5)*radius*1.35, pr=8+rng()*radius*.12;
      circle(px,py,pr, patch%3===0?'rgba(230,213,135,.20)':patch%3===1?'rgba(35,99,52,.22)':'rgba(255,255,255,.07)');
    }
    g.restore();
    // Inner coastline highlights the shore against the ocean.
    g.save(); shapeIsland(i,x,y,t); g.strokeStyle='rgba(255,245,185,.8)'; g.lineWidth=5; g.stroke(); g.restore();
    const levels = islandBuilds(i.row.id);
    if (!i.generated) drawIslandSettlement(x, y, i.row.owner_id, levels.mainhall || 1, radius);
    if (!i.generated) text('H' + (levels.mainhall || 1), x - 12, y + 43, 9, '#fff4bf');
    if (!i.generated && (levels.worker || levels.farm || levels.lumber || levels.mine)) {
      const stations = [['worker',-48,48,'#d6c08b'],['farm',-72,20,'#7fbf68'],['lumber',-63,69,'#a96d35'],['mine',-40,87,'#8e9698']];
      for (const [key,bx,by,col] of stations) if (levels[key]) {
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x+bx-2,y+by+3,21,15);
        g.fillStyle = col; g.fillRect(x+bx,y+by,17,12);
        g.fillStyle = '#493b2c'; g.beginPath(); g.moveTo(x+bx-2,y+by+2); g.lineTo(x+bx+8,y+by-5); g.lineTo(x+bx+19,y+by+2); g.closePath(); g.fill();
        text('Lv'+levels[key],x+bx+8,y+by+23,8,'#fff6ce');
      }
    }
    if (!i.generated && levels.cottage) {
      for (let n=0;n<levels.cottage;n++) {
        const bx = 34 + n*19, by = -16 + n*10;
        g.fillStyle = '#d8c3a0'; g.fillRect(x+bx,y+by,13,10);
        g.fillStyle = '#6b4530'; g.beginPath(); g.moveTo(x+bx-2,y+by+2); g.lineTo(x+bx+6,y+by-4); g.lineTo(x+bx+15,y+by+2); g.closePath(); g.fill();
      }
    }
    if (!i.generated && levels.aquarium) {
      g.fillStyle = '#74d5e8'; g.fillRect(x+47,y+37,25,17);
      g.strokeStyle = '#e0f5f5'; g.lineWidth = 2; g.strokeRect(x+47,y+37,25,17);
      g.fillStyle = '#1e6b8a'; g.fillRect(x+50,y+40,19,11);
      g.fillStyle = '#ffcf5b'; g.beginPath(); g.ellipse(x+57,y+45,4,2,0,0,Math.PI*2); g.fill();
      text('A'+levels.aquarium,x+59,y+64,9,'#fff');
    }
    if (!i.generated && levels.dock) {
      g.fillStyle = '#9c6a3a'; g.fillRect(x+105,y+34,12+levels.dock*5,9);
      text('D'+levels.dock,x+116,y+54,9,'#fff');
    }
    if (!i.palms.length) {
      const rng = seededRandom(i.seed || hash(i.row.id || i.key || i.row.name));
      const count = i.generated ? 25 + Math.floor(rng()*40) : 12;
      for(let n=0;n<count;n++) {
        const a=rng()*Math.PI*2, d=Math.sqrt(rng())*radius*.78;
        i.palms.push([Math.cos(a)*d,Math.sin(a)*d*.76]);
      }
    }
    for (const p of i.palms) {
      const treeScale = i.generated ? .7 + (i.seed%5)*.08 : 1;
      circle(x+p[0],y+p[1],(i.generated?11:15)*treeScale,'#26733b');
      circle(x+p[0]-2,y+p[1]-2,(i.generated?7:9)*treeScale,'#3d9948');
      circle(x+p[0],y+p[1],3*treeScale,'#8a5a2b');
    }
    if (!i.generated && i.row.owner_id) {
      const ownerColor = i.row.owner_id === me.id ? '#d8c46a' : '#a95a50';
      drawWarship(x + radius*.58, y + radius*.40, 'destroyer', ownerColor, -0.35);
      const ownedCount = isl.filter(q => q.row.owner_id === i.row.owner_id).length;
      if (ownedCount >= 2) drawWarship(x - radius*.58, y + radius*.48, 'patrol', ownerColor, 0.3);
      if (ownedCount >= 3) drawWarship(x + radius*.05, y + radius*.72, 'battleship', ownerColor, -0.15);
    }
    g.fillStyle = '#fff'; g.fillRect(x - 2, y - 40, 4, 40); g.fillStyle = flagCol(i.row.owner_id); g.fillRect(x + 2, y - 40, 26, 16);
    text(i.row.name, x, y - radius - 15, i.generated ? 12 : 15);
  }
  const now = performance.now();
  for (const r of Object.values(remotes)) drawPlayer(r, now);
  drawPlayer({...P, e: now < P.eUntil ? P.e : ''}, now);
  // Keep the rod visible in the player's hand; cast line and float animate when fishing.
  drawFishingRod(P.x - camx, P.y - camy, P.a, !!fs, now);
  g.restore();
  pops = pops.filter(p => now - p.t < 1500);
  for (const p of pops) text(p.text, p.x - camx, p.y - camy - (now - p.t) / 25, 16, p.c);
  const mx = W - 190, my = Hh - 126, k = .055, mp = (x, y) => [mx + (x + 1500) * k, my + (y + 1100) * k];   // minimap
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(mx, my, 176, 112);
  for (const i of isl) { const [a, b] = mp(i.wx, i.wy); circle(a, b, 5, flagCol(i.row.owner_id)); }
  for (const r of Object.values(remotes)) { const [a, b] = mp(r.x, r.y); circle(a, b, 2.5, r.c); }
  const [a, b] = mp(P.x, P.y); circle(a, b, 3.5, '#fff');
}

/* ================= LOCAL SAVE ================= */
const saveKey = () => 'fih-conquest-save-v1:' + me.id;
function saveLocal(showToast = true) {
  if (!me || !started) return;
  try {
    const snapshot = {
      format: 'FIH-CONQUEST-LOCAL', version: 1, savedAt: new Date().toISOString(),
      userId: me.id, mode: gameMode,
      player: {x:P.x, y:P.y, a:P.a, boat:P.boat, coins:st.coins, xp:st.xp, level:st.level, name:st.name, inventory:inv},
      islands: isl.map(i => ({id:i.row.id, owner_id:i.row.owner_id}))
    };
    localStorage.setItem(saveKey(), JSON.stringify(snapshot));
    if (showToast) toast('Game saved on this browser!');
  } catch (e) { if (showToast) toast('Save failed: browser storage may be full.'); }
}
function restoreLocal() {
  try {
    const raw = localStorage.getItem(saveKey()); if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.format !== 'FIH-CONQUEST-LOCAL' || data.version !== 1 || data.userId !== me.id || !data.player) return false;
    const p = data.player;
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) { P.x=p.x; P.y=p.y; }
    if (Number.isFinite(p.a)) P.a=p.a;
    P.boat=!!p.boat;
    return true;
  } catch (_) { return false; }
}
if ($('savegame')) $('savegame').onclick = () => saveLocal(true);
addEventListener('beforeunload', () => { saveLocal(false); saveDevelopment(); });

/* ================= MAIN LOOP ================= */
let last = performance.now(), tx = 0, lastAutoSave = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - last) / 1000, .1); last = t;
  const fx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  const fy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (fx || fy) {
    const v = (P.boat ? 300 : 170) * dt / Math.hypot(fx, fy), nx = P.x + fx * v, ny = P.y + fy * v;
    const ok = (x, y) => Math.abs(x) < WORLD_LIMIT_X && Math.abs(y) < WORLD_LIMIT_Y && landAt(x, y) !== P.boat;   // boat = water only, walking = land only
    if (ok(nx, ny)) { P.x = nx; P.y = ny; } else if (ok(nx, P.y)) P.x = nx; else if (ok(P.x, ny)) P.y = ny;
    P.a = Math.atan2(fy, fx);
  }
  if (fs) {
    if (fs.ph === 'wait' && t >= fs.bite) { fs.ph = 'bite'; fs.end = t + 900; }
    else if (fs.ph === 'bite' && t > fs.end) { fs = null; toast('It got away!'); }
  }
  for (const [id, r] of Object.entries(remotes)) {
    if (t - r.seen > 6000) { delete remotes[id]; continue; }
    r.x += (r.tx - r.x) * .2; r.y += (r.ty - r.y) * .2;
  }
  if (started && t - lastAutoSave > 15000) { saveLocal(false); saveDevelopment(); lastAutoSave = t; }
  if (ch && t - tx > ((fx || fy) ? 125 : 1000)) {     // about 8 updates a second while moving, 1 a second when idle
    tx = t;
    ch.send({type:'broadcast', event:'pos', payload:{id: me.id, n: st.name, x: Math.round(P.x), y: Math.round(P.y), a: +P.a.toFixed(2), b: P.boat, e: t < P.eUntil ? P.e : ''}});
  }
  draw(t);
}

/* ================= INPUT + START ================= */
const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
addEventListener('resize', fit); fit();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || !started) return;
  const k = e.key.toLowerCase(); keys[k] = 1;
  const T = {i:'inv', m:'map', p:'ppl', n:'fleet', g:'build', a:'aquarium'};
  if (k === 'f') cast(); if (k === 'b') boat();
  if (k === 'enter') { e.preventDefault(); $('chat').focus(); }
  if (EMO[+k - 1]) emote(+k - 1);
  if (T[k]) { tab = tab === T[k] ? null : T[k]; render(); }
  if (k === 'escape') { tab = null; render(); }
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = 0);
if ($('chat')) $('chat').onkeydown = e => { if (e.key === 'Enter') { sendChat(); $('chat').blur(); } if (e.key === 'Escape') $('chat').blur(); };
if ($('fish')) $('fish').onclick = cast; if ($('boat')) $('boat').onclick = boat;

async function startGame(mode) {
  gameMode = mode;
  $('play').disabled = true; $('solo').disabled = true; err();
  let rows;
  try { rows = await load(); }
  catch (e) { err('Could not load game data: ' + e.message); $('play').disabled = false; $('solo').disabled = false; return; }
  if (!rows.length) { err('No islands found. Check your Supabase tables and policies.'); $('play').disabled = false; $('solo').disabled = false; return; }
  isl = rows.map(row => ({key:row.id,row,wx:(row.x-50)*SCALE,wy:(row.y-50)*SCALE,seed:hash(row.id),generated:false,palms:[0,1,2,3,4,5,6].map(k=>{const a=k*2.4+row.x,d=25+(k*37%45);return [Math.cos(a)*d,Math.sin(a)*d];})}));
  ensureWorldAround(0,0);
  const s = isl.find(i => i.row.id === 'starter-cove') || isl[0];
  P.x = s.wx; P.y = s.wy + 45; P.n = st.name; P.c = hue(me.id);
  loadDevelopment();
  const hadSave = restoreLocal();
  started = true;
  $('menu').classList.add('hide'); $('hud').classList.remove('hide');
  $('chat').classList.toggle('hide', gameMode !== 'multiplayer');
  hud();
  if (gameMode === 'multiplayer') join();
  else { online = {}; remotes = {}; toast('Singleplayer mode: other players are hidden.'); }
  if (hadSave) toast('Previous position restored. Press Save Game to save anytime.');
  requestAnimationFrame(loop);
}
if ($('play')) $('play').onclick = () => startGame('multiplayer');
if ($('solo')) $('solo').onclick = () => startGame('singleplayer');

// Export a portable backup of the player's progress and the island ownership snapshot.
if ($('savefile')) $('savefile').onclick = async () => {
  try {
    const rows = await load();
    if (!rows.length) throw new Error('Could not load island data for this save.');
    const payload = {
      format: 'FIH-CONQUEST-SAVE', version: 1, exportedAt: new Date().toISOString(),
      userId: me.id,
      player: {name: st.name, coins: st.coins, xp: st.xp, level: st.level, inventory: inv},
      islands: rows.map(row => ({id: row.id, name: row.name, biome: row.biome, x: row.x, y: row.y, claim_cost: row.claim_cost, owner_id: row.owner_id}))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fih-conquest-save.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Save file exported.');
  } catch (e) { err('Could not export save: ' + e.message); }
};
if ($('loadfile')) $('loadfile').onclick = () => $('saveinput').click();
if ($('saveinput')) $('saveinput').onchange = async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== 'FIH-CONQUEST-SAVE' || data.version !== 1 || data.userId !== me.id || !data.player || !Array.isArray(data.islands))
      throw new Error('Invalid save file or it belongs to another account.');
    const cloudRows = await load();
    if (!cloudRows.length) throw new Error('Could not verify your online island data.');
    toast('Backup verified. Your online account remains the source of truth.');
    feed('Save file checked: ' + data.islands.length + ' islands in the backup.');
  } catch (ex) { err('Could not import save file: ' + ex.message); }
  e.target.value = '';
};
