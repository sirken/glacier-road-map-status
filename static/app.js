const map = L.map('map').setView([48.696, -113.718], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
}).addTo(map);

let currentLayers = L.layerGroup().addTo(map);
let availableDates = [];
let timelineData = []; // Store events for timeline
let currentDateIndex = 0;

const getPinIcon = (pinType) => {
    let pinColor = '#3498db';
    let innerHtml = 'ℹ️';

    // Update to show the warning icon for hazards
    if (pinType === 'winter_rec') {
        pinColor = '#e41e1e'; // Red
        innerHtml = '<span style="font-size: 14px;">⛔️</span>';
    } else if (pinType === 'hiker_biker') {
        pinColor = '#f1c40f'; // Yellow
        innerHtml = '<span style="font-size: 16px; color: black;">🚴</span>';
    } else if (pinType === 'snow_plow') {
        pinColor = '#9b59b6'; // Purple
        innerHtml = '<span style="font-size: 14px;">🚜</span>';
    }

    const svgPin = `
        <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="position: absolute; top: 0; left: 0; z-index: 1;">
            <path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27c0-8.3-6.7-15-15-15z" fill="${pinColor}" stroke="#ffffff" stroke-width="1.5"/>
            <circle cx="15" cy="15" r="10" fill="white" />
        </svg>
    `;

    const html = `
        <div style="position: relative; width: 30px; height: 42px; filter: drop-shadow(2px 4px 4px rgba(0,0,0,0.4));">
            ${svgPin}
            <div style="position: absolute; top: 0; left: 0; width: 30px; height: 30px; display: flex; justify-content: center; align-items: center; z-index: 2;">
                ${innerHtml}
            </div>
        </div>
    `;

    return L.divIcon({
        html: html,
        className: '',
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -42]
    });
};

async function init() {
    const res = await fetch('/api/timeline_data');
    const data = await res.json();

    availableDates = data.map(d => d.date);
    timelineData = data; // Just save the whole array directly!

    if (availableDates.length > 0) {
        loadDataForDate(availableDates[0]);

        // Initialize Flatpickr HERE, passing in our availableDates array
        flatpickr("#datePicker", {
            enable: availableDates, // This is the magic line!
            dateFormat: "Y-m-d",
            defaultDate: availableDates[0],
            onChange: function(selectedDates, dateStr, instance) {
                loadDataForDate(dateStr);
            }
        });

    } else {
        document.getElementById('currentDateDisplay').innerText = "No data in database. Run fetch_data.py!";
    }
}

async function loadDataForDate(dateStr) {
    document.getElementById('currentDateDisplay').innerText = "Date: " + dateStr;
    // Check if flatpickr is initialized, then update it
    const dp = document.getElementById('datePicker')._flatpickr;
    if (dp) {
        dp.setDate(dateStr, false); // false prevents triggering onChange again
    }
    currentDateIndex = availableDates.indexOf(dateStr);

    const res = await fetch(`/api/data?date=${dateStr}`);
    const data = await res.json();

    currentLayers.clearLayers();

    const showRoads = document.getElementById('filterRoads').checked;
    const showHikers = document.getElementById('filterHikers').checked;
    const showHazards = document.getElementById('filterHazards').checked;

    if (showRoads) {
        data.roads.forEach(road => {
            const geojson = JSON.parse(road.geometry);
            const color = road.status === 'open' ? 'green' : (road.status === 'closed' ? 'red' : 'orange');

            L.geoJSON(geojson, {
                style: { color: color, weight: 4 }
            }).bindPopup(`<b>${road.rdname}</b><br>Status: ${road.status}<br>Reason: ${road.reason || 'N/A'}`).addTo(currentLayers);
        });
    }

    data.pins.forEach(pin => {
        if (!showHazards && pin.pin_type === 'winter_rec') return;
        if (!showHikers && pin.pin_type === 'hiker_biker') return;

        const geojson = JSON.parse(pin.geometry);
        L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, { icon: getPinIcon(pin.pin_type) });
            }
        }).bindPopup(`<b>${pin.name || pin.pin_type.replace('_', ' ').toUpperCase()}</b><br>${pin.description}`).addTo(currentLayers);
    });

    renderTimeline();
}

