"""
Remove redundant road_status rows from the database.

A road record is redundant if the previous stored record for the same cartodb_id
has identical status, reason, and geometry — meaning nothing changed that day.
Only the first record of each "state" is kept; the rest are deleted.

fetch_log is backfilled from existing dates before any deletion so the timeline
doesn't lose any days.

Run with --execute to actually make changes; default is a dry run.
"""

import sqlite3
import os
import sys

DB_FILE = 'glacier_data.db'


def debloat(execute=False):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    size_before = os.path.getsize(DB_FILE)

    # Ensure fetch_log exists and has every date before we delete anything
    c.execute('''CREATE TABLE IF NOT EXISTS fetch_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fetch_date TEXT UNIQUE
    )''')
    c.execute('''INSERT OR IGNORE INTO fetch_log (fetch_date)
                 SELECT DISTINCT record_date FROM road_status
                 UNION
                 SELECT DISTINCT record_date FROM pin_status''')

    total_rows = c.execute('SELECT COUNT(*) FROM road_status').fetchone()[0]
    date_count = c.execute('SELECT COUNT(*) FROM fetch_log').fetchone()[0]

    # Walk every road's history oldest→newest; mark redundant rows for deletion
    rows = c.execute('''
        SELECT id, cartodb_id, status, reason, geometry
        FROM road_status
        ORDER BY cartodb_id, record_date ASC
    ''').fetchall()

    ids_to_delete = []
    last_state = {}

    for row in rows:
        cid = row['cartodb_id']
        key = (row['status'], row['reason'], row['geometry'])
        if cid in last_state and last_state[cid] == key:
            ids_to_delete.append(row['id'])
        else:
            last_state[cid] = key

    kept = total_rows - len(ids_to_delete)

    print(f"DB file:        {DB_FILE}  ({size_before / 1024 / 1024:.2f} MB)")
    print(f"Fetch dates:    {date_count}")
    print(f"Road rows:      {total_rows} total")
    print(f"  → keep:       {kept}")
    print(f"  → delete:     {len(ids_to_delete)}  ({len(ids_to_delete) / total_rows * 100:.1f}% reduction)")

    if not execute:
        print("\nDry run — no changes made. Re-run with --execute to apply.")
        conn.close()
        return

    print("\nDeleting redundant rows...", end=" ", flush=True)
    c.executemany('DELETE FROM road_status WHERE id = ?', [(i,) for i in ids_to_delete])
    conn.commit()
    print("done.")

    print("Running VACUUM to reclaim disk space...", end=" ", flush=True)
    conn.execute('VACUUM')
    print("done.")

    conn.close()

    size_after = os.path.getsize(DB_FILE)
    saved = size_before - size_after
    print(f"\nDB size: {size_before / 1024 / 1024:.2f} MB → {size_after / 1024 / 1024:.2f} MB  (saved {saved / 1024:.0f} KB)")


if __name__ == '__main__':
    debloat(execute='--execute' in sys.argv)
