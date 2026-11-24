'use strict';
const CAT = ['Jalan rusak atau berlubang', 'Penerangan jalan umum', 'Drainase dan saluran air', 'Trotoar dan jembatan', 'Taman dan ruang terbuka', 'Halte dan fasilitas transportasi', 'Fasilitas umum lainnya'];
const ST = ['Menunggu', 'Diproses', 'Selesai', 'Ditolak'];
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fd = t => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const lid = id => 'LP-' + String(id).padStart(4, '0');
const badge = s => `<span class="bd ${s}">${s}</span>`;
let tok = ls.get('lf_token') || '', me = null, view = { n: 'auth', p: 'login' }, flt = 'Semua', seq = 0;
const MAXF = 5;
let pics = [];
const app = document.getElementById('app');

async function api(p, o = {}) {
  const h = {};
  if (tok) h.Authorization = 'Bearer ' + tok;
  let body = o.body;
  if (o.json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(o.json); }
  let r;
  try { r = await fetch('/api' + p, { method: o.method || 'GET', headers: h, body }); }
  catch (e) { throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && tok && !/^\/(login|register)$/.test(p)) logout(false);
  if (!r.ok) throw new Error(d.error || 'Terjadi kesalahan pada server.');
  return d;
}
function logout(redraw = true) { tok = ''; me = null; ls.set('lf_token', null); view = { n: 'auth', p: 'login' }; if (redraw) render(); }
function go(n, p) { pics.forEach(x => URL.revokeObjectURL(x.url)); pics = []; view = { n, p }; render(); scrollTo(0, 0); }

function auth() {
  const reg = view.p === 'reg';
  return `<div class="auth"><section class="side"><div class="brand"><img class="logo" src="/logo-putih.png" alt="Lapor Fasum"></div>
  <h1>Laporkan kerusakan fasilitas umum di sekitar Anda.</h1>
  <p>Kirim laporan lengkap dengan foto dan lokasi, lalu pantau perkembangan penanganannya.</p>
  <ul class="track"><li><b>Menunggu</b><span>Laporan Anda diterima sistem.</span></li><li><b>Diproses</b><span>Administrator memeriksa dan menindaklanjuti.</span></li><li><b>Selesai</b><span>Penanganan dicatat pada laporan.</span></li></ul></section>
  <section class="form"><h2>${reg ? 'Buat akun' : 'Masuk'}</h2><p class="hint">${reg ? 'Daftar untuk mulai mengirim laporan.' : 'Masuk untuk mengirim dan memantau laporan.'}</p>
  <form id="${reg ? 'reg' : 'login'}">${reg ? '<label for="name">Nama lengkap</label><input id="name" name="name" required maxlength="80" autocomplete="name">' : ''}
  <label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email">
  <label for="pw">Kata sandi</label><input id="pw" name="password" type="password" required autocomplete="${reg ? 'new-password' : 'current-password'}" ${reg ? 'minlength="8" maxlength="72"' : ''}>
  ${reg ? '<small>Minimal 8 karakter.</small>' : ''}
  <p class="err" role="alert"></p><button class="btn">${reg ? 'Buat akun' : 'Masuk'}</button></form>
  <p class="alt">${reg ? 'Sudah punya akun?' : 'Belum punya akun?'} <button data-go="auth" data-p="${reg ? 'login' : 'reg'}">${reg ? 'Masuk' : 'Buat akun'}</button></p></section></div>`;
}

function shell(body) {
  const adm = me.role === 'admin', n = view.n;
  const items = adm ? [['admin', 'Dashboard']] : [['new', 'Buat laporan'], ['hist', 'Riwayat laporan']];
  return `<header class="top"><div class="bar"><div class="brand"><img class="logo" src="/logo.png" alt="Lapor Fasum"></div>
  <nav>${items.map(i => `<button data-go="${i[0]}" class="${n === i[0] ? 'on' : ''}">${i[1]}</button>`).join('')}</nav>
  <div class="who"><span>${esc(me.name)}${adm ? ' (Administrator)' : ''}</span><button class="btn ghost sm" data-do="out">Keluar</button></div></div></header><main class="wrap">${body}</main>`;
}

