import * as THREE from 'three';
import {createClient} from '@supabase/supabase-js';

/* ================= SETTINGS ================= */
const SUPABASE_URL = 'https://ucxustzrevjlktcfsmfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DlflO5eJAotVhCv-q16Ceg_-fWZQ8Kr';
const SCALE = 7;      // island map units -> world units
const RADIUS = 26;    // island size
const PRICE = {Sardine:4, Mackerel:7, Clownfish:10, Tuna:18, 'Golden Koi':35}; // display only, the database sets real prices

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

/* ================= GAME STATE ================= */
let me = null, st = {coins:0, xp:0, level:1, name:'Sailor'}, inv = {}, isl = [];
let ch = null, started = false, online = {}, remotes = {}, tab = null;
let scene, cam, rd, pl, boatOn = false, yaw = 0, pitch = .45, dist = 14, keys = {}, busy = false;

/* ================= HELPERS ================= */
const toast = m => {
  const t = $('toast');
  t.textContent = m; t.style.opacity = 1;
  clearTimeout(t.h); t.h = setTimeout(() => t.style.opacity = 0, 2800);
};
const err = m => $('err').textContent = m || '';
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const col = id => new THREE.Color().setHSL(hash(id) % 360 / 360, .7, .55);
const flagCol = o => o ? (o === me.id ? 0x00e5ff : 0xffc107) : 0xcccccc;
// ground height at a point: 0 = open water, 0.4+ = walkable land
const H = (x, z) => {
  let h = 0;
  for (const i of isl) {
    const d = Math.hypot(x - i.wx, z - i.wz);
    if (d < RADIUS) h = Math.max(h, Math.min(1.6, (RADIUS - d) * .25));
  }
  return h;
};

/* ================= ACCOUNTS ================= */
const creds = () => {
  const email = $('em').value.trim(), password = $('pw').value;
  if (!email || password.length < 6) { err('Enter an email and a password of 6+ characters.'); return null; }
  return {email, password};
};
$('bin').onclick = async () => {
  err(); const c = creds(); if (!c) return;
  const {error} = await sb.auth.signInWithPassword(c);
  if (error) err(error.message);
};
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
  $('auth').classList.toggle('hide', !!me);
  $('ready').classList.toggle('hide', !me);
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
  if (name === 'Sailor' && md && md !== 'Sailor') {
    const r = await sb.rpc('fih_set_username', {p_username: md});
    if (!r.error) name = md;
  }
  st = {...st, ...(s.data || {}), name};
  inv = {};
  (i.data || []).forEach(r => inv[r.fish_type] = r.quantity);
  return o.data || [];
}
const hud = () => { $('stats').innerHTML = `<b>${st.name}</b> &nbsp; ${st.coins} coins &nbsp; Lv ${st.level} &nbsp; ${st.xp} XP`; };

/* ================= PANELS ================= */
const nm = id => id === me.id ? 'You' : (online[id]?.name || 'Another sailor');

function render() {
  const p = $('panel');
  if (!tab) { p.classList.add('hide'); return; }
  p.classList.remove('hide');
  let h = '';
  if (tab === 'inv') {
    h = '<h3>Inventory &amp; Shop</h3>' + Object.keys(PRICE).map(f => {
      const q = inv[f] || 0;
      return `<div class="row"><span>${f} x${q} <small>(about ${PRICE[f]} coins each)</small></span>
        <span><button data-s="${f}|1" ${q ? '' : 'disabled'}>Sell 1</button>
        <button class="alt" data-s="${f}|${q}" ${q ? '' : 'disabled'}>Sell all</button></span></div>`;
    }).join('');
  }
  if (tab === 'map') {
    h = '<h3>Island conquest</h3>' + isl.map(i => {
      const o = i.row.owner_id;
      return `<div class="row"><span><b>${i.row.name}</b> <small>${i.row.biome}, ${i.row.claim_cost ? i.row.claim_cost + ' coins' : 'free'}</small><br>
        <small>${o ? 'Owner: ' + nm(o) : 'Unclaimed'}</small></span>
        ${o ? '' : `<button data-c="${i.row.id}" ${st.coins < i.row.claim_cost ? 'disabled' : ''}>Claim</button>`}</div>`;
    }).join('');
  }
  if (tab === 'ppl') {
    const cnt = {};
    isl.forEach(i => i.row.owner_id && (cnt[i.row.owner_id] = (cnt[i.row.owner_id] || 0) + 1));
    const board = Object.entries(cnt).sort((a, b) => b[1] - a[1])
      .map(([id, n], k) => `<div class="row"><span>#${k + 1} ${nm(id)}</span><span>${n} island${n > 1 ? 's' : ''}</span></div>`).join('');
    h = '<h3>Online now</h3>' + Object.values(online).map(o => `<div class="row">${o.name}</div>`).join('')
      + '<h3>Island leaderboard</h3>' + (board || '<small>No islands claimed yet.</small>');
  }
  if (tab === 'set') {
    h = '<h3>Settings</h3><p><small>WASD move, drag mouse to look, scroll to zoom. F fish, B board or leave boat, I shop, M conquest, P players.</small></p><button id="lo">Sign out</button>';
  }
  p.innerHTML = h + '<p><button class="alt" id="cl">Close</button></p>';
}

