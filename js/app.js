/* =========================================
   MAIN APPLICATION LOGIC (BUG FIX & UPDATE)
   ========================================= */
import { auth, db } from "./auth.js";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

// --- KONFIGURASI CONSTANT ---
const platforms = ["BRI", "BCA", "Flazz", "Wallet"];
const catExpense = [
  "Food & Drink",
  "Transportation",
  "Gasoline",
  "Shopping",
  "Bills",
  "Health",
  "Reimbursement",
  "Rent",
  "Entertainment",
];
const catIncome = ["Salary", "Freelance", "Refund", "Bonus", "Investment"];

// --- STATE MANAGEMENT ---
let transactions = [];
let transfers = [];
let shoppingItems = [];
let expenseChartInstance = null; // Variabel global untuk menyimpan instance chart
let incomeChartInstance = null; // <--- VAR GLOBAL BARU

// --- SELECTORS ---
const globalYear = document.getElementById("globalYear");
const globalMonth = document.getElementById("globalMonth");
const logoutBtn = document.getElementById("logoutBtn");

// --- HELPER FUNCTIONS ---
const formatRupiah = (number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(number);
};

const getWeekNumber = (dateObj) => {
  const date = dateObj.getDate();
  return Math.ceil(date / 7);
};

// --- INISIALISASI ---
document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  globalYear.value = now.getFullYear();
  globalMonth.value = now.getMonth();

  setupNavigation();
  setupForms();
  loadData(); // Memulai Realtime Listener
});

logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => (window.location.href = "login.html"));
});

// Trigger refresh saat filter berubah
globalYear.addEventListener("change", refreshDashboard);
globalMonth.addEventListener("change", refreshDashboard);

/* =========================================
   1. NAVIGATION & UI SETUP
   ========================================= */
function setupNavigation() {
  const menuItems = document.querySelectorAll(".menu-item");
  const sections = document.querySelectorAll(".content-section");

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      menuItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      const targetId = item.getAttribute("data-target");
      sections.forEach((sec) => sec.classList.add("hidden"));
      document.getElementById(targetId).classList.remove("hidden");
    });
  });

  // Setup Category Dropdown Dinamis di Form Transaksi
  const transType = document.getElementById("transType");
  const transCategory = document.getElementById("transCategory");

  const populateCats = () => {
    transCategory.innerHTML = "";
    const type = transType.value;
    const list = type === "expense" ? catExpense : catIncome;
    list.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      transCategory.appendChild(opt);
    });
  };
  transType.addEventListener("change", populateCats);
  populateCats();
}

/* =========================================
   2. DATA LOADING (REALTIME FIRESTORE)
   ========================================= */
function loadData() {
  // Load Transactions
  onSnapshot(query(collection(db, "transactions")), (snapshot) => {
    transactions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    refreshDashboard();
  });

  // Load Transfers
  onSnapshot(query(collection(db, "transfers")), (snapshot) => {
    transfers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    refreshDashboard();
  });

  // Load Shopping
  onSnapshot(query(collection(db, "shopping")), (snapshot) => {
    shoppingItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    refreshShopping();
  });
}

/* =========================================
   3. CORE LOGIC (DASHBOARD & CALCULATION)
   ========================================= */
