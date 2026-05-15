from flask import Flask, send_from_directory
import os

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "sp500.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
