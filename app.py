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


@app.route('/api/timeline_data')
def timeline_data():
    conn = get_db_connection()

    # Get all distinct dates that have pin data
    dates_rows = conn.execute('SELECT DISTINCT record_date FROM pin_status ORDER BY record_date DESC').fetchall()

    # Get the geometries for ONLY the hiker/biker and hazard (winter_rec) pins
    pins_rows = conn.execute('''
        SELECT record_date, pin_type, geometry 
        FROM pin_status 
        WHERE geometry IS NOT NULL 
          AND pin_type IN ('hiker_biker', 'winter_rec')
    ''').fetchall()
    conn.close()

    # Group the pins by date
    data_by_date = {row['record_date']: [] for row in dates_rows}
    for row in pins_rows:
        data_by_date[row['record_date']].append({
            'type': row['pin_type'],
            'geom': row['geometry']
        })

    # Format as a list sorted by newest date to oldest
    result = [{'date': d['record_date'], 'pins': data_by_date[d['record_date']]} for d in dates_rows]
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