function refreshDashboard() {
  const selectedYear = parseInt(globalYear.value);
  const selectedMonth = parseInt(globalMonth.value);

  // Tentukan Batas Waktu untuk Filter
  // Akhir bulan terpilih (untuk logika Cumulative Balance)
  const endOfSelectedMonth = new Date(
    selectedYear,
    selectedMonth + 1,
    0,
    23,
    59,
    59
  );

  // --- DATASET 1: STRICT MONTHLY (Hanya transaksi di bulan & tahun terpilih) ---
  // Digunakan untuk: Kartu Income, Kartu Expense, Chart, Analysis
  const strictTrans = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
  });

  const strictTransfers = transfers.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
  });

  // --- DATASET 2: CUMULATIVE (Semua transaksi S.D. akhir bulan terpilih) ---
  // Digunakan untuk: Kartu Total Balance (Carry Over)
  const cumulativeTrans = transactions.filter((t) => {
    const d = new Date(t.date);
    return d <= endOfSelectedMonth;
  });

  // --- DATASET 3: ALL TIME (Semua transaksi) ---
  // Digunakan untuk: Realtime Wallet Balance List & Shopping Projection Base
  const allTimeTrans = transactions;

  // ================== PERHITUNGAN ==================

  // A. Monthly Income & Expense (STRICT)
  let monthlyInc = 0;
  let monthlyExp = 0;
  strictTrans.forEach((t) => {
    if (t.type === "income") monthlyInc += parseFloat(t.amount);
    if (t.type === "expense") monthlyExp += parseFloat(t.amount);
  });

  // B. Total Balance (CUMULATIVE / CARRY OVER)
  // Rumus: (Total Income s.d. bulan ini) - (Total Expense s.d. bulan ini)
  let cumulativeInc = 0;
  let cumulativeExp = 0;
  cumulativeTrans.forEach((t) => {
    if (t.type === "income") cumulativeInc += parseFloat(t.amount);
    if (t.type === "expense") cumulativeExp += parseFloat(t.amount);
  });
  const balanceAsOfSelectedMonth = cumulativeInc - cumulativeExp;

  // C. Realtime Wallet Balance (ALL TIME)
  // Menghitung uang fisik yang ada di dompet/bank saat ini juga
  let currentWalletBalance = 0;
  let platformBalances = {};
  platforms.forEach((p) => (platformBalances[p] = 0));

  // Hitung Transaksi
  allTimeTrans.forEach((t) => {
    const val = parseFloat(t.amount);
    if (t.type === "income") {
      platformBalances[t.platform] += val;
      currentWalletBalance += val;
    } else {
      platformBalances[t.platform] -= val;
      currentWalletBalance -= val;
    }
  });

  // Hitung Transfer
  transfers.forEach((tf) => {
    // Transfer all time
    const val = parseFloat(tf.amount);
    if (platformBalances[tf.source] !== undefined)
      platformBalances[tf.source] -= val;
    if (platformBalances[tf.target] !== undefined)
      platformBalances[tf.target] += val;
  });

  // ================== UPDATE UI ==================

  // 1. Update Cards
  document.getElementById("monthlyIncome").textContent =
    formatRupiah(monthlyInc);
  document.getElementById("monthlyExpense").textContent =
    formatRupiah(monthlyExp);
  document.getElementById("totalBalance").textContent = formatRupiah(
    balanceAsOfSelectedMonth
  );

  // 2. Update Platform List
  const pList = document.getElementById("platformList");
  pList.innerHTML = "";
  for (const [key, val] of Object.entries(platformBalances)) {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.padding = "12px 0";
    div.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    div.innerHTML = `<span>${key}</span> <span style="font-weight:600;">${formatRupiah(
      val
    )}</span>`;
    pList.appendChild(div);
  }

  // 3. Render Tables & Charts (Gunakan Strict Data)
  renderTransactionTable(strictTrans);
  renderTransferTable(strictTransfers);
  updateBarChart(strictTrans);
  updateIncomeChart(strictTrans);
  renderAnalysis(strictTrans);

  // 4. Update Shopping Projection (Butuh Current Wallet Balance)
  renderShoppingAnalysis(currentWalletBalance);
}

// Fungsi Render Income Chart (Bar Chart Hijau)
function updateIncomeChart(data) {
  const ctx = document.getElementById("incomeChart").getContext("2d");

  // 1. FILTER: Hanya Income
  const incomes = data.filter((t) => t.type === "income");

  // 2. GROUPING
  const grouped = {};
  incomes.forEach((t) => {
    grouped[t.category] = (grouped[t.category] || 0) + parseFloat(t.amount);
  });

  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  // 3. DESTROY OLD INSTANCE (PENTING: Cegah Memory Leak/Glitch)
  if (incomeChartInstance) {
    incomeChartInstance.destroy();
  }

  // 4. CREATE NEW CHART
  incomeChartInstance = new Chart(ctx, {
    type: "bar", // Menggunakan Bar agar konsisten dengan Expense
    data: {
      labels: labels,
      datasets: [
        {
          label: "Total Income",
          data: values,
          // Warna Hijau (Emerald-500) untuk membedakan dengan Expense (Biru)
          backgroundColor: "#10b981",
          hoverBackgroundColor: "#34d399",
          borderRadius: 4,
          barThickness: 25,
          maxBarThickness: 35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // PENTING: Ikut tinggi container CSS
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              return new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
              }).format(context.raw);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#94a3b8", font: { size: 10 } },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", font: { size: 10 } },
        },
      },
    },
  });
}

