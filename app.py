# To enable real analysis: set WATSON_API_KEY and WATSON_URL in a .env file

import os
from dotenv import load_dotenv
load_dotenv()  # loads variables from .env into os.environ

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MOCK_DATA = {
    "emotion": {
        "joy": 0.6,
        "sadness": 0.1,
        "anger": 0.05,
        "fear": 0.1,
        "disgust": 0.05
    },
    "sentiment": {"label": "positive", "score": 0.8},
    "mock": True
}


def analyze_with_watson(text):
    watson_api_key = os.environ.get("WATSON_API_KEY", "YOUR_API_KEY_HERE")
    watson_url = os.environ.get("WATSON_URL", "")

    if not watson_api_key or watson_api_key == "YOUR_API_KEY_HERE":
        return None

    try:
        from ibm_watson import NaturalLanguageUnderstandingV1
        from ibm_watson.natural_language_understanding_v1 import Features, EmotionOptions, SentimentOptions
        from ibm_cloud_sdk_core.authenticators import IAMAuthenticator

        authenticator = IAMAuthenticator(watson_api_key)
        nlu = NaturalLanguageUnderstandingV1(
            version="2022-04-07",
            authenticator=authenticator
        )
        nlu.set_service_url(watson_url)

        response = nlu.analyze(
            text=text,
            features=Features(
                emotion=EmotionOptions(),
                sentiment=SentimentOptions()
            )
        ).get_result()

        emotion_doc = response.get("emotion", {}).get("document", {}).get("emotion", {})
        sentiment_doc = response.get("sentiment", {}).get("document", {})

        return {
            "emotion": {
                "joy": emotion_doc.get("joy", 0),
                "sadness": emotion_doc.get("sadness", 0),
                "anger": emotion_doc.get("anger", 0),
                "fear": emotion_doc.get("fear", 0),
                "disgust": emotion_doc.get("disgust", 0)
            },
            "sentiment": {
                "label": sentiment_doc.get("label", "neutral"),
                "score": sentiment_doc.get("score", 0)
            },
            "mock": False
        }
    except Exception as e:
        print(f"Watson NLU error: {e}")
        return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "No text provided"}), 400

    text = data["text"].strip()
    if not text:
        return jsonify({"error": "Text is empty"}), 400

    result = analyze_with_watson(text)
    if result is None:
        return jsonify(MOCK_DATA)

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
