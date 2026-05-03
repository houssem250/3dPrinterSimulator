/**
 * --- 1. CORE STATE & SELECTORS ---
 */
const terminal = document.getElementById('terminal-output');
const assetWizard = document.getElementById('asset-wizard');
const globalAddBtn = document.getElementById('global-add-fleet');
const globalAddMenu = document.getElementById('global-add-menu');
const statusDisplay = document.getElementById('status-display');
const statusOptions = document.getElementById('status-options');
const configPane = document.getElementById('config-pane');
const establishBtn = document.getElementById('establish-btn');

let fleetData = [
    { id: "unassigned", groupName: "Unassigned Assets", isOpen: true, assets: [], canDelete: false },
    { id: "g1", groupName: "Production Line A", isOpen: true, assets: [
        { name: "Mach 01 - 3D Printer", id: "PRINTER_01" },
        { name: "Mach 02 - Resin Pro", id: "PRINTER_02" }
    ], canDelete: true }
];

let activePrintJob = {
    targetAsset: null,
    fileName: "No file selected",
    progress: 0,
    isPrinting: false,
    timer: null
};

const gcodes = [
    "G1 X10 Y50 E1.5", 
    "M105 (Heat Check)", 
    "G1 Z30.80 F3000", 
    "M114 (Get Position)", 
    "G92 E0 (Reset Extruder)"
];

/**
 * --- 2. FLEET RENDERER ---
 * Optimized for the 3-dot alignment and visibility logic.
 */
function renderFleet() {
    const container = document.getElementById('fleet-tree');
    if (!container) return;
    
    // Clear current view
    container.innerHTML = ""; 

    fleetData.forEach((group, gIdx) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = "group-wrapper";
        
        const deleteIcon = group.canDelete 
            ? `<span class="action-icon btn-delete-group" title="Delete Group" style="margin-left:10px; color:var(--accent-red)">🗑</span>` 
            : '';

        groupDiv.innerHTML = `
            <div class="group-node ${group.isOpen ? 'open' : ''}" data-group-id="${group.id}">
                <span>${group.groupName.toUpperCase()}</span>
                <div style="display:flex; align-items:center;">
                    <span class="add-btn-quick" title="Quick Add Asset">+</span>
                    ${deleteIcon}
                </div>
            </div>
            <ul class="asset-list" style="display: ${group.isOpen ? 'block' : 'none'}">
                ${group.assets.length === 0 
                    ? '<li class="tree-node empty-msg" style="opacity:0.5; font-style:italic; padding-left:20px;">Empty Group</li>' 
                    : group.assets.map((asset, aIdx) => `
                    <li class="tree-node" data-asset-id="${asset.id}" data-a-idx="${aIdx}" ondblclick="switchToPrintMode('${asset.id}')">
                        <span class="asset-label">
                            <span class="status-dot active" style="color:var(--accent-green)">●</span>
                            ${asset.name}
                        </span>
                        <div class="asset-actions">
                            <span class="three-dots" data-asset-id="${asset.id}">⋮</span>
                            <ul class="asset-context-menu" id="menu-${asset.id}" style="display:none;">
                                <li onclick="switchToPrintMode('${asset.id}')">▶ Start Control</li>
                                <li onclick="handleConfigureAsset('${asset.id}')">⚙ Reconfigure</li>
                                <li onclick="handleLeaveGroup(${gIdx}, ${aIdx})">📤 Move to Unassigned</li>
                                <li onclick="handleDeleteAsset(${gIdx}, ${aIdx})" style="color:var(--accent-red)">✕ Delete Asset</li>
                            </ul>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;

        // Group Toggle Logic
        const header = groupDiv.querySelector('.group-node');
        header.onclick = (e) => {
            if (e.target.classList.contains('add-btn-quick') || e.target.classList.contains('btn-delete-group')) return;
            group.isOpen = !group.isOpen;
            renderFleet();
        };

        // Quick Add Button
        header.querySelector('.add-btn-quick').onclick = (e) => {
            e.stopPropagation();
            openWizard(group.id); 
        };

        // Delete Group Button
        const delGroupBtn = header.querySelector('.btn-delete-group');
        if(delGroupBtn) delGroupBtn.onclick = (e) => { e.stopPropagation(); handleDeleteGroup(gIdx); };

        // 3-Dot Context Menu Toggler
        groupDiv.querySelectorAll('.three-dots').forEach(dot => {
            dot.onclick = (e) => {
                e.stopPropagation();
                const menu = document.getElementById(`menu-${dot.dataset.assetId}`);
                const isVisible = menu.style.display === 'block';
                
                // Close all other menus
                document.querySelectorAll('.asset-context-menu').forEach(m => m.style.display = 'none');
                
                // Toggle current
                menu.style.display = isVisible ? 'none' : 'block';
            };
        });

        container.appendChild(groupDiv);
    });
}

