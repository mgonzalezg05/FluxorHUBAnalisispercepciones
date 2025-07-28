import { supabaseClient } from './config.js';
import { appState, ui, STATUS } from './state.js';
import { showMessage, normalizeRecord, renderTable } from './utils.js';
import { populateProviderSelector } from './providerAnalysis.js';
import { calculateAllProviderDiscrepancies } from './discrepancyAnalysis.js';
import { updateToolAvailability } from './main.js';

function populateColumnSelectors(type, headers) {
    const { reconciler: recUI } = ui;
    if (type === 'Arca') {
        const cuitSelect = recUI.selectCuitArca;
        const montoSelect = recUI.selectMontoArca;
        cuitSelect.innerHTML = '<option value="">Selecciona Columna CUIT...</option>';
        montoSelect.innerHTML = '<option value="">Selecciona Columna Monto...</option>';
        headers.forEach(header => {
            cuitSelect.add(new Option(header, header));
            montoSelect.add(new Option(header, header));
        });
        cuitSelect.value = headers.find(h => h.toLowerCase().includes('cuit')) || '';
        montoSelect.value = headers.find(h => h.toLowerCase().includes('monto retenido')) || '';
    } else {
        const cuitSelect = recUI.selectCuitContabilidad;
        const montoSelect = recUI.selectMontoContabilidad;
        cuitSelect.innerHTML = '<option value="">Selecciona Columna CUIT...</option>';
        montoSelect.innerHTML = '<option value="">Selecciona Columna Monto...</option>';
        headers.forEach(header => {
            cuitSelect.add(new Option(header, header));
            montoSelect.add(new Option(header, header));
        });
        cuitSelect.value = headers.find(h => h.toLowerCase().includes('cuit')) || '';
        montoSelect.value = headers.find(h => h.toLowerCase().includes('crédito') || h.toLowerCase().includes('monto')) || '';
    }
}

