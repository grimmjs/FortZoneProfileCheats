/**
 * Fortzone Modifier Suite - Client Logic
 * Target: Fortzone Battle Royale Backend APIs
 * Author: Pair-programmed with Antigravity / Ritmada
 */

// ==========================================
// CONFIGURATION & PERSISTENCE
// ==========================================
const DEFAULT_CONFIG = {
  proxyUrl: '', // e.g. 'https://corsproxy.io/?' or custom proxy
  battleApi: 'https://protondev.xyz:8511',
  nickApi: 'https://fahrenheit-dev.com/fz3/Nicks/ChangeNick',
  origin: 'https://fortzone-battle-royale-xkd.game-files.crazygames.com',
  versIdBattle: '9',
  versIdNick: '10'
};

const RESERVED_NICKS = ['diva_killer', 'admin', 'system', 'root'];

const CONFIG = { ...DEFAULT_CONFIG };

function loadConfig() {
  const saved = localStorage.getItem('fz_modifier_config');
  if (saved) {
    try {
      Object.assign(CONFIG, JSON.parse(saved));
    } catch (e) {
      console.error('Failed to parse saved config:', e);
    }
  } else {
    // If running on Cloudflare Pages or relative proxy exists, use native edge proxy
    if (typeof window !== 'undefined' && (window.location.hostname.includes('pages.dev') || window.location.protocol.startsWith('http'))) {
      CONFIG.proxyUrl = '/proxy?url=';
    }
  }
}

function saveConfig() {
  localStorage.setItem('fz_modifier_config', JSON.stringify(CONFIG));
}

// Token helper: normalizes raw / decoded / encoded session tokens
function formatToken(token) {
  if (!token) return '';
  let clean = token.trim();
  try {
    clean = decodeURIComponent(clean);
  } catch (e) {}
  if (!/^[A-Za-z0-9+/]+=*$/.test(clean) || clean.length % 4 !== 0) {
    try {
      clean = btoa(clean);
    } catch (e) {}
  }
  return clean;
}

// Network wrapper with proxy fallback
async function fetchEndpoint(url, options = {}) {
  const targetUrl = CONFIG.proxyUrl ? `${CONFIG.proxyUrl}${encodeURIComponent(url)}` : url;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(options.headers || {})
  };

  // If calling without proxy, some browsers allow Origin override or drop it
  if (!CONFIG.proxyUrl) {
    headers['Origin'] = CONFIG.origin;
  }

  const response = await fetch(targetUrl, {
    ...options,
    headers
  });
  return response;
}

// ==========================================
// DATA DICTIONARIES
// ==========================================
const WINGS_DATA = [
  ...Array.from({ length: 9 }, (_, i) => ({
    id: 12 + i,
    emoji: '❄️',
    name: `ICE WINGS ${12 + i}`,
    type: 'ice'
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    id: 21 + i,
    emoji: '🔥',
    name: `FIRE WINGS ${21 + i}`,
    type: 'fire'
  }))
];

const CHARACTERS_DATA = [
  {
    id: 103,
    name: 'Luna',
    title: 'Moonlight Assassin',
    gender: 'female',
    image: 'https://i.postimg.cc/6Tw4kDCh/103.png',
    accent: 'from-fuchsia-500 via-pink-500 to-rose-500',
    glow: 'rgba(236,72,153,0.55)'
  },
  {
    id: 104,
    name: 'Zoe',
    title: 'Neon Striker',
    gender: 'female',
    image: 'https://i.postimg.cc/GTJ22hYN/104.png',
    accent: 'from-cyan-400 via-sky-500 to-indigo-500',
    glow: 'rgba(56,189,248,0.55)'
  },
  {
    id: 107,
    name: 'Nona',
    title: 'Golden Sniper',
    gender: 'female',
    image: 'https://i.postimg.cc/TKSWB1cS/107.png',
    accent: 'from-amber-400 via-orange-500 to-red-500',
    glow: 'rgba(251,146,60,0.55)'
  },
  {
    id: 108,
    name: 'Malik',
    title: 'Shadow Blade',
    gender: 'male',
    image: 'https://i.postimg.cc/Z0Fp0TTb/108.png',
    accent: 'from-emerald-400 via-teal-500 to-cyan-500',
    glow: 'rgba(20,184,166,0.55)'
  },
  {
    id: 109,
    name: 'Rex',
    title: 'Iron Titan',
    gender: 'male',
    image: 'https://i.postimg.cc/5HhNSFmJ/109.png',
    accent: 'from-yellow-400 via-amber-500 to-orange-600',
    glow: 'rgba(245,158,11,0.55)'
  },
  {
    id: 111,
    name: 'Zoro',
    title: 'Storm Warrior',
    gender: 'male',
    image: 'https://i.postimg.cc/QBHHbDGD/111.png',
    accent: 'from-violet-500 via-purple-600 to-fuchsia-600',
    glow: 'rgba(168,85,247,0.55)'
  }
];

