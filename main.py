from datetime import datetime
import json
import sqlite3
from typing import List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_NAME = "restaurant.db"


def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT NOT NULL,
            size TEXT NOT NULL,
            price TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending'
        )
    """
    )
    conn.commit()
    conn.close()


init_db()


# --- WebSocket Manager ---
class ConnectionManager:

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass


manager = ConnectionManager()


# --- Models ---
class OrderCreate(BaseModel):
    name: str
    size: str
    price: str


class OrderUpdate(BaseModel):
    name: Optional[str] = None
    size: Optional[str] = None
    price: Optional[str] = None
    status: Optional[str] = None


# --- WebSocket Route ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# --- API Routes ---


# 1. 一覧取得 (All orders for Dashboard & Pending for Kitchen)
@app.get("/api/orders")
def get_orders(status: Optional[str] = None):
    conn = get_db()
    cursor = conn.cursor()
    if status:
        cursor.execute(
            "SELECT * FROM orders WHERE status = ? ORDER BY id DESC", (status,)
        )
    else:
        cursor.execute("SELECT * FROM orders ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "id": r["id"],
            "name": r["item_name"],
            "size": r["size"],
            "price": r["price"],
            "time": r["created_at"],
            "status": r["status"],
        }
        for r in rows
    ]


# 2. 注文追加 (Customer or Manager)
@app.post("/api/orders")
async def create_order(order: OrderCreate):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().strftime("%H:%M:%S")

    cursor.execute(
        "INSERT INTO orders (item_name, size, price, created_at, status) VALUES (?, ?, ?, ?, 'pending')",
        (order.name, order.size, order.price, now),
    )
    conn.commit()
    order_id = cursor.lastrowid
    conn.close()

    new_order = {
        "id": order_id,
        "name": order.name,
        "size": order.size,
        "price": order.price,
        "time": now,
        "status": "pending",
    }

    # Broadcast to Kitchen & Dashboard
    await manager.broadcast({"event": "order_created", "order": new_order})
    return {"message": "Success", "order": new_order}


# 3. 注文変更 (Dashboard: 変更 / Kitchen: 完了)
@app.put("/api/orders/{order_id}")
async def update_order(order_id: int, update: OrderUpdate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    existing = cursor.fetchone()

    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found")

    new_name = update.name if update.name is not None else existing["item_name"]
    new_size = update.size if update.size is not None else existing["size"]
    new_price = update.price if update.price is not None else existing["price"]
    new_status = (
        update.status if update.status is not None else existing["status"]
    )

    cursor.execute(
        """
        UPDATE orders 
        SET item_name = ?, size = ?, price = ?, status = ? 
        WHERE id = ?
    """,
        (new_name, new_size, new_price, new_status, order_id),
    )
    conn.commit()
    conn.close()

    updated_order = {
        "id": order_id,
        "name": new_name,
        "size": new_size,
        "price": new_price,
        "time": existing["created_at"],
        "status": new_status,
    }

    await manager.broadcast({"event": "order_updated", "order": updated_order})
    return {"message": "Updated", "order": updated_order}


# 4. 注文削除 (Dashboard: 削除)
@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    conn.commit()
    conn.close()

    await manager.broadcast({"event": "order_deleted", "order_id": order_id})
    return {"message": "Deleted"}