function rows(list, empty) {
  if (!list.length) return `<div class="list"><div class="empty">${empty}</div></div>`;
  return `<div class="list">${list.map(r => `<button class="row" data-go="det" data-p="${r.id}"><span class="id">${lid(r.id)}</span><span class="tt"><b>${esc(r.judul)}</b><small>${esc(r.kategori)}, ${esc(r.lokasi)}${me.role === 'admin' ? ' (pelapor: ' + esc(r.pelapor) + ')' : ''}</small></span><span class="dt">${fd(r.created_at)}</span>${badge(r.status)}</button>`).join('')}</div>`;
}

function pNew() {
  return `<div class="ph"><div><h1>Buat laporan</h1><p>Isi data kerusakan dengan jelas agar mudah diperiksa.</p></div></div>
  <form id="rep" class="card"><label for="judul" style="margin-top:0">Judul laporan</label><input id="judul" name="judul" required maxlength="100" placeholder="Contoh: Lubang besar di badan jalan">
  <label for="kat">Kategori kerusakan</label><select id="kat" name="kategori" required><option value="">Pilih kategori</option>${CAT.map(c => `<option>${c}</option>`).join('')}</select>
  <label for="lok">Lokasi kerusakan</label><input id="lok" name="lokasi" required maxlength="160" placeholder="Nama jalan, kelurahan, atau patokan terdekat">
  <label for="desk">Deskripsi</label><textarea id="desk" name="deskripsi" required maxlength="1000" placeholder="Jelaskan kondisi kerusakan dan dampaknya"></textarea>
  <label for="foto">Foto kerusakan (opsional, maksimal ${MAXF} foto)</label><input id="foto" type="file" accept="image/*" multiple><div id="pv"></div>
  <p class="err" role="alert"></p><div class="gap"><button class="btn">Kirim laporan</button></div></form>`;
}

async function pHist() {
  const { reports } = await api('/reports');
  return `<div class="ph"><div><h1>Riwayat laporan</h1><p>Laporan yang pernah Anda kirim beserta statusnya.</p></div><button class="btn" data-go="new">Buat laporan</button></div>
  ${rows(reports, 'Belum ada laporan. Buat laporan pertama Anda.')}`;
}

async function pAdmin() {
  const [{ reports }, { stats }] = await Promise.all([api('/reports'), api('/stats')]);
  const l = flt === 'Semua' ? reports : reports.filter(r => r.status === flt);
  return `<div class="ph"><div><h1>Dashboard administrator</h1><p>Periksa laporan masuk dan perbarui statusnya.</p></div></div>
  <div class="stats"><div class="stat"><b>${stats.total}</b><span>Total laporan</span></div>${ST.map(s => `<div class="stat"><b>${stats.by[s]}</b><span>${s}</span></div>`).join('')}<div class="stat"><b>${stats.users}</b><span>Pengguna terdaftar</span></div></div>
  <div class="chips">${['Semua', ...ST].map(s => `<button class="chip ${flt === s ? 'on' : ''}" data-do="flt" data-v="${s}">${s}</button>`).join('')}</div>
  ${rows(l, 'Tidak ada laporan pada status ini.')}`;
}

