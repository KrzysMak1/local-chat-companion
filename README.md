# Local Chat Companion

A privacy-focused chat application that connects to your local AI server (llama.cpp) with support for multiple chats, image uploads, and server-side authentication.

## Features

- **Server-side authentication**: Secure login with bcrypt password hashing
- **Google Sign-In**: Optional OAuth authentication with Google
- **Multiple chats**: Create and manage multiple conversations
- **Split view**: Open two chats side-by-side for parallel conversations
- **Image support**: Upload images and get AI analysis (requires vision-capable model)
- **Multi-tab support**: Work across multiple browser tabs with the same account
- **Offline-first**: Works entirely locally without internet connection
- **ChatGPT-like UI**: Familiar interface with sidebar, chat history, and settings

## Prerequisites

- **Node.js 18+** for the frontend
- **Python 3.10+** for the backend
- **llama.cpp server** running with OpenAI-compatible API

## Quick Start

### 1. Start llama.cpp Server

```bash
# Example with llama.cpp server
./llama-server -m your-model.gguf --port 8081 --host 127.0.0.1

# For vision models (image support)
./llama-server -m llava-model.gguf --mmproj mmproj-model.gguf --port 8081
```

The server should be accessible at `http://127.0.0.1:8081`.

### 2. Start the Python Backend

```bash
cd server

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (optional)
cp .env.example .env
# Edit .env to customize LLAMA_BASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, etc.

# Run the backend
uvicorn main:app --reload --port 8000
```

The backend API will be available at `http://localhost:8000`.

### 3. Start the Frontend

```bash
# In the project root directory
npm install
npm run dev
```

The frontend will be available at `http://localhost:8080` (or the port shown in terminal).

### 4. Create an Account and Start Chatting

1. Open the frontend URL in your browser
2. Click "Register" to create a new account (or use Google Sign-In if configured)
3. Log in with your credentials
4. Start a new chat and begin conversing!

## Google Sign-In Setup (Optional)

To enable "Sign in with Google":

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** > **Credentials**

### 2. Create OAuth 2.0 Client ID

1. Click **Create Credentials** > **OAuth client ID**
2. Select **Web application**
3. Set name (e.g., "Local Chat Companion")
4. Add **Authorized JavaScript origins**:
   - `http://localhost:8080`
   - `http://localhost:5173`
   - `http://127.0.0.1:8080`
5. Click **Create**
6. Copy the **Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)

### 3. Configure Backend

Add to `server/.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### 4. Configure Frontend

Create `.env` in project root:

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### 5. Restart Both Servers

The Google Sign-In button will now appear on the login screen.

## Configuration

### Backend Environment Variables

Create a `.env` file in the `/server` directory:

```env
# llama.cpp server URL
LLAMA_BASE_URL=http://127.0.0.1:8081

# JWT secret for authentication (change in production!)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Token expiration in hours
TOKEN_EXPIRY_HOURS=24

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Frontend Environment Variables

Create a `.env` file in the project root:

```env
# Google OAuth (optional - must match backend)
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Frontend Settings

In the app, click the **Settings** icon in the sidebar to configure:

- **Backend URL**: URL of the Python backend (default: `http://localhost:8000`)
- **Temperature**: AI response creativity (0.0 - 2.0)
- **Max Tokens**: Maximum response length
- **Streaming**: Enable/disable streaming responses
- **Model**: Select the model to use (if multiple available)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│  Python Backend │────▶│  llama.cpp      │
│    (React)      │     │    (FastAPI)    │     │    Server       │
│                 │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     :8080                    :8000                   :8081
```

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Python FastAPI with JWT auth + Google OAuth
- **AI Server**: llama.cpp with OpenAI-compatible API

## API Endpoints

### Authentication

| Method | Endpoint          | Description                |
|--------|-------------------|----------------------------|
| POST   | `/auth/register`  | Create new account         |
| POST   | `/auth/login`     | Login with username/pass   |
| POST   | `/auth/google`    | Login with Google ID token |
| POST   | `/auth/logout`    | Logout (clears token)      |
| GET    | `/auth/me`        | Get current user info      |

### Chats

| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| GET    | `/chats`                        | List all user's chats    |
| POST   | `/chats`                        | Create new chat          |
| GET    | `/chats/{id}`                   | Get chat with messages   |
| PUT    | `/chats/{id}`                   | Update chat (title, etc) |
| DELETE | `/chats/{id}`                   | Delete chat              |
| POST   | `/chats/{id}/messages`          | Add message to chat      |
| DELETE | `/chats/{id}/messages/{msg_id}` | Delete a message         |

### AI Proxy

| Method | Endpoint    | Description                      |
|--------|-------------|----------------------------------|
| POST   | `/api/chat` | Send message, get AI response    |

## Image Support

To use image analysis:

1. Run a vision-capable model (e.g., LLaVA, Obsidian)
2. Click the 📎 (paperclip) icon in the chat input
3. Select an image (PNG, JPG, WEBP, GIF - max 10MB)
4. Add your question and send

The image is sent as base64 to the backend, which forwards it to llama.cpp in OpenAI vision format.

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. Make sure the backend is running on port 8000
2. Check that frontend URL is in the backend's CORS origins
3. Try clearing browser cache and reloading

### "Failed to fetch" or Connection Refused

1. Verify the backend is running: `curl http://localhost:8000/health`
2. Verify llama.cpp is running: `curl http://127.0.0.1:8081/v1/models`
3. Check firewall settings if on Windows

### No Response from AI

1. Check llama.cpp server logs for errors
2. Verify the model is loaded correctly
3. Try reducing `max_tokens` in settings
4. Check if streaming is causing issues (try disabling it)

### Authentication Issues

1. Clear localStorage in browser dev tools
2. Delete `server/data/sessions.json` and restart backend
3. Re-register a new account

### Google Sign-In Not Working

1. Verify `GOOGLE_CLIENT_ID` is set in both backend `.env` and frontend `.env`
2. Check that the client ID matches in both files
3. Ensure `http://localhost:8080` is in Authorized JavaScript origins in Google Cloud Console
4. Check browser console for detailed error messages
5. Make sure you're accessing from `localhost`, not `127.0.0.1`

### Port Already in Use

```bash
# Find process using port 8000
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill the process or use a different port
uvicorn main:app --port 8001
```

## Data Storage

All data is stored locally:

- **Users**: `server/data/users.json` (passwords are bcrypt hashed, Google accounts linked by google_id)
- **Sessions**: `server/data/sessions.json`
- **Chats**: `server/data/chats/{user_id}.json`

To reset all data, delete the contents of `server/data/` (keep `.gitkeep`).

## Security Notes

- Passwords are hashed with bcrypt (never stored in plain text)
- Google accounts are verified using Google's official OAuth library
- JWT tokens are used for session management
- All API endpoints require authentication (except `/auth/register`, `/auth/login`, `/auth/google`)
- CORS is configured for localhost only by default

For production use:
1. Change `JWT_SECRET` to a strong random value
2. Use HTTPS
3. Configure proper CORS origins
4. Consider adding rate limiting
5. Update Google OAuth authorized origins for your domain

## License

MIT