// ==========================================
// UI HELPER: LOGGING
// ==========================================
function appendLog(containerId, message, type = 'info') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  
  let color = 'text-slate-300';
  if (type === 'success' || type === 'ok') color = 'text-emerald-400 font-semibold';
  if (type === 'error' || type === 'err') color = 'text-rose-400 font-semibold';
  if (type === 'warn') color = 'text-amber-400';
  if (type === 'cyan') color = 'text-cyan-400';

  div.className = `${color} break-words`;
  div.textContent = `[${time}] ${message}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ==========================================
// MODULE 1: LVL / COINS / CRYSTALS FARMER
// ==========================================
let lvlAborted = false;

async function executeLvlFarming(battleId, token, repeat, targetExp = 0, targetCoins = 0, targetGems = 0) {
  const btnSubmit = document.getElementById('lvlBtnSubmit');
  const btnStop = document.getElementById('lvlBtnStop');
  const statusEl = document.getElementById('lvlStatus');
  const consoleEl = document.getElementById('lvlConsole');

  lvlAborted = false;
  btnSubmit.disabled = true;
  btnStop.classList.remove('hidden');
  statusEl.textContent = 'Running...';
  appendLog('lvlConsole', `🚀 Starting farm job: Battle ${battleId}, Max Matches: ${repeat}`, 'cyan');

  const hasTargets = targetExp > 0 || targetCoins > 0 || targetGems > 0;
  if (hasTargets) {
    appendLog('lvlConsole', `🎯 Active Targets: EXP: ${targetExp || '∞'} · Coins: ${targetCoins || '∞'} · Gems: ${targetGems || '∞'}`, 'cyan');
  }

  const normalizedToken = formatToken(token);
  const finishPayload = `data=${encodeURIComponent(JSON.stringify({
    BattleId: Number(battleId),
    BattleResult: {
      Result: 1,
      Medals: [],
      WeaponStatistics: [],
      GrenadeStatistics: { Damage: 999, Kills: 999, Count: 999 },
      PickUpWeaponCount: 999,
      Place: 1,
      PlayersCount: 30,
      Part: 1
    }
  }))}&VersId=${CONFIG.versIdBattle}&token=${encodeURIComponent(normalizedToken)}`;

  let successCount = 0;
  let totalExp = 0;
  let totalCoins = 0;
  let totalGems = 0;

  for (let i = 1; i <= repeat; i++) {
    if (lvlAborted) {
      appendLog('lvlConsole', `⏹ Farm job aborted by user at #${i}/${repeat}`, 'warn');
      break;
    }

    try {
      const resp = await fetchEndpoint(`${CONFIG.battleApi}/Battle/FinishBattle`, {
        method: 'POST',
        body: finishPayload
      });

      const data = await resp.json();
      if (data.error === 0 || resp.ok) {
        successCount++;
        const rew = data.battleReward || {};
        const exp = rew.exp || 0;
        const coins = rew.softCurrencyCount || 0;
        const gems = rew.hardCurrencyCount || 0;
        totalExp += exp;
        totalCoins += coins;
        totalGems += gems;
        appendLog('lvlConsole', `[${i}/${repeat}] ✅ +${exp} EXP (Tot: ${totalExp}) · +${coins} Coins (Tot: ${totalCoins}) · +${gems} Gems (Tot: ${totalGems})`, 'success');

        if ((targetExp > 0 && totalExp >= targetExp) ||
            (targetCoins > 0 && totalCoins >= targetCoins) ||
            (targetGems > 0 && totalGems >= targetGems)) {
          appendLog('lvlConsole', `🎯 Target Reached! Total Farmed: +${totalExp} EXP, +${totalCoins} Coins, +${totalGems} Gems`, 'cyan');
          break;
        }
      } else {
        appendLog('lvlConsole', `[${i}/${repeat}] ❌ Failed (Code: ${data.error ?? 'Unknown'})`, 'error');
      }
    } catch (err) {
      appendLog('lvlConsole', `[${i}/${repeat}] ❌ Network error: ${err.message}`, 'error');
    }

    // Small delay between iterations
    await new Promise(r => setTimeout(r, 200));
  }

  statusEl.textContent = `Done ${successCount}/${repeat}`;
  appendLog('lvlConsole', `🏁 Completed! Total farmed: +${totalExp} EXP, +${totalCoins} Coins, +${totalGems} Gems`, 'cyan');
  btnSubmit.disabled = false;
  btnStop.classList.add('hidden');
}

