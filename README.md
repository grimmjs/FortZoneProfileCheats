# Fortzone Modifier — Web Suite

A web-based match modification, farm utility, rating regulator, wings/characters unlocker, and nickname injection toolkit for Fortzone Battle Royale.

Re-engineered directly from analysis of the Fortzone Playbook application architecture.

## Features

- **LVL / Coins / Crystals Farm**:
  - Connects to `POST /Battle/FinishBattle` on `https://protondev.xyz:8511`.
  - Injects full victory battle payload with custom grenade/weapon damage metrics to yield maximum soft currency (Coins), hard currency (Gems), and player EXP.
  - Generates shareable configuration links containing pre-filled parameters.
- **Rating / KD Engine**:
  - Connects to `POST /Battle/CreateBattle` and `POST /Battle/FinishBattle`.
  - Supports Ranked (17), Normal (15), and Competitive (18) battle modes.
  - Configurable Victory (2), Victory alt (0), or Defeat (1) results to manipulate kill/death ratios and rating points.
- **Premium Wings Collection**:
  - Unlocks Ice Wings (IDs 12–20) and Fire Wings (IDs 21–31).
  - Integrates `POST /Accessory/BuyAccessory` and `POST /Accessory/SetCurrentChar` for immediate purchase and equip.
  - One-click batch purchase tools (All, Ice only, Fire only).
- **Premium Characters Store**:
  - Unlocks and equips heroes: Luna (#103), Zoe (#104), Nona (#107), Malik (#108), Rex (#109), Zoro (#111).
  - Direct integration with `POST /Character/BuyCharacter`.
- **Cyberpunk Nickname Injection**:
  - Interacts with `POST https://fahrenheit-dev.com/fz3/Nicks/ChangeNick`.
  - Automated loop injection mechanism with configurable millisecond delay.
  - Built-in token normalizer with base64/URL encoding handling.

## Deployment to Cloudflare Pages (Recommended)

1. Collega il repository GitHub su **Cloudflare Dashboard** > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Impostazioni di Build:
   - **Framework preset**: `None`
   - **Build command**: *(lascia vuoto)*
   - **Build output directory**: `/` (o root)
3. Clicca **Save and Deploy**.
4. Il proxy Edge integrato in `functions/proxy.js` verrà distribuito automaticamente su Cloudflare, bypassando qualsiasi blocco CORS del browser verso i server di gioco con zero configurazioni manuali.

## Deployment to GitHub Pages

1. Create a repository on GitHub (e.g. `fortzone-modifier`).
2. Push this repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Fortzone Modifier suite"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
3. In your GitHub repository settings:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment**, set **Source** to `Deploy from a branch`.
   - Select branch `main` and folder `/ (root)`, then click **Save**.
4. Your site will be published at `https://<your-username>.github.io/<your-repo-name>/`.

## CORS Configuration

When running from a browser on GitHub Pages, calls directly to `protondev.xyz:8511` might be subject to browser CORS policies.
A built-in **API / Proxy Config** panel in the top-right header allows configuring an optional proxy (such as `https://corsproxy.io/?`) or custom proxy URLs without editing code.
