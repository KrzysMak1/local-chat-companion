"""
Local Chat Companion - FastAPI Backend
Provides auth, chat storage (SQLite), and proxy to llama.cpp server
"""
import os
import json
import uuid
import sqlite3
import httpx
import time
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Any, Dict
from contextlib import asynccontextmanager
from functools import wraps
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from passlib.context import CryptContext
from jose import jwt, JWTError
from pydantic import BaseModel, Field
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# --- Configuration ---
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "database.db"

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRY_HOURS", "168"))  # 1 week default

LLAMA_BASE_URL = os.getenv("LLAMA_BASE_URL", "http://127.0.0.1:8081")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# Rate limiting config
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_ATTEMPTS = 5

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Rate limiting storage (in-memory for simplicity)
login_attempts: Dict[str, List[float]] = defaultdict(list)


# --- SQLite Database ---
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize SQLite database with tables"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT,
            google_id TEXT,
            auth_provider TEXT DEFAULT 'local',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_login TEXT
        )
    """)
    
    # Chats table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT 'New chat',
            pinned INTEGER DEFAULT 0,
            archived INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    
    # Messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            image_url TEXT,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )
    """)
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)")
    
    conn.commit()
    conn.close()


# --- Pydantic Models ---
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)


class UserLogin(BaseModel):
    username: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str


class UserResponse(BaseModel):
    id: str
    username: str
    created_at: str
    auth_provider: Optional[str] = "local"


class ChatCreate(BaseModel):
    title: str = "New chat"


class ChatUpdate(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None
    archived: Optional[bool] = None


class MessageContent(BaseModel):
    type: str = "text"
    text: Optional[str] = None
    image_url: Optional[dict] = None


class MessageCreate(BaseModel):
    content: str | List[MessageContent]
    analyze_image: bool = False


class ChatSettings(BaseModel):
    system_prompt: str = "You are a helpful AI assistant."
    temperature: float = 0.7
    max_tokens: int = 2048
    streaming: bool = True


# --- Rate Limiting ---
def check_rate_limit(identifier: str) -> bool:
    """Check if the identifier is rate limited. Returns True if allowed."""
    now = time.time()
    # Clean old attempts
    login_attempts[identifier] = [
        t for t in login_attempts[identifier] 
        if now - t < RATE_LIMIT_WINDOW
    ]
    
    if len(login_attempts[identifier]) >= RATE_LIMIT_MAX_ATTEMPTS:
        return False
    
    login_attempts[identifier].append(now)
    return True


def get_rate_limit_remaining(identifier: str) -> int:
    """Get remaining attempts"""
    now = time.time()
    login_attempts[identifier] = [
        t for t in login_attempts[identifier] 
        if now - t < RATE_LIMIT_WINDOW
    ]
    return max(0, RATE_LIMIT_MAX_ATTEMPTS - len(login_attempts[identifier]))


# --- Auth Helpers ---
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def get_current_user(request: Request) -> dict:
    """Dependency to get current user from JWT cookie or Authorization header"""
    token = request.cookies.get("auth_token")
    
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    
    return dict(row)


# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Local Chat Companion API", lifespan=lifespan)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Auth Endpoints ---
@app.post("/auth/register", response_model=UserResponse)
async def register(user: UserRegister, request: Request, response: Response):
    client_ip = request.client.host if request.client else "unknown"
    
    if not check_rate_limit(f"register:{client_ip}"):
        raise HTTPException(
            status_code=429, 
            detail=f"Too many registration attempts. Try again in {RATE_LIMIT_WINDOW} seconds."
        )
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if username exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (user.username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    cursor.execute("""
        INSERT INTO users (id, username, password_hash, auth_provider, created_at, updated_at, last_login)
        VALUES (?, ?, ?, 'local', ?, ?, ?)
    """, (user_id, user.username, hash_password(user.password), now, now, now))
    conn.commit()
    conn.close()
    
    token = create_access_token(user_id)
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=JWT_EXPIRE_HOURS * 3600,
    )
    
    return UserResponse(id=user_id, username=user.username, created_at=now)


@app.post("/auth/login", response_model=UserResponse)
async def login(user: UserLogin, request: Request, response: Response):
    client_ip = request.client.host if request.client else "unknown"
    identifier = f"login:{client_ip}:{user.username}"
    
    if not check_rate_limit(identifier):
        remaining_time = RATE_LIMIT_WINDOW
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Try again in {remaining_time} seconds.",
            headers={"Retry-After": str(remaining_time)}
        )
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (user.username,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    user_data = dict(row)
    
    if not user_data.get("password_hash") or not verify_password(user.password, user_data["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Update last login
    now = datetime.utcnow().isoformat()
    cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_data["id"]))
    conn.commit()
    conn.close()
    
    # Clear rate limit on success
    if identifier in login_attempts:
        del login_attempts[identifier]
    
    token = create_access_token(user_data["id"])
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=JWT_EXPIRE_HOURS * 3600,
    )
    
    return UserResponse(
        id=user_data["id"],
        username=user_data["username"],
        created_at=user_data["created_at"],
        auth_provider=user_data.get("auth_provider", "local"),
    )


