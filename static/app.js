const map = L.map('map', { keyboard: false }).setView([48.696, -113.718], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
}).addTo(map);

map.on('click', function() {
    if (selectedRoadLayer) {
        selectedRoadLayer.resetStyle();
        selectedRoadLayer = null;
    }
});

let currentLayers = L.layerGroup().addTo(map);
let pinClusterGroup = L.markerClusterGroup({
    spiderfyOnEveryZoom: true,
    zoomToBoundsOnClick: false,
    iconCreateFunction: function(cluster) {
        const children = cluster.getAllChildMarkers();
        const count = children.length;
        const types = [...new Set(children.map(m => m._pinType))];
        const badge = `<div style="position:absolute;top:-6px;right:-8px;background:#333;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;z-index:10;border:1.5px solid #fff;">${count}</div>`;
        if (types.length <= 1) {
            return L.divIcon({
                html: `<div style="position:relative;display:inline-block;">${makePinHtml(types[0])}${badge}</div>`,
                className: '',
                iconSize: [30, 42],
                iconAnchor: [15, 42],
                popupAnchor: [0, -42],
            });
        }
        const html = `<div style="position:relative;width:46px;height:42px;">
            <div style="position:absolute;left:16px;top:4px;z-index:1;transform:scale(0.85);transform-origin:bottom center;opacity:0.85;">${makePinHtml(types[1])}</div>
            <div style="position:absolute;left:0;top:0;z-index:2;">${makePinHtml(types[0])}</div>
            ${badge}
        </div>`;
        return L.divIcon({ html, className: '', iconSize: [46, 42], iconAnchor: [15, 42], popupAnchor: [0, -42] });
    },
}).addTo(map);
let availableDates = [];
let timelineData = []; // Store events for timeline
let currentDateIndex = 0;
let selectedRoadLayer = null;

function makePinHtml(pinType) {
    let pinColor = '#3498db';
    let innerHtml = 'ℹ️';

    if (pinType === 'winter_rec') {
        pinColor = '#e41e1e';
        innerHtml = '<span style="font-size: 14px;">⛔️</span>';
    } else if (pinType === 'hiker_biker') {
        pinColor = '#f1c40f';
        innerHtml = '<span style="font-size: 16px; color: black;">🚴</span>';
    } else if (pinType === 'snow_plow') {
        pinColor = '#9b59b6';
        innerHtml = '<span style="font-size: 14px;">🚜</span>';
    }

    const svgPin = `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;z-index:1;">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27c0-8.3-6.7-15-15-15z" fill="${pinColor}" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="15" cy="15" r="10" fill="white" />
    </svg>`;

    return `<div style="position:relative;width:30px;height:42px;filter:drop-shadow(2px 4px 4px rgba(0,0,0,0.4));">
        ${svgPin}
        <div style="position:absolute;top:0;left:0;width:30px;height:30px;display:flex;justify-content:center;align-items:center;z-index:2;">${innerHtml}</div>
    </div>`;
}

const getPinIcon = (pinType) => L.divIcon({
    html: makePinHtml(pinType),
    className: '',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
});

async function init() {
    const res = await fetch('/api/timeline_data');
    const data = await res.json();

    availableDates = data.map(d => d.date);
    timelineData = data; // Just save the whole array directly!

    if (availableDates.length > 0) {
        loadDataForDate(availableDates[0]);

        flatpickr("#datePicker", {
            enable: availableDates,
            dateFormat: "Y-m-d",
            defaultDate: availableDates[0],
            onChange: function(selectedDates, dateStr, instance) {
                loadDataForDate(dateStr);
            }
        });

    } else {
        // Restored this to update the new status element
        document.getElementById('statusDisplay').innerText = "No data in database.";
    }
}

