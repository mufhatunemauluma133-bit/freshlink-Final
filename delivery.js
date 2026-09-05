const form = document.getElementById('deliveryForm');
const messageBox = document.getElementById('deliveryMessage');
const driverList = document.getElementById('driverList');

function getDrivers() {
    return JSON.parse(localStorage.getItem('freshlink_drivers') || '[]');
}

function saveDrivers(drivers) {
    localStorage.setItem('freshlink_drivers', JSON.stringify(drivers));
}

function formatCurrency(value) {
    return `R${Number(value || 0).toFixed(2)}`;
}

function renderDrivers() {
    if (!driverList) return;

    const drivers = getDrivers();

    if (!drivers.length) {
        driverList.innerHTML = '<div class="message">No delivery drivers registered yet.</div>';
        return;
    }

    driverList.innerHTML = drivers.map((driver, index) => `
        <div class="farm-summary" style="margin-bottom:12px;">
            <h3>${driver.driverName}</h3>
            <p style="margin:6px 0; color:#cbd5e1;">${driver.vehicleType} • ${driver.serviceArea}</p>
            <p style="margin:6px 0; color:#94a3b8;">${driver.location}</p>
            <p style="margin:6px 0; color:#94a3b8;">📞 ${driver.phone}</p>
            <p style="margin:6px 0; color:#94a3b8;">💸 ${formatCurrency(driver.costPer100km)} per 100km</p>
            <p style="margin:6px 0; color:#cbd5e1;">${driver.notes || 'Available for scheduled farm deliveries.'}</p>
            <button class="secondary-btn" type="button" onclick="selectDriver(${index})">Use this driver</button>
        </div>
    `).join('');
}

window.selectDriver = function (index) {
    const drivers = getDrivers();
    const selected = drivers[index];
    if (!selected) return;
    localStorage.setItem('freshlink_selected_driver', JSON.stringify(selected));
    if (messageBox) {
        messageBox.innerHTML = `<div class="message success">${selected.driverName} selected for your delivery.</div>`;
    }
    window.location.href = 'payment.html';
};

if (form) {
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const drivers = getDrivers();
        const driverName = document.getElementById('driverName')?.value.trim() || "";
        const vehicleType = document.getElementById('vehicleType')?.value.trim() || "";
        const phone = (document.getElementById('phone')?.value || "").trim().replace(/\D/g, '').substring(0, 15);
        const location = document.getElementById('location')?.value.trim() || "";
        const serviceArea = document.getElementById('serviceArea')?.value.trim() || "";
        const costPer100km = Number(document.getElementById('costPer100km')?.value || 0);
        const notes = document.getElementById('notes')?.value.trim() || "";

        if (!driverName || !vehicleType || !phone || !location || !serviceArea || costPer100km <= 0) {
            if (messageBox) {
                messageBox.innerHTML = '<div class="message error">Please fill in all driver details correctly.</div>';
            }
            return;
        }

        const payload = {
            driverName: driverName.substring(0, 100),
            vehicleType: vehicleType.substring(0, 50),
            phone: phone,
            location: location.substring(0, 100),
            serviceArea: serviceArea.substring(0, 100),
            costPer100km: costPer100km,
            notes: notes.substring(0, 300)
        };

        drivers.push(payload);
        saveDrivers(drivers);
        form.reset();
        if (messageBox) {
            messageBox.innerHTML = '<div class="message success">Driver registered successfully. It is now visible for delivery options.</div>';
        }
        renderDrivers();
    });
}

renderDrivers();