/**
 * --- 3. PRINT CONTROL LOGIC ---
 */
// function switchToPrintMode(assetId) {
//     const asset = findAsset(assetId);
//     if (!asset) return;
//     activePrintJob.targetAsset = asset;

    // Update Icon Rail styling
//     const rail = document.querySelector('.icon-rail');
//     rail.querySelectorAll('.nav-icon').forEach(i => i.classList.remove('active'));
    
//     let printIcon = document.getElementById('rail-printer-icon');
//     if (!printIcon) {
//         printIcon = document.createElement('div');
//         printIcon.className = 'nav-icon active';
//         printIcon.id = 'rail-printer-icon';
//         printIcon.innerHTML = '⎙'; 
//         printIcon.onclick = () => switchToPrintMode(assetId);
//         rail.appendChild(printIcon);
//     } else {
//         printIcon.classList.add('active');
//     }

//     // Transform Sidebar into Control Interface
//     const pane = document.querySelector('.fleet-manager');
//     pane.innerHTML = `
//         <div class="pane-header">
//             <span>CONTROL: ${asset.name}</span>
//             <span class="close-x-btn" onclick="exitPrintMode()">×</span>
//         </div>
//         <div class="print-control-body">
//             <!-- Job Status Card -->
//             <div class="job-status-card">
//                 <label style="font-size:9px; color:var(--text-dim)">ACTIVE FILE</label>
//                 <div id="active-filename" style="font-size:12px; margin:5px 0; color:var(--accent-green); font-weight:bold;">${activePrintJob.fileName}</div>
//                 <div class="progress-bar-container">
//                     <div id="print-progress-fill" style="height:100%; background:var(--accent-green); width:${activePrintJob.progress}%; transition:width 0.3s;"></div>
//                 </div>
//                 <div style="display:flex; justify-content:space-between; font-size:10px;">
//                     <span id="progress-text">${activePrintJob.progress}%</span>
//                     <span>Est: --:--</span>
//                 </div>
//             </div>

//             <!-- Main Actions -->
//             <div class="control-grid">
//                 <button class="action-btn" onclick="startPrint()" id="ctrl-start">START</button>
//                 <button class="secondary-btn" onclick="pausePrint()">PAUSE</button>
//                 <button class="secondary-btn" onclick="document.getElementById('file-input').click()">UPLOAD</button>
//                 <button class="action-btn" onclick="abortPrint()" style="background:var(--accent-red); color:#fff;">ABORT</button>
//             </div>
            
//             <input type="file" id="file-input" style="display:none" onchange="handleFileUpload(event)">

//             <!-- G-Code Analysis Placeholder (New) -->
//             <div class="file-metadata-pane" id="file-meta-display">
//                 <div class="meta-row"><span>Total lines:</span> <span id="m-lines">---</span></div>
//                 <div class="meta-row"><span>Parsed moves:</span> <span id="m-moves">---</span></div>
//                 <div class="meta-row"><span>Skipped lines:</span> <span id="m-skipped">---</span></div>
//                 <div class="meta-row"><span>Layers:</span> <span id="m-layers">---</span></div>
//                 <div class="meta-row"><span>Hotend temp:</span> <span id="m-htemp">---</span></div>
//                 <div class="meta-row"><span>Bed temp:</span> <span id="m-btemp">---</span></div>
//                 <div class="meta-row"><span>Est. filament:</span> <span id="m-filament">---</span></div>
//                 <div class="meta-row"><span>Linear advance:</span> <span id="m-kfactor">---</span></div>
//             </div>

