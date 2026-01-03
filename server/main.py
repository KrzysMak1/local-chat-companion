"""
Local Chat Companion - FastAPI Backend
Provides auth, chat storage, and proxy to llama.cpp server
"""
import os
import json
import uuid
import httpx
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Any
from contextlib import asynccontextmanager

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
USERS_FILE = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"
CHATS_DIR = DATA_DIR / "chats"

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 7  # 1 week

LLAMA_BASE_URL = os.getenv("LLAMA_BASE_URL", "http://127.0.0.1:8081")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
CHATS_DIR.mkdir(exist_ok=True)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# --- Pydantic Models ---
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)


class UserLogin(BaseModel):
    username: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token


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
    type: str = "text"  # "text" or "image_url"
    text: Optional[str] = None
    image_url: Optional[dict] = None  # {"url": "data:image/..."}


class MessageCreate(BaseModel):
    content: str | List[MessageContent]  # text or array for images
    analyze_image: bool = False


class ChatMessage(BaseModel):
    id: str
    role: str
    content: str | List[Any]
    timestamp: int
    image_url: Optional[str] = None


class ChatSettings(BaseModel):
    system_prompt: str = "You are a helpful AI assistant."
    temperature: float = 0.7
    max_tokens: int = 2048
    streaming: bool = True


# --- File Storage Helpers ---
def load_json(path: Path, default: Any = None) -> Any:
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default if default is not None else {}


