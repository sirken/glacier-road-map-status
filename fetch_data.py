import sqlite3
import requests
import json
import datetime
import urllib3

# Suppress the insecure request warnings since we are bypassing SSL verification
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DB_FILE = 'glacier_data.db'

# Define the API endpoints based on the README
URLS = {
    'road_nds': [
        "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_road_nds WHERE status = 'closed'",
        "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_road_nds WHERE status = 'construction'",
        "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_road_nds WHERE status = 'open'"
    ],
    'pins': {
        'hiker_biker': "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_hiker_biker_closures WHERE status = 'active'",
        'snow_plow': "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM glac_snow_plow_status where status='active'",
        'gate': "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM gate_closures WHERE status IN ('closed', 'reservation')",
        'winter_rec': "https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT * FROM winter_rec_closure WHERE status = 'active'"
    }
}


def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS road_status (
        record_date TEXT, cartodb_id INTEGER, rdname TEXT, 
        rdsurface TEXT, seasdesc TEXT, maintainer TEXT, 
        status TEXT, reason TEXT, geometry TEXT
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS pin_status (
        record_date TEXT, pin_type TEXT, cartodb_id INTEGER, 
        name TEXT, description TEXT, status TEXT, geometry TEXT
    )''')

    conn.commit()
    return conn


def fetch_and_store(conn):
    today = datetime.date.today().isoformat()
    c = conn.cursor()

    # 1. Process Roads
    for url in URLS['road_nds']:
        try:
            # Added verify=False here
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geom = json.dumps(feature.get('geometry'))

                c.execute('''INSERT INTO road_status 
                             (record_date, cartodb_id, rdname, rdsurface, seasdesc, maintainer, status, reason, geometry) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                          (today, props.get('cartodb_id'), props.get('rdname'), props.get('rdsurface'),
                           props.get('seasdesc'), props.get('maintainer'), props.get('status'),
                           props.get('reason'), geom))
        except Exception as e:
            print(f"Error fetching road data: {e}")

    # 2. Process Pins
    for pin_type, url in URLS['pins'].items():
        try:
            # Added verify=False here
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geom = json.dumps(feature.get('geometry'))

                c.execute('''INSERT INTO pin_status 
                             (record_date, pin_type, cartodb_id, name, description, status, geometry) 
                             VALUES (?, ?, ?, ?, ?, ?, ?)''',
                          (today, pin_type, props.get('cartodb_id'), props.get('name'),
                           props.get('description'), props.get('status'), geom))
        except Exception as e:
            print(f"Error fetching pin data for {pin_type}: {e}")

    conn.commit()
    print(f"Data for {today} successfully saved.")


if __name__ == "__main__":
    db_conn = init_db()
    fetch_and_store(db_conn)
    db_conn.close()