//             <div class="telemetry-mini">
//                 <div class="data-row" style="font-size:11px;">
//                     <span>Status:</span> 
//                     <span id="op-status" style="color:var(--text-dim)">IDLE</span>
//                 </div>
//             </div>
//         </div>
//     `;
// }

// updated function : 

function switchToPrintMode(assetId) {
    const asset = findAsset(assetId);
    if (!asset) return;
    activePrintJob.targetAsset = asset;

    const pane = document.querySelector('.fleet-manager');
    pane.innerHTML = `
        <div class="pane-header">
            <span>CONTROL: ${asset.name}</span>
            <span class="close-x-btn" onclick="exitPrintMode()">×</span>
        </div>
        
        <!-- Tab Navigation -->
        <div class="control-tabs">
            <div class="tab active" onclick="switchControlTab('print')">PRINTING</div>
            <div class="tab" onclick="switchControlTab('calib')">CALIBRATION</div>
        </div>

        <div class="print-control-body">
            <!-- PRINT TAB CONTENT -->
            <div id="tab-print" class="tab-content active">
                <div class="job-status-card">
                    <label style="font-size:9px; color:var(--text-dim)">ACTIVE FILE</label>
                    <div id="active-filename" style="font-size:12px; margin:5px 0; color:var(--accent-green); font-weight:bold;">${activePrintJob.fileName}</div>
                    <div class="progress-bar-container">
                        <div id="print-progress-fill" style="height:100%; background:var(--accent-green); width:${activePrintJob.progress}%;"></div>
                    </div>
                </div>

                 <!-- Main Actions -->
                <div class="control-grid">
                    <button class="action-btn" onclick="startPrint()" id="ctrl-start">START</button>
                    <button class="secondary-btn" onclick="pausePrint()">PAUSE</button>
                    <button class="secondary-btn" onclick="document.getElementById('file-input').click()">UPLOAD</button>
                    <button class="action-btn" onclick="abortPrint()" style="background:var(--accent-red); color:#fff;">ABORT</button>
                </div>
                
                <input type="file" id="file-input" style="display:none" onchange="handleFileUpload(event)">

                <!-- G-Code Analysis Placeholder (New) -->
                <div class="file-metadata-pane" id="file-meta-display">
                    <div class="meta-row"><span>Total lines:</span> <span id="m-lines">---</span></div>
                    <div class="meta-row"><span>Parsed moves:</span> <span id="m-moves">---</span></div>
                    <div class="meta-row"><span>Skipped lines:</span> <span id="m-skipped">---</span></div>
                    <div class="meta-row"><span>Layers:</span> <span id="m-layers">---</span></div>
                    <div class="meta-row"><span>Hotend temp:</span> <span id="m-htemp">---</span></div>
                    <div class="meta-row"><span>Bed temp:</span> <span id="m-btemp">---</span></div>
                    <div class="meta-row"><span>Est. filament:</span> <span id="m-filament">---</span></div>
                    <div class="meta-row"><span>Linear advance:</span> <span id="m-kfactor">---</span></div>
                </div>
            </div>

            <!-- CALIBRATION TAB CONTENT -->
            <div id="tab-calib" class="tab-content">
                <div class="calibration-info">
                    <p>System health check. Select modules to verify hardware integrity before production.</p>
                </div>

                <div class="calibration-options">
                    <label class="check-container select-all">
                        <input type="checkbox" id="cal-all" onchange="toggleAllCalib(this)">
                        <span class="checkmark"></span> SELECT ALL MODULES
                    </label>
                    <hr style="border:0; border-top:1px solid var(--border); margin:10px 0;">
                    <label class="check-container">
                        <input type="checkbox" class="cal-opt" value="extrusion">
                        <span class="checkmark"></span> Extrusion Test (E-Steps)
                    </label>
                    <label class="check-container">
                        <input type="checkbox" class="cal-opt" value="movement">
                        <span class="checkmark"></span> Movement (X/Y/Z Squaring)
                    </label>
                    <label class="check-container">
                        <input type="checkbox" class="cal-opt" value="temp">
                        <span class="checkmark"></span> Thermal Stability (PID)
                    </label>
                </div>

                <div class="calib-footer">
                    <div class="est-time">Est. Test Duration: <span id="cal-time">0m</span></div>
                    <button class="secondary-btn" style="width:100%; margin: 10px 0;">PREVIEW CALIB G-CODE</button>
                    <div class="control-grid" style="margin-top:0">
                        <button class="action-btn" onclick="runCalibration()">START TEST</button>
                        <button class="action-btn" style="background:var(--accent-red);" onclick="abortPrint()">ABORT</button>
                    </div>
                </div>
            </div>
        </div>
        <input type="file" id="file-input" style="display:none" onchange="handleFileUpload(event)">
    `;
}

