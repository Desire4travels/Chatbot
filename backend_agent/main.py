"""
from flask import Flask, request, jsonify
from agent import run_agent

app = Flask(__name__)

@app.route('/')
def home():
    return "CrewAI Agent Backend is running."

@app.route('/generate-itinerary', methods=['POST'])
def generate_itinerary():
    try:
        data = request.get_json()
        user_input = data.get('input')

        if not user_input:
            return jsonify({"error": "Missing 'input' in request body"}), 400

        result = run_agent(user_input)
        return jsonify({"response": result})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
"""