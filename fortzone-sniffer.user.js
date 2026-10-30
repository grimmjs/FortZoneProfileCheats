// ==UserScript==
// @name         Fortzone Credential Sniffer & Profile Injector
// @namespace    https://github.com/grimmjs/FortZoneProfileCheats
// @version      1.0.0
// @description  Cattura in automatico Token e Battle ID da Fortzone e li invia con 1-click alla suite di modifica
// @author       grimmjs
// @match        *://*.crazygames.com/*
// @match        *://fortzone-battle-royale-xkd.game-files.crazygames.com/*
// @match        *://*.game-files.crazygames.com/*
// @run-at       document-start
// @grant        GM_setClipboard
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    const MODIFIER_URL = "https://fortzoneprofilecheats.sadness-grimm.workers.dev";
    let capturedToken = localStorage.getItem('fz_captured_token') || "";
    let capturedBattleId = localStorage.getItem('fz_captured_battle_id') || "";

    // Hook Fetch API
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const url = args[0] ? (typeof args[0] === 'string' ? args[0] : args[0].url) : '';
            const opts = args[1] || {};

            if (url && (url.includes('protondev.xyz') || url.includes('fahrenheit-dev.com'))) {
                const body = opts.body || '';
                inspectPayload(body);
            }
        } catch (e) {}

        const response = await originalFetch.apply(this, args);

        try {
            const url = args[0] ? (typeof args[0] === 'string' ? args[0] : args[0].url) : '';
            if (url && url.includes('/Battle/CreateBattle')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.value) {
                        saveBattleId(String(data.value));
                    }
                }).catch(() => {});
            }
        } catch (e) {}

        return response;
    };

    // Hook XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (this._url && (this._url.includes('protondev.xyz') || this._url.includes('fahrenheit-dev.com'))) {
            inspectPayload(body);
        }

        this.addEventListener('load', function() {
            try {
                if (this._url && this._url.includes('/Battle/CreateBattle')) {
                    const data = JSON.parse(this.responseText);
                    if (data && data.value) {
                        saveBattleId(String(data.value));
                    }
                }
            } catch (e) {}
        });

        return originalSend.apply(this, arguments);
    };

    // Parser di payload e parametri
    function inspectPayload(body) {
        if (!body) return;
        const str = typeof body === 'string' ? body : '';

        // Estrazione token
        const tokenMatch = str.match(/(?:token|sessionToken)=([^&]+)/i);
        if (tokenMatch && tokenMatch[1]) {
            let t = decodeURIComponent(tokenMatch[1]).trim();
            saveToken(t);
        }

        // Estrazione Battle ID
        const battleMatch = str.match(/(?:battleId|BattleId)=([^&]+)/i);
        if (battleMatch && battleMatch[1]) {
            saveBattleId(decodeURIComponent(battleMatch[1]).trim());
        }

        // Estrazione da JSON 'data='
        const dataMatch = str.match(/data=([^&]+)/i);
        if (dataMatch && dataMatch[1]) {
            try {
                const parsed = JSON.parse(decodeURIComponent(dataMatch[1]));
                if (parsed.BattleId) saveBattleId(String(parsed.BattleId));
            } catch (e) {}
        }
    }

    function saveToken(token) {
        if (token && token !== capturedToken) {
            capturedToken = token;
            localStorage.setItem('fz_captured_token', token);
            updateUI();
        }
    }

    function saveBattleId(id) {
        if (id && id !== capturedBattleId) {
            capturedBattleId = id;
            localStorage.setItem('fz_captured_battle_id', id);
            updateUI();
        }
    }

    // Overlay HUD Minimal su schermo
    function createHUD() {
        if (document.getElementById('fz-sniffer-hud')) return;

        const hud = document.createElement('div');
        hud.id = 'fz-sniffer-hud';
        hud.style.cssText = `
            position: fixed;
            bottom: 16px;
            left: 16px;
            z-index: 9999999;
            background: rgba(5, 7, 13, 0.95);
            border: 1px solid rgba(0, 212, 255, 0.4);
            box-shadow: 0 0 25px rgba(0, 212, 255, 0.25);
            border-radius: 12px;
            padding: 12px 16px;
            color: #f8fafc;
            font-family: monospace, sans-serif;
            font-size: 11px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            backdrop-filter: blur(8px);
            min-width: 250px;
        `;

        hud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
                <span style="font-weight:bold; color:#38bdf8;">⚡ FORTZONE SNIFFER</span>
                <span id="fz-status-dot" style="width:8px; height:8px; border-radius:50%; background:#ef4444;"></span>
            </div>
            <div>
                <div style="color:#94a3b8; font-size:10px;">BATTLE ID:</div>
                <div id="fz-hud-battle" style="font-weight:bold; color:#fbbf24;">Waiting for match...</div>
            </div>
            <div>
                <div style="color:#94a3b8; font-size:10px;">SESSION TOKEN:</div>
                <div id="fz-hud-token" style="font-weight:bold; color:#34d399; word-break:break-all;">Waiting for request...</div>
            </div>
            <div style="display:flex; gap:6px; margin-top:4px;">
                <button id="fz-btn-copy-token" style="flex:1; padding:5px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#fff; cursor:pointer; font-size:10px;">Copy Token</button>
                <button id="fz-btn-open-suite" style="flex:1.2; padding:5px; background:linear-gradient(90deg, #06b6d4, #2563eb); border:none; border-radius:6px; color:#fff; font-weight:bold; cursor:pointer; font-size:10px;">Open Suite 🚀</button>
            </div>
        `;

        document.body.appendChild(hud);

        document.getElementById('fz-btn-copy-token').addEventListener('click', () => {
            if (capturedToken) {
                if (typeof GM_setClipboard !== 'undefined') {
                    GM_setClipboard(capturedToken);
                } else {
                    navigator.clipboard.writeText(capturedToken);
                }
                alert('Token copiato negli appunti!');
            } else {
                alert('Nessun token ancora catturato. Avvia una partita!');
            }
        });

        document.getElementById('fz-btn-open-suite').addEventListener('click', () => {
            const url = `${MODIFIER_URL}/?token=${encodeURIComponent(capturedToken)}&battleId=${encodeURIComponent(capturedBattleId)}`;
            window.open(url, '_blank');
        });

        updateUI();
    }

    function updateUI() {
        const hudToken = document.getElementById('fz-hud-token');
        const hudBattle = document.getElementById('fz-hud-battle');
        const dot = document.getElementById('fz-status-dot');

        if (hudToken && capturedToken) {
            hudToken.textContent = capturedToken.length > 25 ? capturedToken.slice(0, 25) + '...' : capturedToken;
        }
        if (hudBattle && capturedBattleId) {
            hudBattle.textContent = capturedBattleId;
        }
        if (dot && capturedToken) {
            dot.style.background = '#10b981';
            dot.style.boxShadow = '0 0 8px #10b981';
        }
    }

    // Inizializza UI appena il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createHUD);
    } else {
        createHUD();
    }
})();
