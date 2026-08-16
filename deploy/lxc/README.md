# Running the web app in an LXC container (systemd)

Two `systemd` services on one host: `sf-seed-server` (Express backend, port 3001)
and `sf-seed-web` (Next.js frontend, port 3000). Both run as an unprivileged
`sfseed` user. Because they share a host, the frontend proxies `/api` and `/logs`
to the backend at the default `http://localhost:3001` — no build arg needed.

Tested against a Debian 12 / Ubuntu 24.04 unprivileged LXC. Run as root inside
the container unless noted.

## 1. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
```

## 2. User and directories

```bash
useradd --system --home /opt/sf-seed --shell /usr/sbin/nologin sfseed
mkdir -p /opt/sf-seed /etc/sf-seed /var/lib/sf-seed/logs
```

## 3. Get the code and build

```bash
git clone <repo-url> /opt/sf-seed
cd /opt/sf-seed/web
npm ci
npm run build            # produces .next/ that `next start` serves
```

If you set non-default origins, they are only needed at runtime here (backend reads
them from the env file) — the frontend's proxy target uses the localhost default,
which is correct for a single host, so no rebuild is required to change URLs.

## 4. Configuration

```bash
cp /opt/sf-seed/deploy/lxc/sf-seed.env.example /etc/sf-seed/sf-seed.env
# Set SESSION_SECRET (openssl rand -hex 32) and, for LAN access, CLIENT_URL/SERVER_URL
# to this container's address. Then lock it down:
chown sfseed:sfseed /etc/sf-seed/sf-seed.env
chmod 600 /etc/sf-seed/sf-seed.env
chown -R sfseed:sfseed /opt/sf-seed /var/lib/sf-seed
```

## 5. Install and start the services

```bash
cp /opt/sf-seed/deploy/lxc/sf-seed-server.service /etc/systemd/system/
cp /opt/sf-seed/deploy/lxc/sf-seed-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sf-seed-server sf-seed-web
```

Check status and logs:

```bash
systemctl status sf-seed-server sf-seed-web
journalctl -u sf-seed-server -f
curl -s http://localhost:3001/api/health
```

## Access

Browse to `http://<container-ip>:3000`. The Socket.IO connection for live progress
goes directly from the browser to `<container-ip>:3001`, so **`CLIENT_URL` in the env
file must equal the origin you browse to** or CORS will reject the WebSocket. Both
ports must be reachable from your machine.

## Updating

```bash
cd /opt/sf-seed && git pull
cd web && npm ci && npm run build
chown -R sfseed:sfseed /opt/sf-seed
systemctl restart sf-seed-server sf-seed-web
```
