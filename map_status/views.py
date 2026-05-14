import sqlite3
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render


def get_db_connection():
    conn = sqlite3.connect(settings.DB_FILE)
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


def index(request):
    return render(request, 'index.html')


def timeline_data(request):
    conn = get_db_connection()

    dates_rows = conn.execute('SELECT fetch_date FROM fetch_log ORDER BY fetch_date DESC').fetchall()

    pins_rows = conn.execute('''
        SELECT record_date, pin_type, cartodb_id, geometry, status
        FROM pin_status
        WHERE geometry IS NOT NULL
          AND pin_type IN ('hiker_biker', 'winter_rec')
        ORDER BY pin_type, cartodb_id, record_date ASC
    ''').fetchall()

    roads_rows = conn.execute(
        'SELECT record_date, cartodb_id, status FROM road_status ORDER BY cartodb_id, record_date ASC'
    ).fetchall()

    conn.close()

    road_history = {}
    for row in roads_rows:
        cid = row['cartodb_id']
        if cid not in road_history:
            road_history[cid] = []
        road_history[cid].append((row['record_date'], row['status']))

    pin_history = {}
    for row in pins_rows:
        key = (row['pin_type'], row['cartodb_id'])
        if key not in pin_history:
            pin_history[key] = []
        pin_history[key].append((row['record_date'], row['status'], row['geometry']))

    result = []
    for row in dates_rows:
        date = row['fetch_date']

        roads_for_date = []
        for cid, history in road_history.items():
            latest_status = None
            for record_date, status in history:
                if record_date <= date:
                    latest_status = status
                else:
                    break
            if latest_status is not None:
                roads_for_date.append({'id': cid, 'status': latest_status})

        pins_for_date = []
        for (pin_type, _cid), history in pin_history.items():
            latest = None
            for record_date, status, geom in history:
                if record_date <= date:
                    latest = (status, geom, pin_type)
                else:
                    break
            if latest and latest[0] == 'active':
                pins_for_date.append({'type': latest[2], 'geom': latest[1]})

        result.append({
            'date': date,
            'pins': pins_for_date,
            'roads': roads_for_date,
        })

    return JsonResponse(result, safe=False)


def get_data(request):
    target_date = request.GET.get('date')
    conn = get_db_connection()

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

    pins = conn.execute('''
        SELECT ps.* FROM pin_status ps
        WHERE ps.id = (
            SELECT id FROM pin_status ps2
            WHERE ps2.pin_type = ps.pin_type
              AND ps2.cartodb_id = ps.cartodb_id
              AND ps2.record_date <= ?
            ORDER BY ps2.record_date DESC
            LIMIT 1
        )
        AND ps.status = 'active'
    ''', (target_date,)).fetchall()
    conn.close()

    return JsonResponse({
        'roads': [dict(r) for r in roads],
        'pins': [dict(p) for p in pins],
    })