async function loadDataForDate(dateStr) {
    const dp = document.getElementById('datePicker')._flatpickr;
    if (dp) {
        dp.setDate(dateStr, false);
    }
    currentDateIndex = availableDates.indexOf(dateStr);

    const res = await fetch(`/api/data?date=${dateStr}`);
    const data = await res.json();

    currentLayers.clearLayers();
    pinClusterGroup.clearLayers();
    selectedRoadLayer = null;

    const showRoads = document.getElementById('filterRoads').checked;
    const showHikers = document.getElementById('filterHikers').checked;
    const showHazards = document.getElementById('filterHazards').checked;
    const showOnlyChanges = document.getElementById('filterChangesOnly').checked;

    // Get today's and yesterday's timeline data
    const todayTimeline = timelineData[currentDateIndex];
    const yesterdayData = timelineData[currentDateIndex + 1];

    // --- NEW CHANGE CALCULATION LOGIC ---
    let changedPinsCount = 0;
    let changedRoadsCount = 0;

    if (yesterdayData) {
        // Count Pin Changes (new/moved pins, and pins that disappeared e.g. went inactive)
        todayTimeline.pins.forEach(todayPin => {
            const matchFound = yesterdayData.pins.some(yPin => yPin.type === todayPin.type && yPin.geom === todayPin.geom);
            if (!matchFound) changedPinsCount++;
        });
        yesterdayData.pins.forEach(yesterdayPin => {
            const matchFound = todayTimeline.pins.some(tPin => tPin.type === yesterdayPin.type && tPin.geom === yesterdayPin.geom);
            if (!matchFound) changedPinsCount++;
        });

        // Count Road Changes
        todayTimeline.roads.forEach(todayRoad => {
            const yRoad = yesterdayData.roads.find(r => r.id === todayRoad.id);
            if (!yRoad || yRoad.status !== todayRoad.status) changedRoadsCount++;
        });
    }

    // Format the status string
    let statusText = "No changes";
    if (!yesterdayData) {
        statusText = "Baseline date (no previous data)";
    } else if (changedPinsCount > 0 || changedRoadsCount > 0) {
        let parts = [];

        if (changedPinsCount === 1) parts.push("1 pin change");
        else if (changedPinsCount > 1) parts.push(`${changedPinsCount} pin changes`);

        if (changedRoadsCount === 1) parts.push("1 road segment change");
        else if (changedRoadsCount > 1) parts.push(`${changedRoadsCount} road segment changes`);

        statusText = parts.join(' and ');
    }

    // Update the UI
    document.getElementById('statusDisplay').innerText = statusText;
    // -------------------------------------

    if (showRoads) {
        data.roads.forEach(road => {
            if (showOnlyChanges) {
                if (!yesterdayData) return;
                const yesterdayRoad = yesterdayData.roads.find(r => r.id === road.cartodb_id);
                if (yesterdayRoad && yesterdayRoad.status === road.status) return;
            }

            const geojson = JSON.parse(road.geometry);
            const color = road.status === 'open' ? 'green' : (road.status === 'closed' ? 'red' : 'orange');

            const roadLayer = L.geoJSON(geojson, {
                style: { color: color, weight: 4, opacity: 0.85 },
                onEachFeature: function(feature, layer) {
                    layer.on({
                        mouseover: function() {
                            if (roadLayer !== selectedRoadLayer) {
                                layer.setStyle({ color: '#00e5ff', weight: 8, opacity: 1.0 });
                            }
                            layer._map.getContainer().style.cursor = 'pointer';
                        },
                        mouseout: function() {
                            if (roadLayer !== selectedRoadLayer) {
                                roadLayer.resetStyle(layer);
                            }
                            layer._map.getContainer().style.cursor = '';
                        },
                        click: function() {
                            if (selectedRoadLayer && selectedRoadLayer !== roadLayer) {
                                selectedRoadLayer.resetStyle();
                            }
                            selectedRoadLayer = roadLayer;
                            layer.setStyle({ color: '#00e5ff', weight: 8, opacity: 1.0 });
                        }
                    });
                }
            }).bindPopup(`<b>${road.rdname}</b><br>Status: ${road.status}<br>Reason: ${road.reason || 'N/A'}`).addTo(currentLayers);
        });
    }

    data.pins.forEach(pin => {
        if (!showHazards && pin.pin_type === 'winter_rec') return;
        if (!showHikers && pin.pin_type === 'hiker_biker') return;

        if (showOnlyChanges) {
            if (!yesterdayData) return;
            const matchFound = yesterdayData.pins.some(yesterdayPin =>
                yesterdayPin.type === pin.pin_type && yesterdayPin.geom === pin.geometry
            );
            if (matchFound) return;
        }

        const geojson = JSON.parse(pin.geometry);
        L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                const marker = L.marker(latlng, { icon: getPinIcon(pin.pin_type) });
                marker._pinType = pin.pin_type;
                return marker.bindPopup(`<b>${pin.name || pin.pin_type.replace('_', ' ').toUpperCase()}</b><br>${pin.description}`);
            }
        }).addTo(pinClusterGroup);
    });

    renderTimeline();
}

