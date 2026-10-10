const API_URL = "http://127.0.0.1:8000/api/orders";
const tbody = document.getElementById("dashboardTableBody");
const modal = document.getElementById("orderModal");
const wsStatus = document.getElementById("wsStatus");

let orders = [];
let isEditing = false;

async function loadOrders() {
  const res = await fetch(API_URL);
  orders = await res.json();
  renderTable();
}

function renderTable() {
  tbody.innerHTML = "";

  orders.forEach(order => {
    const tr = document.createElement("tr");
    tr.id = `row-${order.id}`;

    tr.innerHTML = `
      <td>#${order.id}</td>
      <td>${order.time}</td>
      <td><strong>${order.name}</strong></td>
      <td>${order.size}</td>
      <td>${order.price}</td>
      <td><span class="badge ${order.status}">${order.status}</span></td>
      <td style="text-align: center;">
        <button class="btn btn-edit" onclick="openEditModal(${order.id})">変更</button>
        <button class="btn btn-delete" onclick="deleteOrder(${order.id})">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 注文追加モーダルを開く
function openCreateModal() {
  isEditing = false;
  document.getElementById("modalTitle").textContent = "注文の新規追加";
  document.getElementById("editOrderId").value = "";
  document.getElementById("editItemName").value = "";
  document.getElementById("editItemSize").value = "S";
  document.getElementById("editItemPrice").value = "500円";
  document.getElementById("statusGroup").style.display = "none";
  modal.style.display = "flex";
}

// 注文変更モーダルを開く
function openEditModal(orderId) {
  isEditing = true;
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById("modalTitle").textContent = `注文 #${order.id} の変更`;
  document.getElementById("editOrderId").value = order.id;
  document.getElementById("editItemName").value = order.name;
  document.getElementById("editItemSize").value = order.size;
  document.getElementById("editItemPrice").value = order.price;
  document.getElementById("editItemStatus").value = order.status;
  document.getElementById("statusGroup").style.display = "block";
  modal.style.display = "flex";
}

function closeModal() {
  modal.style.display = "none";
}

// 保存ボタン（追加または更新を実行）
async function saveOrder() {
  const name = document.getElementById("editItemName").value.trim();
  const size = document.getElementById("editItemSize").value;
  const price = document.getElementById("editItemPrice").value.trim();

  if (!name || !price) {
    alert("すべての項目を入力してください。");
    return;
  }

  if (isEditing) {
    const orderId = document.getElementById("editOrderId").value;
    const status = document.getElementById("editItemStatus").value;

    await fetch(`${API_URL}/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size, price, status })
    });
  } else {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size, price })
    });
  }

  closeModal();
}

// 削除処理
async function deleteOrder(orderId) {
  if (!confirm(`注文 #${orderId} を削除しますか？`)) return;

  await fetch(`${API_URL}/${orderId}`, {
    method: "DELETE"
  });
}

// WebSocket リアルタイム同期
function connectWebSocket() {
  const socket = new WebSocket("ws://127.0.0.1:8000/ws");

  socket.onopen = () => {
    wsStatus.textContent = "リアルタイム同期中";
    wsStatus.style.backgroundColor = "#2e7d32";
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.event === "order_created") {
      orders.unshift(msg.order);
      renderTable();
    } else if (msg.event === "order_updated") {
      const idx = orders.findIndex(o => o.id === msg.order.id);
      if (idx !== -1) {
        orders[idx] = msg.order;
        renderTable();
      }
    } else if (msg.event === "order_deleted") {
      orders = orders.filter(o => o.id !== msg.order_id);
      renderTable();
    }
  };

  socket.onclose = () => {
    wsStatus.textContent = "切断中 (再接続...)";
    wsStatus.style.backgroundColor = "#c62828";
    setTimeout(connectWebSocket, 3000);
  };
}

loadOrders();
connectWebSocket();