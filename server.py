import spacy
from flask import Flask, request, jsonify
from flask_cors import CORS
import pytextrank # <-- ADD THIS LINE

# Load the spaCy model
nlp = spacy.load("en_core_web_sm")

# Now add the TextRank pipe. The import above makes this factory available.
nlp.add_pipe("textrank")

app = Flask(__name__)
CORS(app)

@app.route('/extract_keywords', methods=['POST'])
def extract_keywords():
    data = request.json
    document_content = data.get('content', '')

    if not document_content or len(document_content) < 20:
        return jsonify({"keywords": []}), 200

    doc = nlp(document_content)

    keywords = [p.text for p in doc._.phrases[:3]]

    return jsonify({"keywords": keywords})

if __name__ == '__main__':
    app.run(debug=False, port=5000)