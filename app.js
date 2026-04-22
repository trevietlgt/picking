const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxJl4vMd8YJlmrZv90Wo2pUh8-mxLno2oPPisB6NkN3FjoYbFYSncu3JN-MdrXYwNdfSA/exec';
const STORAGE_KEYS = {
  PICKER: 'picking_picker_name'
};

const state = {
  apiUrl: DEFAULT_API_URL,
  pickerName: '',
  orders: [],
  currentOrder: null,
  currentLines: [],
  currentIndex: 0,
  nextOrder: null,
  pendingSaves: 0,
  actionQueue: Promise.resolve()
};

function initSavedValues() {
  const savedPicker = localStorage.getItem(STORAGE_KEYS.PICKER) || '';
  document.getElementById('pickerName').value = savedPicker;
}

function toast(message) {
  const box = document.getElementById('toast');
  box.textContent = message;
  box.style.display = 'block';
  clearTimeout(box._timer);
  box._timer = setTimeout(() => {
    box.style.display = 'none';
  }, 2500);
}

function showSection(sectionId) {
  ['loginScreen', 'ordersScreen', 'pickingScreen', 'summaryScreen'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(sectionId).classList.remove('hidden');
}

function setActionLoading(isLoading) {
  const confirmBtn = document.getElementById('confirmBtn');
  const skipBtn = document.getElementById('skipBtn');
  if (!confirmBtn || !skipBtn) return;
  confirmBtn.disabled = isLoading;
  skipBtn.disabled = isLoading;
}

function updateHeaderStats() {
  const picked = state.currentLines.filter(x => x.result === 'OK' || x.result === 'SKIP').length;
  const remaining = state.currentLines.filter(x => !x.result).length;
  document.getElementById('pickedCount').textContent = String(picked);
  document.getElementById('remainingCount').textContent = String(remaining);
  document.getElementById('pendingSyncCount').textContent = String(state.pendingSaves);

  const q = document.getElementById('queueIndicator');
  if (state.pendingSaves > 0) {
    q.classList.remove('hidden');
    q.textContent = `Đang đồng bộ nền: ${state.pendingSaves} thao tác`;
  } else {
    q.classList.add('hidden');
  }
}

async function apiRequest(action, payload = {}, method = 'POST') {
  if (!state.apiUrl) throw new Error('Thiếu API URL');

  if (method === 'GET') {
    const url = new URL(state.apiUrl);
    url.searchParams.set('action', action);
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.success === false) throw new Error(data.message || 'API error');
    return data;
  }

  const res = await fetch(state.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.success === false) throw new Error(data.message || 'API error');
  return data;
}

async function startApp() {
  const pickerName = document.getElementById('pickerName').value.trim();
  if (!pickerName) {
    alert('Anh nhập tên picker trước nhé.');
    return;
  }
  state.pickerName = pickerName;
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
    <div class="order-item">
      <div class="row">
        <div>
          <div class="order-title">${escapeHtml(o.shiptoNm || '')}</div>
          <div class="meta">
            DO: <b>${escapeHtml(o.doNo || '')}</b><br>
            Trip: <b>${escapeHtml(String(o.tripNo || ''))}</b><br>
            Tiến độ: <b>${o.doneLines || 0}/${o.totalLines || 0}</b>${o.pickedBy ? `<br>Đang giữ bởi: <b>${escapeHtml(o.pickedBy)}</b>` : ''}
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
      alert('Không tìm thấy dữ liệu đơn.');
      return;
    }
    state.currentOrder = data.order;
    state.currentLines = data.lines;
    state.currentIndex = data.lines.findIndex(x => !x.result);
    state.pendingSaves = 0;
    state.actionQueue = Promise.resolve();

    if (state.currentIndex < 0) {
      toast('Đơn này đã hoàn thành.');
      await loadOrders();
      return;
    }

    showSection('pickingScreen');
    renderCurrentLine();
    updateHeaderStats();
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
  document.getElementById('activePicker').textContent = state.pickerName;
  document.getElementById('srcCell').textContent = line.srcCell || '';
  document.getElementById('itemCode').textContent = line.itemCode || '';
  document.getElementById('itemName').textContent = line.itemName || '';
  document.getElementById('allocQty').textContent = line.allocQty || 0;
  updateHeaderStats();
}

function enqueueSave(payload) {
  state.pendingSaves += 1;
  updateHeaderStats();

  state.actionQueue = state.actionQueue
    .then(() => apiRequest('saveLineAction', payload))
    .then(() => {
      state.pendingSaves = Math.max(0, state.pendingSaves - 1);
      updateHeaderStats();
    })
    .catch(err => {
      state.pendingSaves = Math.max(0, state.pendingSaves - 1);
      updateHeaderStats();
      toast('Có thao tác lưu lỗi: ' + err.message);
      console.error(err);
    });

  return state.actionQueue;
}

function fastMoveNext() {
  state.currentIndex += 1;
  if (state.currentIndex < state.currentLines.length) {
    renderCurrentLine();
    return false;
  }
  return true;
}

