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

    # Added id and created_at
    c.execute('''CREATE TABLE IF NOT EXISTS road_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        record_date TEXT, cartodb_id INTEGER, rdname TEXT, 
        rdsurface TEXT, seasdesc TEXT, maintainer TEXT, 
        status TEXT, reason TEXT, geometry TEXT
    )''')

    # Added id and created_at
    c.execute('''CREATE TABLE IF NOT EXISTS pin_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        record_date TEXT, pin_type TEXT, cartodb_id INTEGER, 
        name TEXT, description TEXT, status TEXT, geometry TEXT
    )''')

    conn.commit()
    return conn


def fetch_and_store(conn):
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now().isoformat()  # Exact timestamp
    c = conn.cursor()

    for url in URLS['road_nds']:
        try:
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                geom = feature.get('geometry')
                if not geom: continue  # Skip null geometries

                c.execute('''INSERT INTO road_status 
                             (created_at, record_date, cartodb_id, rdname, rdsurface, seasdesc, maintainer, status, reason, geometry) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                          (now, today, feature['properties'].get('cartodb_id'), feature['properties'].get('rdname'),
                           feature['properties'].get('rdsurface'), feature['properties'].get('seasdesc'),
                           feature['properties'].get('maintainer'), feature['properties'].get('status'),
                           feature['properties'].get('reason'), json.dumps(geom)))
        except Exception as e:
            print(f"Error fetching road data: {e}")

    for pin_type, url in URLS['pins'].items():
        try:
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                geom = feature.get('geometry')
                if not geom: continue  # Skip null geometries

                c.execute('''INSERT INTO pin_status 
                             (created_at, record_date, pin_type, cartodb_id, name, description, status, geometry) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                          (now, today, pin_type, feature['properties'].get('cartodb_id'),
                           feature['properties'].get('name'),
                           feature['properties'].get('description'), feature['properties'].get('status'),
                           json.dumps(geom)))
        except Exception as e:
            print(f"Error fetching pin data for {pin_type}: {e}")

    conn.commit()
    print(f"Data for {today} successfully saved at {now}.")


if __name__ == "__main__":
    db_conn = init_db()
    fetch_and_store(db_conn)
    db_conn.close()