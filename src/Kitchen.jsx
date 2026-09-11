import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, writeBatch, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const MENU_ITEMS = [
  { id: "1", name: "Samosa", category: "Starters" }, { id: "2", name: "Onion Pakora", category: "Starters" },
  { id: "3", name: "Paneer Tikka", category: "Starters" }, { id: "4", name: "Chicken Tikka", category: "Starters" },
  { id: "5", name: "Roasted Papad", category: "Starters" }, { id: "6", name: "Butter Naan", category: "Breads" },
  { id: "7", name: "Tandoori Roti", category: "Breads" }, { id: "8", name: "Aloo Paratha", category: "Breads" },
  { id: "9", name: "Jeera Rice", category: "Rice Dishes" }, { id: "10", name: "Chicken Biryani", category: "Rice Dishes" },
  { id: "11", name: "Veg Pulao", category: "Rice Dishes" }, { id: "12", name: "Paneer Butter Masala", category: "Main Course" },
  { id: "13", name: "Dal Tadka", category: "Main Course" }, { id: "14", name: "Aloo Gobi", category: "Main Course" },
  { id: "15", name: "Chicken Curry", category: "Main Course" }, { id: "16", name: "Mutton Rogan Josh", category: "Main Course" },
  { id: "19", name: "Gulab Jamun", category: "Desserts" }, { id: "20", name: "Rasmalai", category: "Desserts" },
  { id: "21", name: "Rice Kheer", category: "Desserts" }, { id: "22", name: "Sweet Lassi", category: "Beverages" },
  { id: "23", name: "Filter Coffee", category: "Beverages" }, { id: "24", name: "Masala Chai", category: "Beverages" },
  { id: "25", name: "Fresh Lime Soda", category: "Beverages" }
];

const COLORS = { background: "#F9FAFB", primaryText: "#111827", secondaryText: "#6B7280", accent: "#E63946", success: "#10B981", white: "#FFFFFF", ticketBg: "#FFFFFF" };
const TOTAL_TABLES = [1, 2, 3, 4, 5, 6]; 