/* =========================================
   4. RENDER FUNCTIONS
   ========================================= */
function renderTransactionTable(data) {
  const tbody = document.querySelector("#transactionTable tbody");
  tbody.innerHTML = "";
  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  data.forEach((t) => {
    const row = document.createElement("tr");
    const colorClass = t.type === "income" ? "text-success" : "text-danger";
    const sign = t.type === "income" ? "+" : "-";

    row.innerHTML = `
            <td>${t.date}</td>
            <td><span class="${colorClass}" style="text-transform:capitalize; font-weight:600;">${
      t.type
    }</span></td>
            <td>
                <div>${t.category}</div>
                <div style="font-size:0.75rem; color:#94a3b8;">${
                  t.platform
                }</div>
            </td>
            <td class="${colorClass}" style="font-weight:600;">${sign} ${formatRupiah(
      t.amount
    )}</td>
            <td style="text-align: right;">
                <button class="action-btn edit" onclick="window.editTransaction('${
                  t.id
                }')"><i class="fas fa-pen"></i></button>
                <button class="action-btn del" onclick="window.deleteTransaction('${
                  t.id
                }')"><i class="fas fa-trash"></i></button>
            </td>
        `;
    tbody.appendChild(row);
  });
}

function renderTransferTable(data) {
  const tbody = document.querySelector("#transferTable tbody");
  tbody.innerHTML = "";
  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  data.forEach((t) => {
    const row = document.createElement("tr");
    row.innerHTML = `
            <td>${t.date}</td>
            <td>${
              t.source
            } <span style="color:var(--text-muted); margin:0 5px;">&rarr;</span> ${
      t.target
    }</td>
            <td style="font-weight:600;">${formatRupiah(t.amount)}</td>
            <td style="text-align: right;">
                <button class="action-btn edit" onclick="window.editTransfer('${
                  t.id
                }')"><i class="fas fa-pen"></i></button>
                <button class="action-btn del" onclick="window.deleteTransfer('${
                  t.id
                }')"><i class="fas fa-trash"></i></button>
            </td>
        `;
    tbody.appendChild(row);
  });
}

// BUG FIX 2: Mencegah Chart Memanjang (Stretching)
function updateBarChart(data) {
  const ctx = document.getElementById("expenseChart").getContext("2d");

  // Filter hanya Expense untuk Chart ini (sesuai judul Spending)
  const expenses = data.filter((t) => t.type === "expense");

  const grouped = {};
  expenses.forEach((t) => {
    grouped[t.category] = (grouped[t.category] || 0) + parseFloat(t.amount);
  });

  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  // PENTING: Hancurkan instance lama sebelum buat baru
  if (expenseChartInstance) {
    expenseChartInstance.destroy();
  }

  expenseChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Expense",
          data: values,
          backgroundColor: "#3b82f6",
          borderRadius: 4,
          barThickness: 20,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // Penting agar mengikuti height container HTML
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#94a3b8" },
        },
        x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
      },
    },
  });
}

/* =========================================
   5. ANALYSIS LOGIC (UPDATED)
   ========================================= */