async function pDet() {
  const adm = me.role === 'admin', back = adm ? 'admin' : 'hist';
  let r;
  try { r = (await api('/reports/' + encodeURIComponent(view.p))).report; }
  catch (e) { return `<p class="err">${esc(e.message)}</p><button class="btn ghost" data-go="${back}">Kembali</button>`; }
  return `<button class="back" data-go="${back}">Kembali ke daftar laporan</button>
  <div class="det"><section class="card"><div class="ph" style="margin:0"><h1>${esc(r.judul)}</h1>${badge(r.status)}</div>
  <div class="meta"><div><small>Nomor laporan</small>${lid(r.id)}</div><div><small>Kategori</small>${esc(r.kategori)}</div><div><small>Lokasi</small>${esc(r.lokasi)}</div><div><small>Tanggal dikirim</small>${fd(r.created_at)}</div>${adm ? `<div><small>Pelapor</small>${esc(r.pelapor)}</div>` : ''}</div>
  <h3 style="font-size:16px">Deskripsi</h3><p style="white-space:pre-wrap">${esc(r.deskripsi)}</p>
  ${r.fotos && r.fotos.length ? `<h3 style="font-size:16px">Foto kerusakan (${r.fotos.length})</h3><div class="gal">${r.fotos.map((x, i) => `<a href="/uploads/${esc(x)}" target="_blank" rel="noopener"><img src="/uploads/${esc(x)}" alt="Foto kerusakan ${i + 1}: ${esc(r.judul)}"></a>`).join('')}</div>` : ''}</section>
  <aside class="card"><h3 style="font-size:16px">Perkembangan status</h3><ul class="tl">${[...r.log].reverse().map(l => `<li><b>${l.status}</b><small>${fd(l.created_at)}</small></li>`).join('')}</ul>
  ${adm ? `<form id="st"><label for="s">Perbarui status</label><select id="s" name="status">${ST.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select><p class="err" role="alert"></p><div class="gap"><button class="btn">Simpan status</button><button type="button" class="btn danger" data-do="del">Hapus laporan</button></div></form>` : ''}</aside></div>`;
}

const bar = (w, h = 14) => `<div class="sk" style="width:${w};height:${h}px"></div>`;
const gap = h => `<div style="height:${h}px"></div>`;
const skRows = n => `<div class="list">${Array.from({ length: n }, () =>
  `<div style="padding:16px 18px;border-bottom:1px solid var(--ln)">${bar('28%')}${gap(10)}${bar('72%', 16)}</div>`).join('')}</div>`;

function skeleton(n) {
  let h;
  if (n === 'admin') {
    h = `<div class="ph">${bar('40%', 28)}</div><div class="stats">${Array.from({ length: 6 }, () =>
      `<div class="stat">${bar('40%', 28)}${gap(8)}${bar('70%')}</div>`).join('')}</div>${skRows(5)}`;
  } else if (n === 'det') {
    h = `<div class="det"><section class="card">${bar('60%', 28)}${gap(16)}${bar('100%')}${gap(10)}${bar('90%')}${gap(10)}${bar('70%')}</section><aside class="card">${bar('50%', 18)}${gap(14)}${bar('80%')}</aside></div>`;
  } else {
    h = `<div class="ph">${bar('40%', 28)}</div>${skRows(4)}`;
  }
  return `<div aria-busy="true" aria-label="Memuat data">${h}</div>`;
}

async function render() {
  const my = ++seq;
  if (!tok) { app.innerHTML = auth(); return; }
  try {
    if (!me) app.innerHTML = `<main class="wrap">${skeleton('hist')}</main>`;
    if (!me) me = (await api('/me')).user;
    if (my !== seq) return;
    const adm = me.role === 'admin';
    if (view.n === 'auth' || (adm && ['new', 'hist'].includes(view.n)) || (!adm && view.n === 'admin')) view.n = adm ? 'admin' : 'new';
    if (view.n !== 'new') app.innerHTML = shell(skeleton(view.n));
    const body = await ({ new: pNew, hist: pHist, admin: pAdmin, det: pDet })[view.n]();
    if (my !== seq) return;
    app.innerHTML = shell(body);
  } catch (e) {
    if (my !== seq) return;
    if (!tok || !me) { app.innerHTML = auth(); return; }
    app.innerHTML = shell(`<div class="card"><p class="err">${esc(e.message)}</p><button class="btn" data-do="retry">Coba lagi</button></div>`);
  }
}

function shrink(f) {
  return new Promise((ok, no) => {
    const u = URL.createObjectURL(f), i = new Image();
    i.onerror = () => { URL.revokeObjectURL(u); no(); };
    i.onload = () => {
      URL.revokeObjectURL(u);
      const s = Math.min(1, 1280 / Math.max(i.width, i.height)), c = document.createElement('canvas');
      c.width = Math.round(i.width * s); c.height = Math.round(i.height * s);
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
      c.toBlob(b => b ? ok(b) : no(), 'image/jpeg', .75);
    };
    i.src = u;
  });
}

function renderPv() {
  const pv = document.getElementById('pv'); if (!pv) return;
  pv.innerHTML = pics.length
    ? `<div class="pvs">${pics.map((p, i) => `<div class="pvi"><img src="${p.url}" alt="Pratinjau foto ${i + 1}"><button type="button" data-do="rm" data-i="${i}" aria-label="Hapus foto ${i + 1}">&times;</button></div>`).join('')}</div><small>${pics.length} dari ${MAXF} foto</small>`
    : '';
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go]');
  if (t) { go(t.dataset.go, t.dataset.p); return; }
  const a = e.target.closest('[data-do]'); if (!a) return;
  const d = a.dataset.do;
  if (d === 'out') logout();
  if (d === 'retry') render();
  if (d === 'rm') { const p = pics.splice(+a.dataset.i, 1)[0]; if (p) URL.revokeObjectURL(p.url); renderPv(); }
  if (d === 'flt') { flt = a.dataset.v; render(); }
  if (d === 'del' && confirm('Hapus laporan ini secara permanen?')) {
    try { await api('/reports/' + encodeURIComponent(view.p), { method: 'DELETE' }); go('admin'); }
    catch (x) { alert(x.message); }
  }
});

