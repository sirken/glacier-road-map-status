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
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    // Grab our 30-day window
    const startIdx = Math.max(0, currentDateIndex - 15);
    const endIdx = Math.min(availableDates.length, startIdx + 30);

    // Create an array of the indices we want to render, and reverse it (older to newer left-to-right)
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
        item.innerText = date;

        const iconContainer = document.createElement('div');
        iconContainer.style.marginTop = '5px';
        iconContainer.style.display = 'flex';
        iconContainer.style.gap = '5px';

        const movedPins = new Set();

        // LOGIC: Check if today's pins moved since yesterday
        if (yesterdayData) {
            todayData.pins.forEach(todayPin => {
                // Try to find a pin from yesterday with the exact same type and coordinates
                const matchFound = yesterdayData.pins.some(yesterdayPin =>
                    yesterdayPin.type === todayPin.type && yesterdayPin.geom === todayPin.geom
                );

                // If no match is found, this pin is new or moved!
                if (!matchFound) {
                    movedPins.add(todayPin.type);
                }
            });
        } else {
            // If there is no "yesterday" (it's the oldest record in the DB),
            // treat all pins as "new" so they show up.
            todayData.pins.forEach(p => movedPins.add(p.type));
        }

        // Draw icons based ONLY on the pins that moved/appeared
        if (movedPins.has('hiker_biker')) iconContainer.innerHTML += '<span>🚴</span>';
        if (movedPins.has('winter_rec')) iconContainer.innerHTML += '<span>⛔️</span>';

        if (iconContainer.innerHTML !== '') {
            item.appendChild(iconContainer);
        }

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

init();