// ==========================================
// MODULE 2: RATING / KD MODIFIER
// ==========================================
let ratingAborted = false;

async function executeRatingSimulation(token, repeat, resultType, battleMode) {
  const btnSubmit = document.getElementById('ratingBtnSubmit');
  const btnStop = document.getElementById('ratingBtnStop');
  const statusEl = document.getElementById('ratingStatus');
  const statsBox = document.getElementById('ratingStatsBox');

  ratingAborted = false;
  btnSubmit.disabled = true;
  btnStop.classList.remove('hidden');
  statusEl.textContent = 'Running...';
  statsBox.classList.remove('hidden');

  appendLog('ratingConsole', `🔥 Initiating KD Engine: Mode ${battleMode}, Result ${resultType}, Repeat ${repeat}`, 'cyan');

  const normalizedToken = formatToken(token);
  let totalCoins = 0;
  let totalGems = 0;
  let totalRatingDelta = 0;
  let successCount = 0;

  for (let i = 1; i <= repeat; i++) {
    if (ratingAborted) {
      appendLog('ratingConsole', `⏹ Aborted at #${i}/${repeat}`, 'warn');
      break;
    }

    appendLog('ratingConsole', `[${i}/${repeat}] Creating battle in mode ${battleMode}...`);

    let battleId = null;
    try {
      const createResp = await fetchEndpoint(`${CONFIG.battleApi}/Battle/CreateBattle`, {
        method: 'POST',
        body: `battleModeId=${battleMode}&isRating=True&VersId=${CONFIG.versIdBattle}&token=${encodeURIComponent(normalizedToken)}`
      });
      const createData = await createResp.json();
      if (createData.error !== 0 || !createData.value) {
        appendLog('ratingConsole', `❌ CreateBattle failed: ${JSON.stringify(createData)}`, 'error');
        continue;
      }
      battleId = String(createData.value);
      appendLog('ratingConsole', `✅ Battle created — ID: ${battleId}`, 'success');
    } catch (err) {
      appendLog('ratingConsole', `❌ Error creating battle: ${err.message}`, 'error');
      continue;
    }

    // Finish the battle
    const finishBody = {
      BattleId: Number(battleId),
      BattleResult: {
        Result: Number(resultType),
        Medals: Array(15).fill(37),
        WeaponStatistics: [
          { WeaponId: 6, WeaponType: 6, Damage: 9999, Kills: 30 },
          { WeaponId: 1, WeaponType: 3, Damage: 5000, Kills: 15 }
        ],
        GrenadeStatistics: { Damage: 5000, Kills: 20, Count: 50 },
        PickUpWeaponCount: 15,
        Place: 1,
        PlayersCount: 30,
        Part: 1,
        TotalTime: 300
      }
    };

    try {
      const finishResp = await fetchEndpoint(`${CONFIG.battleApi}/Battle/FinishBattle`, {
        method: 'POST',
        body: `data=${encodeURIComponent(JSON.stringify(finishBody))}&VersId=${CONFIG.versIdBattle}&token=${encodeURIComponent(normalizedToken)}`
      });
      const finishData = await finishResp.json();

      if (finishData.error === 0) {
        successCount++;
        const rew = finishData.battleReward || {};
        const coins = rew.softCurrencyCount || 0;
        const gems = rew.hardCurrencyCount || 0;
        const delta = rew.ratingPointsChanges || 0;

        totalCoins += coins;
        totalGems += gems;
        totalRatingDelta += delta;

        // Update stats UI
        document.getElementById('statTotal').textContent = rew.totalBattlesCount ?? successCount;
        document.getElementById('statWins').textContent = rew.winBattlesCount ?? (resultType !== '1' ? successCount : 0);
        document.getElementById('statLosses').textContent = rew.failBattlesCount ?? (resultType === '1' ? successCount : 0);
        document.getElementById('statCoins').textContent = `+${totalCoins}`;
        document.getElementById('statGems').textContent = `+${totalGems}`;
        document.getElementById('statRating').textContent = `${totalRatingDelta >= 0 ? '+' : ''}${totalRatingDelta}`;

        appendLog('ratingConsole', `[${i}/${repeat}] ✅ Finished! Coins +${coins} · Gems +${gems} · Rating ${delta >= 0 ? '+' : ''}${delta}`, 'success');
      } else {
        appendLog('ratingConsole', `[${i}/${repeat}] ❌ Finish error: ${finishData.error}`, 'error');
      }
    } catch (err) {
      appendLog('ratingConsole', `❌ Error finishing battle: ${err.message}`, 'error');
    }

    await new Promise(r => setTimeout(r, 250));
  }

  statusEl.textContent = `Done ${successCount}/${repeat}`;
  appendLog('ratingConsole', `🏁 Run complete. Success: ${successCount}/${repeat}`, 'cyan');
  btnSubmit.disabled = false;
  btnStop.classList.add('hidden');
}

