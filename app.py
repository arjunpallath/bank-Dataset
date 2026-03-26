from flask import Flask, request, jsonify, render_template, redirect, url_for, session
import joblib
import pandas as pd
import numpy as np
from functools import wraps

app = Flask(__name__)
app.secret_key = 'publicbank_secret'

# In-memory mock database for Demo
# Formatting: { "phone_number": "password" }
users_db = {}
review_queue = []
admin_logs = []

# Load Model and Scaler at startup
model = None
scaler = None
try:
    model = joblib.load('model.pkl')
    scaler = joblib.load('scaler.pkl')
except Exception as e:
    print(f"Warning: Model or scaler not found. {e}")

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get('role') != 'admin':
            return jsonify({"status": "error", "message": "Unauthorized access"}), 403
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def home():
    if 'user_phone' not in session:
        return redirect(url_for('login'))
    return render_template('index.html', role=session.get('role', 'user'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        phone = data.get('phone')
        password = data.get('password')
        action = data.get('action') # "login" or "register"
        role = data.get('role', 'user')

        if action == 'register':
            if phone in users_db:
                return jsonify({"status": "error", "message": "Phone number already registered"})
            users_db[phone] = {"password": password, "role": role}
            session['user_phone'] = phone
            session['role'] = role
            return jsonify({"status": "success", "message": "Registration successful"})
            
        elif action == 'login':
            user = users_db.get(phone)
            if user and (isinstance(user, str) and user == password or isinstance(user, dict) and user['password'] == password):
                session['user_phone'] = phone
                # If it was an old string user, default to 'admin' for demo continuity, or use new role
                session['role'] = user['role'] if isinstance(user, dict) else role
                return jsonify({"status": "success", "message": "Login successful"})
            else:
                return jsonify({"status": "error", "message": "Invalid phone number or password"})
                
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user_phone', None)
    return redirect(url_for('login'))

@app.route('/api/stats')
@admin_required
def get_stats():
    return jsonify({
        "total_transactions": 24592,
        "fraud_prevented": 842,
        "accuracy": "99.8%",
        "active_monitoring": True
    })

@app.route('/api/history')
def get_history():
    return jsonify([
        {"id": "TXN-8429", "amount": 150.00, "type": "Debit", "status": "Secure", "time": "2 mins ago"},
        {"id": "TXN-8428", "amount": 12500.00, "type": "Credit", "status": "Suspicious", "time": "15 mins ago"},
        {"id": "TXN-8427", "amount": 24.50, "type": "Debit", "status": "Secure", "time": "1 hour ago"},
        {"id": "TXN-8426", "amount": 890.00, "type": "Debit", "status": "Secure", "time": "3 hours ago"},
        {"id": "TXN-8425", "amount": 5400.00, "type": "Debit", "status": "Suspicious", "time": "5 hours ago"}
    ])
    
@app.route('/api/track/<txn_id>')
def track_txn(txn_id):
    # Mock data lookup
    mock_history = [
        {"id": "TXN-8429", "amount": 150.00, "type": "Debit", "status": "Secure", "time": "2 mins ago", "balance": 4500.50},
        {"id": "TXN-8428", "amount": 12500.00, "type": "Credit", "status": "Suspicious", "time": "15 mins ago", "balance": 17000.50},
        {"id": "TXN-8427", "amount": 24.50, "type": "Debit", "status": "Secure", "time": "1 hour ago", "balance": 4525.00},
        {"id": "TXN-8426", "amount": 890.00, "type": "Debit", "status": "Secure", "time": "3 hours ago", "balance": 5415.00},
        {"id": "TXN-8425", "amount": 5400.00, "type": "Debit", "status": "Suspicious", "time": "5 hours ago", "balance": 10815.00}
    ]
    
    # Also check review queue
    all_records = mock_history + review_queue
    
    match = next((x for x in all_records if x['id'] == txn_id), None)
    if match:
        return jsonify({"status": "success", "data": match})
    
    return jsonify({"status": "error", "message": "Transaction or Account ID not found"}), 404

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        
        # Extract features
        amount = float(data.get('TransactionAmount', 0))
        age = float(data.get('CustomerAge', 0))
        duration = float(data.get('TransactionDuration', 0))
        login_attempts = float(data.get('LoginAttempts', 0))
        balance = float(data.get('AccountBalance', 0))
        
        # Categorical
        channel_str = data.get('Channel', 'Online')
        type_str = data.get('TransactionType', 'Debit')
        
        channel_mapping = {'Online': 0, 'Branch': 1, 'ATM': 2}
        type_mapping = {'Debit': 0, 'Credit': 1}
        
        channel = channel_mapping.get(channel_str, 0)
        txn_type = type_mapping.get(type_str, 0)
        
        # Feature array matching the training order:
        # ['TransactionAmount', 'CustomerAge', 'TransactionDuration', 'LoginAttempts', 'AccountBalance', 'TransactionType', 'Channel']
        features = np.array([[amount, age, duration, login_attempts, balance, txn_type, channel]])
        
        if scaler and model:
            scaled_features = scaler.transform(features)
            prediction = model.predict(scaled_features)[0] # 1 for normal, -1 for anomaly
            
            # Additional logic to create a "risk score" for UI purposes based on decision function
            score = model.decision_function(scaled_features)[0]
            # Normalize score somewhat arbitrarily for UI: decision function is usually negative for anomalies
            # Let's map it roughly to a 0-100 risk score
            # A negative score = anomaly (high risk), positive score = normal (low risk)
            risk_score = max(0, min(100, int((0.5 - score) * 100)))
            
            result = "Suspicious" if prediction == -1 else "Normal"
            
            # Auto-queue suspicious transactions for Admin Review
            if prediction == -1:
                review_item = {
                    "id": f"REV-{np.random.randint(1000, 9999)}",
                    "amount": amount,
                    "balance": balance,
                    "age": age,
                    "duration": duration,
                    "login_attempts": login_attempts,
                    "channel": channel_str,
                    "type": type_str,
                    "risk_score": risk_score,
                    "status": "Pending",
                    "timestamp": "Just now"
                }
                review_queue.append(review_item)
            
            return jsonify({
                "status": "success",
                "prediction": result,
                "risk_score": risk_score
            })
        else:
            return jsonify({"status": "error", "message": "Model not loaded"}), 500
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/admin/reviews')
@admin_required
def get_admin_reviews():
    return jsonify(review_queue)

@app.route('/api/admin/logs')
@admin_required
def get_admin_logs():
    return jsonify(admin_logs)

@app.route('/api/admin/action', methods=['POST'])
@admin_required
def admin_action():
    data = request.json
    review_id = data.get('id')
    action = data.get('action') # 'Approve', 'Block', 'Investigate'
    
    # Find item in queue
    global review_queue
    item = next((x for x in review_queue if x['id'] == review_id), None)
    
    if item:
        # Move from queue to logs
        item['status'] = action
        item['processed_at'] = "Just now"
        admin_logs.insert(0, item)
        review_queue = [x for x in review_queue if x['id'] != review_id]
        return jsonify({"status": "success", "message": f"Transaction {action}d successfully"})
    
    return jsonify({"status": "error", "message": "Transaction not found"}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5000)
