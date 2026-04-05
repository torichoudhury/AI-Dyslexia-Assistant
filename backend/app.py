from datetime import datetime, timezone
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
mongo_error = None


def utc_now():
    return datetime.now(timezone.utc)


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


def ensure_user_exists(user_id, display_name=None):
    if users_collection is None or not user_id:
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

    users_collection.update_one(
        {"user_id": user_id},
        {
            "$set": update_payload,
            "$setOnInsert": insert_payload,
        },
        upsert=True,
    )

    return users_collection.find_one({"user_id": user_id})


def bootstrap_mongodb():
    global mongo_client
    global mongo_db
    global users_collection
    global preferences_collection
    global history_collection
    global glossary_collection
    global mongo_error

    try:
        mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
        mongo_client.admin.command("ping")
        mongo_db = mongo_client[mongo_db_name]

        users_collection = mongo_db["users"]
        preferences_collection = mongo_db["preferences"]
        history_collection = mongo_db["history"]
        glossary_collection = mongo_db["glossary"]

        users_collection.create_index("user_id", unique=True)
        users_collection.create_index([("updated_at", DESCENDING)])
        preferences_collection.create_index("user_id", unique=True)
        history_collection.create_index([("user_id", DESCENDING), ("created_at", DESCENDING)])
        glossary_collection.create_index([("user_id", DESCENDING), ("created_at", DESCENDING)])
        glossary_collection.create_index([("user_id", DESCENDING), ("term_key", DESCENDING)], unique=True)

    except Exception as exc:
        mongo_error = str(exc)
        mongo_client = None
        mongo_db = None
        users_collection = None
        preferences_collection = None
        history_collection = None
        glossary_collection = None


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
    user_id = requested_user_id or f"user-{uuid.uuid4().hex[:12]}"

    user = ensure_user_exists(user_id, display_name)
    return jsonify({"user": serialize_user(user)}), 201


@app.route("/users/<user_id>", methods=["PATCH"])
def rename_user(user_id):
    mongo_check = require_mongo()
    if mongo_check:
        return mongo_check

    payload = request.get_json(silent=True) or {}
    display_name = (payload.get("display_name") or "").strip()
    if not display_name:
        return jsonify({"error": "display_name is required."}), 400

    user = ensure_user_exists(user_id, display_name)
    return jsonify({"user": serialize_user(user)})


@app.route("/simplify", methods=["POST"])
def simplify_text():
    try:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        user_id = (data.get("user_id") or "guest-user").strip()
        source_url = data.get("source_url") or ""
        request_source = data.get("request_source") or "unknown"

        if not text:
            return jsonify({"error": "Text is required."}), 400

        ensure_user_exists(user_id)

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

    ensure_user_exists(user_id)

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

    ensure_user_exists(user_id)

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