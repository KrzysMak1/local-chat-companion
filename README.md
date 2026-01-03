# Local Chat Companion

A fully offline, privacy-focused ChatGPT-like application with server-side authentication, multiple chats, and image support. Connects to your local llama.cpp server.

## ✨ Features

- **🔐 Server-side authentication** - Secure login with bcrypt password hashing (SQLite database)
- **🔑 Google Sign-In** - Optional OAuth authentication
- **💬 Multiple chats** - Create and manage multiple conversations
- **🖼️ Image support** - Upload images via file picker OR paste with Ctrl+V
- **📱 Split view** - Open two chats side-by-side
- **🔄 Multi-tab support** - Work across multiple browser tabs
- **📴 Fully offline** - Works without internet connection
- **⚡ Rate limiting** - Protection against brute-force attacks

## 📋 Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18+ | Frontend development |
| Python | 3.10+ | Backend server |
| llama.cpp | Latest | AI model server |

## 🚀 Quick Start

### Option 1: One-Command Start (Recommended)

```bash
# Terminal 1: Start backend
cd server && python start.py

# Terminal 2: Start frontend
npm run dev
```

### Option 2: Step-by-Step

#### 1️⃣ Start llama.cpp Server

```bash
# Basic text model
./llama-server -m your-model.gguf --port 8081 --host 127.0.0.1

# Vision model (for image support)
./llama-server -m llava-v1.6-mistral-7b.Q4_K_M.gguf \
  --mmproj mmproj-model-f16.gguf \
  --port 8081 --host 127.0.0.1
```

#### 2️⃣ Start Python Backend

```bash
cd server

# Create virtual environment (first time only)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure (optional)
cp .env.example .env
# Edit .env as needed

# Start server
python start.py
# OR: uvicorn main:app --reload --port 8000
```

#### 3️⃣ Start Frontend

```bash
npm install
npm run dev
```

#### 4️⃣ Open Browser

Navigate to `http://localhost:8080`, register an account, and start chatting!

## 🔌 Port Configuration

| Service | Default Port | Environment Variable |
|---------|-------------|---------------------|
| Frontend | 8080 | - |
| Backend | 8000 | `PORT` |
| llama.cpp | 8081 | `LLAMA_BASE_URL` |

## ⚙️ Configuration

### Backend Environment Variables

Create `server/.env`:

```env
# llama.cpp server URL
LLAMA_BASE_URL=http://127.0.0.1:8081

# JWT secret (CHANGE THIS!)
JWT_SECRET=your-super-secret-key-change-in-production

# Token expiration (hours)
TOKEN_EXPIRY_HOURS=168

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Frontend Environment Variables

Create `.env` in project root (optional):

```env
# Google OAuth (must match backend)
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### In-App Settings

Click the ⚙️ icon in the sidebar to configure:
- **Backend URL** - Python backend address
- **Temperature** - AI creativity (0.0 - 2.0)
- **Max Tokens** - Response length limit
- **Streaming** - Real-time token display
- **Theme** - Light/dark mode

## 🖼️ Image Support

### Two Ways to Attach Images

1. **📎 File Picker** - Click the paperclip icon
2. **⌨️ Ctrl+V Paste** - Paste from clipboard directly

Supported formats: PNG, JPG, JPEG, WEBP, GIF (max 10MB)

> **Note:** Image analysis requires a vision-capable model (e.g., LLaVA, Obsidian)

## 🔐 Google Sign-In Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select project → **APIs & Services** → **Credentials**
3. **Create Credentials** → **OAuth client ID** → **Web application**
4. Add Authorized JavaScript origins:
   - `http://localhost:8080`
   - `http://localhost:5173`
5. Copy Client ID to both `server/.env` and root `.env`

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│  Python Backend │────▶│  llama.cpp      │
│    (React)      │     │   (FastAPI)     │     │    Server       │
│                 │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     :8080                    :8000                   :8081

     Vite + React          SQLite + JWT           OpenAI-compatible
     Tailwind CSS          Rate limiting          API endpoint
```

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description | Rate Limited |
|--------|----------|-------------|--------------|
| POST | `/auth/register` | Create account | ✅ 5/min |
| POST | `/auth/login` | Login | ✅ 5/min per user |
| POST | `/auth/google` | Google OAuth | ❌ |
| POST | `/auth/logout` | Logout | ❌ |
| GET | `/auth/me` | Current user | ❌ |

### Chats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chats` | List all chats |
| POST | `/chats` | Create chat |
| GET | `/chats/{id}` | Get chat + messages |
| PATCH | `/chats/{id}` | Update chat |
| DELETE | `/chats/{id}` | Delete chat |
| POST | `/chats/{id}/messages` | Send message + get AI response |
| DELETE | `/chats/{id}/messages/{msg_id}` | Delete message |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Backend health |
| GET | `/api/llama/health` | llama.cpp health |
| GET | `/api/llama/models` | Available models |

## 🔧 Troubleshooting

### CORS Errors

```
Access to fetch blocked by CORS policy
```

**Solution:**
1. Ensure backend is running on port 8000
2. Access frontend via `localhost`, not `127.0.0.1`
3. Clear browser cache

### Connection Refused

```
Failed to fetch / ECONNREFUSED
```

**Solution:**
```bash
# Check backend
curl http://localhost:8000/health

# Check llama.cpp
curl http://127.0.0.1:8081/v1/models
```

### No AI Response

**Checklist:**
1. Is llama.cpp running? Check terminal output
2. Is model loaded? Look for "model loaded" message
3. Try disabling streaming in settings
4. Reduce max_tokens to 512

### Authentication Issues

**Solution:**
1. Clear browser localStorage
2. Delete `server/data/database.db`
3. Restart backend and re-register

### Port Already in Use

```bash
# macOS/Linux
lsof -i :8000
kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Image Not Analyzed

**Possible causes:**
1. Model doesn't support vision → Use LLaVA or similar
2. Image too large → Resize to under 10MB
3. Check backend logs for errors

### Rate Limited

```
Too many login attempts
```

**Solution:** Wait 60 seconds, or restart the backend to clear rate limits.

## 💾 Data Storage

All data stored locally in `server/data/`:

| File | Contents |
|------|----------|
| `database.db` | SQLite database (users, chats, messages) |

**Reset all data:**
```bash
rm server/data/database.db
```

## 🔒 Security Notes

- ✅ Passwords hashed with bcrypt (never plaintext)
- ✅ JWT tokens for session management
- ✅ HttpOnly cookies (XSS protection)
- ✅ Rate limiting on auth endpoints
- ✅ CORS configured for localhost only

**For production:**
1. Change `JWT_SECRET` to a strong random value
2. Use HTTPS
3. Configure proper CORS origins
4. Consider adding Argon2 for password hashing

## 📄 License

MIT