function renderTimeline() {
    const timelineContainer = document.getElementById('timeline-container');
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    if (availableDates.length === 0) return;

    // 1. Calculate how many items can fit on screen
    // Container width minus 32px for the container's left/right padding (16px each)
    const containerWidth = timelineContainer.clientWidth - 32;
    // Each item is ~30px (28px min-width + 2px gap between items)
    const itemWidth = 30;
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
        let roadChanged = false;

        // LOGIC: Check if today's pins or roads moved/changed since yesterday
        if (yesterdayData) {
            // Check Pins (new/moved, and pins that disappeared e.g. went inactive)
            todayData.pins.forEach(todayPin => {
                const matchFound = yesterdayData.pins.some(yesterdayPin =>
                    yesterdayPin.type === todayPin.type && yesterdayPin.geom === todayPin.geom
                );
                if (!matchFound) {
                    movedPins.add(todayPin.type);
                }
            });
            yesterdayData.pins.forEach(yesterdayPin => {
                const matchFound = todayData.pins.some(todayPin =>
                    todayPin.type === yesterdayPin.type && todayPin.geom === yesterdayPin.geom
                );
                if (!matchFound) {
                    movedPins.add(yesterdayPin.type);
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

        }
        // We removed the 'else' block!
        // Now, if there is no 'yesterday' to compare against (the oldest date),
        // it simply won't flag any changes or draw any icons.

        // Draw icons based ONLY on the items that moved/appeared/changed
        if (movedPins.has('hiker_biker')) iconContainer.innerHTML += '<span>🚴</span>';
        if (movedPins.has('winter_rec')) iconContainer.innerHTML += '<span>⛔️</span>';
        if (roadChanged) iconContainer.innerHTML += '<span>🚧</span>';

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
    // 1. Get the actual current date
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // 2. Try to load it, or show the custom modal if missing
    if (availableDates.includes(todayStr)) {
        loadDataForDate(todayStr);
    } else {
        showAlert(`No data in the database for today (${todayStr}). Run your update script!`);
    }
};

document.querySelectorAll('.filters input').forEach(cb => {
    cb.addEventListener('change', () => loadDataForDate(availableDates[currentDateIndex]));
});

// --- Modal and Keyboard Shortcut Logic ---

const helpModal = document.getElementById('helpModal');
const helpIcon = document.getElementById('helpIcon');

const alertModal = document.getElementById('alertModal');
const alertMessage = document.getElementById('alertMessage');

// Function to show custom alert
function showAlert(message) {
    alertMessage.innerText = message;
    alertModal.classList.remove('hidden');
}

// Toggle modal visibility
function toggleHelp() {
    helpModal.classList.toggle('hidden');
}

// Click icon to open
helpIcon.addEventListener('click', toggleHelp);

// Click outside modal content to close
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.classList.add('hidden');
    }
});
alertModal.addEventListener('click', (e) => {
    if (e.target === alertModal) alertModal.classList.add('hidden');
});

// A helper function to toggle a checkbox and trigger its change event
function toggleCheckbox(id) {
    const cb = document.getElementById(id);
    if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    }
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Ignore keystrokes if the user is typing inside the date input
    if (e.target.tagName.toLowerCase() === 'input') return;

    const key = e.key.toLowerCase();
    let triggeredShortcut = false;

    // Timeline Navigation
    if (e.key === 'ArrowLeft') {
        document.getElementById('btnPrev').click();
        triggeredShortcut = true;
    } else if (e.key === 'ArrowRight') {
        document.getElementById('btnNext').click();
        triggeredShortcut = true;
    } else if (key === 't') {
        document.getElementById('btnToday').click();
        triggeredShortcut = true;

    // Map Navigation (WASD + Zoom)
    } else if (key === 'w') {
        map.panBy([0, -150]); // Move up 150px
        triggeredShortcut = true;
    } else if (key === 's') {
        map.panBy([0, 150]);  // Move down 150px
        triggeredShortcut = true;
    } else if (key === 'a') {
        map.panBy([-150, 0]); // Move left 150px
        triggeredShortcut = true;
    } else if (key === 'd') {
        map.panBy([150, 0]);  // Move right 150px
        triggeredShortcut = true;
    } else if (key === 'q' || key === '-' || key === '_') {
        map.zoomOut();
        triggeredShortcut = true;
    } else if (key === 'e' || key === '=' || key === '+') {
        map.zoomIn();
        triggeredShortcut = true;

    // Filter Toggles
    } else if (key === 'r') {
        toggleCheckbox('filterRoads');
        triggeredShortcut = true;
    } else if (key === 'h') {
        toggleCheckbox('filterHikers');
        triggeredShortcut = true;
    } else if (key === 'z') {
        toggleCheckbox('filterHazards');
        triggeredShortcut = true;
    } else if (key === 'c') {
        toggleCheckbox('filterChangesOnly');
        triggeredShortcut = true;

    // UI Controls
    } else if (e.key === '?') {
        toggleHelp();
        return;
    } else if (e.key === 'Escape') {
        helpModal.classList.add('hidden');
        alertModal.classList.add('hidden'); // Dismiss alert on Escape
    }

    // Auto-close ANY open modal if a mapped shortcut is pressed
    if (triggeredShortcut) {
        if (!helpModal.classList.contains('hidden')) helpModal.classList.add('hidden');

        // Prevent the 'T' key from instantly hiding the alert it just opened
        if (key !== 't' && !alertModal.classList.contains('hidden')) {
            alertModal.classList.add('hidden');
        }
    }
});

window.addEventListener('resize', renderTimeline);

init();