// tab logic for printing pane : 

// Logic to switch tabs
function switchControlTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Shell logic for "Select All"
function toggleAllCalib(source) {
    const checkboxes = document.querySelectorAll('.cal-opt');
    checkboxes.forEach(cb => cb.checked = source.checked);
    document.getElementById('cal-time').innerText = source.checked ? "12m 30s" : "0m";
}

function runCalibration() {
    logToTerminal("SYSTEM: Initiating hardware calibration sequence...");
    // Future: Add notification logic here
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        activePrintJob.fileName = file.name;
        document.getElementById('active-filename').innerText = file.name;
        
        // Simulate G-Code Parsing
        const metaPane = document.getElementById('file-meta-display');
        metaPane.classList.add('parsing-active');
        
        setTimeout(() => {
            metaPane.classList.remove('parsing-active');
            document.getElementById('m-lines').innerText = "253,111";
            document.getElementById('m-moves').innerText = "211,011";
            document.getElementById('m-skipped').innerText = "5";
            document.getElementById('m-layers').innerText = "6,171";
            document.getElementById('m-htemp').innerText = "220 °C";
            document.getElementById('m-btemp').innerText = "55 °C";
            document.getElementById('m-filament').innerText = "8992.0 mm";
            document.getElementById('m-kfactor').innerText = "K=0";
            
            logToTerminal(`SYSTEM: Analyzed ${file.name} - 6171 layers found.`);
        }, 800);
    }
}

function startPrint() {
    if (activePrintJob.fileName === "No file selected") {
        logToTerminal("ERROR: No file loaded for printing.");
        return;
    }
    activePrintJob.isPrinting = true;
    const status = document.getElementById('op-status');
    if(status) { status.innerText = "PRINTING"; status.style.color = "var(--accent-green)"; }
    document.getElementById('rail-printer-icon')?.classList.add('printing');
    
    if(activePrintJob.timer) clearInterval(activePrintJob.timer);
    activePrintJob.timer = setInterval(() => {
        if (activePrintJob.progress < 100) {
            activePrintJob.progress++;
            const fill = document.getElementById('print-progress-fill');
            const text = document.getElementById('progress-text');
            if(fill) fill.style.width = activePrintJob.progress + "%";
            if(text) text.innerText = activePrintJob.progress + "%";
        } else {
            clearInterval(activePrintJob.timer);
            activePrintJob.isPrinting = false;
            document.getElementById('rail-printer-icon')?.classList.remove('printing');
            logToTerminal("SUCCESS: Job completed.");
        }
    }, 1000);
}

function abortPrint() {
    activePrintJob.isPrinting = false;
    clearInterval(activePrintJob.timer);
    activePrintJob.progress = 0;
    const status = document.getElementById('op-status');
    if(status) { status.innerText = "ABORTED"; status.style.color = "var(--accent-red)"; }
    document.getElementById('rail-printer-icon')?.classList.remove('printing');
    logToTerminal("WARNING: Print job aborted.");
}

