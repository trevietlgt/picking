const STORAGE_KEYS = {
  API_URL: 'picking_api_url',
  PICKER: 'picking_picker_name'
};

let state = {
  apiUrl: '',
  pickerName: '',
  orders: [],
  currentOrder: null,
  currentLines: [],
  currentIndex: 0,
  nextOrder: null,
  currentSummary: null
};

function initSavedValues() {
  const savedApi = localStorage.getItem(STORAGE_KEYS.API_URL) || '';
  const savedPicker = localStorage.getItem(STORAGE_KEYS.PICKER) || '';
  document.getElementById('apiUrl').value = savedApi;
  document.getElementById('pickerName').value = savedPicker;
}

function showSection(sectionId) {
  ['loginScreen', 'ordersScreen', 'pickingScreen', 'summaryScreen'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(sectionId).classList.remove('hidden');
}

function normalizeApiUrl(url) {
  return (url || '').trim().replace(/\/$/, '');
}

async function apiRequest(action, payload = {}, method = 'POST') {
  if (!state.apiUrl) throw new Error('Thiếu API URL');

  if (method === 'GET') {
    const url = new URL(state.apiUrl);
    url.searchParams.set('action', action);
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { method: 'GET' });
    return await res.json();
  }

  const res = await fetch(state.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  return await res.json();
}

async function startApp() {
  const apiUrl = normalizeApiUrl(document.getElementById('apiUrl').value);
  const pickerName = document.getElementById('pickerName').value.trim();

  if (!apiUrl) return alert('Anh nhập Apps Script Web App URL trước nhé.');
  if (!pickerName) return alert('Anh nhập tên picker trước nhé.');

  state.apiUrl = apiUrl;
  state.pickerName = pickerName;
  localStorage.setItem(STORAGE_KEYS.API_URL, apiUrl);
  localStorage.setItem(STORAGE_KEYS.PICKER, pickerName);

  document.getElementById('helloText').textContent = `Picker: ${pickerName}`;
  showSection('ordersScreen');
  await loadOrders();
}

async function loadOrders() {
  try {
    document.getElementById('ordersLoading').classList.remove('hidden');
    const data = await apiRequest('getOrdersSummary', {}, 'GET');
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    renderOrders();
  } catch (err) {
    alert('Không tải được danh sách đơn: ' + err.message);
  } finally {
    document.getElementById('ordersLoading').classList.add('hidden');
  }
}

function renderOrders() {
  const box = document.getElementById('ordersList');
  const statusFilter = document.getElementById('statusFilter').value;
  const tripFilter = document.getElementById('tripFilter').value.trim();

  let orders = [...state.orders];
  if (statusFilter !== 'ALL') {
    orders = orders.filter(o => o.status === statusFilter);
  }
  if (tripFilter) {
    orders = orders.filter(o => String(o.tripNo) === tripFilter);
  }

  if (!orders.length) {
    box.innerHTML = '<div class="card">Không có đơn phù hợp.</div>';
    return;
  }

  box.innerHTML = orders.map(o => `
    <div class="card order-item">
      <div class="row">
        <div>
          <div class="order-title">${escapeHtml(o.shiptoNm || '')}</div>
          <div class="meta">
            DO: <b>${escapeHtml(o.doNo || '')}</b><br>
            Trip: <b>${escapeHtml(String(o.tripNo || ''))}</b><br>
            Tiến độ: <b>${o.doneLines || 0}/${o.totalLines || 0}</b>
          </div>
        </div>
        <span class="badge status-${o.status}">${o.status}</span>
      </div>
      <div style="height:12px"></div>
      <button class="btn btn-primary" onclick="openOrder('${encodeForAttr(o.doNo)}')">Mở đơn</button>
    </div>
  `).join('');
}

async function openOrder(doNo) {
  try {
    const data = await apiRequest('getPickingLines', { doNo, pickerName: state.pickerName }, 'GET');
    if (!data.order || !Array.isArray(data.lines) || !data.lines.length) {
      return alert('Không tìm thấy dữ liệu đơn.');
    }

    state.currentOrder = data.order;
    state.currentLines = data.lines;
    state.currentIndex = data.lines.findIndex(x => !x.result);
    if (state.currentIndex < 0) {
      await loadOrders();
      return alert('Đơn này đã hoàn thành rồi.');
    }

    showSection('pickingScreen');
    renderCurrentLine();
  } catch (err) {
    alert('Không mở được đơn: ' + err.message);
  }
}

function renderCurrentLine() {
  const line = state.currentLines[state.currentIndex];
  if (!line) return;
  document.getElementById('storeName').textContent = state.currentOrder.shiptoNm || '';
  document.getElementById('doNo').textContent = state.currentOrder.doNo || '';
  document.getElementById('tripNo').textContent = state.currentOrder.tripNo || '';
  document.getElementById('lineProgress').textContent = `${state.currentIndex + 1}/${state.currentLines.length}`;
  document.getElementById('srcCell').textContent = line.srcCell || '';
  document.getElementById('itemCode').textContent = line.itemCode || '';
  document.getElementById('itemName').textContent = line.itemName || '';
  document.getElementById('allocQty').textContent = line.allocQty || 0;
}

async function confirmLine() {
  const line = state.currentLines[state.currentIndex];
  try {
    await apiRequest('saveLineAction', {
      rowNumber: line.rowNumber,
      actionType: 'CONFIRM',
      pickerName: state.pickerName
    });

    state.currentLines[state.currentIndex].result = 'OK';
    state.currentLines[state.currentIndex].missingQty = 0;

    await moveNext();
  } catch (err) {
    alert('Lưu CONFIRM lỗi: ' + err.message);
  }
}

async function skipLine() {
  const line = state.currentLines[state.currentIndex];
  const missingQty = prompt('Nhập số lượng chưa lấy được:');
  if (missingQty === null) return;

  const reason = prompt('Lý do skip (ví dụ: thiếu hàng / hết hàng):', 'thiếu hàng') || '';
  const qtyNum = Number(missingQty);
  if (Number.isNaN(qtyNum) || qtyNum < 0) {
    return alert('Số lượng không hợp lệ.');
  }

  try {
    await apiRequest('saveLineAction', {
      rowNumber: line.rowNumber,
      actionType: 'SKIP',
      missingQty: qtyNum,
      skipReason: reason,
      pickerName: state.pickerName
    });

    state.currentLines[state.currentIndex].result = 'SKIP';
    state.currentLines[state.currentIndex].missingQty = qtyNum;

    await moveNext();
  } catch (err) {
    alert('Lưu SKIP lỗi: ' + err.message);
  }
}

async function moveNext() {
  state.currentIndex += 1;
  if (state.currentIndex < state.currentLines.length) {
    renderCurrentLine();
    return;
  }

  const doNo = state.currentOrder.doNo;
  const summary = buildSummary(state.currentLines);
  state.currentSummary = summary;

  try {
    const next = await apiRequest('getNextOrderAfter', { doNo }, 'GET');
    state.nextOrder = next.order || null;
  } catch (_) {
    state.nextOrder = null;
  }

  document.getElementById('summaryTitle').textContent = `DO ${doNo} đã hoàn thành`;
  document.getElementById('sumTotal').textContent = summary.total;
  document.getElementById('sumOk').textContent = summary.ok;
  document.getElementById('sumSkip').textContent = summary.skip;
  document.getElementById('sumMissing').textContent = summary.missing;
  showSection('summaryScreen');
  await loadOrders();
}

function buildSummary(lines) {
  let ok = 0;
  let skip = 0;
  let missing = 0;

  lines.forEach(line => {
    if (line.result === 'OK') ok += 1;
    if (line.result === 'SKIP') {
      skip += 1;
      missing += Number(line.missingQty || 0);
    }
  });

  return {
    total: lines.length,
    ok,
    skip,
    missing
  };
}

async function openNextOrderFromSummary() {
  if (state.nextOrder && state.nextOrder.doNo) {
    await openOrder(state.nextOrder.doNo);
  } else {
    showSection('ordersScreen');
    await loadOrders();
  }
}

async function releaseCurrentOrder() {
  if (!state.currentOrder) return;
  const yes = confirm(`Nhả đơn ${state.currentOrder.doNo}?`);
  if (!yes) return;

  try {
    await apiRequest('releaseOrder', {
      doNo: state.currentOrder.doNo,
      pickerName: state.pickerName
    });
    backToOrders();
  } catch (err) {
    alert('Nhả đơn lỗi: ' + err.message);
  }
}

function backToOrders() {
  showSection('ordersScreen');
  loadOrders();
}

function goOrdersFromSummary() {
  showSection('ordersScreen');
  loadOrders();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function encodeForAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

document.addEventListener('DOMContentLoaded', initSavedValues);