export default function Kitchen() {
  const [activeTab, setActiveTab] = useState("ops");
  const [activeOrders, setActiveOrders] = useState([]);
  const [unpaidOrders, setUnpaidOrders] = useState([]); 
  const [alerts, setAlerts] = useState([]);
  const [occupiedTables, setOccupiedTables] = useState([]);
  const [outOfStock, setOutOfStock] = useState([]);
  const [activeTables, setActiveTables] = useState({}); // Tracks if a table is unlocked

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/Digi-QR-Menu/?portal=admin";
  };
  
  useEffect(() => {
    const qOrders = query(collection(db, "orders"), where("restaurant_id", "==", "mysuru_cafe"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const active = [];
      const unpaid = [];
      const activeTableSet = new Set();
      const todayString = new Date().toDateString();

      snapshot.forEach((document) => {
        const data = document.data();
        const orderDateObj = data.created_at ? data.created_at.toDate() : new Date();
        
        if (data.status === "pending" || data.status === "preparing") {
          active.push({ id: document.id, ...data });
        }
        if (data.status !== "paid" && data.status !== "rejected" && orderDateObj.toDateString() === todayString) {
          unpaid.push({ id: document.id, ...data });
          activeTableSet.add(data.table_number);
        }
      });
      
      active.sort((a, b) => (a.created_at?.toMillis() || 0) - (b.created_at?.toMillis() || 0));
      setActiveOrders(active);
      setUnpaidOrders(unpaid);
      setOccupiedTables(Array.from(activeTableSet));
    });

    const qAlerts = query(collection(db, "alerts"), where("restaurant_id", "==", "mysuru_cafe"), where("status", "==", "active"));
    const unsubAlerts = onSnapshot(qAlerts, (snapshot) => {
      const activeAlerts = [];
      snapshot.forEach((doc) => activeAlerts.push({ id: doc.id, ...doc.data() }));
      setAlerts(activeAlerts);
    });

    const unsubMenu = onSnapshot(doc(db, "settings", "mysuru_cafe"), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().outOfStock)) {
        setOutOfStock(docSnap.data().outOfStock);
      } else {
        setOutOfStock([]); 
      }
    });

    // 🚨 NEW: Listens to the table lock statuses
    const unsubTables = onSnapshot(collection(db, "tables"), (snapshot) => {
      const tablesMap = {};
      snapshot.forEach(doc => {
        tablesMap[doc.id] = doc.data().is_active;
      });
      setActiveTables(tablesMap);
    });

    return () => { unsubOrders(); unsubAlerts(); unsubMenu(); unsubTables(); };
  }, []);

  const toggleAvailability = async (itemId) => {
    try {
      const isCurrentlyOut = outOfStock.includes(itemId);
      const docRef = doc(db, "settings", "mysuru_cafe");
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, { outOfStock: [itemId] });
      } else {
        await setDoc(docRef, { outOfStock: isCurrentlyOut ? arrayRemove(itemId) : arrayUnion(itemId) }, { merge: true });
      }
    } catch (error) {
      alert("Failed to update inventory!");
    }
  };

  // 🚨 NEW: Functions to manually open or close a table
  const openTable = async (tableNum) => {
    await setDoc(doc(db, "tables", tableNum.toString()), { is_active: true });
  };

  const lockTable = async (tableNum) => {
    await setDoc(doc(db, "tables", tableNum.toString()), { is_active: false });
  };

  const settleBill = async (tableNumber) => {
    const batch = writeBatch(db);
    
    unpaidOrders.forEach((order) => {
      if (order.table_number === tableNumber) {
        batch.update(doc(db, "orders", order.id), { status: "paid" });
      }
    });

    alerts.forEach((alert) => {
      if (alert.table_number === tableNumber && alert.type === "bill") {
        batch.update(doc(db, "alerts", alert.id), { status: "resolved" });
      }
    });

    // 🚨 NEW: Automatically lock the table after it is settled!
    batch.set(doc(db, "tables", tableNumber.toString()), { is_active: false });

    await batch.commit(); 
  };

  const printBill = (tableNum) => {
    const tableOrders = unpaidOrders.filter(order => order.table_number === tableNum);
    if (tableOrders.length === 0) return alert("No active orders for this table.");
    
    let itemsList = [];
    let grandTotal = 0;

    tableOrders.forEach(order => {
      order.items.forEach(item => {
        const existing = itemsList.find(i => i.name === item.name);
        if (existing) {
          existing.qty += item.qty;
          existing.total += (item.price * item.qty);
        } else {
          itemsList.push({ name: item.name, qty: item.qty, price: item.price, total: (item.price * item.qty) });
        }
        grandTotal += (item.price * item.qty);
      });
    });

    const receiptWindow = window.open('', '_blank', 'width=400,height=600');
    receiptWindow.document.write(`
      <html>
        <head>
          <title>Bill - Table ${tableNum}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; padding: 10px; color: #000; }
            h2 { text-align: center; margin: 0 0 5px 0; font-size: 22px; }
            .text-center { text-align: center; font-size: 14px; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 4px 0; font-size: 14px; }
            .right { text-align: right; }
            .total-row { font-size: 18px; font-weight: bold; margin-top: 10px; display: flex; justify-content: space-between; }
            @media print {
              body { width: 100%; margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <h2>MYSURU CAFE</h2>
          <div class="text-center">Table ${tableNum}</div>
          <div class="text-center">${new Date().toLocaleString('en-IN')}</div>
          <div class="divider"></div>
          <table>
            <tr><th>Item</th><th class="right">Qty</th><th class="right">Total</th></tr>
            ${itemsList.map(item => `
              <tr>
                <td>${item.name}</td>
                <td class="right">${item.qty}</td>
                <td class="right">Rs.${item.total}</td>
              </tr>
            `).join('')}
          </table>
          <div class="divider"></div>
          <div class="total-row">
            <span>GRAND TOTAL</span>
            <span>Rs.${grandTotal}</span>
          </div>
          <div class="divider"></div>
          <div class="text-center" style="margin-top: 15px;">Thank you for dining with us!</div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    receiptWindow.document.close();
  };

  const acceptNewItems = async (pendingIds) => {
    const batch = writeBatch(db);
    pendingIds.forEach((id) => batch.update(doc(db, "orders", id), { status: "preparing" }));
    await batch.commit();
  };

  const rejectNewItems = async (pendingIds) => {
    const confirmReject = window.confirm("Are you sure you want to REJECT this new order?");
    if (confirmReject) {
      const batch = writeBatch(db);
      pendingIds.forEach((id) => batch.update(doc(db, "orders", id), { status: "rejected" }));
      await batch.commit();
    }
  };

  const markTableServed = async (allIds) => {
    const batch = writeBatch(db);
    allIds.forEach((id) => batch.update(doc(db, "orders", id), { status: "completed" }));
    await batch.commit();
  };

  const markWaiterResolved = async (alertId) => {
    const batch = writeBatch(db);
    batch.update(doc(db, "alerts", alertId), { status: "resolved" });
    await batch.commit();
  };

  // 🚨 UPDATED: Now shows 4 states (Dining, Needs Waiter, Unlocked, Locked)
  const getTableStatus = (tableNum) => {
    if (alerts.find(a => a.table_number === tableNum && a.type === "waiter")) return { text: "Needs Waiter", bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" };
    if (occupiedTables.includes(tableNum)) return { text: "Dining", bg: "#ECFDF5", color: "#059669", border: "#6EE7B7" };
    if (activeTables[tableNum.toString()]) return { text: "Unlocked (Empty)", bg: "#EFF6FF", color: "#3B82F6", border: "#93C5FD" };
    return { text: "Locked", bg: COLORS.white, color: COLORS.secondaryText, border: "#E5E7EB" };
  };

  const groupedTables = {};
  activeOrders.forEach(order => {
    const t = order.table_number;
    if (!groupedTables[t]) groupedTables[t] = { table_number: t, pendingIds: [], allIds: [], items: [], notes: [] };
    groupedTables[t].allIds.push(order.id);
    if (order.status === "pending") groupedTables[t].pendingIds.push(order.id);
    order.items.forEach(item => groupedTables[t].items.push({ ...item, isNew: order.status === "pending" }));
    if (order.special_instructions) groupedTables[t].notes.push(order.special_instructions);
  });
  const kitchenQueue = Object.values(groupedTables).sort((a, b) => a.table_number - b.table_number);

  return (
    <div style={{ padding: "30px", fontFamily: "'Inter', 'Segoe UI', sans-serif", backgroundColor: COLORS.background, minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", backgroundColor: COLORS.white, padding: "15px 25px", borderRadius: "16px", boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ backgroundColor: "#E5E7EB", padding: "12px", borderRadius: "12px" }}>
            <span style={{ fontSize: "28px" }}>👨‍💼</span>
          </div>
          <div>
            <h1 style={{ margin: 0, color: COLORS.primaryText, fontSize: "28px", fontWeight: "900", letterSpacing: "-0.5px" }}>Operations Hub</h1>
            <p style={{ margin: 0, color: COLORS.secondaryText, fontWeight: "600" }}>Floor & Kitchen Management</p>
          </div>
        </div>
        <button onClick={handleLogout} style={{ backgroundColor: "#FEE2E2", color: "#DC2626", border: "none", padding: "12px 24px", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: "pointer", transition: "0.2s" }}>
          Secure Logout
        </button>
      </div>

      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "30px" }}>
          {alerts.map(alert => (
            alert.type === "waiter" && (
              <div key={alert.id} style={{ backgroundColor: "#FFFBEB", borderLeft: `5px solid #F59E0B`, padding: "15px 20px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
                <strong style={{ color: "#D97706", fontSize: "18px" }}>🔔 Table {alert.table_number} needs a waiter!</strong>
                <button onClick={() => markWaiterResolved(alert.id)} style={{ backgroundColor: "#F59E0B", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>Mark Resolved</button>
              </div>
            )
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "15px", marginBottom: "30px", borderBottom: `2px solid #E5E7EB`, paddingBottom: "10px" }}>
        <button onClick={() => setActiveTab("ops")} style={{ backgroundColor: "transparent", border: "none", fontSize: "16px", fontWeight: "bold", cursor: "pointer", color: activeTab === "ops" ? COLORS.primaryText : COLORS.secondaryText, borderBottom: activeTab === "ops" ? `3px solid ${COLORS.primaryText}` : "none" }}>🔥 Live Floor & Kitchen</button>
        <button onClick={() => setActiveTab("inventory")} style={{ backgroundColor: "transparent", border: "none", fontSize: "16px", fontWeight: "bold", cursor: "pointer", color: activeTab === "inventory" ? COLORS.primaryText : COLORS.secondaryText, borderBottom: activeTab === "inventory" ? `3px solid ${COLORS.primaryText}` : "none" }}>📦 Inventory Toggle</button>
      </div>

      {activeTab === "ops" && (
        <div>
          <h2 style={{ color: COLORS.primaryText, marginBottom: "15px", fontSize: "20px" }}>Floor Map</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "15px", marginBottom: "40px" }}>
            {TOTAL_TABLES.map(tableNum => {
              const status = getTableStatus(tableNum);
              const isOccupied = occupiedTables.includes(tableNum);
              const isUnlocked = activeTables[tableNum.toString()];
              
              return (
                <div key={tableNum} style={{ padding: "15px", borderRadius: "12px", backgroundColor: status.bg, border: `2px solid ${status.border}`, textAlign: "center", display: "flex", flexDirection: "column", gap: "5px", boxShadow: "0 4px 10px rgba(0,0,0,0.03)", height: "130px" }}>
                  <h3 style={{ margin: 0, color: status.color, fontSize: "18px" }}>Table {tableNum}</h3>
                  <span style={{ fontSize: "11px", fontWeight: "bold", color: status.color, textTransform: "uppercase", marginBottom: "10px" }}>{status.text}</span>
                  
                  {isOccupied && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "auto" }}>
                      <button onClick={() => printBill(tableNum)} style={{ backgroundColor: "#3B82F6", color: "white", border: "none", padding: "8px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>🖨️ Print</button>
                      <button onClick={() => settleBill(tableNum)} style={{ backgroundColor: COLORS.success, color: "white", border: "none", padding: "8px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>💰 Settle</button>
                    </div>
                  )}

                  {!isOccupied && !isUnlocked && (
                    <button onClick={() => openTable(tableNum)} style={{ backgroundColor: "#111827", color: "white", border: "none", padding: "8px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px", marginTop: "auto" }}>🔓 Open Table</button>
                  )}

                  {!isOccupied && isUnlocked && (
                    <button onClick={() => lockTable(tableNum)} style={{ backgroundColor: "#E5E7EB", color: "#4B5563", border: "none", padding: "8px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px", marginTop: "auto" }}>🔒 Lock</button>
                  )}
                </div>
              );
            })}
          </div>

          <h2 style={{ color: COLORS.primaryText, marginBottom: "20px", fontSize: "20px" }}>Kitchen Dispatch Queue</h2>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {kitchenQueue.length === 0 && (
              <div style={{ backgroundColor: COLORS.white, padding: "40px", borderRadius: "16px", width: "100%", textAlign: "center", border: `2px dashed ${COLORS.secondaryText}` }}>
                <h3 style={{ color: COLORS.secondaryText, margin: 0 }}>No active orders. Kitchen is clear! 🎉</h3>
              </div>
            )}
            
            {kitchenQueue.map((tableGroup) => {
              const hasNewItems = tableGroup.pendingIds.length > 0;
              return (
                <div key={tableGroup.table_number} style={{ border: `1px solid ${hasNewItems ? '#F59E0B' : '#E5E7EB'}`, borderRadius: "16px", padding: "20px", width: "300px", backgroundColor: COLORS.ticketBg, display: "flex", flexDirection: "column", boxShadow: hasNewItems ? "0 0 15px rgba(245, 158, 11, 0.3)" : "0 8px 20px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                    <h3 style={{ margin: 0, color: COLORS.white, backgroundColor: COLORS.primaryText, padding: "6px 14px", borderRadius: "8px", fontSize: "18px" }}>Table {tableGroup.table_number}</h3>
                    {hasNewItems && <span style={{ color: "#D97706", fontSize: "12px", fontWeight: "bold", backgroundColor: "#FEF3C7", padding: "4px 8px", borderRadius: "6px", animation: "pulse 2s infinite" }}>New Additions!</span>}
                  </div>
                  
                  <ul style={{ paddingLeft: "0", margin: "0 0 15px 0", listStyle: "none", flexGrow: 1 }}>
                    {tableGroup.items.map((item, index) => (
                      <li key={index} style={{ fontSize: "16px", marginBottom: "12px", color: COLORS.primaryText, display: "flex", alignItems: "center", gap: "10px" }}>
                        <strong style={{ color: COLORS.secondaryText, fontSize: "18px" }}>{item.qty}x</strong> 
                        <span style={{ fontWeight: item.isNew ? "800" : "500" }}>{item.name}</span>
                        {item.isNew && <span style={{ backgroundColor: "#F59E0B", color: "white", fontSize: "10px", padding: "2px 6px", borderRadius: "10px", fontWeight: "bold" }}>NEW</span>}
                      </li>
                    ))}
                  </ul>

                  {tableGroup.notes.length > 0 && (
                    <div style={{ backgroundColor: "#FEF3C7", padding: "12px", borderRadius: "8px", marginBottom: "20px", fontSize: "13px", color: "#D97706", borderLeft: "4px solid #D97706" }}>
                      <strong>📝 Notes:</strong> {tableGroup.notes.join(" | ")}
                    </div>
                  )}

                  {hasNewItems ? (
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button onClick={() => acceptNewItems(tableGroup.pendingIds)} style={{ flex: 1, padding: "15px", backgroundColor: "#F59E0B", color: "white", border: "none", borderRadius: "10px", fontSize: "15px", cursor: "pointer", fontWeight: "bold" }}>👨‍🍳 Accept</button>
                      <button onClick={() => rejectNewItems(tableGroup.pendingIds)} style={{ flex: 1, padding: "15px", backgroundColor: "#DC2626", color: "white", border: "none", borderRadius: "10px", fontSize: "15px", cursor: "pointer", fontWeight: "bold" }}>❌ Reject</button>
                    </div>
                  ) : (
                    <button onClick={() => markTableServed(tableGroup.allIds)} style={{ width: "100%", padding: "15px", backgroundColor: COLORS.success, color: "white", border: "none", borderRadius: "10px", fontSize: "16px", cursor: "pointer", fontWeight: "bold" }}>✓ Mark Table Served</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div style={{ backgroundColor: COLORS.white, borderRadius: "16px", padding: "20px", boxShadow: "0 4px 10px rgba(0,0,0,0.02)" }}>
          <h2 style={{ color: COLORS.primaryText, margin: "0 0 20px 0", fontSize: "20px" }}>Mark Items Out of Stock</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {MENU_ITEMS.map((item) => {
              const isAvailable = !outOfStock.includes(item.id);
              return (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 15px", borderBottom: "1px solid #F3F4F6", backgroundColor: isAvailable ? "transparent" : "#FEF2F2", borderRadius: "8px" }}>
                  <div><h4 style={{ margin: 0, color: isAvailable ? COLORS.primaryText : "#DC2626", fontSize: "16px", fontWeight: "600" }}>{item.name}</h4></div>
                  <button onClick={() => toggleAvailability(item.id)} style={{ padding: "8px 16px", borderRadius: "20px", border: "none", fontWeight: "bold", cursor: "pointer", backgroundColor: isAvailable ? "#E5E7EB" : "#DC2626", color: isAvailable ? COLORS.primaryText : "white" }}>
                    {isAvailable ? "Available" : "❌ Out of Stock"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`}</style>
    </div>
  );
}