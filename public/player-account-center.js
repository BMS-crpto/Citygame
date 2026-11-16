/* Citygame Player Account Centre
 * Authenticated profile, saved progression, account settings and session controls.
 */
(() => {
  'use strict';
  const token = () => { try { return localStorage.getItem('ll_tok') || ''; } catch (_) { return ''; } };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => '₦' + Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-NG');
  const date = value => value ? new Date(value).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}) : 'Not recorded';
  const css = document.createElement('style');
  css.textContent = `
    #cgAccountLaunch{position:fixed;right:12px;top:12px;z-index:30;border:1px solid #526984;border-radius:24px;padding:9px 13px;background:#10243b;color:#f1f7ff;font-weight:850;font-size:12px;box-shadow:0 8px 24px #0005}
    #cgAccountLayer{position:fixed;inset:0;z-index:80;display:none;overflow:auto;background:radial-gradient(ellipse at top right,#1b4561,#091321 58%);color:#eff6ff;font-family:system-ui,sans-serif;padding:clamp(12px,3vw,28px)}
    #cgAccountLayer.open{display:block}
    .cgAccWrap{width:min(920px,100%);margin:0 auto}
    .cgAccTop{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 0 18px}
    .cgAccBrand{font-size:10px;letter-spacing:2px;color:#6ee7d2;font-weight:900}
    .cgAccTitle{font-size:clamp(24px,5vw,36px);font-weight:950;margin:4px 0}
    .cgAccSub{font-size:12px;color:#a9bed3}
    .cgAccClose{border:1px solid #526984;background:#142a42;color:white;border-radius:12px;padding:10px 13px}
    .cgAccHero{padding:18px;border:1px solid #38536e;border-radius:20px;background:linear-gradient(125deg,#173653,#142238 65%,#21304a);display:flex;align-items:center;gap:14px}
    .cgAccAvatar{width:58px;height:58px;flex:0 0 58px;border-radius:18px;display:grid;place-items:center;background:#0d7180;font-size:28px}
    .cgAccName{font-size:20px;font-weight:900;overflow-wrap:anywhere}
    .cgAccHandle{font-size:11px;color:#a9bed3;margin-top:3px}
    .cgAccGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}
    .cgAccStat{border:1px solid #2b4058;border-radius:15px;background:#122238;padding:13px;min-width:0}
    .cgAccStat small{display:block;font-size:9px;letter-spacing:1px;color:#8ea7c0;text-transform:uppercase}
    .cgAccStat b{display:block;font-size:clamp(15px,2.5vw,22px);margin-top:5px;overflow-wrap:anywhere}
    .cgAccSection{border:1px solid #2b4058;border-radius:17px;background:#101e30;padding:15px;margin:10px 0}
    .cgAccSection h3{margin:0 0 12px;font-size:14px}
    .cgAccRows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    .cgAccRow{background:#182b41;border-radius:11px;padding:10px;min-width:0}
    .cgAccRow small{display:block;color:#91a8c0;font-size:10px}
    .cgAccRow b{display:block;font-size:12px;margin-top:3px;overflow-wrap:anywhere}
    .cgAccField{display:grid;gap:5px;margin:10px 0}
    .cgAccField label{font-size:11px;color:#b8c9da}
    .cgAccField input,.cgAccField textarea{width:100%;box-sizing:border-box;border:1px solid #3b536d;background:#091625;color:#fff;border-radius:10px;padding:11px;font:inherit;font-size:13px}
    .cgAccField textarea{min-height:70px;resize:vertical}
    .cgAccActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    .cgAccActions button{border:0;border-radius:10px;background:#f5ca57;color:#1a2635;font-weight:900;padding:11px 14px}
    .cgAccActions button.alt{background:#263c55;color:#edf6ff;border:1px solid #4b6480}
    .cgAccNote{font-size:10px;color:#92a9c1;line-height:1.5;margin-top:9px}
    .cgAccError{font-size:11px;color:#ffb4a9;min-height:16px;margin-top:6px}
    .cgAccBiz{padding:10px;border-radius:11px;background:#182b41;margin:7px 0}
    .cgAccBiz b{font-size:12px}.cgAccBiz small{display:block;color:#9cb0c5;font-size:10px;margin-top:3px}
    @media(max-width:560px){.cgAccGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.cgAccRows{grid-template-columns:1fr}.cgAccHero{align-items:flex-start}.cgAccAvatar{width:48px;height:48px;flex-basis:48px}}
  `;
  document.head.appendChild(css);

  const launch = document.createElement('button');
  launch.id = 'cgAccountLaunch'; launch.type = 'button'; launch.textContent = '👤 Player account';
  const layer = document.createElement('div');
  layer.id = 'cgAccountLayer';
  layer.innerHTML = '<div class="cgAccWrap"><header class="cgAccTop"><div><div class="cgAccBrand">CITYGAME IDENTITY</div><div class="cgAccTitle">Player account</div><div class="cgAccSub">Your profile, saved life and account settings</div></div><button class="cgAccClose" id="cgAccClose">Close ✕</button></header><div id="cgAccContent"><div class="cgAccSection">Loading account…</div></div></div>';
  document.body.append(launch, layer);

  let current = null;
  async function request(method, body) {
    const t = token();
    if (!t) throw new Error('Sign in with a player account to open this account centre.');
    const response = await fetch('/api/account', {
      method, cache:'no-store', headers:{'Authorization':'Bearer '+t,'Accept':'application/json','Content-Type':'application/json'},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Account request failed.');
    return data.account;
  }
  function businessMarkup(items) {
    if (!items || !items.length) return '<div class="cgAccNote">No player-owned businesses saved on this account yet.</div>';
    return items.map(b => '<div class="cgAccBiz"><b>'+esc(b.name)+'</b><small>'+esc(b.kind)+' · '+esc(b.area)+' · '+money(b.balance)+' company balance · '+b.staffCount+' staff · '+b.customers+' customers</small></div>').join('');
  }
  function render(a, storage) {
    current = a;
    const p = a.player || {};
    const content = document.getElementById('cgAccContent');
    content.innerHTML =
      '<section class="cgAccHero"><div class="cgAccAvatar">🧑🏾‍💻</div><div><div class="cgAccName">'+esc(a.displayName)+'</div><div class="cgAccHandle">@'+esc(a.username)+' · '+esc(a.email || 'No email added')+'</div><div class="cgAccSub">Member since '+date(a.createdAt)+'</div></div></section>'+
      '<div class="cgAccGrid"><div class="cgAccStat"><small>Cash wallet</small><b>'+money(p.money)+'</b></div><div class="cgAccStat"><small>Bank balance</small><b>'+money(p.bank)+'</b></div><div class="cgAccStat"><small>Career</small><b>'+esc(p.career ? p.career.id : 'Not started')+'</b></div><div class="cgAccStat"><small>Vehicles</small><b>'+Number(p.vehicles||0)+'</b></div><div class="cgAccStat"><small>Home</small><b>'+(p.homeActive?'Active':'Not active')+'</b></div><div class="cgAccStat"><small>Business</small><b>'+((p.businesses||[]).length)+'</b></div></div>'+
      '<section class="cgAccSection"><h3>Saved player progress</h3><div class="cgAccRows">'+
      '<div class="cgAccRow"><small>Life path</small><b>'+esc(p.path || 'Not set')+'</b></div>'+
      '<div class="cgAccRow"><small>Food / needs data</small><b>'+Math.round(Number(p.food)||0)+' / 100</b></div>'+
      '<div class="cgAccRow"><small>Inventory items</small><b>'+Number(p.inventoryItems||0)+'</b></div>'+
      '<div class="cgAccRow"><small>Driver licence</small><b>'+(p.hasDriversLicense?'Issued':'Not issued')+'</b></div>'+
      '<div class="cgAccRow"><small>Daily reward streak</small><b>'+Number(p.dailyStreak||0)+' days</b></div>'+
      '<div class="cgAccRow"><small>Last game save</small><b>'+date(a.lastSavedAt)+'</b></div>'+
      '</div></section>'+
      '<section class="cgAccSection"><h3>My businesses</h3>'+businessMarkup(p.businesses)+'</section>'+
      '<section class="cgAccSection"><h3>Profile settings</h3>'+
      '<div class="cgAccField"><label for="cgAccDisplay">Display name</label><input id="cgAccDisplay" maxlength="24" value="'+esc(a.displayName)+'"></div>'+
      '<div class="cgAccField"><label for="cgAccBio">About me · 120 characters max</label><textarea id="cgAccBio" maxlength="120" placeholder="Write a short player bio…">'+esc(a.bio||'')+'</textarea></div>'+
      '<div class="cgAccActions"><button id="cgAccSave">Save profile</button><button class="alt" id="cgAccRefresh">Refresh saved data</button><button class="alt" id="cgAccSignout">Sign out</button></div><div class="cgAccError" id="cgAccError"></div>'+
      '<div class="cgAccNote">Account storage: '+esc(storage==='persistent'?'Persistent cloud storage':'Local fallback storage')+'. Profile updates are saved to the game server. Character progress is saved by the multiplayer game session.</div></section>';
    document.getElementById('cgAccSave').onclick = async () => {
      const button = document.getElementById('cgAccSave'), error = document.getElementById('cgAccError');
      button.disabled = true; button.textContent = 'Saving…'; error.textContent = '';
      try {
        const updated = await request('PATCH', {displayName:document.getElementById('cgAccDisplay').value,bio:document.getElementById('cgAccBio').value});
        render(updated, storage);
        document.getElementById('cgAccError').style.color = '#7ee5bf';
        document.getElementById('cgAccError').textContent = 'Profile saved successfully.';
      } catch (e) { error.textContent = e.message; }
      finally { button.disabled = false; button.textContent = 'Save profile'; }
    };
    document.getElementById('cgAccRefresh').onclick = load;
    document.getElementById('cgAccSignout').onclick = () => {
      try { localStorage.removeItem('ll_tok'); localStorage.removeItem('ll_user'); } catch (_) {}
      location.reload();
    };
  }
  async function load() {
    const content = document.getElementById('cgAccContent');
    content.innerHTML = '<div class="cgAccSection">Loading your saved player account…</div>';
    try {
      const data = await request('GET');
      render(data, data.storage);
    } catch (e) {
      content.innerHTML = '<div class="cgAccSection"><b>Account unavailable</b><p class="cgAccNote">'+esc(e.message)+'</p><div class="cgAccActions"><button id="cgAccRetry">Try again</button></div></div>';
      document.getElementById('cgAccRetry').onclick = load;
    }
  }
  launch.addEventListener('click', () => { layer.classList.add('open'); load(); });
  document.getElementById('cgAccClose').addEventListener('click', () => layer.classList.remove('open'));
  layer.addEventListener('click', e => { if (e.target === layer) layer.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') layer.classList.remove('open'); });
  console.info('Citygame Player Account Centre ready');
})();