// ==========================================
// MODULE 3: WINGS MANAGER
// ==========================================
let selectedWingId = 12;

function renderWingsGrid() {
  const grid = document.getElementById('wingsGrid');
  grid.innerHTML = '';

  WINGS_DATA.forEach(w => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = w.id === selectedWingId;
    btn.className = `flex flex-col items-center justify-center py-2 rounded-lg border transition-all ${
      isSelected
        ? 'bg-fuchsia-500/20 border-fuchsia-400 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20'
    }`;
    btn.innerHTML = `
      <span class="text-lg leading-none">${w.emoji}</span>
      <span class="text-[10px] font-bold mt-0.5">${w.id}</span>
    `;
    btn.onclick = () => {
      selectedWingId = w.id;
      document.getElementById('wingPreviewEmoji').textContent = w.emoji;
      document.getElementById('wingPreviewName').textContent = w.name;
      renderWingsGrid();
    };
    grid.appendChild(btn);
  });
}

async function buyAndEquipWing(wingId, token) {
  const normToken = formatToken(token);
  const wing = WINGS_DATA.find(w => w.id === wingId) || { id: wingId, emoji: '🪽', name: `Wing ${wingId}` };
  const encodedToken = encodeURIComponent(normToken);

  appendLog('wingsConsole', `Processing ${wing.emoji} ${wing.name}...`);

  try {
    const buyResp = await fetchEndpoint(`${CONFIG.battleApi}/Accessory/BuyAccessory`, {
      method: 'POST',
      body: `accessoryId=${wingId}&VersId=${CONFIG.versIdBattle}&token=${encodedToken}`
    });
    const buyData = await buyResp.json();
    let canEquip = false;

    if (buyData.error === 0) {
      appendLog('wingsConsole', `🛒 ${wing.emoji} ${wing.name} — Bought successfully`, 'success');
      canEquip = true;
    } else if (buyData.error === 9110) {
      appendLog('wingsConsole', `ℹ️ ${wing.emoji} ${wing.name} — Already owned`, 'warn');
      canEquip = true;
    } else if (buyData.error === 404) {
      appendLog('wingsConsole', `❌ ${wing.emoji} ${wing.name} — Wing item not found`, 'error');
    } else {
      appendLog('wingsConsole', `❌ ${wing.emoji} ${wing.name} — Purchase error ${buyData.error}`, 'error');
    }

    if (canEquip) {
      const equipResp = await fetchEndpoint(`${CONFIG.battleApi}/Accessory/SetCurrentChar`, {
        method: 'POST',
        body: `accessoryId=${wingId}&VersId=${CONFIG.versIdBattle}&token=${encodedToken}`
      });
      const equipData = await equipResp.json();
      if (equipData.error === 0) {
        appendLog('wingsConsole', `✅ ${wing.emoji} ${wing.name} — Equipped!`, 'success');
      } else {
        appendLog('wingsConsole', `❌ ${wing.emoji} Equip failed: error code ${equipData.error}`, 'error');
      }
    }
  } catch (err) {
    appendLog('wingsConsole', `❌ Request failed: ${err.message}`, 'error');
  }
}

