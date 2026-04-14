from datetime import datetime, timedelta, timezone
import os
import re
import uuid

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
import google.generativeai as genai
from pymongo import DESCENDING, MongoClient
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
CORS(app)  # Allow frontend to call the backend

load_dotenv()  # Load environment variables

api_key = os.getenv("GEMINI_API_KEY")
mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
mongo_db_name = os.getenv("MONGODB_DB", "dyslexia_assistant")

# Set up Gemini API key
genai.configure(api_key=api_key)

mongo_client = None
mongo_db = None
users_collection = None
preferences_collection = None
history_collection = None
glossary_collection = None
sessions_collection = None
mongo_error = None
SESSION_DURATION_HOURS = 12
PASSWORD_MIN_LENGTH = 8


def utc_now():
    return datetime.now(timezone.utc)


def normalize_utc_datetime(value):
    if not isinstance(value, datetime):
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def to_iso(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return None


def serialize_history(item):
    return {
        "id": str(item.get("_id")),
        "original_text": item.get("original_text", ""),
        "simplified_text": item.get("simplified_text", ""),
        "source_url": item.get("source_url", ""),
        "request_source": item.get("request_source", ""),
        "created_at": to_iso(item.get("created_at")),
    }


def serialize_user(item):
    return {
        "id": str(item.get("_id")),
        "user_id": item.get("user_id", ""),
        "display_name": item.get("display_name", ""),
        "auth_required": bool(item.get("password_hash")),
        "created_at": to_iso(item.get("created_at")),
        "updated_at": to_iso(item.get("updated_at")),
    }


def serialize_glossary(item):
    return {
        "id": str(item.get("_id")),
        "term": item.get("term", ""),
        "simplified_definition": item.get("simplified_definition", ""),
        "source_text": item.get("source_text", ""),
        "created_at": to_iso(item.get("created_at")),
        "updated_at": to_iso(item.get("updated_at")),
    }


def serialize_preferences(item):
    if not item:
        return {}

    return {
        "fontSize": item.get("fontSize", 16),
        "fontFamily": item.get("fontFamily", "OpenDyslexic"),
        "lineSpacing": item.get("lineSpacing", 1.5),
        "theme": item.get("theme", "light"),
        "backgroundColor": item.get("backgroundColor", "#f8f9fa"),
        "textColor": item.get("textColor", "#212529"),
        "autoSimplify": item.get("autoSimplify", False),
        "autoReadAloud": item.get("autoReadAloud", False),
        "showSimplifyButton": item.get("showSimplifyButton", True),
        "speechRate": item.get("speechRate", 0.9),
        "speechVoice": item.get("speechVoice", "default"),
        "updated_at": to_iso(item.get("updated_at")),
    }


def default_display_name(user_id):
    suffix = user_id[-4:] if len(user_id) >= 4 else user_id
    return f"Reader {suffix}"


def ensure_user_exists(user_id, display_name=None, password=None, create_if_missing=True):
    if users_collection is None or not user_id:
        return None

    existing_user = users_collection.find_one({"user_id": user_id})
    if existing_user is None and not create_if_missing:
        return None

    if existing_user is None and not (isinstance(password, str) and password.strip()):
        return None

    now = utc_now()
    update_payload = {
        "user_id": user_id,
        "updated_at": now,
    }
    insert_payload = {
        "created_at": now,
    }

    if isinstance(display_name, str) and display_name.strip():
        update_payload["display_name"] = display_name.strip()
    else:
        insert_payload["display_name"] = default_display_name(user_id)

    if isinstance(password, str) and password.strip():
        update_payload["password_hash"] = generate_password_hash(password.strip())

    users_collection.update_one(
        {"user_id": user_id},
        {
            "$set": update_payload,
            "$setOnInsert": insert_payload,
        },
        upsert=True,
    )

    return users_collection.find_one({"user_id": user_id})


def require_existing_user(user_id):
    if users_collection is None or not user_id:
        return None, (jsonify({"error": "Profile not found. Create a profile first."}), 404)

    user = users_collection.find_one({"user_id": user_id})
    if user is None:
        return None, (jsonify({"error": "Profile not found. Create a profile first."}), 404)

    return user, None


def request_auth_token():
    auth_header = (request.headers.get("Authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token

    return (request.headers.get("X-User-Token") or "").strip()


def create_session(user_id):
    if sessions_collection is None or not user_id:
        return None

    now = utc_now()
    expires_at = now + timedelta(hours=SESSION_DURATION_HOURS)

    for _ in range(3):
        token = uuid.uuid4().hex
        try:
            sessions_collection.insert_one(
                {
                    "token": token,
                    "user_id": user_id,
                    "created_at": now,
                    "expires_at": expires_at,
                }
            )
            return {
                "auth_token": token,
                "expires_at": to_iso(expires_at),
            }
        except Exception:
            continue

    return None


def require_profile_auth(user_id):
    if users_collection is None or sessions_collection is None or not user_id:
        return None

    user = users_collection.find_one({"user_id": user_id})
    if not user or not user.get("password_hash"):
        return None

    token = request_auth_token()
    if not token:
        return jsonify({"error": "Authentication required for this profile."}), 401

    session = sessions_collection.find_one({"token": token, "user_id": user_id})
    if not session:
        return jsonify({"error": "Invalid or expired session token."}), 401

    expires_at = normalize_utc_datetime(session.get("expires_at"))
    if expires_at is None:
        sessions_collection.delete_one({"_id": session.get("_id")})
        return jsonify({"error": "Invalid session token metadata. Please sign in again."}), 401

    if expires_at <= utc_now():
        sessions_collection.delete_one({"_id": session.get("_id")})
        return jsonify({"error": "Session expired. Please sign in again."}), 401

    return None


def bootstrap_mongodb():
    global mongo_client
    global mongo_db
    global users_collection
    global preferences_collection
    global history_collection
    global glossary_collection
    global sessions_collection
    global mongo_error

    try:
        mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
        mongo_client.admin.command("ping")
        mongo_db = mongo_client[mongo_db_name]

        users_collection = mongo_db["users"]
        preferences_collection = mongo_db["preferences"]
        history_collection = mongo_db["history"]
        glossary_collection = mongo_db["glossary"]
        sessions_collection = mongo_db["sessions"]

        users_collection.create_index("user_id", unique=True)
        users_collection.create_index([("updated_at", DESCENDING)])
        preferences_collection.create_index("user_id", unique=True)
        history_collection.create_index([("user_id", DESCENDING), ("created_at", DESCENDING)])
        glossary_collection.create_index([("user_id", DESCENDING), ("created_at", DESCENDING)])
        glossary_collection.create_index([("user_id", DESCENDING), ("term_key", DESCENDING)], unique=True)
        sessions_collection.create_index("token", unique=True)
        sessions_collection.create_index("expires_at", expireAfterSeconds=0)

    except Exception as exc:
        mongo_error = str(exc)
        mongo_client = None
        mongo_db = None
        users_collection = None
        preferences_collection = None
        history_collection = None
        glossary_collection = None
        sessions_collection = None


def require_mongo():
    if mongo_db is None:
        return jsonify(
            {
                "error": "MongoDB is unavailable. Check MONGODB_URI and ensure MongoDB is running.",
                "details": mongo_error,
            }
        ), 503
    return None


bootstrap_mongodb()


@app.route("/users", methods=["GET"])
def list_users():
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    users = [serialize_user(item) for item in users_collection.find({}).sort("updated_at", DESCENDING).limit(200)]
    return jsonify({"users": users})


@app.route("/users", methods=["POST"])
def create_or_update_user():
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    payload = request.get_json(silent=True) or {}
    requested_user_id = (payload.get("user_id") or "").strip()
    display_name = (payload.get("display_name") or "").strip()
    password = (payload.get("password") or "").strip()
    user_id = requested_user_id or f"user-{uuid.uuid4().hex[:12]}"

    existing_user = users_collection.find_one({"user_id": user_id})
    if existing_user and password:
        return jsonify({"error": "Use profile settings to change password for existing users."}), 400

    if existing_user and display_name and existing_user.get("password_hash"):
        auth_check = require_profile_auth(user_id)
        if auth_check:
            return auth_check

    is_new_user = existing_user is None
    if is_new_user and not password:
        return jsonify({"error": "password is required when creating a profile."}), 400

    if is_new_user and len(password) < PASSWORD_MIN_LENGTH:
        return jsonify({"error": f"password must be at least {PASSWORD_MIN_LENGTH} characters."}), 400

    user = ensure_user_exists(user_id, display_name, password if is_new_user else None, create_if_missing=True)
    if user is None:
        return jsonify({"error": "Could not create profile."}), 400

    response_payload = {"user": serialize_user(user)}
    if is_new_user:
        session = create_session(user_id)
        if session:
            response_payload.update(session)

    status_code = 201 if is_new_user else 200
    return jsonify(response_payload), status_code


@app.route("/users/<user_id>", methods=["PATCH"])
def rename_user(user_id):
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    payload = request.get_json(silent=True) or {}
    display_name = (payload.get("display_name") or "").strip()
    if not display_name:
        return jsonify({"error": "display_name is required."}), 400

    _, user_error = require_existing_user(user_id)
    if user_error:
        return user_error

    auth_check = require_profile_auth(user_id)
    if auth_check:
        return auth_check

    user = ensure_user_exists(user_id, display_name, create_if_missing=False)
    return jsonify({"user": serialize_user(user)})


@app.route("/auth/login", methods=["POST"])
def login_profile():
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    payload = request.get_json(silent=True) or {}
    user_id = (payload.get("user_id") or "").strip()
    password = (payload.get("password") or "").strip()

    if not user_id or not password:
        return jsonify({"error": "user_id and password are required."}), 400

    user = users_collection.find_one({"user_id": user_id})
    if not user:
        return jsonify({"error": "Profile not found."}), 404

    password_hash = user.get("password_hash")
    if not password_hash:
        return jsonify({"error": "This profile does not have password authentication enabled."}), 400

    if not check_password_hash(password_hash, password):
        return jsonify({"error": "Invalid credentials."}), 401

    session = create_session(user_id)
    if not session:
        return jsonify({"error": "Could not create authenticated session."}), 500

    return jsonify({
        "user": serialize_user(user),
        **session,
    })


@app.route("/auth/logout", methods=["POST"])
def logout_profile():
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    token = request_auth_token()
    if not token:
        return jsonify({"error": "Session token is required."}), 400

    payload = request.get_json(silent=True) or {}
    user_id = (payload.get("user_id") or "").strip()

    query = {"token": token}
    if user_id:
        query["user_id"] = user_id

    sessions_collection.delete_many(query)
    return jsonify({"message": "Signed out."})


@app.route("/simplify", methods=["POST"])
def simplify_text():
    try:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        user_id = (data.get("user_id") or "").strip()
        source_url = data.get("source_url") or ""
        request_source = data.get("request_source") or "unknown"

        if not text:
            return jsonify({"error": "Text is required."}), 400

        if not user_id:
            return jsonify({"error": "user_id is required."}), 400

        _, user_error = require_existing_user(user_id)
        if user_error:
            return user_error

        auth_check = require_profile_auth(user_id)
        if auth_check:
            return auth_check

        model = genai.GenerativeModel("gemini-2.5-flash")

        prompt = """
        Simplify the following text for someone with dyslexia. Follow these guidelines:
        1. Use simple, common words
        2. Keep sentences short (15 words or less)
        3. Use active voice
        4. Avoid idioms, metaphors, and ambiguous language
        5. Maintain the original meaning
        6. Break complex concepts into simpler parts
        7. Use clear paragraph breaks for new ideas
        8. Maintain the original formatting structure (paragraphs, lists, etc.)

        Here is the text to simplify:

        """

        response = model.generate_content(prompt + text)
        simplified_text = response.text if response else text

        history_id = None
        if history_collection is not None:
            inserted = history_collection.insert_one(
                {
                    "user_id": user_id,
                    "original_text": text,
                    "simplified_text": simplified_text,
                    "source_url": source_url,
                    "request_source": request_source,
                    "created_at": utc_now(),
                }
            )
            history_id = str(inserted.inserted_id)

        return jsonify({"simplified_text": simplified_text, "history_id": history_id})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/preferences/<user_id>", methods=["GET"])
def get_preferences(user_id):
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    _, user_error = require_existing_user(user_id)
    if user_error:
        return user_error

    auth_check = require_profile_auth(user_id)
    if auth_check:
        return auth_check

    item = preferences_collection.find_one({"user_id": user_id})
    return jsonify({"preferences": serialize_preferences(item)})


@app.route("/preferences/<user_id>", methods=["PUT"])
def update_preferences(user_id):
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    payload = request.get_json(silent=True) or {}
    preferences = payload.get("preferences")

    if not isinstance(preferences, dict):
        return jsonify({"error": "A preferences object is required."}), 400

    allowed_fields = {
        "fontSize",
        "fontFamily",
        "lineSpacing",
        "theme",
        "backgroundColor",
        "textColor",
        "autoSimplify",
        "autoReadAloud",
        "showSimplifyButton",
        "speechRate",
        "speechVoice",
    }
    sanitized = {key: preferences[key] for key in preferences if key in allowed_fields}
    sanitized["updated_at"] = utc_now()

    _, user_error = require_existing_user(user_id)
    if user_error:
        return user_error

    auth_check = require_profile_auth(user_id)
    if auth_check:
        return auth_check

    preferences_collection.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                **sanitized,
            }
        },
        upsert=True,
    )

    saved = preferences_collection.find_one({"user_id": user_id})
    return jsonify({"preferences": serialize_preferences(saved)})


