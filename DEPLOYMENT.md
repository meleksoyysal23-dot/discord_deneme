# 🚀 Vibe-Voice Deployment Guide

## Production Deployment Options

### Option 1: Docker (Recommended)

**Prerequisites:**
- Docker 20+
- Docker Compose 2+

**Steps:**

1. **Clone repository:**
   ```bash
   git clone <your-repo-url>
   cd vibe-voice
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

3. **Build and start:**
   ```bash
   docker-compose up -d --build
   ```

4. **Verify:**
   ```bash
   docker-compose ps
   curl http://localhost:3001/api/health
   ```

5. **View logs:**
   ```bash
   docker-compose logs -f
   ```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

---

### Option 2: Manual Deployment

#### Backend Deployment

1. **Install dependencies:**
   ```bash
   cd backend
   npm ci --production
   ```

2. **Configure environment:**
   ```bash
   cp ../.env.example .env
   # Edit .env
   ```

3. **Start with PM2 (recommended):**
   ```bash
   npm install -g pm2
   pm2 start server.js --name vibe-voice-backend
   pm2 save
   pm2 startup
   ```

4. **Or use systemd:**
   ```bash
   sudo nano /etc/systemd/system/vibe-voice.service
   ```
   
   ```ini
   [Unit]
   Description=Vibe-Voice Backend
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/path/to/vibe-voice/backend
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   Environment=NODE_ENV=production
   Environment=PORT=3001

   [Install]
   WantedBy=multi-user.target
   ```
   
   ```bash
   sudo systemctl enable vibe-voice
   sudo systemctl start vibe-voice
   ```

#### Frontend Deployment

1. **Build production bundle:**
   ```bash
   cd frontend
   npm ci
   npm run build
   ```

2. **Deploy `dist/` folder:**
   - Copy to web server (Nginx, Apache, etc.)
   - Or use static hosting (Vercel, Netlify, Cloudflare Pages)

3. **Nginx configuration:**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /var/www/vibe-voice/dist;
       index index.html;

       # SPA fallback
       location / {
           try_files $uri $uri/ /index.html;
       }

       # API proxy
       location /api {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
       }

       # Socket.io proxy
       location /socket.io {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

---

### Option 3: Cloud Platforms

#### Vercel (Frontend)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   cd frontend
   vercel
   ```

3. **Set environment variables:**
   ```bash
   vercel env add VITE_BACKEND_URL
   # Enter: https://your-backend-domain.com
   ```

#### Railway/Render (Backend)

1. **Connect GitHub repo**
2. **Set root directory:** `backend`
3. **Set environment variables:**
   - `NODE_ENV=production`
   - `PORT=3001`
   - `CORS_ORIGIN=https://your-frontend-domain.com`
   - `MAX_ROOM_SIZE=4`

---

## SSL/HTTPS Configuration

### Let's Encrypt (Nginx)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Cloudflare (Recommended)

1. **Add your domain to Cloudflare**
2. **Enable "Always Use HTTPS"**
3. **Set SSL/TLS mode to "Full (strict)"**
4. **Point DNS to your server**

---

## TURN Server (For Production WebRTC)

STUN servers work for LAN, but production needs TURN for symmetric NAT:

### Using coturn

```bash
sudo apt install coturn
```

**Edit `/etc/turnserver.conf`:**
```
listening-port=3478
fingerprint
lt-cred-mech
user=username:password
realm=your-domain.com
```

**Update frontend WebRTC config:**
```javascript
// frontend/src/services/webrtc.js
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turn:your-domain.com:3478',
      username: 'username',
      credential: 'password'
    },
  ],
};
```

---

## Environment Variables Reference

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment (development/production) |
| `PORT` | `3001` | Backend port |
| `HOST` | `localhost` | Backend host |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `MAX_ROOM_SIZE` | `4` | Max users per room |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `http://localhost:3001` | Backend API URL |

---

## Monitoring & Logging

### Backend Logs

**PM2:**
```bash
pm2 logs vibe-voice-backend
```

**Systemd:**
```bash
journalctl -u vibe-voice -f
```

**Docker:**
```bash
docker-compose logs -f backend
```

### Health Checks

```bash
curl http://localhost:3001/api/health
```

---

## Security Checklist

- [ ] HTTPS enabled (SSL certificate)
- [ ] CORS_ORIGIN set to production domain
- [ ] NODE_ENV=production
- [ ] Rate limiting configured
- [ ] Input validation active
- [ ] No hardcoded secrets
- [ ] Environment variables secured
- [ ] TURN server configured (if needed)
- [ ] Firewall configured (only expose 80, 443, 3478)
- [ ] Regular backups enabled

---

## Troubleshooting

### Backend won't start
```bash
# Check port availability
netstat -ano | findstr :3001

# Kill process
taskkill /PID <PID> /F

# Check logs
docker-compose logs backend
```

### Frontend can't connect to backend
- Verify `VITE_BACKEND_URL` is correct
- Check CORS settings in backend
- Ensure backend is running
- Check firewall rules

### WebRTC connection fails
- Verify STUN/TURN servers are accessible
- Check browser console for ICE errors
- Ensure HTTPS is used (WebRTC requires secure context)
- Configure TURN server for symmetric NAT

---

## Performance Optimization

### Backend
- Enable clustering for multi-core CPUs
- Use Redis adapter for Socket.io (multi-server)
- Add caching layer (Redis)

### Frontend
- Enable CDN for static assets
- Use HTTP/2
- Enable Brotli compression
- Optimize images

---

## Support

For issues and questions:
- GitHub Issues: [your-repo]/issues
- Documentation: README.md

---

**Last Updated:** November 2026  
**Version:** 1.0.0