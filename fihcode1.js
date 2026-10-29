import {createClient} from '@supabase/supabase-js';

/* ================= SETTINGS ================= */
const SUPABASE_URL = 'https://ucxustzrevjlktcfsmfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DlflO5eJAotVhCv-q16Ceg_-fWZQ8Kr';
const SCALE = 22, LAND = 105, SHORE = 122;        // map units -> pixels, island sizes
const PRICE = {Sardine:4, Mackerel:7, Clownfish:10, Tuna:18, 'Golden Koi':35}; // display only, the database sets real prices
const FCOL = {Sardine:'#9fb7c9', Mackerel:'#5fa8d3', Clownfish:'#ff8c42', Tuna:'#e74c3c', 'Golden Koi':'#ffd700'};
const RARE = ['Tuna', 'Golden Koi'];
const EMO = ['👋', '🎣', '🎉', '❓'];
const BIO = {tropical:'#4caf50', reef:'#2bb6a8', mist:'#9fb7c9', beach:'#e8d27a', rocky:'#8d8d8d', remote:'#8a6bbd'};
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id), cv = $('c'), g = cv.getContext('2d');

/* ================= STATE ================= */
let me = null, st = {coins:0, xp:0, level:1, name:'Sailor'}, inv = {}, isl = [];
let ch = null, started = false, gameMode = 'multiplayer', online = {}, remotes = {}, tab = null;
let P = {x:0, y:0, a:0, boat:false, e:'', eUntil:0, say:'', sayUntil:0, n:'', c:''};
let keys = {}, fs = null, busy = false, lastFish = 0, lastChat = 0, pops = [], camx = 0, camy = 0;

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
const landAt = (x, y) => isl.some(i => Math.hypot(x - i.wx, y - i.wy) < LAND);
const here = () => isl.find(i => Math.hypot(P.x - i.wx, P.y - i.wy) < LAND);
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
$('bin').onclick = async () => { err(); const c = creds(); if (!c) return; const {error} = await sb.auth.signInWithPassword(c); if (error) err(error.message); };
$('bup').onclick = async () => {
  err(); const c = creds(); if (!c) return;
  const username = $('un').value.trim();
  if (username.length < 2) return err('Pick a username (2-20 characters).');
  const {data, error} = await sb.auth.signUp({...c, options:{data:{username}, emailRedirectTo: location.href.split('#')[0]}});
  if (error) return err(error.message);
  if (!data.session) err('Check your email to confirm your account, then sign in.');
};
$('bout').onclick = () => sb.auth.signOut();
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
    h = '<h3>Island conquest</h3><small>Stand on an island to claim it.</small>' + isl.map(i => {
      const o = i.row.owner_id, cost = i.row.claim_cost;
      const act = o ? '' : (here() === i ? `<button data-c="${i.row.id}" ${st.coins < cost ? 'disabled' : ''}>Claim</button>` : '<small>Sail there</small>');
      return `<div class="row"><span><b>${i.row.name}</b> <small>${i.row.biome}, ${cost ? cost + ' coins' : 'free'}</small><br><small>${o ? 'Owner: ' + nm(o) : 'Unclaimed'}</small></span>${act}</div>`;
    }).join('');
  }
  if (tab === 'ppl') {
    const cnt = {}; isl.forEach(i => i.row.owner_id && (cnt[i.row.owner_id] = (cnt[i.row.owner_id] || 0) + 1));
    const board = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id, n], k) => `<div class="row"><span>#${k + 1} ${nm(id)}</span><span>${n} island${n > 1 ? 's' : ''}</span></div>`).join('');
    h = '<h3>Online now</h3>' + Object.values(online).map(o => `<div class="row"><span>${o.name}</span><span>Lv ${o.lv}</span></div>`).join('')
      + '<h3>Island leaderboard</h3>' + (board || '<small>No islands claimed yet.</small>');
  }
  if (tab === 'set') h = '<h3>Settings</h3><p><small>WASD or arrows move. F cast and reel. B board or leave boat. I shop, M conquest, P players. Enter chat. 1-4 emotes.</small></p><button id="lo">Sign out</button>';
  p.innerHTML = h + '<p><button class="alt" id="cl">Close</button></p>';
}
async function sell(f, q) {
  const {data, error} = await sb.rpc('fih_sell_fish', {p_fish_type: f, p_quantity: q});
  if (error) { toast(error.message); return 0; }
  st.coins = data.coins; inv[f] -= q; return data.earned;
}
$('panel').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'cl') { tab = null; return render(); }
  if (b.id === 'lo') return sb.auth.signOut();
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