function renderAnalysis(data) {
  // A. TAB CATEGORY: Income & Expense (Mixed)
  const catDaily = {};
  const catWeekly = {};

  data.forEach((t) => {
    // UPDATE 3: Tidak ada filter type, semua masuk (Income & Expense)
    const dObj = new Date(t.date);
    const dateStr = t.date;
    const weekStr = `Week ${getWeekNumber(dObj)}`;

    // Tanda (+) untuk Income, (-) untuk Expense agar user paham di list
    const sign = t.type === "income" ? "(+)" : "(-)";

    const dailyKey = `${t.category} ${sign} - ${dateStr}`;
    catDaily[dailyKey] = (catDaily[dailyKey] || 0) + t.amount;

    const weeklyKey = `${t.category} ${sign} - ${weekStr}`;
    catWeekly[weeklyKey] = (catWeekly[weeklyKey] || 0) + t.amount;
  });

  const renderList = (obj, containerId) => {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        const isIncome = key.includes("(+)");
        const color = isIncome ? "var(--success)" : "var(--text-main)";

        const div = document.createElement("div");
        div.innerHTML = `<span style="color: var(--text-muted)">${key}</span> <span style="color: ${color}; font-weight:600;">${formatRupiah(
          obj[key]
        )}</span>`;
        container.appendChild(div);
      });
    if (Object.keys(obj).length === 0)
      container.innerHTML = "<div class='text-muted'>No Data</div>";
  };

  renderList(catDaily, "catDailyList");
  renderList(catWeekly, "catWeeklyList");

  // B. TAB SUMMARY: No Net Column
  const sumDaily = {};
  const sumWeekly = {};

  data.forEach((t) => {
    const dObj = new Date(t.date);
    const dateStr = t.date;
    const weekStr = `Week ${getWeekNumber(dObj)}`;

    if (!sumDaily[dateStr]) sumDaily[dateStr] = { inc: 0, exp: 0 };
    if (!sumWeekly[weekStr]) sumWeekly[weekStr] = { inc: 0, exp: 0 };

    if (t.type === "income") {
      sumDaily[dateStr].inc += t.amount;
      sumWeekly[weekStr].inc += t.amount;
    } else {
      sumDaily[dateStr].exp += t.amount;
      sumWeekly[weekStr].exp += t.amount;
    }
  });

  const renderSummaryTable = (obj, tableId) => {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = "";
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        const row = obj[key];
        const tr = document.createElement("tr");
        // UPDATE 4: Hapus kolom Net
        tr.innerHTML = `
                <td>${key}</td>
                <td class="text-success">${formatRupiah(row.inc)}</td>
                <td class="text-danger">${formatRupiah(row.exp)}</td>
            `;
        tbody.appendChild(tr);
      });
  };

  renderSummaryTable(sumDaily, "summaryDailyTable");
  renderSummaryTable(sumWeekly, "summaryWeeklyTable");
}

/* =========================================
   6. SHOPPING & PROJECTIONS
   ========================================= */