async function confirmLine() {
  const line = state.currentLines[state.currentIndex];
  if (!line) return;

  const payload = {
    rowNumber: line.rowNumber,
    actionType: 'CONFIRM',
    pickerName: state.pickerName
  };

  state.currentLines[state.currentIndex].result = 'OK';
  state.currentLines[state.currentIndex].missingQty = 0;
  state.currentLines[state.currentIndex].skipReason = '';

  const finished = fastMoveNext();
  enqueueSave(payload);

  if (finished) {
    await finishCurrentOrderFlow();
  }
}

async function skipLine() {
  const line = state.currentLines[state.currentIndex];
  if (!line) return;

  const missingQty = prompt('Nhập số lượng chưa lấy được:');
  if (missingQty === null) return;

  const qtyNum = Number(missingQty);
  if (Number.isNaN(qtyNum) || qtyNum < 0) {
    alert('Số lượng không hợp lệ.');
    return;
  }

  const reason = prompt('Lý do skip (ví dụ: thiếu hàng / hết hàng):', 'thiếu hàng') || '';

  const payload = {
    rowNumber: line.rowNumber,
    actionType: 'SKIP',
    missingQty: qtyNum,
    skipReason: reason,
    pickerName: state.pickerName
  };

  state.currentLines[state.currentIndex].result = 'SKIP';
  state.currentLines[state.currentIndex].missingQty = qtyNum;
  state.currentLines[state.currentIndex].skipReason = reason;

  const finished = fastMoveNext();
  enqueueSave(payload);

  if (finished) {
    await finishCurrentOrderFlow();
  }
}

async function finishCurrentOrderFlow() {
  const summary = buildSummary(state.currentLines);

  try {
    await state.actionQueue;
  } catch (_) {}

  try {
    const next = await apiRequest('getNextOrderAfter', { doNo: state.currentOrder.doNo }, 'GET');
    state.nextOrder = next.order || null;
  } catch (_) {
    state.nextOrder = null;
  }

  document.getElementById('summaryTitle').textContent = `DO ${state.currentOrder.doNo} đã hoàn thành`;
  document.getElementById('sumTotal').textContent = summary.total;
  document.getElementById('sumOk').textContent = summary.ok;
  document.getElementById('sumSkip').textContent = summary.skip;
  document.getElementById('sumMissing').textContent = summary.missing;
  showSection('summaryScreen');
  await loadOrders();
}

function buildSummary(lines) {
  let ok = 0, skip = 0, missing = 0;
  lines.forEach(line => {
    if (line.result === 'OK') ok += 1;
    if (line.result === 'SKIP') {
      skip += 1;
      missing += Number(line.missingQty || 0);
    }
  });
  return { total: lines.length, ok, skip, missing };
}

function getPickedHistory() {
  return state.currentLines
    .filter(line => line.result === 'OK' || line.result === 'SKIP')
    .map(line => ({
      itemCode: line.itemCode || '',
      itemName: line.itemName || '',
      srcCell: line.srcCell || '',
      allocQty: line.allocQty || 0,
      result: line.result || '',
      missingQty: Number(line.missingQty || 0),
      skipReason: line.skipReason || ''
    }));
}

function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  const list = document.getElementById('historyList');
  const subtitle = document.getElementById('historySubtitle');

  subtitle.textContent = state.currentOrder
    ? `DO ${state.currentOrder.doNo} - ${state.currentOrder.shiptoNm || ''}`
    : 'Chưa có đơn nào mở';

  const history = getPickedHistory();

  if (!history.length) {
    list.innerHTML = '<div class="empty-box">Chưa có mã hàng nào được pick trong đơn này.</div>';
  } else {
    list.innerHTML = history.map((item, index) => `
      <div class="history-item">
        <div class="history-top">
          <div>
            <div class="history-code">${index + 1}. ${escapeHtml(item.itemCode)}</div>
            <div class="history-name">${escapeHtml(item.itemName)}</div>
          </div>
          <span class="badge status-${item.result === 'OK' ? 'DA_PICK' : 'DANG_PICK'}">${item.result}</span>
        </div>
        <div class="history-meta">
          Vị trí: <b>${escapeHtml(item.srcCell)}</b><br>
          Số lượng cần lấy: <b>${item.allocQty}</b>
          ${item.result === 'SKIP' ? `<br>Thiếu: <b>${item.missingQty}</b>${item.skipReason ? `<br>Lý do: <b>${escapeHtml(item.skipReason)}</b>` : ''}` : ''}
        </div>
      </div>
    `).join('');
  }

  modal.classList.add('show');
}

function closeHistoryModal(event) {
  if (event && event.target && event.target.id !== 'historyModal') return;
  document.getElementById('historyModal').classList.remove('show');
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
    await state.actionQueue;
    await apiRequest('releaseOrder', {
      doNo: state.currentOrder.doNo,
      pickerName: state.pickerName
    });
    toast('Đã nhả đơn.');
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function encodeForAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

document.addEventListener('DOMContentLoaded', initSavedValues);