@app.route("/history/<user_id>", methods=["GET"])
def get_history(user_id):
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    _, user_error = require_existing_user(user_id)
    if user_error:
        return user_error

    auth_check = require_profile_auth(user_id)
    if auth_check:
        return auth_check

    limit = request.args.get("limit", default=30, type=int)
    if limit is None or limit < 1:
        limit = 30
    limit = min(limit, 100)

    cursor = history_collection.find({"user_id": user_id}).sort("created_at", DESCENDING).limit(limit)
    history = [serialize_history(item) for item in cursor]
    return jsonify({"history": history})


@app.route("/glossary/<user_id>", methods=["GET"])
def get_glossary(user_id):
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    _, user_error = require_existing_user(user_id)
    if user_error:
        return user_error

    auth_check = require_profile_auth(user_id)
    if auth_check:
        return auth_check

    search_query = (request.args.get("q") or "").strip()

    query = {"user_id": user_id}
    if search_query:
        query["term"] = {"$regex": re.escape(search_query), "$options": "i"}

    cursor = glossary_collection.find(query).sort("created_at", DESCENDING).limit(200)
    glossary_items = [serialize_glossary(item) for item in cursor]
    return jsonify({"glossary": glossary_items})


@app.route("/glossary", methods=["POST"])
def upsert_glossary_item():
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    payload = request.get_json(silent=True) or {}
    user_id = (payload.get("user_id") or "").strip()
    term = (payload.get("term") or "").strip()
    simplified_definition = (payload.get("simplified_definition") or "").strip()
    source_text = (payload.get("source_text") or "").strip()

    if not user_id:
        return jsonify({"error": "user_id is required."}), 400
    if not term:
        return jsonify({"error": "term is required."}), 400
    if not simplified_definition:
        return jsonify({"error": "simplified_definition is required."}), 400

    term_key = term.lower()
    now = utc_now()

    _, user_error = require_existing_user(user_id)
    if user_error:
        return user_error

    auth_check = require_profile_auth(user_id)
    if auth_check:
        return auth_check

    glossary_collection.update_one(
        {"user_id": user_id, "term_key": term_key},
        {
            "$set": {
                "term": term,
                "term_key": term_key,
                "simplified_definition": simplified_definition,
                "source_text": source_text,
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": user_id,
                "created_at": now,
            },
        },
        upsert=True,
    )

    item = glossary_collection.find_one({"user_id": user_id, "term_key": term_key})
    return jsonify({"glossary_item": serialize_glossary(item)})


@app.route("/glossary/<item_id>", methods=["DELETE"])
def delete_glossary_item(item_id):
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    user_id = (request.args.get("user_id") or "").strip()
    if not user_id:
        return jsonify({"error": "user_id is required."}), 400

    _, user_error = require_existing_user(user_id)
    if user_error:
        return user_error

    auth_check = require_profile_auth(user_id)
    if auth_check:
        return auth_check

    try:
        object_id = ObjectId(item_id)
    except InvalidId:
        return jsonify({"error": "Invalid glossary id."}), 400

    result = glossary_collection.delete_one({"_id": object_id, "user_id": user_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Glossary item not found."}), 404

    return jsonify({"message": "Glossary item deleted."})


@app.route("/status", methods=["GET"])
def status():
    """Endpoint to check if the backend is running"""
    return jsonify(
        {
            "status": "online",
            "mongo": {
                "status": "online" if mongo_db is not None else "offline",
                "database": mongo_db_name,
                "error": mongo_error,
            },
        }
    )


if __name__ == "__main__":
    app.run(port=5000, debug=True)