function renderTimeline() {
    const timelineContainer = document.getElementById('timeline-container');
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    if (availableDates.length === 0) return;

    // 1. Calculate how many items can fit on screen
    // Container width minus 40px for the container's left/right padding
    const containerWidth = timelineContainer.clientWidth - 40;
    // Each item is ~38px (25px min-width + 12px padding + 1px border)
    const itemWidth = 38;
    const maxItems = Math.max(1, Math.floor(containerWidth / itemWidth));

    // 2. Try to center the current date
    let startIdx = currentDateIndex - Math.floor(maxItems / 2);
    let endIdx = startIdx + maxItems;

    // 3. Shift the window if we hit the edges so the timeline stays completely full
    if (startIdx < 0) {
        startIdx = 0;
        endIdx = Math.min(availableDates.length, maxItems);
    }
    if (endIdx > availableDates.length) {
        endIdx = availableDates.length;
        startIdx = Math.max(0, availableDates.length - maxItems);
    }

    // 4. Create the array of indices to render, reversing it so older dates are on the left
    const windowIndices = [];
    for(let i = startIdx; i < endIdx; i++) {
        windowIndices.push(i);
    }
    windowIndices.reverse();

    windowIndices.forEach(idx => {
        const todayData = timelineData[idx];
        const date = todayData.date;

        // In our array, index 0 is newest. So idx + 1 is "yesterday"
        const yesterdayData = timelineData[idx + 1];

        const item = document.createElement('div');
        item.className = `timeline-item ${date === availableDates[currentDateIndex] ? 'active' : ''}`;

        // 1. Create the icon container
        const iconContainer = document.createElement('div');
        iconContainer.className = 'timeline-icons';

        const movedPins = new Set();
        let roadChanged = false; // Flag to track if any road status changed

        // LOGIC: Check if today's pins or roads moved/changed since yesterday
        if (yesterdayData) {
            // Check Pins
            todayData.pins.forEach(todayPin => {
                const matchFound = yesterdayData.pins.some(yesterdayPin =>
                    yesterdayPin.type === todayPin.type && yesterdayPin.geom === todayPin.geom
                );
                if (!matchFound) {
                    movedPins.add(todayPin.type);
                }
            });

            // Check Roads
            todayData.roads.forEach(todayRoad => {
                const yesterdayRoad = yesterdayData.roads.find(r => r.id === todayRoad.id);
                // If the road didn't exist yesterday, or its status changed, flag it
                if (!yesterdayRoad || yesterdayRoad.status !== todayRoad.status) {
                    roadChanged = true;
                }
            });

        } else {
            // If there is no "yesterday", treat everything as "new"
            todayData.pins.forEach(p => movedPins.add(p.type));
            if (todayData.roads && todayData.roads.length > 0) roadChanged = true;
        }

        // Draw icons based ONLY on the items that moved/appeared/changed
        if (movedPins.has('hiker_biker')) iconContainer.innerHTML += '<span>🚴</span>';
        if (movedPins.has('winter_rec')) iconContainer.innerHTML += '<span>⛔️</span>';
        if (roadChanged) iconContainer.innerHTML += '<span>🚧</span>'; // Construction barrier for road changes

        item.appendChild(iconContainer);

        // 2. Create the date element
        const dateSpan = document.createElement('div');
        dateSpan.className = 'timeline-date';
        dateSpan.innerText = date;
        item.appendChild(dateSpan);

        item.onclick = () => loadDataForDate(date);
        timeline.appendChild(item);
    });

    const activeItem = document.querySelector('.timeline-item.active');
    if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', inline: 'center' });
}

document.getElementById('btnPrev').onclick = () => {
    if (currentDateIndex < availableDates.length - 1) loadDataForDate(availableDates[currentDateIndex + 1]);
};

document.getElementById('btnNext').onclick = () => {
    if (currentDateIndex > 0) loadDataForDate(availableDates[currentDateIndex - 1]);
};

document.getElementById('btnToday').onclick = () => {
    if (availableDates.length > 0) loadDataForDate(availableDates[0]);
};

document.querySelectorAll('.filters input').forEach(cb => {
    cb.addEventListener('change', () => loadDataForDate(availableDates[currentDateIndex]));
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') document.getElementById('btnPrev').click();
    if (e.key === 'ArrowRight') document.getElementById('btnNext').click();
});

window.addEventListener('resize', renderTimeline);

init();