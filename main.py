from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from typing import List
import sqlite3
import json

app = FastAPI()

# CORS設定（ブラウザからの通信を許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# データベース初期化
def init_db():
    conn = sqlite3.connect("restaurant.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT NOT NULL,
            size TEXT NOT NULL,
            price TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending'
        )
    """)
    conn.commit()
    conn.close()

init_db()

# --- WebSocket 接続マネージャー ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        # 接続しているすべてのキッチン画面へメッセージを一斉送信
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# リクエストボディ形式
class OrderCreate(BaseModel):
    name: str
    size: str
    price: str

# 1. 客側からの注文受付 (POST)
@app.post("/api/orders")
async def create_order(order: OrderCreate):
    conn = sqlite3.connect("restaurant.db")
    cursor = conn.cursor()
    now = datetime.now().strftime("%H:%M:%S")
    
    cursor.execute(
        "INSERT INTO orders (item_name, size, price, created_at) VALUES (?, ?, ?, ?)",
        (order.name, order.size, order.price, now)
    )
    conn.commit()
    order_id = cursor.lastrowid
    conn.close()

    new_order_data = {
        "id": order_id,
        "name": order.name,
        "size": order.size,
        "price": order.price,
        "time": now
    }

    # ★ 注文が入った瞬間、キッチン画面全員へリアルタイム配信！
    await manager.broadcast(json.dumps(new_order_data))

    return {"message": "Success", "order": new_order_data}

# 2. 未対応注文一覧の取得 (GET)
@app.get("/api/orders")
def get_orders():
    conn = sqlite3.connect("restaurant.db")
    cursor = conn.cursor()
    cursor.execute("SELECT id, item_name, size, price, created_at FROM orders WHERE status = 'pending' ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {"id": row[0], "name": row[1], "size": row[2], "price": row[3], "time": row[4]}
        for row in rows
    ]

# 3. 調理完了ステータス更新 (POST)
@app.post("/api/orders/{order_id}/complete")
def complete_order(order_id: int):
    conn = sqlite3.connect("restaurant.db")
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET status = 'completed' WHERE id = ?", (order_id,))
    conn.commit()
    conn.close()
    return {"message": f"Order {order_id} marked as completed"}

# 4. キッチン画面用 WebSocket エンドポイント
@app.websocket("/ws/kitchen")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # 接続を維持する
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)