from flask import Flask, render_template, jsonify, request
import sqlite3

app = Flask(__name__)
DB_FILE = 'glacier_data.db'


def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/available_dates')
def available_dates():
    conn = get_db_connection()
    # Query returns the date and a comma-separated list of pin types for that date
    query = '''
        SELECT r.record_date, 
               (SELECT GROUP_CONCAT(DISTINCT pin_type) FROM pin_status WHERE record_date = r.record_date) as pins
        FROM (SELECT DISTINCT record_date FROM road_status) r
        ORDER BY r.record_date DESC
    '''
    dates = conn.execute(query).fetchall()
    conn.close()

    result = []
    for row in dates:
        pins = row['pins'].split(',') if row['pins'] else []
        result.append({'date': row['record_date'], 'pins': pins})

    return jsonify(result)


@app.route('/api/data')
def get_data():
    target_date = request.args.get('date')
    conn = get_db_connection()

    roads = conn.execute('SELECT * FROM road_status WHERE record_date = ?', (target_date,)).fetchall()
    pins = conn.execute('SELECT * FROM pin_status WHERE record_date = ?', (target_date,)).fetchall()
    conn.close()

    return jsonify({
        'roads': [dict(r) for r in roads],
        'pins': [dict(p) for p in pins]
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)