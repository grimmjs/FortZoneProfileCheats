// ==UserScript==
// @name         Fortzone Credential Sniffer & Profile Injector
// @namespace    https://github.com/grimmjs/FortZoneProfileCheats
// @version      3.0.0
// @description  Cattura Token e Battle ID direttamente dalle chiamate native di Fortzone (Auth, Users, Battle, Nicks)
// @author       grimmjs
// @match        *://*.crazygames.com/*
// @match        *://fortzone-battle-royale-xkd.game-files.crazygames.com/*
// @match        *://*.game-files.crazygames.com/*
// @run-at       document-start
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    const MODIFIER_URL = "https://fortzoneprofilecheats.sadness-grimm.workers.dev";

    // Stato locale sincronizzato
    const state = {
        token: localStorage.getItem('fz_captured_token') || "",
        battleId: localStorage.getItem('fz_captured_battle_id') || ""
    };

    function setToken(val) {
        if (!val || typeof val !== 'string') return;
        let clean = val.trim();
        try { clean = decodeURIComponent(clean); } catch (e) {}

        // Se non corrisponde o è nuovo, memorizza
        if (clean.length > 5 && clean !== state.token) {
            state.token = clean;
            localStorage.setItem('fz_captured_token', clean);
            updateUI();
            console.log('[Fortzone Sniffer] ✅ Captured Token:', clean);
        }
    }

    function setBattleId(val) {
        if (!val) return;
        const clean = String(val).trim();
        if (clean.length > 0 && clean !== state.battleId && clean !== '0' && clean !== '-1') {
            state.battleId = clean;
            localStorage.setItem('fz_captured_battle_id', clean);
            updateUI();
            console.log('[Fortzone Sniffer] 🆔 Captured Battle ID:', clean);
        }
    }

    // Ispezione query string, form data e JSON
    function inspectPayload(url, body, responseText) {
        const fullString = (url || '') + ' ' + (typeof body === 'string' ? body : '') + ' ' + (typeof responseText === 'string' ? responseText : '');

        // 1. Estrazione del TOKEN (parametro token=...)
        const tokenMatches = [
            /(?:^|[?&;]|"|\s)token=([^&"'\s\\]+)/i,
            /"token"\s*:\s*"([^"]+)"/i,
            /"sessionToken"\s*:\s*"([^"]+)"/i,
            /"authToken"\s*:\s*"([^"]+)"/i
        ];
        for (const rgx of tokenMatches) {
            const m = fullString.match(rgx);
            if (m && m[1]) {
                setToken(m[1]);
                break;
            }
        }

        // 2. Estrazione del BATTLE ID
        // Nel server Protondev: BattleId=12345 o CreateBattle response: {"error":0,"value":47712702}
        const battleMatches = [
            /(?:BattleId|battleId|battleID)=([0-9]{4,12})/i,
            /"BattleId"\s*:\s*([0-9]{4,12})/i,
            /"battleId"\s*:\s*([0-9]{4,12})/i
        ];
        for (const rgx of battleMatches) {
            const m = fullString.match(rgx);
            if (m && m[1]) {
                setBattleId(m[1]);
                break;
            }
        }

        // Se è la risposta di CreateBattle, il valore ritornato è {"error":0,"value":<battleId>}
        if (url && url.includes('Battle/CreateBattle') && responseText) {
            try {
                const json = JSON.parse(responseText);
                if (json && (json.value || json.BattleId)) {
                    setBattleId(json.value || json.BattleId);
                }
            } catch (e) {}
        }

        // Se è StartBattle o JoinBattle o FinishBattle
        if (url && (url.includes('Battle/JoinBattle') || url.includes('Battle/StartBattle') || url.includes('Battle/FinishBattle'))) {
            try {
                const json = JSON.parse(responseText);
                if (json && json.value) setBattleId(json.value);
            } catch (e) {}
        }
    }

    // 1. Intercetta Fetch API
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let url = '';
        let body = null;
        try {
            const req = args[0];
            const opts = args[1] || {};
            if (typeof req === 'string') {
                url = req;
            } else if (req instanceof Request) {
                url = req.url;
                try { body = await req.clone().text(); } catch (e) {}
            }
            if (opts.body) body = opts.body;
            inspectPayload(url, body, null);
        } catch (e) {}

        const response = await originalFetch.apply(this, args);

        try {
            if (url && (url.includes('protondev.xyz') || url.includes('fahrenheit-dev.com') || url.includes('Battle') || url.includes('Auth'))) {
                const clone = response.clone();
                clone.text().then(text => inspectPayload(url, body, text)).catch(() => {});
            }
        } catch (e) {}

        return response;
    };

    // 2. Intercetta XMLHttpRequest (usato dal runtime Unity WebGL per UnityWebRequest)
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._fz_url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        const url = this._fz_url || '';
        try {
            inspectPayload(url, body, null);
        } catch (e) {}

        this.addEventListener('load', function() {
            try {
                if (url && (url.includes('protondev.xyz') || url.includes('fahrenheit-dev.com') || url.includes('Battle') || url.includes('Auth') || url.includes('Users'))) {
                    inspectPayload(url, body, this.responseText);
                }
            } catch (e) {}
        });

        return originalSend.apply(this, arguments);
    };

    // 3. UI Overlay: Unico, visibile solo nel frame del gioco
    function createHUD() {
        if (window.top !== window.self) {
            // Se siamo in un iframe ma non è quello del gioco (nessun canvas), esci
            if (!document.querySelector('canvas') && !window.location.href.includes('game-files.crazygames.com')) {
                return;
            }
        } else {
            // Se siamo nella pagina top ma c'è un iframe di gioco, aspetta o non duplicare
            if (document.querySelector('iframe')) return;
        }

        if (document.getElementById('fz-sniffer-hud')) return;

        const hud = document.createElement('div');
        hud.id = 'fz-sniffer-hud';
        hud.style.cssText = `
            position: fixed;
            bottom: 12px;
            left: 12px;
            z-index: 2147483647;
            background: rgba(5, 7, 13, 0.95);
            border: 1px solid rgba(0, 212, 255, 0.4);
            box-shadow: 0 0 25px rgba(0, 212, 255, 0.3);
            border-radius: 12px;
            padding: 10px 14px;
            color: #f8fafc;
            font-family: 'Consolas', monospace, sans-serif;
            font-size: 11px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            backdrop-filter: blur(8px);
            width: 260px;
            pointer-events: auto;
        `;

        hud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">
                <span style="font-weight:bold; color:#38bdf8; font-size:11px;">⚡ FORTZONE SNIFFER</span>
                <span id="fz-status-dot" style="width:8px; height:8px; border-radius:50%; background:${state.token ? '#10b981' : '#ef4444'};"></span>
            </div>
            <div>
                <div style="color:#94a3b8; font-size:9px;">BATTLE ID (for LVL farm):</div>
                <div id="fz-hud-battle" style="font-weight:bold; color:#fbbf24; word-break:break-all;">${state.battleId || 'Avvia una partita...'}</div>
            </div>
            <div>
                <div style="color:#94a3b8; font-size:9px;">SESSION TOKEN:</div>
                <div id="fz-hud-token" style="font-weight:bold; color:#34d399; word-break:break-all; font-size:10px;">${state.token ? (state.token.length > 25 ? state.token.slice(0, 25) + '...' : state.token) : 'In attesa di login/richiesta...'}</div>
            </div>
            <div style="display:flex; gap:6px; margin-top:2px;">
                <button id="fz-btn-copy-token" style="flex:1; padding:5px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#fff; cursor:pointer; font-size:10px;">Copy Token</button>
                <button id="fz-btn-copy-battle" style="flex:1; padding:5px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#fff; cursor:pointer; font-size:10px;">Copy ID</button>
            </div>
            <button id="fz-btn-open-suite" style="padding:6px; background:linear-gradient(90deg, #06b6d4, #2563eb); border:none; border-radius:6px; color:#fff; font-weight:bold; cursor:pointer; font-size:11px; margin-top:2px;">Open Suite 🚀</button>
        `;

        document.body.appendChild(hud);

        document.getElementById('fz-btn-copy-token').addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.token) {
                if (typeof GM_setClipboard !== 'undefined') GM_setClipboard(state.token);
                else navigator.clipboard.writeText(state.token);
                alert('Token copiato negli appunti!');
            } else {
                alert('Token non ancora catturato. Fai un click nel menu del gioco per farlo inviare!');
            }
        });

        document.getElementById('fz-btn-copy-battle').addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.battleId) {
                if (typeof GM_setClipboard !== 'undefined') GM_setClipboard(state.battleId);
                else navigator.clipboard.writeText(state.battleId);
                alert('Battle ID copiato negli appunti!');
            } else {
                alert('Battle ID non presente. Clicca su PLAY per entrare in una partita!');
            }
        });

        document.getElementById('fz-btn-open-suite').addEventListener('click', (e) => {
            e.stopPropagation();
            const url = `${MODIFIER_URL}/?token=${encodeURIComponent(state.token)}&battleId=${encodeURIComponent(state.battleId)}`;
            window.open(url, '_blank');
        });

        updateUI();
    }

    function updateUI() {
        const hudToken = document.getElementById('fz-hud-token');
        const hudBattle = document.getElementById('fz-hud-battle');
        const dot = document.getElementById('fz-status-dot');

        if (hudToken) {
            hudToken.textContent = state.token
                ? (state.token.length > 25 ? state.token.slice(0, 25) + '...' : state.token)
                : 'In attesa di login/richiesta...';
        }
        if (hudBattle) {
            hudBattle.textContent = state.battleId || 'Avvia una partita...';
        }
        if (dot) {
            dot.style.background = state.token ? '#10b981' : '#ef4444';
            dot.style.boxShadow = state.token ? '0 0 8px #10b981' : 'none';
        }
    }

    // Inizializzazione rapida
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createHUD);
    } else {
        createHUD();
    }
    window.addEventListener('load', createHUD);

    // Observer per agganciarsi al canvas non appena Unity lo inietta
    const observer = new MutationObserver(() => {
        if (document.querySelector('canvas')) {
            createHUD();
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Scansione localStorage e sessionStorage iniziale
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        inspectPayload(k, v, null);
    }
})();