document.addEventListener('change', e => {
  if (e.target.id !== 'foto') return;
  let msg = '';
  for (const f of e.target.files) {
    if (!f.type.startsWith('image/')) { msg = 'Hanya file gambar yang dapat diunggah.'; continue; }
    if (pics.length >= MAXF) { msg = `Maksimal ${MAXF} foto per laporan.`; break; }
    pics.push({ file: f, url: URL.createObjectURL(f), ready: shrink(f).catch(() => f) });
  }
  e.target.value = '';
  const er = document.querySelector('#rep .err'); if (er) er.textContent = msg;
  renderPv();
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, er = f.querySelector('.err'), btn = f.querySelector('button:not([type=button])');
  const bad = t => { if (er) er.textContent = t; };
  bad(''); const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; if (f.id === 'rep') btn.textContent = 'Mengirim laporan...'; }
  try {
    const v = Object.fromEntries(new FormData(f));
    if (f.id === 'login' || f.id === 'reg') {
      const d = f.id === 'login'
        ? await api('/login', { method: 'POST', json: { email: v.email, password: v.password } })
        : await api('/register', { method: 'POST', json: { name: v.name, email: v.email, password: v.password } });
      tok = d.token; me = d.user; ls.set('lf_token', tok); go(me.role === 'admin' ? 'admin' : 'new');
    } else if (f.id === 'rep') {
      const body = new FormData();
      ['judul', 'kategori', 'lokasi', 'deskripsi'].forEach(k => body.append(k, v[k]));
      for (let i = 0; i < pics.length; i++) {
        body.append('foto', await pics[i].ready, `foto${i + 1}.jpg`);
      }
      const d = await api('/reports', { method: 'POST', body });
      go('det', d.id);
    } else if (f.id === 'st') {
      await api('/reports/' + encodeURIComponent(view.p) + '/status', { method: 'PATCH', json: { status: v.status } });
      render();
    }
  } catch (x) { bad(x.message); if (btn) btn.disabled = false; }
});

render();