$('panel').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'cl') { tab = null; return render(); }
  if (b.id === 'lo') return sb.auth.signOut();
  if (b.dataset.s) {
    const [f, q] = b.dataset.s.split('|');
    const {data, error} = await sb.rpc('fih_sell_fish', {p_fish_type: f, p_quantity: +q});
    if (error) return toast(error.message);
    st.coins = data.coins; inv[f] -= +q; toast(`Sold for ${data.earned} coins`);
  }
  if (b.dataset.c) {
    const {data, error} = await sb.rpc('fih_claim_island', {p_island_id: b.dataset.c});
    if (error) return toast(error.message);
    st.coins = data.coins; setOwner(data.island_id, data.owner_id); toast('Island claimed!');
  }
  hud(); render();
};
document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = tab === b.dataset.t ? null : b.dataset.t; render(); });

function setOwner(id, o) {
  const i = isl.find(i => i.row.id === id); if (!i) return;
  i.row.owner_id = o;
  i.flag.material.color.set(flagCol(o));
  if (tab) render();
}

/* ================= 3D WORLD ================= */
function label(t) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px system-ui,sans-serif'; x.textAlign = 'center';
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 8, 256, 48);
  x.fillStyle = '#fff'; x.fillText(t, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), depthTest: false}));
  s.scale.set(8, 2, 1);
  return s;
}
const M = (g, c) => new THREE.Mesh(g, new THREE.MeshStandardMaterial({color: c, flatShading: true}));

function makeChar(c) {
  const g = new THREE.Group();
  const body = M(new THREE.CylinderGeometry(.5, .5, 1.2, 8), c);
  const head = M(new THREE.SphereGeometry(.4, 8, 6), 0xffd6a5);
  const boat = M(new THREE.BoxGeometry(2.4, .7, 5), 0x8a5a2b);
  body.position.y = .9; head.position.y = 1.8; boat.position.y = .2; boat.visible = false;
  g.userData.boat = boat;
  g.add(body, head, boat);
  return g;
}