// --- LÓGICA DEL CONCILIADOR ---
export async function handleFileSelect(file, type) {
    if (!file) return;
    appState.currentReconciliationId = null; 
    ui.reconciler.reconciliationNameInput.value = '';
    ui.reconciler.reconciliationStatusSelect.value = 'Borrador';

    appState[`file${type}`] = file;
    const fileNameEl = ui.reconciler[`fileName${type}`];
    fileNameEl.innerHTML = `<span class="file-loaded">${file.name}</span>`;
    ui.reconciler.resultsSection.classList.add('hidden');
    ui.reconciler.messageBox.classList.add('hidden');
    appState.allArcaRecords = [];
    appState.allContabilidadRecords = [];
    updateToolAvailability();
    ui.reconciler.loaderOverlay.style.display = 'flex';
    try {
        const fileData = await file.arrayBuffer();
        const workbook = XLSX.read(fileData, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        const headers = data.length > 0 ? Object.keys(data[0]) : [];
        appState[`data${type}`] = data;
        appState[`headers${type}`] = headers;
        populateColumnSelectors(type, headers);
    } catch (e) {
        console.error(`Error reading file ${type}:`, e);
        showMessage('Error al leer el archivo. Asegúrate que sea un formato válido.', true);
        appState[`file${type}`] = null;
        fileNameEl.innerHTML = `Arrastra el archivo de <span>${type}</span>`;
    } finally {
        ui.reconciler.loaderOverlay.style.display = 'none';
    }
    const bothFilesLoaded = appState.fileArca && appState.fileContabilidad;
    ui.reconciler.columnMappingSection.classList.toggle('hidden', !bothFilesLoaded);
    ui.reconciler.processBtn.disabled = !bothFilesLoaded;
}

export async function processReconciliation() {
    appState.currentReconciliationId = null;
    ui.reconciler.reconciliationNameInput.value = '';
    ui.reconciler.reconciliationStatusSelect.value = 'Borrador';

    const { reconciler: recUI } = ui;
    const cuitArcaCol = recUI.selectCuitArca.value, montoArcaCol = recUI.selectMontoArca.value;
    const cuitContCol = recUI.selectCuitContabilidad.value, montoContCol = recUI.selectMontoContabilidad.value;

    if (!cuitArcaCol || !montoArcaCol || !cuitContCol || !montoContCol) {
        showMessage('Debes seleccionar las columnas de CUIT y Monto para ambos archivos.', true);
        return;
    }
    recUI.loaderOverlay.style.display = 'flex';
    recUI.messageBox.classList.add('hidden');
    recUI.resultsSection.classList.add('hidden');
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
        appState.allArcaRecords = appState.dataArca
            .filter(r => r && typeof r === 'object')
            .map((r, i) => ({ ...r, __originalIndex: i, Estado: STATUS.PENDING }));
        
        appState.allContabilidadRecords = appState.dataContabilidad
            .filter(r => r && typeof r === 'object')
            .map((r, i) => ({ ...r, __originalIndex: i, Estado: STATUS.PENDING }));

        const arcaNorm = appState.allArcaRecords.map(r => normalizeRecord(r, cuitArcaCol, montoArcaCol));
        const contNorm = appState.allContabilidadRecords.map(r => normalizeRecord(r, cuitContCol, montoContCol));
        let matchCounter = 0;

        arcaNorm.forEach(arcaRec => {
            const match = contNorm.find(contRec => 
                !contRec.matched && 
                contRec.cuit === arcaRec.cuit && 
                contRec.monto.toFixed(2) === arcaRec.monto.toFixed(2)
            );
            
            if (match) {
                const matchId = `auto_${++matchCounter}`;
                arcaRec.matched = true;
                match.matched = true;
                
                const arcaRecordToUpdate = appState.allArcaRecords.find(r => r.__originalIndex === arcaRec.original.__originalIndex);
                if (arcaRecordToUpdate) {
                    arcaRecordToUpdate.Estado = STATUS.RECONCILED;
                    arcaRecordToUpdate.matchId = matchId;
                }

                const contabRecordToUpdate = appState.allContabilidadRecords.find(r => r.__originalIndex === match.original.__originalIndex);
                if (contabRecordToUpdate) {
                    contabRecordToUpdate.Estado = STATUS.RECONCILED;
                    contabRecordToUpdate.matchId = matchId;
                }
            }
        });

        const allArcaCuits = appState.allArcaRecords.map(r => normalizeRecord(r, cuitArcaCol, null).cuit);
        const allContabilidadCuits = appState.allContabilidadRecords.map(r => normalizeRecord(r, cuitContCol, null).cuit);
        appState.providerCuits = [...new Set([...allArcaCuits, ...allContabilidadCuits])].filter(c => c).sort();
        
        await calculateAllProviderDiscrepancies();
        displayGeneralResults();
        updateToolAvailability();
        showMessage('Conciliación completada.');
    } catch (e) {
        console.error("Error en processReconciliation:", e);
        showMessage('Ocurrió un error inesperado durante el proceso.', true);
    } finally {
        recUI.loaderOverlay.style.display = 'none';
    }
}

export function displayGeneralResults() {
    const { reconciler: recUI } = ui;
    const arcaMontoCol = recUI.selectMontoArca.value;
    const arcaData = appState.allArcaRecords;
    
    const reconciled = arcaData.filter(r => r.Estado === STATUS.RECONCILED || r.Estado === STATUS.RECONCILED_WITH_DIFF);
    const pending = arcaData.filter(r => r.Estado === STATUS.PENDING);
    
    const totalArca = arcaData.reduce((sum, r) => sum + (normalizeRecord(r, null, arcaMontoCol).monto || 0), 0);
    const totalReconciled = reconciled.reduce((sum, r) => sum + (normalizeRecord(r, null, arcaMontoCol).monto || 0), 0);
    const totalPending = totalArca - totalReconciled;
    
    const formatCurrency = (num) => num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    recUI.summaryArcaAmount.textContent = `$${formatCurrency(totalArca)}`;
    recUI.summaryArcaCount.textContent = `${arcaData.length} registros`;
    recUI.summaryReconciledAmount.textContent = `$${formatCurrency(totalReconciled)}`;
    recUI.summaryReconciledCount.textContent = `${reconciled.length} registros`;
    recUI.summaryPendingAmount.textContent = `$${formatCurrency(totalPending)}`;
    recUI.summaryPendingCount.textContent = `${pending.length} registros`;
    
    renderTable(pending, recUI.tablePending, { maxRows: 10 });
    recUI.resultsSection.classList.remove('hidden');
}

// --- FUNCIONES DE GESTIÓN DE DATOS ---