// ==========================================
// MODULE 4: CHARACTERS STORE
// ==========================================
const selectedCharIds = new Set();
let charsAborted = false;

function renderCharsGrid() {
  const grid = document.getElementById('charsGrid');
  grid.innerHTML = '';

  CHARACTERS_DATA.forEach(c => {
    const card = document.createElement('div');
    const isSelected = selectedCharIds.has(c.id);
    card.className = `group relative rounded-2xl p-[2px] transition-all duration-300 cursor-pointer ${
      isSelected ? 'scale-[1.02]' : 'hover:scale-[1.02]'
    } bg-gradient-to-br ${c.accent}`;

    if (isSelected) {
      card.style.boxShadow = `0 0 30px ${c.glow}`;
    }

    card.innerHTML = `
      <div class="rounded-[14px] bg-[#0a0d1e] p-2.5 space-y-2">
        <div class="relative rounded-xl overflow-hidden aspect-square bg-black/40">
          <img src="${c.image}" alt="${c.name}" loading="lazy" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
          ${isSelected ? `
            <div class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
              <i data-lucide="check" class="w-4 h-4"></i>
            </div>
          ` : ''}
        </div>
        <div>
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-sm text-white">${c.name}</h4>
            <span class="text-[10px] text-slate-500 font-mono">#${c.id}</span>
          </div>
          <p class="text-[11px] text-slate-400">${c.title}</p>
        </div>
      </div>
    `;

    card.onclick = () => {
      if (selectedCharIds.has(c.id)) {
        selectedCharIds.delete(c.id);
      } else {
        selectedCharIds.add(c.id);
      }
      document.getElementById('charsSelectedCount').textContent = selectedCharIds.size;
      renderCharsGrid();
      if (window.lucide) lucide.createIcons();
    };

    grid.appendChild(card);
  });
}

async function buyCharacter(charId, token) {
  const normToken = formatToken(token);
  const body = `characterId=${charId}&VersId=${CONFIG.versIdBattle}&token=${encodeURIComponent(normToken)}`;

  try {
    const resp = await fetchEndpoint(`${CONFIG.battleApi}/Character/BuyCharacter`, {
      method: 'POST',
      body
    });
    const data = await resp.json();
    if (data.error === 0) return { ok: true, msg: '✅ Purchased' };
    if (data.error === 3 || data.error === 9110) return { ok: true, msg: '⚠️ Already owned' };
    if (data.error === 1) return { ok: false, msg: '❌ Not enough coins/gems' };
    if (data.error === 4) return { ok: false, msg: '❌ Invalid token' };
    return { ok: false, msg: `❓ Error code ${data.error ?? 'unknown'}` };
  } catch (err) {
    return { ok: false, msg: `⚠️ Network: ${err.message}` };
  }
}

// ==========================================
// MODULE 5: NICKNAME CHANGER (CYBERPUNK ENGINE)
// ==========================================
let nickRunning = false;
let nickTimeoutId = null;
const nickStats = { ok: 0, fail: 0, total: 0 };

function updateNickStatsUI() {
  document.getElementById('nickStatOk').textContent = nickStats.ok;
  document.getElementById('nickStatFail').textContent = nickStats.fail;
  document.getElementById('nickStatTotal').textContent = nickStats.total;
}

function stopNickChanger(reason = '🛑 Injection stopped.') {
  nickRunning = false;
  if (nickTimeoutId) {
    clearTimeout(nickTimeoutId);
    nickTimeoutId = null;
  }
  document.getElementById('nickBtnStart').disabled = false;
  document.getElementById('nickBtnStop').classList.add('hidden');
  const badge = document.getElementById('nickRunningBadge');
  badge.textContent = '○ IDLE';
  badge.className = 'px-3 py-1 rounded border text-[10px] tracking-widest border-emerald-800 text-emerald-700';

  appendLog('nickConsole', reason, 'warn');
}