function buildIsland(row) {
  const BIO = {tropical:0x4caf50, reef:0x2bb6a8, mist:0x9fb7c9, beach:0xe8d27a, rocky:0x8d8d8d, remote:0x8a6bbd};
  const wx = (row.x - 50) * SCALE, wz = (row.y - 50) * SCALE;
  const g = new THREE.Group(); g.position.set(wx, 0, wz);

  const base = M(new THREE.CylinderGeometry(RADIUS - 6.4, RADIUS, 1.6, 10), 0xe8d27a); base.position.y = .8; g.add(base);
  const top = M(new THREE.CircleGeometry(RADIUS - 9, 10), BIO[row.biome] || 0x4caf50);
  top.rotation.x = -Math.PI / 2; top.position.y = 1.62; g.add(top);

  for (let k = 0; k < 7; k++) {                       // palm trees
    const a = k * 2.4 + row.x, d = 4 + (k * 5.3 % 9), t = new THREE.Group();
    t.position.set(Math.cos(a) * d, 1.6, Math.sin(a) * d);
    const trunk = M(new THREE.CylinderGeometry(.25, .4, 4, 6), 0x8a5a2b);
    const leaves = M(new THREE.ConeGeometry(2.2, 1.4, 6), 0x2e8b3a);
    trunk.position.y = 2; leaves.position.y = 4.3;
    t.add(trunk, leaves); g.add(t);
  }
  for (let k = 0; k < 3; k++) {                       // rocks
    const r = M(new THREE.DodecahedronGeometry(1 + k * .4), 0x777777);
    r.position.set(Math.cos(k * 2 + 1) * (RADIUS - 12), 1.8, Math.sin(k * 2 + 1) * (RADIUS - 12)); g.add(r);
  }
  const dock = M(new THREE.BoxGeometry(5, .3, 2), 0x9b6a35); dock.position.set(RADIUS - 5, 1.3, 0); g.add(dock);

  const flag = M(new THREE.BoxGeometry(1.8, 1.2, .1), flagCol(row.owner_id));
  const pole = M(new THREE.CylinderGeometry(.1, .1, 6, 5), 0xffffff);
  flag.position.set(.9, 7.6, 0); pole.position.y = 4.6;
  const lb = label(row.name); lb.position.y = 11;
  g.add(pole, flag, lb);
  scene.add(g);
  return {row, wx, wz, flag};
}

function build() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3f0);
  scene.fog = new THREE.Fog(0x8fd3f0, 120, 520);
  cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 1500);
  rd = new THREE.WebGLRenderer({antialias: true});
  rd.setSize(innerWidth, innerHeight);
  rd.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.prepend(rd.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a6a7a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.4); sun.position.set(80, 120, 40); scene.add(sun);
  const sea = M(new THREE.PlaneGeometry(2000, 2000), 0x1e90c8);
  sea.material.transparent = true; sea.material.opacity = .92; sea.rotation.x = -Math.PI / 2; scene.add(sea);

  isl = isl.map(buildIsland);
  const start = isl.find(i => i.row.id === 'starter-cove') || isl[0];
  pl = makeChar(col(me.id));
  pl.position.set(start.wx, 1.6, start.wz + 6);
  scene.add(pl);

  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase(); keys[k] = 1;
    const T = {i:'inv', m:'map', p:'ppl'};
    if (k === 'f') fish();
    if (k === 'b') boat();
    if (T[k]) { tab = tab === T[k] ? null : T[k]; render(); }
    if (k === 'escape') { tab = null; render(); }
  });
  addEventListener('keyup', e => keys[e.key.toLowerCase()] = 0);
  let drag = false;
  addEventListener('pointerdown', e => drag = e.target.tagName === 'CANVAS');
  addEventListener('pointerup', () => drag = false);
  addEventListener('pointermove', e => {
    if (drag) { yaw -= e.movementX * .005; pitch = Math.max(.1, Math.min(1.2, pitch + e.movementY * .005)); }
  });
  addEventListener('wheel', e => { dist = Math.max(6, Math.min(30, dist + e.deltaY * .02)); });
  addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); rd.setSize(innerWidth, innerHeight); });
  $('fish').onclick = fish;
  $('boat').onclick = boat;
}

/* ================= ACTIONS ================= */
// look around the player for land (want=true) or water (want=false)
const probe = (want, r) => {
  for (let d = 2; d <= r; d += 1.5)
    for (let a = 0; a < 6.28; a += .4) {
      const x = pl.position.x + Math.cos(a) * d, z = pl.position.z + Math.sin(a) * d;
      if ((H(x, z) >= .4) === want) return [x, z];
    }
};
function boat() {
  if (!boatOn) {
    const p = probe(false, 8); if (!p) return toast('Walk to the shore to board your boat.');
    pl.position.set(p[0], .2, p[1]); boatOn = true;
  } else {
    const p = probe(true, 9); if (!p) return toast('Sail closer to an island to dock.');
    pl.position.set(p[0], H(p[0], p[1]), p[1]); boatOn = false;
  }
  pl.userData.boat.visible = boatOn;
}
async function fish() {
  if (busy) return;
  if (!boatOn && !probe(false, 6)) return toast('Stand near the water or use your boat to fish.');
  busy = true;
  const {data, error} = await sb.rpc('fih_fish');
  busy = false;
  if (error) return toast(error.message);
  inv[data.fish] = data.quantity; st.xp = data.xp; st.level = data.level;
  toast(`You caught a ${data.fish}! +5 XP`);
  hud(); if (tab) render();
}