function exitPrintMode() {
    document.getElementById('rail-printer-icon')?.remove();
    document.querySelector('.icon-rail .nav-icon')?.classList.add('active');
    renderFleet(); 
}

/**
 * --- 4. DATA HELPERS ---
 */
function findAsset(id) {
    for (let group of fleetData) {
        let asset = group.assets.find(a => a.id === id);
        if (asset) return asset;
    }
    return null;
}

function handleDeleteGroup(gIdx) {
    const group = fleetData[gIdx];
    if (group.assets.length > 0) {
        if (confirm(`Group contains ${group.assets.length} assets. Move them to Unassigned?`)) {
            const unassigned = fleetData.find(g => g.id === 'unassigned');
            unassigned.assets.push(...group.assets);
            fleetData.splice(gIdx, 1);
        }
    } else if (confirm(`Delete empty group [${group.groupName}]?`)) {
        fleetData.splice(gIdx, 1);
    }
    renderFleet();
}

function handleLeaveGroup(gIdx, aIdx) {
    const asset = fleetData[gIdx].assets.splice(aIdx, 1)[0];
    fleetData.find(g => g.id === 'unassigned').assets.push(asset);
    logToTerminal(`SYSTEM: ${asset.name} moved to Unassigned.`);
    renderFleet();
}

function handleDeleteAsset(gIdx, aIdx) {
    const name = fleetData[gIdx].assets[aIdx].name;
    if (confirm(`Delete ${name}?`)) {
        fleetData[gIdx].assets.splice(aIdx, 1);
        renderFleet();
    }
}

function handleConfigureAsset(assetId) {
    openWizard(); 
    const header = document.querySelector('#asset-wizard .pane-header span');
    if(header) header.textContent = "EDIT ASSET CONFIGURATION";
}

/**
 * --- 5. UI & MODAL LOGIC ---
 */
function logToTerminal(msg) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const entry = document.createElement('div');
    entry.style.marginBottom = "2px";
    entry.innerHTML = `<span style="color:var(--text-dim)">[${time}]</span> ${msg}`;
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

function openWizard(selectedGroupId = "unassigned") {
    assetWizard.style.display = 'block';
    const body = document.querySelector('#printer-tab .config-body');
    const old = document.getElementById('wizard-group-select-container');
    if(old) old.remove();

    const selectHTML = `
        <div id="wizard-group-select-container" style="margin-top:15px; border-top:1px solid #333; padding-top:10px;">
            <label style="font-size:11px; color:var(--text-dim)">TARGET ASSIGNMENT</label><br>
            <select id="wizard-group-select" style="width:100%; background:#1a1a1a; color:white; border:1px solid #444; padding:8px; margin-top:5px;">
                ${fleetData.map(g => `<option value="${g.id}" ${selectedGroupId === g.id ? 'selected' : ''}>${g.groupName}</option>`).join('')}
            </select>
        </div>`;
    body.insertAdjacentHTML('beforeend', selectHTML);
    switchTab('printer-tab');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === tabId));
}

/**
 * --- 6. EVENT BINDINGS ---
 */

 // Sample data for our alerts
const systemAlerts = [
    {
        id: 1,
        type: 'critical',
        title: 'THERMAL RUNAWAY PROTECTION',
        time: '12:04',
        detail: 'Sensor E0 detected a temperature spike exceeding 15°C/s. Heating has been cut. Check thermistor seating and heater cartridge wiring immediately.'
    },
    {
        id: 2,
        type: 'warning',
        title: 'Z-AXIS SQUARING ERROR',
        time: '11:50',
        detail: 'Lead screw deviation detected on Z2 motor (>0.12mm). Recalibration recommended before starting high-precision prints.'
    }
];