def save_json(path: Path, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_user_chats_file(user_id: str) -> Path:
    return CHATS_DIR / f"{user_id}.json"


def load_user_chats(user_id: str) -> List[dict]:
    return load_json(get_user_chats_file(user_id), [])


def save_user_chats(user_id: str, chats: List[dict]) -> None:
    save_json(get_user_chats_file(user_id), chats)


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
    
    # Also check Authorization header for flexibility
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    users = load_json(USERS_FILE, {})
    if user_id not in users:
        raise HTTPException(status_code=401, detail="User not found")
    
    return {"id": user_id, **users[user_id]}


# --- FastAPI App ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize files if they don't exist
    if not USERS_FILE.exists():
        save_json(USERS_FILE, {})
    if not SESSIONS_FILE.exists():
        save_json(SESSIONS_FILE, {})
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
async def register(user: UserRegister, response: Response):
    users = load_json(USERS_FILE, {})
    
    # Check if username exists
    for uid, data in users.items():
        if data.get("username") == user.username:
            raise HTTPException(status_code=400, detail="Username already exists")
    
    user_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    users[user_id] = {
        "username": user.username,
        "password_hash": hash_password(user.password),
        "created_at": now,
        "updated_at": now,
        "last_login": now,
    }
    save_json(USERS_FILE, users)
    
    # Create auth token
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
async def login(user: UserLogin, response: Response):
    users = load_json(USERS_FILE, {})
    
    # Find user by username
    user_id = None
    user_data = None
    for uid, data in users.items():
        if data.get("username") == user.username:
            user_id = uid
            user_data = data
            break
    
    if not user_data or not verify_password(user.password, user_data["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Update last login
    now = datetime.utcnow().isoformat()
    users[user_id]["last_login"] = now
    save_json(USERS_FILE, users)
    
    # Create auth token
    token = create_access_token(user_id)
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=JWT_EXPIRE_HOURS * 3600,
    )
    
    return UserResponse(
        id=user_id,
        username=user_data["username"],
        created_at=user_data["created_at"],
    )


@app.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("auth_token")
    return {"message": "Logged out"}


@app.post("/auth/google", response_model=UserResponse)
async def google_auth(auth_request: GoogleAuthRequest, response: Response):
    """Authenticate with Google ID token"""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env")
    
    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            auth_request.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
        
        # Extract user info from token
        google_user_id = idinfo["sub"]
        email = idinfo.get("email", "")
        name = idinfo.get("name", email.split("@")[0])
        
        users = load_json(USERS_FILE, {})
        
        # Check if user exists by Google ID
        user_id = None
        user_data = None
        for uid, data in users.items():
            if data.get("google_id") == google_user_id:
                user_id = uid
                user_data = data
                break
        
        now = datetime.utcnow().isoformat()
        
        if not user_data:
            # Create new user
            user_id = str(uuid.uuid4())
            users[user_id] = {
                "username": name,
                "email": email,
                "google_id": google_user_id,
                "auth_provider": "google",
                "created_at": now,
                "updated_at": now,
                "last_login": now,
            }
            save_json(USERS_FILE, users)
            user_data = users[user_id]
        else:
            # Update last login
            users[user_id]["last_login"] = now
            save_json(USERS_FILE, users)
        
        # Create auth token
        token = create_access_token(user_id)
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=JWT_EXPIRE_HOURS * 3600,
        )
        
        return UserResponse(
            id=user_id,
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
    chats = load_user_chats(user["id"])
    # Return chats without messages for list view
    return [
        {
            "id": c["id"],
            "title": c.get("title", "New chat"),
            "pinned": c.get("pinned", False),
            "archived": c.get("archived", False),
            "created_at": c.get("created_at"),
            "updated_at": c.get("updated_at"),
            "message_count": len(c.get("messages", [])),
        }
        for c in chats
    ]


@app.post("/chats")
async def create_chat(chat: ChatCreate, user: dict = Depends(get_current_user)):
    chats = load_user_chats(user["id"])
    now = int(datetime.utcnow().timestamp() * 1000)
    
    new_chat = {
        "id": str(uuid.uuid4()),
        "title": chat.title,
        "messages": [],
        "pinned": False,
        "archived": False,
        "created_at": now,
        "updated_at": now,
    }
    
    chats.insert(0, new_chat)
    save_user_chats(user["id"], chats)
    
    return new_chat


@app.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user: dict = Depends(get_current_user)):
    chats = load_user_chats(user["id"])
    chat = next((c for c in chats if c["id"] == chat_id), None)
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    return chat


@app.patch("/chats/{chat_id}")
async def update_chat(chat_id: str, update: ChatUpdate, user: dict = Depends(get_current_user)):
    chats = load_user_chats(user["id"])
    chat_index = next((i for i, c in enumerate(chats) if c["id"] == chat_id), None)
    
    if chat_index is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if update.title is not None:
        chats[chat_index]["title"] = update.title
    if update.pinned is not None:
        chats[chat_index]["pinned"] = update.pinned
    if update.archived is not None:
        chats[chat_index]["archived"] = update.archived
    
    chats[chat_index]["updated_at"] = int(datetime.utcnow().timestamp() * 1000)
    save_user_chats(user["id"], chats)
    
    return chats[chat_index]


@app.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, user: dict = Depends(get_current_user)):
    chats = load_user_chats(user["id"])
    chats = [c for c in chats if c["id"] != chat_id]
    save_user_chats(user["id"], chats)
    return {"message": "Chat deleted"}


@app.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, user: dict = Depends(get_current_user)):
    chats = load_user_chats(user["id"])
    chat = next((c for c in chats if c["id"] == chat_id), None)
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    return chat.get("messages", [])


@app.delete("/chats/{chat_id}/messages/{message_id}")
async def delete_message(chat_id: str, message_id: str, user: dict = Depends(get_current_user)):
    chats = load_user_chats(user["id"])
    chat_index = next((i for i, c in enumerate(chats) if c["id"] == chat_id), None)
    
    if chat_index is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    chats[chat_index]["messages"] = [
        m for m in chats[chat_index].get("messages", []) if m["id"] != message_id
    ]
    chats[chat_index]["updated_at"] = int(datetime.utcnow().timestamp() * 1000)
    save_user_chats(user["id"], chats)
    
    return {"message": "Message deleted"}