function refreshShopping() {
  const tbody = document.querySelector("#shoppingTable tbody");
  tbody.innerHTML = "";

  shoppingItems.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
            <td><input type="checkbox" ${
              item.isChecked ? "checked" : ""
            } onchange="window.toggleShopCheck('${
      item.id
    }', this.checked)"></td>
            <td style="${
              item.isChecked ? "text-decoration:line-through; color:grey;" : ""
            }">${item.itemName}</td>
            <td>${formatRupiah(item.priceEstimate)}</td>
            <td>
                <input type="number" value="${
                  item.priceReal || ""
                }" class="form-control" 
                style="width: 100px; padding: 5px; font-size: 0.8rem;"
                onchange="window.updateShopReal('${
                  item.id
                }', this.value)" placeholder="0">
            </td>
            <td>
                <button class="action-btn del" onclick="window.deleteShop('${
                  item.id
                }')"><i class="fas fa-trash"></i></button>
            </td>
        `;
    tbody.appendChild(row);
  });

  // Trigger refreshDashboard untuk update proyeksi (karena butuh data wallet terbaru)
  refreshDashboard();
}

function renderShoppingAnalysis(currentWalletBalance) {
  let totalEst = 0; // Total estimasi item yang BELUM dibeli (unchecked)
  let totalReal = 0; // Total real item yang SUDAH dibeli (checked)
  let totalEstAll = 0; // Untuk display kartu total estimasi

  shoppingItems.forEach((item) => {
    totalEstAll += parseFloat(item.priceEstimate);
    if (item.isChecked) {
      totalReal += parseFloat(item.priceReal || 0);
    } else {
      // Item belum dibeli, masukkan ke perhitungan proyeksi pengeluaran
      totalEst += parseFloat(item.priceEstimate);
    }
  });

  // UPDATE 5: Projected Balance = Uang Saat Ini - Estimasi Barang yg Belum Dibeli
  const projectedBalance = currentWalletBalance - totalEst;

  document.getElementById("anShopEst").textContent = formatRupiah(totalEstAll);
  document.getElementById("anShopReal").textContent = formatRupiah(totalReal);

  // Update UI Proyeksi
  document.getElementById("anShopWallet").textContent =
    formatRupiah(currentWalletBalance);
  document.getElementById("anShopProjected").textContent =
    formatRupiah(projectedBalance);

  // Update styling indikator
  const projElem = document.getElementById("anShopProjected");
  if (projectedBalance < 0) {
    projElem.style.color = "var(--danger)";
  } else {
    projElem.style.color = "var(--success)";
  }
}

/* =========================================
   7. FORM & ACTIONS
   ========================================= */
function setupForms() {
  // Transaction
  const transForm = document.getElementById("transactionForm");
  transForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("transId").value;
    const data = {
      date: document.getElementById("transDate").value,
      type: document.getElementById("transType").value,
      platform: document.getElementById("transPlatform").value,
      category: document.getElementById("transCategory").value,
      amount: parseFloat(document.getElementById("transAmount").value),
      userId: auth.currentUser.uid,
    };

    try {
      if (id) {
        await updateDoc(doc(db, "transactions", id), data);
        document.getElementById("btnSaveTrans").textContent =
          "Save Transaction";
        document.getElementById("transId").value = "";
      } else {
        await addDoc(collection(db, "transactions"), {
          ...data,
          createdAt: new Date(),
        });
      }
      transForm.reset();
    } catch (err) {
      console.error(err);
      alert("Failed to save");
    }
  });

  // Transfer
  const tfForm = document.getElementById("transferForm");
  tfForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("transferId").value;
    const data = {
      date: document.getElementById("tfDate").value,
      source: document.getElementById("tfSource").value,
      target: document.getElementById("tfTarget").value,
      amount: parseFloat(document.getElementById("tfAmount").value),
      userId: auth.currentUser.uid,
    };

    if (data.source === data.target) return alert("Source & Target same!");

    try {
      if (id) {
        await updateDoc(doc(db, "transfers", id), data);
        document.getElementById("btnSaveTransfer").textContent =
          "Execute Transfer";
        document.getElementById("transferId").value = "";
      } else {
        await addDoc(collection(db, "transfers"), {
          ...data,
          createdAt: new Date(),
        });
      }
      tfForm.reset();
    } catch (err) {
      console.error(err);
    }
  });

  // Shopping
  document
    .getElementById("shoppingForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await addDoc(collection(db, "shopping"), {
          date: document.getElementById("shopDate").value,
          itemName: document.getElementById("shopItem").value,
          priceEstimate: parseFloat(
            document.getElementById("shopEstimate").value
          ),
          priceReal: 0,
          isChecked: false,
          userId: auth.currentUser.uid,
        });
        document.getElementById("shoppingForm").reset();
      } catch (err) {
        console.error(err);
      }
    });
}

// Global Window Functions
window.editTransaction = (id) => {
  const item = transactions.find((t) => t.id === id);
  if (item) {
    document.getElementById("transId").value = item.id;
    document.getElementById("transDate").value = item.date;
    document.getElementById("transType").value = item.type;
    document.getElementById("transType").dispatchEvent(new Event("change"));
    setTimeout(() => {
      document.getElementById("transCategory").value = item.category;
    }, 50);
    document.getElementById("transPlatform").value = item.platform;
    document.getElementById("transAmount").value = item.amount;
    document.getElementById("btnSaveTrans").textContent = "Update Transaction";
    document
      .getElementById("transactions")
      .scrollIntoView({ behavior: "smooth" });
  }
};

window.editTransfer = (id) => {
  const item = transfers.find((t) => t.id === id);
  if (item) {
    document.getElementById("transferId").value = item.id;
    document.getElementById("tfDate").value = item.date;
    document.getElementById("tfAmount").value = item.amount;
    document.getElementById("tfSource").value = item.source;
    document.getElementById("tfTarget").value = item.target;
    document.getElementById("btnSaveTransfer").textContent = "Update Transfer";
    document.getElementById("transfer").scrollIntoView({ behavior: "smooth" });
  }
};

window.deleteTransaction = async (id) => {
  if (confirm("Delete?")) await deleteDoc(doc(db, "transactions", id));
};
window.deleteTransfer = async (id) => {
  if (confirm("Delete?")) await deleteDoc(doc(db, "transfers", id));
};
window.deleteShop = async (id) => {
  if (confirm("Delete?")) await deleteDoc(doc(db, "shopping", id));
};
window.toggleShopCheck = async (id, val) => {
  await updateDoc(doc(db, "shopping", id), { isChecked: val });
};
window.updateShopReal = async (id, val) => {
  await updateDoc(doc(db, "shopping", id), { priceReal: parseFloat(val) });
};