function renderAlertFeed() {
    const container = document.getElementById('alert-feed-container');
    container.innerHTML = systemAlerts.map(alert => `
        <div id="alert-1" class="alert-item critical" onclick="this.classList.toggle('expanded')">
            <!-- HEADER -->
            <div class="alert-header">
                <div>
                    <span style="color:var(--accent-red); margin-right:8px;">●</span>
                    <span style="font-weight:bold;">THERMAL RUNAWAY</span>
                </div>
                <span class="expand-icon">▼</span>
            </div>

            <!-- PANE 1: DETAILS -->
            <div class="alert-detail">
                <p>Sensor E0 detected a rapid temperature drop. Potential heater failure.</p>
                <button class="action-btn initial-fix-btn" onclick="handleFixNow(event, 1)">
                    FIX NOW
                </button>
            </div>

            <!-- PANE 2: THE WIZARD (Appears after Fix Now) -->
            <div class="fix-wizard-pane">
                <div class="step-text">
                    <span style="color:var(--accent-green)">[STEP 1]</span> 
                    Verify heater cartridge resistance via Multi-meter or check for loose terminal screws.
                </div>
                
                <div class="control-grid" style="margin-top:15px;">
                    <button class="action-btn" onclick="closeWizard(event, 1, true)">
                        DIAGNOSE / TEST
                    </button>
                    <button class="secondary-btn" onclick="closeWizard(event, 1, false)">
                        DONE / DISCARD
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Call this on load or when a problem is detected
renderAlertFeed();

function showInlineGroupInput() {
    const groupName = prompt("Enter New Group Name:");
    if (groupName) {
        const newId = "g_" + Date.now();
        fleetData.push({ id: newId, groupName: groupName, isOpen: true, assets: [], canDelete: true });
        renderFleet();
        logToTerminal(`SYSTEM: Created new group [${groupName}]`);
    }
}

function handleFixNow(event, alertId) {
    event.stopPropagation(); // Prevents the parent 'expanded' toggle from firing
    const el = document.getElementById(`alert-${alertId}`);
    el.classList.add('fixing');
}

// function closeWizard(event, alertId, resolve = false) {
//     event.stopPropagation();
//     const el = document.getElementById(`alert-${alertId}`);
    
//     if(resolve) {
//         // Move to Event Timeline (Logic here)
//         console.log("Alert Resolved and Moved to Timeline");
//         el.style.opacity = '0';
//         setTimeout(() => el.remove(), 300);
//     } else {
//         // Just exit fixing mode back to detail mode
//         el.classList.remove('fixing');
//     }
// }
function closeWizard(event, alertId, resolve = false) {
    event.stopPropagation();
    const el = document.getElementById(`alert-${alertId}`);
    
    if(resolve) {
        // 1. Log the event
        addLogEntry("Manual Calibration Performed - Sensor E0 Reseat");
        
        // 2. Animate out the alert
        el.style.transform = "translateX(50px)";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
    } else {
        el.classList.remove('fixing');
    }
}

statusDisplay.onclick = (e) => {
    e.stopPropagation();
    statusOptions.style.display = statusOptions.style.display === 'block' ? 'none' : 'block';
};

document.getElementById('modal-close-x').onclick = () => configPane.style.display = 'none';
document.getElementById('cancel-btn').onclick = () => configPane.style.display = 'none';


statusOptions.querySelectorAll('li').forEach(li => {
    li.onclick = () => {
        const action = li.getAttribute('data-action');
        const statusText = statusDisplay.querySelector('.status-text');
        
        // 1. Reset classes
        statusText.classList.remove('green', 'amber', 'red');

        // 2. Handle Actions
        if (action === 'configure') {
            configPane.style.display = 'block';
        } else if (action === 'disconnect') {
            statusText.innerText = "DISCONNECTED";
            statusText.classList.add('red');
            logToTerminal("SYSTEM: Digital Twin disconnected.");
        } else if (action === 'standalone') {
            statusText.innerText = "STANDALONE";
            statusText.classList.add('amber');
            logToTerminal("SYSTEM: Operating in Offline/Standalone mode.");
        }

        statusOptions.style.display = 'none';
    };
});



// Add this to Section 6 in script.js to make the search work!
document.querySelector('.search-box input').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.tree-node').forEach(node => {
        const isMatch = node.innerText.toLowerCase().includes(term);
        node.style.display = isMatch ? 'flex' : 'none';
    });
};

// Global Add Asset Menu
globalAddBtn.onclick = (e) => {
    e.stopPropagation();
    globalAddMenu.style.display = globalAddMenu.style.display === 'block' ? 'none' : 'block';
};

// Finish Wizard Action
// Replace your existing finish-asset listener with this for better precision:
document.getElementById('finish-asset').onclick = () => {
    // Look for the specific ID we added in the HTML review (wizard-asset-name)
    const nameInput = document.getElementById('wizard-asset-name') || document.querySelector('#printer-tab input[type="text"]');
    const name = nameInput.value.trim() || "New Asset";
    
    const targetGroupId = document.getElementById('wizard-group-select').value;
    const targetGroup = fleetData.find(g => g.id === targetGroupId);
    
    if(targetGroup) {
        targetGroup.assets.push({ 
            name: name, 
            id: `ASSET_${Date.now()}` 
        });
        renderFleet();
        nameInput.value = ""; 
        logToTerminal(`SYSTEM: Added ${name} to ${targetGroup.groupName}`);
    }
    assetWizard.style.display = 'none';
};

establishBtn.onclick = () => {
    const originalText = establishBtn.innerText;
    establishBtn.innerText = "TESTING...";
    establishBtn.disabled = true;
    
    setTimeout(() => {
        const statusText = statusDisplay.querySelector('.status-text');
        establishBtn.innerText = originalText;
        establishBtn.disabled = false;
        configPane.style.display = 'none';
        
        // Update to Connected
        statusText.innerText = "CONNECTED";
        statusText.classList.remove('red', 'amber');
        statusText.classList.add('green');
        
        logToTerminal("SYSTEM: Octoprint connection established.");
    }, 1500);
};


// Initialization
window.onload = () => {
    renderFleet();
    // Background "Heartbeat" Terminal logs
    setInterval(() => { 
        if(!activePrintJob.isPrinting) {
            logToTerminal(gcodes[Math.floor(Math.random() * gcodes.length)]); 
        }
    }, 3500);
};

// Close all menus when clicking away
window.onclick = (e) => {
    if (!e.target.matches('.three-dots')) {
        document.querySelectorAll('.asset-context-menu').forEach(m => m.style.display = 'none');
    }
    if (!e.target.closest('#global-add-fleet')) {
        globalAddMenu.style.display = 'none';
    }
    statusOptions.style.display = 'none';
};

// Wizard Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.getAttribute('data-tab'));
});

// UI Navigation buttons
document.querySelector('.next-tab').onclick = () => switchTab('filament-tab');
document.querySelector('.prev-tab').onclick = () => switchTab('printer-tab');
document.getElementById('wizard-close').onclick = () => assetWizard.style.display = 'none';





// timeline test code : 
const horizontalEvents = [
    { time: "08:00", desc: "System Warmup", status: "completed" },
    { time: "08:15", desc: "Auto-Leveling", status: "completed" },
    { time: "08:20", desc: "Print Started", status: "completed" },
    { time: "09:45", desc: "Extruder Check", status: "current" },
    { time: "---", desc: "Planned Finish", status: "pending" }
];

function renderHorizontalTimeline() {
    const container = document.getElementById('event-timeline-h');
    container.innerHTML = horizontalEvents.map(event => `
        <div class="event-point-h ${event.status}">
            <div class="dot-h"></div>
            <div class="time-h">${event.time}</div>
            <div class="desc-h">${event.desc}</div>
        </div>
    `).join('');
}


// Function to add a new event to the log
function addLogEntry(description, type = "completed") {
    const now = new Date();
    const timestamp = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Set previous "current" events to "completed"
    timelineData.forEach(e => { if(e.status === 'current') e.status = 'completed'; });
    
    timelineData.push({ time: timestamp, desc: description, status: type });
    renderTimeline();
}

// Initialize on load
renderHorizontalTimeline();