async function tickNickChanger(rawToken, newNick, delayMs) {
  if (!nickRunning) return;

  const normalizedToken = formatToken(rawToken);
  const trimmedNick = newNick.trim();
  nickStats.total++;
  const iteration = nickStats.total;

  try {
    const body = new URLSearchParams({
      nick: trimmedNick,
      VersId: CONFIG.versIdNick,
      token: normalizedToken
    }).toString();

    const resp = await fetchEndpoint(CONFIG.nickApi, {
      method: 'POST',
      body
    });

    const responseText = (await resp.text()).trim();

    if (resp.status === 200 && (responseText === '0' || responseText === '1')) {
      nickStats.ok++;
      appendLog('nickConsole', `[+] #${iteration} → nick set "${trimmedNick}" (${responseText})`, 'ok');
    } else {
      nickStats.fail++;
      appendLog('nickConsole', `[-] #${iteration} → HTTP ${resp.status} | ${responseText.slice(0, 80)}`, 'err');
    }
  } catch (err) {
    nickStats.fail++;
    appendLog('nickConsole', `[-] #${iteration} → ERR: ${err.message}`, 'err');
  }

  updateNickStatsUI();

  if (nickRunning) {
    nickTimeoutId = setTimeout(() => tickNickChanger(rawToken, newNick, delayMs), delayMs);
  }
}

function startNickChanger(rawToken, newNick, delayMs) {
  if (nickRunning) return;

  if (!rawToken.trim()) {
    appendLog('nickConsole', '⚠ Token is empty!', 'warn');
    return;
  }
  if (!newNick.trim()) {
    appendLog('nickConsole', '⚠ Nickname is empty!', 'warn');
    return;
  }
  if (RESERVED_NICKS.includes(newNick.trim().toLowerCase())) {
    appendLog('nickConsole', `🚫 Name "${newNick.trim()}" is reserved!`, 'err');
    return;
  }

  nickStats.ok = 0;
  nickStats.fail = 0;
  nickStats.total = 0;
  updateNickStatsUI();

  nickRunning = true;
  document.getElementById('nickBtnStart').disabled = true;
  document.getElementById('nickBtnStop').classList.remove('hidden');

  const badge = document.getElementById('nickRunningBadge');
  badge.textContent = '● RUNNING';
  badge.className = 'px-3 py-1 rounded border text-[10px] tracking-widest border-emerald-400 text-emerald-300 animate-pulse';

  appendLog('nickConsole', `>> injecting nickname "${newNick.trim()}" ...`, 'cyan');
  tickNickChanger(rawToken, newNick, Math.max(100, delayMs));
}

