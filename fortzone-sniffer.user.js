// ==UserScript==
// @name         Fortzone Battle Sniffer & Broadcast HUD
// @namespace    https://github.com/grimmjs/FortZoneProfileCheats
// @version      6.0.0
// @description  Intercetta CreateBattle e JoinBattle da qualsiasi frame WebGL con BroadcastChannel
// @match        *://*.crazygames.com/*
// @match        *://*.game-files.crazygames.com/*
// @run-at       document-start
// @allFrames    true
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    var CHANNEL_NAME = "fz_sniffer_bus";
    var broadcast = null;
    try {
        broadcast = new BroadcastChannel(CHANNEL_NAME);
    } catch (e) {}

    var state = {
        token: "",
        battleId: ""
    };

    function notifyData(type, value) {
        if (!value || typeof value !== "string") {
            return;
        }
        var clean = value.trim();
        if (clean.length === 0) {
            return;
        }

        if (type === "TOKEN") {
            if (clean !== state.token) {
                state.token = clean;
                console.log("%c[FORTZONE SNIFFER] TOKEN CATTURATO:", "color:#10b981; font-weight:bold; font-size:14px;", clean);
                updateHudUI();
                if (broadcast) {
                    broadcast.postMessage({ type: "TOKEN", value: clean });
                }
            }
        }

        if (type === "BATTLE_ID") {
            if (clean !== state.battleId && clean !== "0") {
                state.battleId = clean;
                console.log("%c[FORTZONE SNIFFER] BATTLE ID CATTURATO:", "color:#fbbf24; font-weight:bold; font-size:14px;", clean);
                updateHudUI();
                if (broadcast) {
                    broadcast.postMessage({ type: "BATTLE_ID", value: clean });
                }
            }
        }
    }

    if (broadcast) {
        broadcast.onmessage = function(ev) {
            if (ev && ev.data) {
                if (ev.data.type === "TOKEN") {
                    state.token = ev.data.value;
                    updateHudUI();
                }
                if (ev.data.type === "BATTLE_ID") {
                    state.battleId = ev.data.value;
                    updateHudUI();
                }
            }
        };
    }

    function extractJwt(str) {
        if (!str || typeof str !== "string") {
            return null;
        }
        var m = str.match(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
        if (m) {
            return m[0];
        }
        var param = str.match(/(?:^|[?&;]|"|\s)token=([^&"'\s\\]+)/i);
        if (param) {
            return param[1];
        }
        var jsonProp = str.match(/"(?:battleToken|token|sessionToken|authToken)"\s*:\s*"([^"]+)"/i);
        if (jsonProp) {
            return jsonProp[1];
        }
        return null;
    }

    function extractId(str) {
        if (!str || typeof str !== "string") {
            return null;
        }
        var m = str.match(/"(?:battleId|BattleId|value)"\s*:\s*([0-9]{5,12})/);
        if (m) {
            return m[1];
        }
        var m2 = str.match(/(?:battleId|BattleId|lid)=([0-9]{5,12})/i);
        if (m2) {
            return m2[1];
        }
        return null;
    }

    function inspect(url, headers, reqBody, resBody) {
        if (!url || typeof url !== "string") {
            return;
        }
        var isTarget = (
            url.indexOf("Battle") !== -1 ||
            url.indexOf("CreateBattle") !== -1 ||
            url.indexOf("JoinBattle") !== -1 ||
            url.indexOf("protondev") !== -1 ||
            url.indexOf("fahrenheit") !== -1
        );
        if (!isTarget) {
            return;
        }

        console.log("[FORTZONE NETWORK LOG] Trovata richiesta Battle:", url);

        // Regola Screenshot 4: CreateBattle: Token nel Payload o Header, ID nella Response
        if (url.indexOf("CreateBattle") !== -1) {
            var tokReq = extractJwt(reqBody) || extractJwt(headers);
            if (tokReq) {
                notifyData("TOKEN", tokReq);
            }
            var idRes = extractId(resBody);
            if (idRes) {
                notifyData("BATTLE_ID", idRes);
            }
        }

        // Regola Screenshot 3: JoinBattle: ID nel Payload, Token nella Response
        if (url.indexOf("JoinBattle") !== -1) {
            var idReq = extractId(reqBody);
            if (idReq) {
                notifyData("BATTLE_ID", idReq);
            }
            var tokRes = extractJwt(resBody);
            if (tokRes) {
                notifyData("TOKEN", tokRes);
            }
        }

        // Regola generica di sicurezza su qualunque rotta di match
        var fallbackTok = extractJwt(reqBody) || extractJwt(resBody) || extractJwt(headers);
        if (fallbackTok) {
            notifyData("TOKEN", fallbackTok);
        }
        var fallbackId = extractId(resBody) || extractId(reqBody);
        if (fallbackId) {
            notifyData("BATTLE_ID", fallbackId);
        }
    }

    // ------------------------------------------------------------------------
    // INTERCETTAZIONE XHR UNIVERSALE SU TUTTI I FRAME
    // ------------------------------------------------------------------------
    var rawOpen = XMLHttpRequest.prototype.open;
    var rawSend = XMLHttpRequest.prototype.send;
    var rawSetH = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._fz_target_url = url;
        this._fz_target_h = "";
        return rawOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(h, v) {
        this._fz_target_h = (this._fz_target_h || "") + " " + h + ": " + v;
        return rawSetH.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        var xhr = this;
        var u = xhr._fz_target_url;
        var h = xhr._fz_target_h;
        var b = (typeof body === "string") ? body : "";

        xhr.addEventListener("load", function() {
            try {
                inspect(u, h, b, xhr.responseText);
            } catch (e) {}
        });

        return rawSend.apply(this, arguments);
    };

    // ------------------------------------------------------------------------
    // INTERCETTAZIONE FETCH UNIVERSALE
    // ------------------------------------------------------------------------
    if (window.fetch) {
        var rawFetch = window.fetch;
        window.fetch = function() {
            var args = arguments;
            var u = "";
            var b = "";
            var h = "";

            if (args[0]) {
                if (typeof args[0] === "string") {
                    u = args[0];
                } else if (args[0].url) {
                    u = args[0].url;
                }
            }
            if (args[1]) {
                if (args[1].body && typeof args[1].body === "string") {
                    b = args[1].body;
                }
                if (args[1].headers) {
                    try {
                        h = JSON.stringify(args[1].headers);
                    } catch (e) {}
                }
            }

            var promise = rawFetch.apply(this, args);
            return promise.then(function(res) {
                try {
                    var clone = res.clone();
                    clone.text().then(function(txt) {
                        inspect(u, h, b, txt);
                    }).catch(function() {});
                } catch (e) {}
                return res;
            });
        };
    }

    // ------------------------------------------------------------------------
    // RENDERING HUD: UNICO (SOLO NEL TOP WINDOW PER VISIBILITA TOTALE)
    // ------------------------------------------------------------------------
    var tokenLabel;
    var battleLabel;
    var dotBadge;

    function updateHudUI() {
        if (tokenLabel && state.token.length !== 0) {
            tokenLabel.textContent = state.token.slice(0, 20) + "...";
            tokenLabel.style.color = "#34d399";
        }
        if (battleLabel && state.battleId.length !== 0) {
            battleLabel.textContent = state.battleId;
            battleLabel.style.color = "#fbbf24";
        }
        if (dotBadge && state.token.length !== 0) {
            dotBadge.style.background = "#10b981";
        }
    }

    function createSingleHUD() {
        // Mostra l'HUD unicamente nel frame principale (top) per evitare duplicati
        if (window.top !== window.self) {
            return;
        }
        if (document.getElementById("fz-unified-hud")) {
            return;
        }

        var box = document.createElement("div");
        box.id = "fz-unified-hud";
        box.style.cssText = "position:fixed; bottom:16px; left:16px; z-index:2147483647; background:rgba(10,15,28,0.96); border:1px solid #38bdf8; border-radius:10px; padding:12px 16px; color:#ffffff; font-family:monospace; font-size:11px; width:270px; box-shadow:0 0 20px rgba(56,189,248,0.35); pointer-events:auto;";

        var bar = document.createElement("div");
        bar.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.12); padding-bottom:5px;";

        var title = document.createElement("span");
        title.textContent = "⚡ FORTZONE SNIFFER";
        title.style.cssText = "font-weight:bold; color:#38bdf8; font-size:12px;";

        dotBadge = document.createElement("span");
        dotBadge.style.cssText = "width:10px; height:10px; border-radius:50%; background:#ef4444;";

        bar.appendChild(title);
        bar.appendChild(dotBadge);
        box.appendChild(bar);

        var guide = document.createElement("div");
        guide.textContent = "Avvia la partita (PLAY) per estrarre:";
        guide.style.cssText = "font-size:10px; color:#94a3b8; margin-bottom:6px;";
        box.appendChild(guide);

        var tokRow = document.createElement("div");
        tokRow.textContent = "TOKEN: ";
        tokenLabel = document.createElement("span");
        tokenLabel.textContent = "In attesa di PLAY...";
        tokenLabel.style.color = "#ef4444";
        tokRow.appendChild(tokenLabel);
        box.appendChild(tokRow);

        var idRow = document.createElement("div");
        idRow.textContent = "BATTLE ID: ";
        battleLabel = document.createElement("span");
        battleLabel.textContent = "In attesa di PLAY...";
        battleLabel.style.color = "#ef4444";
        idRow.appendChild(battleLabel);
        box.appendChild(idRow);

        var actions = document.createElement("div");
        actions.style.cssText = "display:flex; gap:6px; margin-top:10px;";

        var copyTokBtn = document.createElement("button");
        copyTokBtn.textContent = "Copy Token";
        copyTokBtn.style.cssText = "flex:1; padding:6px; cursor:pointer; font-size:10px; background:#1e293b; color:#fff; border:1px solid #475569; border-radius:4px;";
        copyTokBtn.addEventListener("click", function() {
            if (state.token.length !== 0) {
                if (typeof GM_setClipboard !== "undefined") {
                    GM_setClipboard(state.token);
                } else {
                    navigator.clipboard.writeText(state.token);
                }
                alert("Battle Token copiato!");
            } else {
                alert("Nessun Token catturato. Premi PLAY!");
            }
        });

        var copyIdBtn = document.createElement("button");
        copyIdBtn.textContent = "Copy ID";
        copyIdBtn.style.cssText = "flex:1; padding:6px; cursor:pointer; font-size:10px; background:#1e293b; color:#fff; border:1px solid #475569; border-radius:4px;";
        copyIdBtn.addEventListener("click", function() {
            if (state.battleId.length !== 0) {
                if (typeof GM_setClipboard !== "undefined") {
                    GM_setClipboard(state.battleId);
                } else {
                    navigator.clipboard.writeText(state.battleId);
                }
                alert("Battle ID copiato!");
            } else {
                alert("Nessun Battle ID catturato. Premi PLAY!");
            }
        });

        actions.appendChild(copyTokBtn);
        actions.appendChild(copyIdBtn);
        box.appendChild(actions);

        var suiteBtn = document.createElement("button");
        suiteBtn.textContent = "Apri Suite Cloudflare 🚀";
        suiteBtn.style.cssText = "width:100%; margin-top:6px; padding:6px; cursor:pointer; font-size:10px; background:#0284c7; color:#fff; border:none; border-radius:4px; font-weight:bold;";
        suiteBtn.addEventListener("click", function() {
            var url = "https://fortzoneprofilecheats.sadness-grimm.workers.dev/?token=" + encodeURIComponent(state.token) + "&battleId=" + encodeURIComponent(state.battleId);
            window.open(url, "_blank");
        });
        box.appendChild(suiteBtn);

        var target = document.body || document.documentElement;
        if (target) {
            target.appendChild(box);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createSingleHUD);
    } else {
        createSingleHUD();
    }
})();
