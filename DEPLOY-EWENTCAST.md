# ewentcast.com par live deploy

EventLifter (Next.js) ko **https://ewentcast.com** par production mein chalane ka guide.

---

## Overview

| Cheez | Detail |
|--------|--------|
| App | Next.js 16 (`npm run build` + `npm run start`) |
| Default port | `3000` |
| Config file | `settings.json` (repo ke bahar / server par — git mein nahi) |
| Auth | HighTribe login → token browser `localStorage` mein |
| Webhooks | Public HTTPS URL zaroori (Luma + Eventbrite register hote hain) |
| Data | `data/event-registry.json` — persistent folder chahiye |

---

## 1. DNS setup

Domain registrar (Namecheap, Cloudflare, GoDaddy, etc.) par:

```
Type    Name    Value              TTL
A       @       <server-public-IP>  Auto
A       www     <server-public-IP>  Auto
```

Ya Cloudflare use kar rahe ho to **orange cloud (proxy) ON** rakho — SSL aur DDoS protection ke liye.

Verify:

```bash
ping ewentcast.com
```

---

## 2. Server requirements

- **Ubuntu 22.04 / 24.04** (ya koi Linux VPS) — recommended
- **Node.js 20 LTS** ya **22 LTS**
- **Nginx** ya **Apache** (reverse proxy)
- **SSL** — Let's Encrypt (Certbot) ya Cloudflare Full SSL

```bash
# Node (nvm example)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v   # v20.x
```

---

## 3. Code deploy karo

```bash
# Server par
cd /var/www
git clone <your-repo-url> eventlifter-core
cd eventlifter-core
npm ci
npm run build
```

**Important:** `settings.json` git mein nahi hai. Server par manually banao:

```bash
cp settings.example.json settings.json   # agar example hai
# ya neeche wala template use karo
nano settings.json
```

### `settings.json` (production template)

```json
{
  "eventbrite": {
    "clientId": "YOUR_EB_CLIENT_ID",
    "clientSecret": "YOUR_EB_CLIENT_SECRET",
    "redirectUri": "https://ewentcast.com/api/eventbrite/callback",
    "privateToken": "YOUR_EB_PRIVATE_TOKEN",
    "publicToken": ""
  },
  "luma": {
    "apiKey": "YOUR_LUMA_PLUS_API_KEY",
    "calendarId": "",
    "apiBaseUrl": "https://public-api.luma.com",
    "discoverBaseUrl": "https://api.lu.ma"
  },
  "hightribe": {
    "serviceUrl": "https://api.hightribe.com",
    "apiKey": ""
  }
}
```

### Optional env (`.env` ya systemd)

```bash
# Agar HighTribe API alag host par ho
HT_API_BASE=https://api.hightribe.com

NODE_ENV=production
PORT=3000
```

### Persistent data folder

```bash
mkdir -p data
chmod 755 data
# event-registry.json yahan auto-create hoga
```

---

## 4. PM2 se app chalao (recommended)

```bash
npm install -g pm2
cd /var/www/eventlifter-core
pm2 start npm --name "ewentcast" -- start
pm2 save
pm2 startup   # reboot ke baad auto-start
```

Check:

```bash
pm2 status
curl -I http://127.0.0.1:3000
```

Logs:

```bash
pm2 logs ewentcast
```

---

## 5. Nginx reverse proxy + SSL

### Nginx site config

`/etc/nginx/sites-available/ewentcast.com`:

```nginx
server {
    listen 80;
    server_name ewentcast.com www.ewentcast.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ewentcast.com www.ewentcast.com;

    ssl_certificate     /etc/letsencrypt/live/ewentcast.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ewentcast.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable + SSL:

```bash
sudo ln -s /etc/nginx/sites-available/ewentcast.com /etc/nginx/sites-enabled/
sudo certbot --nginx -d ewentcast.com -d www.ewentcast.com
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Apache reverse proxy (Laragon / cPanel style)

Agar Apache use kar rahe ho (jaise local Laragon par `eventlifter-core.test`):

```apache
<VirtualHost *:443>
    ServerName ewentcast.com
    ServerAlias www.ewentcast.com

    SSLEngine on
    SSLCertificateFile    /path/to/fullchain.pem
    SSLCertificateKeyFile /path/to/privkey.pem

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Host "ewentcast.com"
</VirtualHost>
```

