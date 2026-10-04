// ==========================================
// 1. スライダー制御
// ==========================================
const slider = document.getElementById("slider");

function slideLeft() {
  slider.scrollBy({ left: -600, behavior: "smooth" });
}

function slideRight() {
  slider.scrollBy({ left: 600, behavior: "smooth" });
}

// ==========================================
// 2. メニューデータ & 注文ステップ処理
// ==========================================
const foodData = [
  {
    name: "寿司",
    prices: { S: "500円", M: "700円", L: "950円" },
    desc: "サーモン、マグロ、エビ、酢飯"
  },
  {
    name: "ラーメン",
    prices: { S: "600円", M: "800円", L: "1,000円" },
    desc: "麺、チャーシュー、煮玉子、醤油スープ"
  },
  {
    name: "餃子",
    prices: { S: "300円", M: "500円", L: "700円" },
    desc: "豚ひき肉、キャベツ、ニラ、ニンニク"
  },
  {
    name: "牛丼",
    prices: { S: "400円", M: "550円", L: "700円" },
    desc: "牛肉、玉ねぎ、特製タレ、ご飯"
  }
];

let currentIndex = 0;
const modal = document.getElementById("modalOverlay");
const stepDetail = document.getElementById("step-detail");
const stepConfirm = document.getElementById("step-confirm");
const stepThanks = document.getElementById("step-thanks");

function showStep(stepName) {
  stepDetail.style.display = (stepName === "detail") ? "block" : "none";
  stepConfirm.style.display = (stepName === "confirm") ? "block" : "none";
  stepThanks.style.display = (stepName === "thanks") ? "block" : "none";
}

function openModal(index) {
  currentIndex = index;
  document.querySelector('input[name="foodSize"][value="S"]').checked = true;
  updateModalContent();
  showStep("detail");
  modal.style.display = "flex";
}

function closeModal() {
  modal.style.display = "none";
}

function updatePriceBySize() {
  const selectedSize = document.querySelector('input[name="foodSize"]:checked').value;
  const currentItem = foodData[currentIndex];
  document.getElementById("modalPrice").textContent = `値段：${currentItem.prices[selectedSize]}`;
}

function updateModalContent() {
  const currentItem = foodData[currentIndex];
  document.getElementById("modalName").textContent = `商品名：${currentItem.name}`;
  document.getElementById("modalDesc").textContent = `材料：${currentItem.desc}`;
  updatePriceBySize();
}

function goToConfirmStep() {
  const currentItem = foodData[currentIndex];
  const selectedSize = document.querySelector('input[name="foodSize"]:checked').value;
  const price = currentItem.prices[selectedSize];

  document.getElementById("confirmItemName").textContent = `商品名：${currentItem.name}`;
  document.getElementById("confirmItemSize").textContent = `サイズ：${selectedSize}`;
  document.getElementById("confirmItemPrice").textContent = `合計金額：${price}`;

  showStep("confirm");
}

function backToDetailStep() {
  showStep("detail");
}

// ★★★ ここがFastAPI連携版の confirmOrder ★★★
async function confirmOrder() {
  const currentItem = foodData[currentIndex];
  const selectedSize = document.querySelector('input[name="foodSize"]:checked').value;
  const price = currentItem.prices[selectedSize];

  const orderPayload = {
    name: currentItem.name,
    size: selectedSize,
    price: price
  };

  try {
    const response = await fetch("http://127.0.0.1:8000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderPayload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("注文送信成功:", result);

    showStep("thanks");

  } catch (error) {
    console.error("注文送信エラー:", error);
    alert("注文の送信に失敗しました。サーバーが起動しているか確認してください。");
  }
}

window.onclick = function(event) {
  if (event.target === modal) {
    closeModal();
  }
};