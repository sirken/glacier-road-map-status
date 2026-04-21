import sqlite3
import requests
import json
import datetime
import random
import copy
import urllib3

# Suppress the insecure request warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DB_FILE = 'glacier_data.db'

# Define the API endpoints
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

    conn.commit()
    return conn


def fetch_base_data():
    print("Fetching base data from NPS servers...")
    base_roads = []
    base_pins = []

    # Fetch Roads
    for url in URLS['road_nds']:
        try:
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                if feature.get('geometry'):
                    base_roads.append({
                        'cartodb_id': feature['properties'].get('cartodb_id'),
                        'rdname': feature['properties'].get('rdname'),
                        'rdsurface': feature['properties'].get('rdsurface'),
                        'seasdesc': feature['properties'].get('seasdesc'),
                        'maintainer': feature['properties'].get('maintainer'),
                        'status': feature['properties'].get('status'),
                        'reason': feature['properties'].get('reason'),
                        'geometry': feature.get('geometry')
                    })
        except Exception as e:
            print(f"Error fetching road data: {e}")

    # Fetch Pins
    for pin_type, url in URLS['pins'].items():
        try:
            data = requests.get(url, verify=False).json()
            for feature in data.get('features', []):
                if feature.get('geometry'):
                    base_pins.append({
                        'pin_type': pin_type,
                        'cartodb_id': feature['properties'].get('cartodb_id'),
                        'name': feature['properties'].get('name'),
                        'description': feature['properties'].get('description'),
                        'status': feature['properties'].get('status'),
                        'geometry': feature.get('geometry')
                    })
        except Exception as e:
            print(f"Error fetching pin data for {pin_type}: {e}")

    print(f"Fetched {len(base_roads)} road segments and {len(base_pins)} pins.")
    return base_roads, base_pins


def generate_dummy_data():
    db_conn = init_db()
    c = db_conn.cursor()

    base_roads, base_pins = fetch_base_data()

    # Carry this state forward loop by loop
    current_roads = copy.deepcopy(base_roads)
    current_pins = copy.deepcopy(base_pins)

    # Start 44 days ago so loop 44 is today
    start_date = datetime.date.today() - datetime.timedelta(days=44)
    now = datetime.datetime.now().isoformat()

    print("\nGenerating 45 days of timeline data...")

    for i in range(45):
        sim_date = (start_date + datetime.timedelta(days=i)).isoformat()

        # 20% chance of a "jackpot" mutation event
        if random.random() < 0.20:
            print(f"  --> Jackpot hit on {sim_date}!")

            # 50% chance to modify pins
            if random.random() < 0.50:
                # 50% chance for each group to be selected for moving
                move_hiker = random.random() < 0.50
                move_hazard = random.random() < 0.50

                print(f"      - Moving pins (Hiker/Biker: {move_hiker}, Hazard: {move_hazard})...")

                for pin in current_pins:
                    if pin['geometry']['type'] == 'Point':
                        # Only move if the specific group's 50% chance hit
                        if (pin['pin_type'] == 'hiker_biker' and move_hiker) or \
                            (pin['pin_type'] == 'winter_rec' and move_hazard):
                            # Shift coordinates by a random distance
                            pin['geometry']['coordinates'][0] += random.uniform(-0.03, 0.03)
                            pin['geometry']['coordinates'][1] += random.uniform(-0.03, 0.03)

            # 50% chance to modify roads
            if random.random() < 0.50:
                # Pick 1 to 5 random roads to flip their status
                num_to_flip = random.randint(1, 5)
                roads_to_flip = random.sample(current_roads, min(num_to_flip, len(current_roads)))
                print(f"      - Toggling {len(roads_to_flip)} road segment statuses...")
                for r in roads_to_flip:
                    r['status'] = 'open' if r['status'] in ['closed', 'construction'] else 'closed'

        # Insert the current state for this simulated date
        for r in current_roads:
            c.execute('''INSERT INTO road_status 
                         (created_at, record_date, cartodb_id, rdname, rdsurface, seasdesc, maintainer, status, reason, geometry) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (now, sim_date, r['cartodb_id'], r['rdname'], r['rdsurface'],
                       r['seasdesc'], r['maintainer'], r['status'], r['reason'], json.dumps(r['geometry'])))

        for p in current_pins:
            c.execute('''INSERT INTO pin_status 
                         (created_at, record_date, pin_type, cartodb_id, name, description, status, geometry) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                      (now, sim_date, p['pin_type'], p['cartodb_id'], p['name'],
                       p['description'], p['status'], json.dumps(p['geometry'])))

    db_conn.commit()
    db_conn.close()
    print("\nDatabase successfully populated with dummy data!")


if __name__ == "__main__":
    generate_dummy_data()