@app.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("auth_token")
    return {"message": "Logged out"}


@app.post("/auth/google", response_model=UserResponse)
async def google_auth(auth_request: GoogleAuthRequest, response: Response):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    try:
        idinfo = id_token.verify_oauth2_token(
            auth_request.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
        
        google_user_id = idinfo["sub"]
        email = idinfo.get("email", "")
        name = idinfo.get("name", email.split("@")[0])
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE google_id = ?", (google_user_id,))
        row = cursor.fetchone()
        
        now = datetime.utcnow().isoformat()
        
        if not row:
            user_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO users (id, username, email, google_id, auth_provider, created_at, updated_at, last_login)
                VALUES (?, ?, ?, ?, 'google', ?, ?, ?)
            """, (user_id, name, email, google_user_id, now, now, now))
            conn.commit()
            user_data = {"id": user_id, "username": name, "created_at": now}
        else:
            user_data = dict(row)
            cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_data["id"]))
            conn.commit()
        
        conn.close()
        
        token = create_access_token(user_data["id"])
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=JWT_EXPIRE_HOURS * 3600,
        )
        
        return UserResponse(
            id=user_data["id"],
            username=user_data["username"],
            created_at=user_data["created_at"],
            auth_provider="google",
        )
        
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")


@app.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        username=user["username"],
        created_at=user["created_at"],
        auth_provider=user.get("auth_provider", "local"),
    )


# --- Chat Endpoints ---
@app.get("/chats")
async def list_chats(user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.*, COUNT(m.id) as message_count
        FROM chats c
        LEFT JOIN messages m ON c.id = m.chat_id
        WHERE c.user_id = ?
        GROUP BY c.id
        ORDER BY c.pinned DESC, c.updated_at DESC
    """, (user["id"],))
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "pinned": bool(row["pinned"]),
            "archived": bool(row["archived"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "message_count": row["message_count"],
        }
        for row in rows
    ]