Modules enable:

```bash
sudo a2enmod proxy proxy_http ssl headers
sudo systemctl reload apache2
```

**Note:** Production VPS par Nginx + PM2 zyada common hai. Laragon sirf local dev ke liye best hai.

---

## 7. Channel credentials (Settings page)

Browser mein kholo: **https://ewentcast.com/settings**

| Channel | Kya chahiye |
|---------|-------------|
| HighTribe | `serviceUrl` = `https://api.hightribe.com` (ya apna backend URL) |
| Luma | Luma Plus API key |
| Eventbrite | OAuth `clientId` + `clientSecret` + `privateToken` |

### Eventbrite OAuth redirect

Eventbrite Developer app mein redirect URI set karo:

```
https://ewentcast.com/api/eventbrite/callback
```

`settings.json` ki `redirectUri` bhi **exact same** honi chahiye.

---

## 8. Webhooks register karo (ticket sync)

Webhooks ke liye app **public HTTPS** par honi chahiye — `localhost` par Luma/Eventbrite register nahi karte.

### Option A — Settings UI

1. Login karo → **Settings**
2. **Webhook setup** section → **Register webhooks** button

### Option B — API

```bash
curl -X POST https://ewentcast.com/api/webhooks/setup
```

Expected endpoints:

| Channel | URL |
|---------|-----|
| Luma | `https://ewentcast.com/api/webhooks/luma` |
| Eventbrite | `https://ewentcast.com/api/webhooks/eventbrite` |
| HighTribe | `https://ewentcast.com/api/webhooks/hightribe` |

HighTribe ke liye booking notification URL manually backend mein set karna pad sakta hai.

Verify:

```bash
curl https://ewentcast.com/api/webhooks/setup
```

---

## 9. Deploy ke baad checklist

- [ ] `https://ewentcast.com` khulta hai (no SSL error)
- [ ] Login page → HighTribe credentials se login
- [ ] Events page par HT / Luma / EB events load hote hain
- [ ] **+ Create Event** modal khulta hai
- [ ] **Edit** same wizard form kholta hai
- [ ] `settings.json` permissions: sirf app user read/write (`chmod 600`)
- [ ] `data/` folder writable hai
- [ ] Webhooks register ho gaye (`POST /api/webhooks/setup` success)
- [ ] Eventbrite redirect URI production URL par set hai

---

## 10. Updates (naya code push)

```bash
cd /var/www/eventlifter-core
git pull
npm ci
npm run build
pm2 restart ewentcast
```

`settings.json` aur `data/` **git pull se overwrite mat karo** — ye server par rehte hain.

---

## 11. Common issues

### Apache directory listing / site nahi chal raha

Next.js directly Apache document root se nahi chalti. Hamesha **proxy → port 3000** use karo aur `npm run start` / PM2 running ho.

### Webhooks fail

- URL publicly reachable honi chahiye (ngrok sirf testing ke liye)
- `X-Forwarded-Proto: https` proxy headers set hon
- Luma Plus account + valid API key

### Luma events nahi aa rahe

- Settings mein API key save hai?
- `settings.json` server par sahi path par hai (`process.cwd()` = app root)

### HTTPS handshake error (local Laragon jaisa)

Production par Let's Encrypt ya Cloudflare SSL use karo. Self-signed cert browser block karta hai.

---

## 12. Quick reference

```bash
# Build
npm run build

# Production start
npm run start          # PORT=3000 default

# Dev (local only)
npm run dev

# Health check
curl -I https://ewentcast.com
curl https://ewentcast.com/api/webhooks/setup
```

---

## Architecture (simple)

```
User browser
    ↓ HTTPS
ewentcast.com (Nginx/Apache :443)
    ↓ proxy
Next.js (127.0.0.1:3000)
    ↓
├── settings.json  → Luma / Eventbrite / HT keys
├── data/event-registry.json
└── APIs → HighTribe, Luma, Eventbrite (+ inbound webhooks)
```

---

**Domain:** `ewentcast.com`  
**App name:** EventLifter Core  
**Support:** Settings → channel status + PM2 logs check karo pehle.