/* ================= DRAWING ================= */
function circle(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function text(s, x, y, size = 13, c = '#fff') { g.font = `bold ${size}px system-ui,sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(s, x + 1, y + 1); g.fillStyle = c; g.fillText(s, x, y); }
function drawPlayer(p, now) {
  const x = p.x - camx, y = p.y - camy;
  if (p.boat) { g.fillStyle = '#8a5a2b'; g.beginPath(); g.ellipse(x, y, 28, 16, p.a || 0, 0, 7); g.fill(); }
  circle(x, y - 4, 12, p.c); circle(x, y - 4, 6, '#ffd6a5');
  text(p.n, x, y - 26, 13);
  if (p.say && now < p.sayUntil) text(p.say, x, y - 44, 14, '#fff6c0');
  else if (p.e && now < (p.eUntil ?? now + 1)) text(p.e, x, y - 46, 22);
}
function draw(t) {
  const W = cv.width, Hh = cv.height; camx = P.x - W / 2; camy = P.y - Hh / 2;
  g.fillStyle = '#1e90c8'; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 2;
  for (let y = -(camy % 60) - 60; y < Hh; y += 60) { g.beginPath(); for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin((x + camx) / 50 + t / 700 + y) * 6); g.stroke(); }
  for (const i of isl) {
    const x = i.wx - camx, y = i.wy - camy;
    if (x < -200 || y < -200 || x > W + 200 || y > Hh + 200) continue;
    circle(x, y, SHORE, '#e8d27a'); circle(x, y, LAND - 25, BIO[i.row.biome] || '#4caf50');
    for (const p of i.palms) { circle(x + p[0], y + p[1], 15, '#2e8b3a'); circle(x + p[0], y + p[1], 5, '#8a5a2b'); }
    g.fillStyle = '#fff'; g.fillRect(x - 2, y - 40, 4, 40); g.fillStyle = flagCol(i.row.owner_id); g.fillRect(x + 2, y - 40, 26, 16);
    text(i.row.name, x, y - 52, 15);
  }
  if (fs) {                                           // fishing line and bobber
    const bx = P.x + Math.cos(P.a) * 60 - camx, by = P.y + Math.sin(P.a) * 60 - camy;
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(P.x - camx, P.y - camy); g.lineTo(bx, by); g.stroke();
    circle(bx, by, 6, fs.ph === 'bite' ? '#ff3b3b' : '#fff');
    if (fs.ph === 'bite') text('!', bx, by - 14, 26, '#ff3b3b');
  }
  const now = performance.now();
  for (const r of Object.values(remotes)) drawPlayer(r, now);
  drawPlayer({...P, e: now < P.eUntil ? P.e : ''}, now);
  pops = pops.filter(p => now - p.t < 1500);
  for (const p of pops) text(p.text, p.x - camx, p.y - camy - (now - p.t) / 25, 16, p.c);
  const mx = W - 190, my = Hh - 126, k = .055, mp = (x, y) => [mx + (x + 1500) * k, my + (y + 1100) * k];   // minimap
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(mx, my, 176, 112);
  for (const i of isl) { const [a, b] = mp(i.wx, i.wy); circle(a, b, 5, flagCol(i.row.owner_id)); }
  for (const r of Object.values(remotes)) { const [a, b] = mp(r.x, r.y); circle(a, b, 2.5, r.c); }
  const [a, b] = mp(P.x, P.y); circle(a, b, 3.5, '#fff');
}

/* ================= MAIN LOOP ================= */
let last = performance.now(), tx = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - last) / 1000, .1); last = t;
  const fx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  const fy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (fx || fy) {
    const v = (P.boat ? 300 : 170) * dt / Math.hypot(fx, fy), nx = P.x + fx * v, ny = P.y + fy * v;
    const ok = (x, y) => Math.abs(x) < 2200 && Math.abs(y) < 1500 && landAt(x, y) !== P.boat;   // boat = water only, walking = land only
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
  const T = {i:'inv', m:'map', p:'ppl'};
  if (k === 'f') cast(); if (k === 'b') boat();
  if (k === 'enter') { e.preventDefault(); $('chat').focus(); }
  if (EMO[+k - 1]) emote(+k - 1);
  if (T[k]) { tab = tab === T[k] ? null : T[k]; render(); }
  if (k === 'escape') { tab = null; render(); }
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = 0);
$('chat').onkeydown = e => { if (e.key === 'Enter') { sendChat(); $('chat').blur(); } if (e.key === 'Escape') $('chat').blur(); };
$('fish').onclick = cast; $('boat').onclick = boat;

async function startGame(mode) {
  gameMode = mode;
  $('play').disabled = true; $('solo').disabled = true; err();
  let rows;
  try { rows = await load(); }
  catch (e) { err('Could not load game data: ' + e.message); $('play').disabled = false; $('solo').disabled = false; return; }
  if (!rows.length) { err('No islands found. Check your Supabase tables and policies.'); $('play').disabled = false; $('solo').disabled = false; return; }
  isl = rows.map(row => ({row, wx: (row.x - 50) * SCALE, wy: (row.y - 50) * SCALE,
    palms: [0, 1, 2, 3, 4, 5, 6].map(k => { const a = k * 2.4 + row.x, d = 25 + (k * 37 % 45); return [Math.cos(a) * d, Math.sin(a) * d]; })}));
  const s = isl.find(i => i.row.id === 'starter-cove') || isl[0];
  P.x = s.wx; P.y = s.wy + 45; P.n = st.name; P.c = hue(me.id);
  started = true;
  $('menu').classList.add('hide'); $('hud').classList.remove('hide');
  $('chat').classList.toggle('hide', gameMode !== 'multiplayer');
  hud();
  if (gameMode === 'multiplayer') join();
  else { online = {}; remotes = {}; toast('Singleplayer mode: other players are hidden.'); }
  requestAnimationFrame(loop);
}
$('play').onclick = () => startGame('multiplayer');
$('solo').onclick = () => startGame('singleplayer');

// Export a portable backup of the player's progress and the island ownership snapshot.
$('savefile').onclick = () => {
  try {
    const payload = {
      format: 'FIH-CONQUEST-SAVE', version: 1, exportedAt: new Date().toISOString(),
      userId: me.id,
      player: {name: st.name, coins: st.coins, xp: st.xp, level: st.level, inventory: inv},
      islands: isl.map(i => ({id: i.row.id, name: i.row.name, biome: i.row.biome, x: i.row.x, y: i.row.y, claim_cost: i.row.claim_cost, owner_id: i.row.owner_id}))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fih-conquest-save.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Save file exported.');
  } catch (e) { err('Could not export save: ' + e.message); }
};
$('loadfile').onclick = () => $('saveinput').click();
$('saveinput').onchange = async e => {
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