// ==========================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  if (window.lucide) lucide.createIcons();

  // Tab switching
  const tabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active', 'bg-gradient-to-r', 'from-cyan-500', 'to-blue-600', 'text-white', 'shadow-[0_0_20px_rgba(0,212,255,0.4)]');
        t.classList.add('text-slate-400');
      });
      tab.classList.add('active', 'bg-gradient-to-r', 'from-cyan-500', 'to-blue-600', 'text-white', 'shadow-[0_0_20px_rgba(0,212,255,0.4)]');
      tab.classList.remove('text-slate-400');

      const targetId = `tab-${tab.dataset.tab}`;
      tabContents.forEach(tc => {
        if (tc.id === targetId) {
          tc.classList.remove('hidden');
          tc.classList.add('block');
        } else {
          tc.classList.remove('block');
          tc.classList.add('hidden');
        }
      });
      if (window.lucide) lucide.createIcons();
    });
  });

  // URL query parameter parsing for sharing links
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('battleId')) document.getElementById('lvlBattleId').value = urlParams.get('battleId');
  if (urlParams.get('token')) {
    const t = urlParams.get('token');
    document.getElementById('lvlToken').value = t;
    document.getElementById('ratingToken').value = t;
    document.getElementById('wingsToken').value = t;
    document.getElementById('charsToken').value = t;
    document.getElementById('nickToken').value = t;
  }
  if (urlParams.get('repeat')) document.getElementById('lvlRepeat').value = urlParams.get('repeat');

  // Form 1: LVL
  const formLvl = document.getElementById('formLvl');
  formLvl.addEventListener('submit', e => {
    e.preventDefault();
    const bId = document.getElementById('lvlBattleId').value.trim();
    const token = document.getElementById('lvlToken').value.trim();
    const rep = parseInt(document.getElementById('lvlRepeat').value) || 50;
    const targetExp = parseInt(document.getElementById('lvlTargetExp')?.value) || 0;
    const targetCoins = parseInt(document.getElementById('lvlTargetCoins')?.value) || 0;
    const targetGems = parseInt(document.getElementById('lvlTargetGems')?.value) || 0;
    executeLvlFarming(bId, token, rep, targetExp, targetCoins, targetGems);
  });
  document.getElementById('lvlBtnStop').addEventListener('click', () => {
    lvlAborted = true;
  });

  // Share link updater
  const updateShareLink = () => {
    const bId = document.getElementById('lvlBattleId').value.trim();
    const token = document.getElementById('lvlToken').value.trim();
    const rep = document.getElementById('lvlRepeat').value.trim();
    if (!bId || !token) {
      document.getElementById('lvlShareLink').value = '';
      return;
    }
    const shareUrl = new URL(window.location.href);
    shareUrl.search = new URLSearchParams({ battleId: bId, token, repeat: rep }).toString();
    document.getElementById('lvlShareLink').value = shareUrl.toString();
  };
  ['lvlBattleId', 'lvlToken', 'lvlRepeat'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateShareLink);
  });
  document.getElementById('lvlBtnCopyShare').addEventListener('click', () => {
    const link = document.getElementById('lvlShareLink').value;
    if (link) {
      navigator.clipboard.writeText(link);
      alert('Link copied to clipboard!');
    }
  });

  // Form 2: Rating / KD
  const formRating = document.getElementById('formRating');
  formRating.addEventListener('submit', e => {
    e.preventDefault();
    const token = document.getElementById('ratingToken').value.trim();
    const rep = parseInt(document.getElementById('ratingRepeat').value) || 1;
    const resType = document.getElementById('ratingResultType').value;
    const mode = document.getElementById('ratingBattleMode').value;
    executeRatingSimulation(token, rep, resType, mode);
  });
  document.getElementById('ratingBtnStop').addEventListener('click', () => {
    ratingAborted = true;
  });

  // Wings Tab setup
  renderWingsGrid();
  document.getElementById('btnBuyEquipSingleWing').addEventListener('click', () => {
    const token = document.getElementById('wingsToken').value.trim();
    if (!token) return alert('Please enter your session token.');
    buyAndEquipWing(selectedWingId, token);
  });

  const batchBuyWings = async (wingList, label) => {
    const token = document.getElementById('wingsToken').value.trim();
    if (!token) return alert('Please enter your session token.');
    appendLog('wingsConsole', `🚀 Starting batch buy for ${label} (${wingList.length} items)...`, 'cyan');
    for (const w of wingList) {
      await buyAndEquipWing(w.id, token);
      await new Promise(r => setTimeout(r, 250));
    }
    appendLog('wingsConsole', `🏁 Finished batch buy for ${label}!`, 'cyan');
  };

  document.getElementById('btnBuyAllWings').addEventListener('click', () => {
    batchBuyWings(WINGS_DATA, 'ALL WINGS (12–31)');
  });
  document.getElementById('btnBuyAllIceWings').addEventListener('click', () => {
    batchBuyWings(WINGS_DATA.filter(w => w.type === 'ice'), 'ICE WINGS (12–20)');
  });
  document.getElementById('btnBuyAllFireWings').addEventListener('click', () => {
    batchBuyWings(WINGS_DATA.filter(w => w.type === 'fire'), 'FIRE WINGS (21–31)');
  });

  // Characters Tab setup
  renderCharsGrid();
  document.getElementById('btnBuySelectedChars').addEventListener('click', async () => {
    const token = document.getElementById('charsToken').value.trim();
    if (!token) return alert('Enter your token first');
    if (selectedCharIds.size === 0) return alert('Select at least one character');

    charsAborted = false;
    document.getElementById('btnStopChars').disabled = false;
    const charIds = Array.from(selectedCharIds);
    appendLog('charsConsole', `🛒 Purchasing ${charIds.length} selected heroes...`, 'cyan');

    for (let i = 0; i < charIds.length; i++) {
      if (charsAborted) {
        appendLog('charsConsole', '⏹ Stopped by user.', 'warn');
        break;
      }
      const char = CHARACTERS_DATA.find(c => c.id === charIds[i]);
      const res = await buyCharacter(charIds[i], token);
      appendLog('charsConsole', `[${i + 1}/${charIds.length}] ${char.name} (${char.id}) — ${res.msg}`);
      await new Promise(r => setTimeout(r, 400));
    }
    document.getElementById('btnStopChars').disabled = true;
    appendLog('charsConsole', '🏁 Done processing character purchases.', 'cyan');
  });

  document.getElementById('btnBuyAllChars').addEventListener('click', async () => {
    const token = document.getElementById('charsToken').value.trim();
    if (!token) return alert('Enter your token first');

    charsAborted = false;
    document.getElementById('btnStopChars').disabled = false;
    appendLog('charsConsole', `⚡ Purchasing ALL ${CHARACTERS_DATA.length} heroes...`, 'cyan');

    for (let i = 0; i < CHARACTERS_DATA.length; i++) {
      if (charsAborted) {
        appendLog('charsConsole', '⏹ Stopped by user.', 'warn');
        break;
      }
      const char = CHARACTERS_DATA[i];
      const res = await buyCharacter(char.id, token);
      appendLog('charsConsole', `[${i + 1}/${CHARACTERS_DATA.length}] ${char.name} (${char.id}) — ${res.msg}`);
      await new Promise(r => setTimeout(r, 400));
    }
    document.getElementById('btnStopChars').disabled = true;
    appendLog('charsConsole', '🏁 Finished buying all characters.', 'cyan');
  });

  document.getElementById('btnStopChars').addEventListener('click', () => {
    charsAborted = true;
  });

  // Nickname Changer Tab setup
  const formNick = document.getElementById('formNick');
  formNick.addEventListener('submit', e => {
    e.preventDefault();
    const token = document.getElementById('nickToken').value;
    const nick = document.getElementById('nickNewName').value;
    const delay = parseInt(document.getElementById('nickDelay').value) || 300;
    startNickChanger(token, nick, delay);
  });
  document.getElementById('nickBtnStop').addEventListener('click', () => {
    stopNickChanger();
  });
  document.getElementById('btnClearNickLog').addEventListener('click', () => {
    document.getElementById('nickConsole').innerHTML = '';
  });

  // Help Modal for Nick Changer
  const modalNickHelp = document.getElementById('modalNickHelp');
  document.getElementById('btnOpenNickHelp').addEventListener('click', () => {
    modalNickHelp.classList.remove('hidden');
  });
  document.getElementById('btnCloseNickHelp').addEventListener('click', () => {
    modalNickHelp.classList.add('hidden');
  });

  // Config Modal
  const modalConfig = document.getElementById('modalConfig');
  document.getElementById('btnOpenConfig').addEventListener('click', () => {
    document.getElementById('cfgProxy').value = CONFIG.proxyUrl;
    document.getElementById('cfgBattleApi').value = CONFIG.battleApi;
    document.getElementById('cfgNickApi').value = CONFIG.nickApi;
    document.getElementById('cfgOrigin').value = CONFIG.origin;
    modalConfig.classList.remove('hidden');
  });
  document.getElementById('btnCloseConfig').addEventListener('click', () => {
    modalConfig.classList.add('hidden');
  });
  document.getElementById('btnSaveConfig').addEventListener('click', () => {
    CONFIG.proxyUrl = document.getElementById('cfgProxy').value.trim();
    CONFIG.battleApi = document.getElementById('cfgBattleApi').value.trim();
    CONFIG.nickApi = document.getElementById('cfgNickApi').value.trim();
    CONFIG.origin = document.getElementById('cfgOrigin').value.trim();
    saveConfig();
    modalConfig.classList.add('hidden');
    alert('Configuration saved!');
  });
  document.getElementById('btnResetConfig').addEventListener('click', () => {
    Object.assign(CONFIG, DEFAULT_CONFIG);
    saveConfig();
    document.getElementById('cfgProxy').value = CONFIG.proxyUrl;
    document.getElementById('cfgBattleApi').value = CONFIG.battleApi;
    document.getElementById('cfgNickApi').value = CONFIG.nickApi;
    document.getElementById('cfgOrigin').value = CONFIG.origin;
    alert('Reset to defaults.');
  });
});
