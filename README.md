# glacier-road-map-status
Get daily glacier road status, hiker/biker icons and save to a local sqlite DB so we can see changes over time

## Features

- Daily retrieve new geojson data
- Client UI to view historical data on a map
- Cycle through days with left/right arrow keys
- Show timeline at the bottom
- Highlight timeline days when geojson data has changed

## Setup
```shell
uv python install 3.12
uv init -p 3.12
uv add flask requests
```

## Client

### .env file

```shell
SERVER=<IP or hostname>
```

### Run client UI
Updates the DB and runs the client

```shell
./client_ui
```

### Run client UI (manual steps)
Update the DB from the server 

```shell
./update_db
```

Run the client UI
```shell
uv run python app.py
```


## Server
Retrieve new geojson data on a schedule

### Copy `fetch_data.py` to the server

```shell
mkdir -p /path/to/glacier-road-map-status
cp /path/from/fetch_data.py /path/to/glacier-road-map-status/
```

### Scheduler

```shell
crontab -e
```

```shell
# Get new data daily
0 3 * * * cd /path/to/glacier-road-map-status && /usr/bin/python fetch_data.py
```

<hr>

# AI prompt

This webpage shows a map with the road status of Glacier National park
https://www.nps.gov/glac/planyourvisit/directions.htm

The map shows green road sections that are open and red road sections that are closed
The map shows icons for waypoint items such as hiker/biker closures, hazard closures, and others

When you load the map, it queries these URLS which download geojson data
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20glac_road_nds%20WHERE%20status%20=%20%27closed%27
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20glac_road_nds%20WHERE%20status%20=%20%27construction%27
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20glac_hiker_biker_closures%20WHERE%20status%20=%20%27active%27
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20glac_snow_plow_status%20where%20status=%27active%27
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20gate_closures%20WHERE%20status%20=%20%27closed%27
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20gate_closures%20WHERE%20status%20=%20%27reservation%27
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20winter_rec_closure%20WHERE%20status%20=%20%27active%27
https://carto.nps.gov/user/glaclive/api/v2/sql?format=GeoJSON&q=SELECT%20*%20FROM%20glac_road_nds%20WHERE%20status%20=%20%27open%27


# New app overview
Our goal is to create a local version of this map that stores historical daily data so we can open the map at any point in time to see road and pin status

## Backend data
- Create a python script that downloads geojson data on a daily basis and stores road and pin data in a sqlite database
- This script would be run via a cron job
- Take a look at the geojson files to determine the sqlite tables and fields that need to be created


## Front end UI
- Create a html/javascript front end UI that pulls from this database and allows us to see the geojson data over time
- The UI will contain 2 areas:
    - The main map will cover approximately 3/4 of the top of the browser window and display roads and pins overlayed on a map
    - A 30-day timeline below the map shows "events" that have taken place over time
 
## Timeline items
- The timeline shows database event changes using a 30-day window
- Show the selected date in the center of the timeline, so we can see events on either side of it
- On the timeline, dates and events are clickable
- Clicking a date or event loads the data for that day on the main map, and moves the timeline to that date
- We don't want a cluttered timeline, so only show specific types of events
- For example, when a hiker/biker pin has moved, this event would show on the timeline on the date it moved relative to the previous day
- Another event example would be when a road section has closed or opened
- In addition to clicking dates on the timeline, show a date picker so we can choose a new date
- Include a "today" button somewhere that takes us to today's date on the timeline 
- Have back and forward buttons so we can move forward or backward in time quickly to see data changes
- Also use left and right arrow keyboard shortcuts to move forward and backward in time
- Show a selection menu that allows us to choose which types of events we want to show on the timeline (hiker/biker closures, road openings/closings)

## Other items 
- When first opening the webpage UI it would by default select the latest date from DB and show that data on the map

Attached are example geojson files from today. How can we use these to bootstrap the database?


