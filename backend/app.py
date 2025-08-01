from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
import os

app = Flask(__name__)
CORS(app)  # Allow frontend to call the backend

load_dotenv()  # Load environment variables
api_key = os.getenv('GEMINI_API_KEY')

# Set up Gemini API key
genai.configure(api_key=api_key)

@app.route('/simplify', methods=['POST'])
def simplify_text():
    try:
        data = request.json
        text = data.get("text", "")

        # Use Gemini AI to simplify text
        model = genai.GenerativeModel("gemini-1.5-flash")  # Updated model name
        
        # Enhanced prompt for better simplification
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
        
        simplified_text = response.text if response else text  # Fallback to original text if no response
        return jsonify({"simplified_text": simplified_text})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def status():
    """Endpoint to check if the backend is running"""
    return jsonify({"status": "online"})

if __name__ == '__main__':
    app.run(port=5000, debug=True)