# --- Chat Completion Proxy ---
@app.post("/chats/{chat_id}/messages")
async def send_message(
    chat_id: str,
    message: MessageCreate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Send a message and get AI response"""
    chats = load_user_chats(user["id"])
    chat_index = next((i for i, c in enumerate(chats) if c["id"] == chat_id), None)
    
    if chat_index is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    now = int(datetime.utcnow().timestamp() * 1000)
    
    # Build user message content
    user_msg_content: Any = message.content
    image_url = None
    
    if isinstance(message.content, list):
        # Has image - keep as array for llama.cpp
        user_msg_content = message.content
        # Extract image URL for storage
        for item in message.content:
            if isinstance(item, dict) and item.get("type") == "image_url":
                image_url = item.get("image_url", {}).get("url")
    elif message.analyze_image:
        # Wrap text in proper format
        user_msg_content = message.content
    
    # Create user message
    user_message = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": message.content if isinstance(message.content, str) else [
            {"type": c.type, "text": c.text, "image_url": c.image_url}
            if isinstance(c, MessageContent) else c
            for c in message.content
        ],
        "timestamp": now,
    }
    if image_url:
        user_message["image_url"] = image_url
    
    chats[chat_index]["messages"].append(user_message)
    
    # Auto-title on first message
    if len(chats[chat_index]["messages"]) == 1 and chats[chat_index]["title"] == "New chat":
        text_content = message.content if isinstance(message.content, str) else next(
            (c.text for c in message.content if isinstance(c, MessageContent) and c.text),
            "New chat"
        )
        chats[chat_index]["title"] = (text_content[:50] + "...") if len(text_content) > 50 else text_content
    
    chats[chat_index]["updated_at"] = now
    save_user_chats(user["id"], chats)
    
    # Get settings from request
    settings = {
        "system_prompt": "You are a helpful AI assistant.",
        "temperature": 0.7,
        "max_tokens": 2048,
        "streaming": True,
    }
    
    # Try to parse settings from headers
    if request.headers.get("X-Chat-Settings"):
        try:
            settings.update(json.loads(request.headers.get("X-Chat-Settings")))
        except:
            pass
    
    # Build messages for llama.cpp
    api_messages = [{"role": "system", "content": settings["system_prompt"]}]
    
    for msg in chats[chat_index]["messages"]:
        content = msg["content"]
        # Format for llama.cpp with images
        if isinstance(content, list):
            # Convert to OpenAI-compatible format
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
    
    # Call llama.cpp
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
                    chats_updated = load_user_chats(user["id"])
                    assistant_message = {
                        "id": str(uuid.uuid4()),
                        "role": "assistant",
                        "content": full_content,
                        "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    }
                    
                    for c in chats_updated:
                        if c["id"] == chat_id:
                            c["messages"].append(assistant_message)
                            c["updated_at"] = assistant_message["timestamp"]
                            break
                    
                    save_user_chats(user["id"], chats_updated)
                    yield f"data: [DONE]\n\n"
                    
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    if settings["streaming"]:
        return StreamingResponse(
            stream_response(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
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
                assistant_message = {
                    "id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": content,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                }
                
                chats[chat_index]["messages"].append(assistant_message)
                chats[chat_index]["updated_at"] = assistant_message["timestamp"]
                save_user_chats(user["id"], chats)
                
                return {"message": assistant_message, "user_message": user_message}
                
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/chats/{chat_id}/stop")
async def stop_generation(chat_id: str, user: dict = Depends(get_current_user)):
    """Endpoint to signal stop - client should use AbortController"""
    return {"message": "Stop signal received"}


# --- Health & Llama Proxy ---
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/llama/health")
async def llama_health():
    """Check if llama.cpp server is reachable"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{LLAMA_BASE_URL}/health")
            return response.json()
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/llama/models")
async def llama_models():
    """Get available models from llama.cpp"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{LLAMA_BASE_URL}/v1/models")
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