export async function saveReconciliation(isNew = false) {
    const { reconciler: recUI } = ui;
    const reconciliationName = recUI.reconciliationNameInput.value.trim();
    if (!reconciliationName) {
        showMessage('Por favor, dale un nombre a la conciliación.', true);
        return;
    }

    const isUpdate = appState.currentReconciliationId !== null && !isNew;
    
    recUI.loaderOverlay.style.display = 'flex';
    try {
        const conciliationData = {
            nombre: reconciliationName,
            status: recUI.reconciliationStatusSelect.value,
            cuit_arca_col: recUI.selectCuitArca.value,
            monto_arca_col: recUI.selectMontoArca.value,
            cuit_cont_col: recUI.selectCuitContabilidad.value,
            monto_cont_col: recUI.selectMontoContabilidad.value,
            configuracion_columnas: appState.columnVisibility
        };

        let reconciliationId = appState.currentReconciliationId;

        if (isUpdate) {
            const { error } = await supabaseClient.from('conciliaciones').update(conciliationData).eq('id', reconciliationId);
            if (error) throw error;
            const { error: deleteError } = await supabaseClient.from('registros').delete().eq('conciliacion_id', reconciliationId);
            if (deleteError) throw deleteError;
        } else {
            const { data, error } = await supabaseClient.from('conciliaciones').insert([conciliationData]).select().single();
            if (error) throw error;
            reconciliationId = data.id;
            appState.currentReconciliationId = reconciliationId; 
        }
        
        const arcaRecordsToSave = appState.allArcaRecords.map(rec => ({ conciliacion_id: reconciliationId, fuente: 'ARCA', estado: rec.Estado, match_id: rec.matchId || null, datos_originales: rec }));
        const contabilidadRecordsToSave = appState.allContabilidadRecords.map(rec => ({ conciliacion_id: reconciliationId, fuente: 'Contabilidad', estado: rec.Estado, match_id: rec.matchId || null, datos_originales: rec }));
        const allRecordsToSave = [...arcaRecordsToSave, ...contabilidadRecordsToSave];

        const { error: regError } = await supabaseClient.from('registros').insert(allRecordsToSave);
        if (regError) throw regError;

        showMessage('¡Conciliación guardada exitosamente!', false);
        loadSavedReconciliations();

    } catch (error) {
        console.error('Error al guardar:', error);
        showMessage(`Error al guardar: ${error.message}`, true);
    } finally {
        recUI.loaderOverlay.style.display = 'none';
    }
}

export async function loadSavedReconciliations() {
    const { data, error } = await supabaseClient.from('conciliaciones').select('id, nombre, created_at, status').order('created_at', { ascending: false });
    if (error) {
        console.error('Error al cargar lista:', error);
        return;
    }
    if (data && data.length > 0) {
        ui.reconciler.loadSection.classList.remove('hidden');
        const select = ui.reconciler.savedReconciliationsSelect;
        select.innerHTML = '<option value="">Elige una conciliación para cargar...</option>';
        data.forEach(rec => {
            const option = document.createElement('option');
            option.value = rec.id;
            const date = new Date(rec.created_at).toLocaleDateString('es-AR');
            option.textContent = `[${rec.status}] ${rec.nombre} (${date})`;
            select.appendChild(option);
        });
    } else {
        ui.reconciler.loadSection.classList.add('hidden');
    }
}

