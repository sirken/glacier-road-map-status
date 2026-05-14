import sqlite3
import requests
import json
import datetime
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DB_FILE = 'glacier_data.db'

URLS = {
    'road_nds': [
        "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_road_nds WHERE status = 'closed'",
        "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_road_nds WHERE status = 'construction'",
        "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_road_nds WHERE status = 'open'"
    ],
    'pins': {
        'hiker_biker': "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_hiker_biker_closures WHERE status = 'active'",
        'snow_plow': "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_snow_plow_status where status='active'",
        'winter_rec': "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM winter_rec_closure WHERE status = 'active'"
    }
}


def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS fetch_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fetch_date TEXT UNIQUE
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS road_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        record_date TEXT, cartodb_id INTEGER, rdname TEXT,
        rdsurface TEXT, seasdesc TEXT, maintainer TEXT,
        status TEXT, reason TEXT, geometry TEXT
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS pin_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        record_date TEXT, pin_type TEXT, cartodb_id INTEGER,
        name TEXT, description TEXT, status TEXT, geometry TEXT
    )''')

    # Backfill fetch_log from any existing data
    c.execute('''INSERT OR IGNORE INTO fetch_log (fetch_date)
                 SELECT DISTINCT record_date FROM road_status
                 UNION
                 SELECT DISTINCT record_date FROM pin_status''')

    conn.commit()
    return conn


def fetch_and_store(conn):
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now().isoformat()
    c = conn.cursor()

    # Always record that we fetched today, even if nothing changed
    c.execute('INSERT OR IGNORE INTO fetch_log (fetch_date) VALUES (?)', (today,))

    # Load the most recent stored record for each road so we can skip unchanged ones
    last_roads = {}
    for row in c.execute('''
        SELECT cartodb_id, status, reason, geometry FROM road_status
        WHERE id IN (SELECT MAX(id) FROM road_status GROUP BY cartodb_id)
    ''').fetchall():
        last_roads[row[0]] = (row[1], row[2], row[3])

    roads_saved = 0
    roads_skipped = 0

    for url in URLS['road_nds']:
        try:
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                geom = feature.get('geometry')
                if not geom:
                    continue

                cid = feature['properties'].get('cartodb_id')
                status = feature['properties'].get('status')
                reason = feature['properties'].get('reason')
                geom_str = json.dumps(geom)

                # Skip if this road's status/reason/geometry hasn't changed
                if cid in last_roads:
                    last_status, last_reason, last_geom = last_roads[cid]
                    if last_status == status and last_reason == reason and last_geom == geom_str:
                        roads_skipped += 1
                        continue

                c.execute('''INSERT INTO road_status
                             (created_at, record_date, cartodb_id, rdname, rdsurface, seasdesc, maintainer, status, reason, geometry)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                          (now, today, cid, feature['properties'].get('rdname'),
                           feature['properties'].get('rdsurface'), feature['properties'].get('seasdesc'),
                           feature['properties'].get('maintainer'), status, reason, geom_str))
                roads_saved += 1
        except Exception as e:
            print(f"Error fetching road data: {e}")

    # Wipe today's pin records before re-inserting so re-runs don't duplicate rows
    c.execute('DELETE FROM pin_status WHERE record_date = ?', (today,))

    # Load the most recent stored record for each pin so we can skip unchanged ones
    last_pins = {}
    for row in c.execute('''
        SELECT pin_type, cartodb_id, status, geometry FROM pin_status
        WHERE record_date < ? AND id IN (
            SELECT MAX(id) FROM pin_status WHERE record_date < ? GROUP BY pin_type, cartodb_id
        )
    ''', (today, today)).fetchall():
        last_pins[(row[0], row[1])] = (row[2], row[3])

    seen_pins = set()
    pins_saved = 0
    pins_skipped = 0

    for pin_type, url in URLS['pins'].items():
        try:
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                geom = feature.get('geometry')
                if not geom:
                    continue

                cid = feature['properties'].get('cartodb_id')
                status = feature['properties'].get('status')
                geom_str = json.dumps(geom)
                key = (pin_type, cid)
                seen_pins.add(key)

                # Skip if geometry and status haven't changed
                if key in last_pins:
                    last_status, last_geom = last_pins[key]
                    if last_status == status and last_geom == geom_str:
                        pins_skipped += 1
                        continue

                c.execute('''INSERT INTO pin_status
                             (created_at, record_date, pin_type, cartodb_id, name, description, status, geometry)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                          (now, today, pin_type, cid,
                           feature['properties'].get('name'),
                           feature['properties'].get('description'), status,
                           geom_str))
                pins_saved += 1
        except Exception as e:
            print(f"Error fetching pin data for {pin_type}: {e}")

    # Insert inactive tombstones for pins that were active yesterday but gone today
    for (pin_type, cid), (last_status, last_geom) in last_pins.items():
        if last_status == 'active' and (pin_type, cid) not in seen_pins:
            c.execute('''INSERT INTO pin_status
                         (created_at, record_date, pin_type, cartodb_id, name, description, status, geometry)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                      (now, today, pin_type, cid, None, None, 'inactive', last_geom))

    conn.commit()
    print(f"Data for {today} saved at {now}. Roads: {roads_saved} new, {roads_skipped} unchanged. Pins: {pins_saved} new, {pins_skipped} unchanged.")


if __name__ == "__main__":
    db_conn = init_db()
    fetch_and_store(db_conn)
    db_conn.close()