@app.post("/chats")
async def create_chat(chat: ChatCreate, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    chat_id = str(uuid.uuid4())
    now = int(datetime.utcnow().timestamp() * 1000)
    
    cursor.execute("""
        INSERT INTO chats (id, user_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    """, (chat_id, user["id"], chat.title, now, now))
    conn.commit()
    conn.close()
    
    return {
        "id": chat_id,
        "title": chat.title,
        "messages": [],
        "pinned": False,
        "archived": False,
        "created_at": now,
        "updated_at": now,
    }


@app.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM chats WHERE id = ? AND user_id = ?", (chat_id, user["id"]))
    chat_row = cursor.fetchone()
    
    if not chat_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Chat not found")
    
    cursor.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp", (chat_id,))
    message_rows = cursor.fetchall()
    conn.close()
    
    messages = []
    for row in message_rows:
        msg = {
            "id": row["id"],
            "role": row["role"],
            "timestamp": row["timestamp"],
        }
        # Parse content (might be JSON array for images)
        try:
            msg["content"] = json.loads(row["content"])
        except:
            msg["content"] = row["content"]
        
        if row["image_url"]:
            msg["image_url"] = row["image_url"]
        messages.append(msg)
    
    return {
        "id": chat_row["id"],
        "title": chat_row["title"],
        "messages": messages,
        "pinned": bool(chat_row["pinned"]),
        "archived": bool(chat_row["archived"]),
        "created_at": chat_row["created_at"],
        "updated_at": chat_row["updated_at"],
    }


@app.patch("/chats/{chat_id}")
async def update_chat(chat_id: str, update: ChatUpdate, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM chats WHERE id = ? AND user_id = ?", (chat_id, user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Chat not found")
    
    updates = []
    params = []
    
    if update.title is not None:
        updates.append("title = ?")
        params.append(update.title)
    if update.pinned is not None:
        updates.append("pinned = ?")
        params.append(1 if update.pinned else 0)
    if update.archived is not None:
        updates.append("archived = ?")
        params.append(1 if update.archived else 0)
    
    now = int(datetime.utcnow().timestamp() * 1000)
    updates.append("updated_at = ?")
    params.append(now)
    params.append(chat_id)
    
    cursor.execute(f"UPDATE chats SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    
    return {"message": "Chat updated"}


@app.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
    cursor.execute("DELETE FROM chats WHERE id = ? AND user_id = ?", (chat_id, user["id"]))
    conn.commit()
    conn.close()
    
    return {"message": "Chat deleted"}


@app.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM chats WHERE id = ? AND user_id = ?", (chat_id, user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Chat not found")
    
    cursor.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp", (chat_id,))
    rows = cursor.fetchall()
    conn.close()
    
    messages = []
    for row in rows:
        msg = {"id": row["id"], "role": row["role"], "timestamp": row["timestamp"]}
        try:
            msg["content"] = json.loads(row["content"])
        except:
            msg["content"] = row["content"]
        if row["image_url"]:
            msg["image_url"] = row["image_url"]
        messages.append(msg)
    
    return messages


@app.delete("/chats/{chat_id}/messages/{message_id}")
async def delete_message(chat_id: str, message_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM chats WHERE id = ? AND user_id = ?", (chat_id, user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Chat not found")
    
    cursor.execute("DELETE FROM messages WHERE id = ? AND chat_id = ?", (message_id, chat_id))
    cursor.execute("UPDATE chats SET updated_at = ? WHERE id = ?", 
                   (int(datetime.utcnow().timestamp() * 1000), chat_id))
    conn.commit()
    conn.close()
    
    return {"message": "Message deleted"}


# --- Chat Completion Proxy ---
@app.post("/chats/{chat_id}/messages")
async def send_message(
    chat_id: str,
    message: MessageCreate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM chats WHERE id = ? AND user_id = ?", (chat_id, user["id"]))
    chat_row = cursor.fetchone()
    
    if not chat_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Chat not found")
    
    now = int(datetime.utcnow().timestamp() * 1000)
    
    # Build user message content
    image_url = None
    if isinstance(message.content, list):
        content_str = json.dumps([
            {"type": c.type, "text": c.text, "image_url": c.image_url}
            if isinstance(c, MessageContent) else c
            for c in message.content
        ])
        for item in message.content:
            if isinstance(item, MessageContent) and item.type == "image_url" and item.image_url:
                image_url = item.image_url.get("url")
    else:
        content_str = message.content
    
    # Save user message
    user_msg_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO messages (id, chat_id, role, content, image_url, timestamp)
        VALUES (?, ?, 'user', ?, ?, ?)
    """, (user_msg_id, chat_id, content_str, image_url, now))
    
    # Auto-title on first message
    cursor.execute("SELECT COUNT(*) FROM messages WHERE chat_id = ?", (chat_id,))
    msg_count = cursor.fetchone()[0]
    
    if msg_count == 1 and chat_row["title"] == "New chat":
        text_content = message.content if isinstance(message.content, str) else next(
            (c.text for c in message.content if isinstance(c, MessageContent) and c.text),
            "New chat"
        )
        new_title = (text_content[:50] + "...") if len(text_content) > 50 else text_content
        cursor.execute("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?", (new_title, now, chat_id))
    else:
        cursor.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now, chat_id))
    
    conn.commit()
    
    # Get all messages for context
    cursor.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp", (chat_id,))
    all_messages = cursor.fetchall()
    conn.close()
    
    # Get settings from request
    settings = {
        "system_prompt": "You are a helpful AI assistant.",
        "temperature": 0.7,
        "max_tokens": 2048,
        "streaming": True,
    }
    
    if request.headers.get("X-Chat-Settings"):
        try:
            settings.update(json.loads(request.headers.get("X-Chat-Settings")))
        except:
            pass
    
    # Build messages for llama.cpp
    api_messages = [{"role": "system", "content": settings["system_prompt"]}]
    
    for msg in all_messages:
        try:
            content = json.loads(msg["content"])
        except:
            content = msg["content"]
        
        if isinstance(content, list):
            formatted_content = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        formatted_content.append({"type": "text", "text": item.get("text", "")})
                    elif item.get("type") == "image_url":
                        formatted_content.append({
                            "type": "image_url",
                            "image_url": item.get("image_url", {})
                        })
            api_messages.append({"role": msg["role"], "content": formatted_content})
        else:
            api_messages.append({"role": msg["role"], "content": content})
    
    # Stream response from llama.cpp
    async def stream_response():
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{LLAMA_BASE_URL}/v1/chat/completions",
                    json={
                        "model": "local",
                        "messages": api_messages,
                        "temperature": settings["temperature"],
                        "max_tokens": settings["max_tokens"],
                        "stream": settings["streaming"],
                    },
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"data: {json.dumps({'error': f'Model error: {error_text.decode()}'})}\n\n"
                        return
                    
                    full_content = ""
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                parsed = json.loads(data)
                                delta = parsed.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    full_content += content
                                    yield f"data: {json.dumps({'content': content})}\n\n"
                            except json.JSONDecodeError:
                                pass
                    
                    # Save assistant message
                    conn = get_db()
                    cursor = conn.cursor()
                    assistant_msg_id = str(uuid.uuid4())
                    assistant_timestamp = int(datetime.utcnow().timestamp() * 1000)
                    
                    cursor.execute("""
                        INSERT INTO messages (id, chat_id, role, content, timestamp)
                        VALUES (?, ?, 'assistant', ?, ?)
                    """, (assistant_msg_id, chat_id, full_content, assistant_timestamp))
                    cursor.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (assistant_timestamp, chat_id))
                    conn.commit()
                    conn.close()
                    
                    yield f"data: [DONE]\n\n"
                    
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot connect to AI server. Make sure llama.cpp is running.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    if settings["streaming"]:
        return StreamingResponse(
            stream_response(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )
    else:
        # Non-streaming response
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{LLAMA_BASE_URL}/v1/chat/completions",
                    json={
                        "model": "local",
                        "messages": api_messages,
                        "temperature": settings["temperature"],
                        "max_tokens": settings["max_tokens"],
                        "stream": False,
                    },
                )
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                # Save assistant message
                conn = get_db()
                cursor = conn.cursor()
                assistant_msg_id = str(uuid.uuid4())
                assistant_timestamp = int(datetime.utcnow().timestamp() * 1000)
                
                cursor.execute("""
                    INSERT INTO messages (id, chat_id, role, content, timestamp)
                    VALUES (?, ?, 'assistant', ?, ?)
                """, (assistant_msg_id, chat_id, content, assistant_timestamp))
                cursor.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (assistant_timestamp, chat_id))
                conn.commit()
                conn.close()
                
                return {
                    "message": {"id": assistant_msg_id, "role": "assistant", "content": content, "timestamp": assistant_timestamp},
                    "user_message": {"id": user_msg_id, "role": "user", "content": message.content, "timestamp": now},
                }
                
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Cannot connect to AI server")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/chats/{chat_id}/stop")
async def stop_generation(chat_id: str, user: dict = Depends(get_current_user)):
    return {"message": "Stop signal received"}


# --- Health & Llama Proxy ---
@app.get("/health")
async def health():
    return {"status": "ok", "database": "sqlite"}


@app.get("/api/llama/health")
async def llama_health():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{LLAMA_BASE_URL}/health")
            return response.json()
    except httpx.ConnectError:
        return {"status": "error", "message": "Cannot connect to llama.cpp server"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/llama/models")
async def llama_models():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{LLAMA_BASE_URL}/v1/models")
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