/* ================= MULTIPLAYER ================= */
function join() {
  ch = sb.channel('fih-world', {config:{presence:{key: me.id}, broadcast:{self:false}}});
  ch.on('presence', {event:'sync'}, () => {
      online = {};
      for (const [id, a] of Object.entries(ch.presenceState())) online[id] = {name: a[0]?.name || 'Sailor'};
      for (const id in remotes) if (!online[id]) { scene.remove(remotes[id].g); delete remotes[id]; }
      if (tab) render();
    })
    .on('broadcast', {event:'pos'}, ({payload: d}) => {
      if (d.id === me.id) return;
      let r = remotes[d.id];
      if (!r) {
        const g = makeChar(col(d.id)), l = label(String(d.n).slice(0, 16));
        l.position.y = 3.2; g.add(l); g.position.set(d.x, d.y, d.z); scene.add(g);
        r = remotes[d.id] = {g, t: new THREE.Vector3(), ry: 0};
      }
      r.t.set(d.x, d.y, d.z); r.ry = d.r; r.g.userData.boat.visible = !!d.b;
    })
    .on('postgres_changes', {event:'UPDATE', schema:'public', table:'fih_islands'}, p => setOwner(p.new.id, p.new.owner_id))
    .subscribe(s => {
      if (s === 'SUBSCRIBED') ch.track({name: st.name});
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        toast('Connection lost, reconnecting...');
        setTimeout(() => { sb.removeChannel(ch); join(); }, 3000);
      }
    });
}

/* ================= MAIN LOOP ================= */
let last = performance.now(), tx = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - last) / 1000, .1); last = t;
  const p = pl.position;

  const fx = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
  const sx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  if (fx || sx) {
    const dx = -Math.sin(yaw) * fx + Math.cos(yaw) * sx, dz = -Math.cos(yaw) * fx - Math.sin(yaw) * sx;
    const v = (boatOn ? 16 : 8) * dt / Math.hypot(dx, dz);
    const ok = (x, z) => Math.abs(x) < 460 && Math.abs(z) < 460 && (H(x, z) >= .4) !== boatOn; // boat = water only, walking = land only
    const nx = p.x + dx * v, nz = p.z + dz * v;
    if (ok(nx, nz)) { p.x = nx; p.z = nz; } else if (ok(nx, p.z)) p.x = nx; else if (ok(p.x, nz)) p.z = nz;
    pl.rotation.y = Math.atan2(dx, dz);
  }
  p.y = boatOn ? .2 + Math.sin(t / 400) * .1 : H(p.x, p.z);

  cam.position.set(p.x + Math.sin(yaw) * Math.cos(pitch) * dist, p.y + 2 + Math.sin(pitch) * dist, p.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(p.x, p.y + 1.5, p.z);

  for (const r of Object.values(remotes)) { r.g.position.lerp(r.t, .15); r.g.rotation.y = r.ry; }
  if (ch && t - tx > 125) {                           // ~8 position updates per second
    tx = t;
    ch.send({type:'broadcast', event:'pos', payload:{id: me.id, n: st.name, x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), r: +pl.rotation.y.toFixed(2), b: boatOn}});
  }
  rd.render(scene, cam);
}

/* ================= START ================= */
$('play').onclick = async () => {
  $('play').disabled = true; err();
  try { isl = await load(); }
  catch (e) { err('Could not load game data: ' + e.message); $('play').disabled = false; return; }
  if (!isl.length) { err('No islands found. Check your Supabase tables and policies.'); $('play').disabled = false; return; }
  started = true;
  $('menu').classList.add('hide'); $('hud').classList.remove('hide');
  hud(); build(); join(); requestAnimationFrame(loop);
};
