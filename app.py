from flask import Flask, render_template, jsonify, request
import sqlite3

app = Flask(__name__)
DB_FILE = 'glacier_data.db'


def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def migrate_db():
    """Ensure fetch_log exists and is populated from any pre-existing data."""
    conn = get_db_connection()
    conn.execute('''CREATE TABLE IF NOT EXISTS fetch_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fetch_date TEXT UNIQUE
    )''')
    conn.execute('''INSERT OR IGNORE INTO fetch_log (fetch_date)
                    SELECT DISTINCT record_date FROM road_status
                    UNION
                    SELECT DISTINCT record_date FROM pin_status''')
    conn.commit()
    conn.close()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/timeline_data')
def timeline_data():
    conn = get_db_connection()

    dates_rows = conn.execute('SELECT fetch_date FROM fetch_log ORDER BY fetch_date DESC').fetchall()

    pins_rows = conn.execute('''
        SELECT record_date, pin_type, geometry
        FROM pin_status
        WHERE geometry IS NOT NULL
          AND pin_type IN ('hiker_biker', 'winter_rec')
    ''').fetchall()

    # Load all road change records, oldest first, for "as of date" reconstruction
    roads_rows = conn.execute(
        'SELECT record_date, cartodb_id, status FROM road_status ORDER BY cartodb_id, record_date ASC'
    ).fetchall()

    conn.close()

    # Build sparse road history: {cartodb_id: [(date, status), ...]} sorted oldest→newest
    road_history = {}
    for row in roads_rows:
        cid = row['cartodb_id']
        if cid not in road_history:
            road_history[cid] = []
        road_history[cid].append((row['record_date'], row['status']))

    # Group pins by date (pins are stored daily)
    pins_by_date = {}
    for row in pins_rows:
        d = row['record_date']
        if d not in pins_by_date:
            pins_by_date[d] = []
        pins_by_date[d].append({'type': row['pin_type'], 'geom': row['geometry']})

    result = []
    for row in dates_rows:
        date = row['fetch_date']

        # Reconstruct each road's status as of this date (most recent record <= date)
        roads_for_date = []
        for cid, history in road_history.items():
            latest_status = None
            for record_date, status in history:  # sorted oldest→newest
                if record_date <= date:
                    latest_status = status
                else:
                    break
            if latest_status is not None:
                roads_for_date.append({'id': cid, 'status': latest_status})

        result.append({
            'date': date,
            'pins': pins_by_date.get(date, []),
            'roads': roads_for_date
        })

    return jsonify(result)


@app.route('/api/data')
def get_data():
    target_date = request.args.get('date')
    conn = get_db_connection()

    # For each road, get the most recent record on or before target_date
    roads = conn.execute('''
        SELECT rs.* FROM road_status rs
        WHERE rs.id = (
            SELECT id FROM road_status rs2
            WHERE rs2.cartodb_id = rs.cartodb_id
              AND rs2.record_date <= ?
            ORDER BY rs2.record_date DESC
            LIMIT 1
        )
    ''', (target_date,)).fetchall()

    pins = conn.execute('SELECT * FROM pin_status WHERE record_date = ?', (target_date,)).fetchall()
    conn.close()

    return jsonify({
        'roads': [dict(r) for r in roads],
        'pins': [dict(p) for p in pins]
    })


migrate_db()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
