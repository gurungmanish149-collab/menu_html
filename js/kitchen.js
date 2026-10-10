const orderList = document.getElementById("orderList");
const emptyMsg = document.getElementById("emptyMsg");
const orderCountElem = document.getElementById("orderCount");
const wsStatus = document.getElementById("wsStatus");

let orders = [];

function updateCounter() {
  const count = orders.filter(o => o.status === "pending").length;
  orderCountElem.textContent = `未対応: ${count}件`;
  emptyMsg.style.display = (count === 0) ? "block" : "none";
}

function renderOrders() {
  orderList.querySelectorAll(".order-card").forEach(el => el.remove());

  const pendingOrders = orders.filter(o => o.status === "pending");
  if (pendingOrders.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }
  emptyMsg.style.display = "none";

  pendingOrders.forEach(order => {
    const card = document.createElement("div");
    card.className = "order-card";
    card.id = `order-${order.id}`;

    card.innerHTML = `
      <div class="card-header">
        <span>注文 #${order.id}</span>
        <span>${order.time}</span>
      </div>
      <div class="item-name">${order.name}</div>
      <div class="item-size">サイズ: ${order.size}</div>
      <div class="item-price">金額: ${order.price}</div>
      <button class="btn-done" onclick="finishOrder(${order.id})">調理完了</button>
    `;
    orderList.appendChild(card);
  });
}

async function finishOrder(orderId) {
  try {
    await fetch(`http://127.0.0.1:8000/api/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" })
    });
  } catch (err) {
    console.error("完了処理エラー:", err);
  }
}

async function loadExistingOrders() {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/orders?status=pending");
    orders = await res.json();
    renderOrders();
    updateCounter();
  } catch (err) {
    console.error("初期データ取得失敗:", err);
  }
}

function connectWebSocket() {
  const socket = new WebSocket("ws://127.0.0.1:8000/ws");

  socket.onopen = () => {
    wsStatus.textContent = "リアルタイム接続中";
    wsStatus.style.backgroundColor = "#2e7d32";
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.event === "order_created") {
      orders.unshift(msg.order);
      renderOrders();
      updateCounter();
    } else if (msg.event === "order_updated") {
      const idx = orders.findIndex(o => o.id === msg.order.id);
      if (idx !== -1) {
        orders[idx] = msg.order;
      }
      renderOrders();
      updateCounter();
    } else if (msg.event === "order_deleted") {
      orders = orders.filter(o => o.id !== msg.order_id);
      renderOrders();
      updateCounter();
    }
  };

  socket.onclose = () => {
    wsStatus.textContent = "切断中 (再接続試行...)";
    wsStatus.style.backgroundColor = "#c62828";
    setTimeout(connectWebSocket, 3000);
  };
}

loadExistingOrders();
connectWebSocket();