export async function loadSelectedReconciliation() {
    const selectedId = ui.reconciler.savedReconciliationsSelect.value;
    if (!selectedId) return;

    ui.reconciler.loaderOverlay.style.display = 'flex';
    try {
        const { data: concData, error: concError } = await supabaseClient.from('conciliaciones').select('*').eq('id', selectedId).single();
        if (concError) throw concError;
        
        const { data: regData, error: regError } = await supabaseClient.from('registros').select('*').eq('conciliacion_id', selectedId);
        if (regError) throw regError;

        appState.currentReconciliationId = selectedId;
        appState.allArcaRecords = regData.filter(r => r.fuente === 'ARCA').map(r => r.datos_originales);
        appState.allContabilidadRecords = regData.filter(r => r.fuente === 'Contabilidad').map(r => r.datos_originales);
        
        if (concData.configuracion_columnas) {
            appState.columnVisibility = concData.configuracion_columnas;
        }

        const arcaHeaders = appState.allArcaRecords.length > 0 ? Object.keys(appState.allArcaRecords[0]) : [];
        const contHeaders = appState.allContabilidadRecords.length > 0 ? Object.keys(appState.allContabilidadRecords[0]) : [];
        populateColumnSelectors('Arca', arcaHeaders);
        populateColumnSelectors('Contabilidad', contHeaders);

        ui.reconciler.selectCuitArca.value = concData.cuit_arca_col;
        ui.reconciler.selectMontoArca.value = concData.monto_arca_col;
        ui.reconciler.selectCuitContabilidad.value = concData.cuit_cont_col;
        ui.reconciler.selectMontoContabilidad.value = concData.monto_cont_col;
        ui.reconciler.reconciliationNameInput.value = concData.nombre;
        ui.reconciler.reconciliationStatusSelect.value = concData.status;
        
        const allArcaCuits = appState.allArcaRecords.map(r => normalizeRecord(r, concData.cuit_arca_col, null).cuit);
        const allContabilidadCuits = appState.allContabilidadRecords.map(r => normalizeRecord(r, concData.cuit_cont_col, null).cuit);
        appState.providerCuits = [...new Set([...allArcaCuits, ...allContabilidadCuits])].filter(c => c).sort();

        await calculateAllProviderDiscrepancies();
        displayGeneralResults();
        updateToolAvailability();
        showMessage(`Conciliación "${concData.nombre}" cargada.`, false);
        ui.reconciler.columnMappingSection.classList.remove('hidden');

    } catch (error) {
        console.error('Error al cargar:', error);
        showMessage(`Error al cargar: ${error.message}`, true);
    } finally {
        ui.reconciler.loaderOverlay.style.display = 'none';
    }
}

export async function renameSelectedReconciliation() {
    const selectedId = ui.reconciler.savedReconciliationsSelect.value;
    if (!selectedId) { showMessage('Primero selecciona una conciliación para renombrar.', true); return; }

    const currentName = ui.reconciler.savedReconciliationsSelect.options[ui.reconciler.savedReconciliationsSelect.selectedIndex].text.split('(')[0].replace(/\[.*?\]\s*/, '').trim();
    const newName = prompt('Ingresa el nuevo nombre para la conciliación:', currentName);

    if (newName && newName.trim() !== '') {
        const { error } = await supabaseClient.from('conciliaciones').update({ nombre: newName.trim() }).eq('id', selectedId);
        if (error) {
            showMessage(`Error al renombrar: ${error.message}`, true);
        } else {
            showMessage('Renombrada con éxito.', false);
            loadSavedReconciliations();
        }
    }
}

export async function deleteSelectedReconciliation() {
    const selectedId = ui.reconciler.savedReconciliationsSelect.value;
    if (!selectedId) { showMessage('Primero selecciona una conciliación para eliminar.', true); return; }

    const selectedText = ui.reconciler.savedReconciliationsSelect.options[ui.reconciler.savedReconciliationsSelect.selectedIndex].text;
    if (confirm(`¿Estás seguro de que quieres eliminar "${selectedText}"?\n\nEsta acción no se puede deshacer.`)) {
        const { error } = await supabaseClient.from('conciliaciones').delete().eq('id', selectedId);
        if (error) {
            showMessage(`Error al eliminar: ${error.message}`, true);
        } else {
            showMessage('Eliminada con éxito.', false);
            loadSavedReconciliations();
        }
    }
}

export function downloadGeneralReport() {
    const wb = XLSX.utils.book_new();
    const pending = appState.allArcaRecords.filter(r => r.Estado === STATUS.PENDING);
    const reconciled = appState.allArcaRecords.filter(r => r.Estado === STATUS.RECONCILED || r.Estado === STATUS.RECONCILED_WITH_DIFF);
    const unmatchedContabilidad = appState.allContabilidadRecords.filter(r => r.Estado === STATUS.PENDING);
    
    if (pending.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pending.map(({__originalIndex, matchId, ...rest}) => rest)), "ARCA Pendiente");
    if (reconciled.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reconciled.map(({__originalIndex, matchId, ...rest}) => rest)), "Conciliadas");
    if (unmatchedContabilidad.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedContabilidad.map(({__originalIndex, matchId, ...rest}) => rest)), "Contabilidad Sin Match");

    if (wb.SheetNames.length > 0) {
        XLSX.writeFile(wb, "Reporte_Conciliacion_General.xlsx");
    } else {
        showMessage('No hay datos en ninguna categoría para generar el reporte.', true);
    }
}
