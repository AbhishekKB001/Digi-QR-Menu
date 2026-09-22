import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import { collection, query, where, onSnapshot, getDocs, doc, writeBatch } from "firebase/firestore";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const COLORS = { 
  background: "#F9FAFB", primaryText: "#111827", secondaryText: "#6B7280", 
  success: "#10B981", danger: "#DC2626", white: "#FFFFFF", cardBg: "#FFFFFF", border: "#E5E7EB"
};

const TOTAL_TABLES = [1, 2, 3, 4, 5, 6];

export default function Owner() {
  const [activeTab, setActiveTab] = useState("today");
  const [dailyRevenue, setDailyRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [popularItems, setPopularItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // History State
  const [monthlyHistory, setMonthlyHistory] = useState({});
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/Digi-QR-Menu/?portal=admin";
  };

  useEffect(() => {
    // --- LISTENER 1: LIVE TODAY'S REVENUE ---
    const qLiveOrders = query(collection(db, "orders"), where("restaurant_id", "==", "mysuru_cafe"));
    const unsubLive = onSnapshot(qLiveOrders, (snapshot) => {
      let revenue = 0;
      let orderCount = 0;
      const itemCounts = {};
      const todayString = new Date().toDateString();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const orderDateObj = data.created_at ? data.created_at.toDate() : new Date();
        
        if (data.status === "paid" && orderDateObj.toDateString() === todayString) {
          
          // 🚨 THE FIX: Calculate total manually for old legacy orders
          let orderTotal = data.total_price || 0;
          if (orderTotal === 0 && data.items && Array.isArray(data.items)) {
            orderTotal = data.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
          }

          revenue += orderTotal;
          orderCount++;
          
          if (data.items && Array.isArray(data.items)) {
            data.items.forEach(item => {
              if (itemCounts[item.name]) {
                itemCounts[item.name].qty += item.qty;
              } else {
                itemCounts[item.name] = { name: item.name, qty: item.qty };
              }
            });
          }
        }
      });

      const sortedItems = Object.values(itemCounts).sort((a, b) => b.qty - a.qty).slice(0, 5);
      setDailyRevenue(revenue);
      setTotalOrders(orderCount);
      setPopularItems(sortedItems);
    });

    // --- LISTENER 2: FULL HISTORY CLASSIFICATION ---
    const unsubHistory = onSnapshot(qLiveOrders, (snapshot) => {
      const historyByMonth = {};
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === "paid" && data.created_at) {
          const dateObj = data.created_at.toDate();
          const monthYear = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
          const sortKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

          if (!historyByMonth[monthYear]) {
            historyByMonth[monthYear] = { 
              label: monthYear, 
              sortKey: sortKey, 
              totalRevenue: 0, 
              orderCount: 0, 
              orders: [] 
            };
          }

          // 🚨 THE FIX: Calculate total manually for old legacy orders in the PDF
          let orderTotal = data.total_price || 0;
          if (orderTotal === 0 && data.items && Array.isArray(data.items)) {
            orderTotal = data.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
          }

          historyByMonth[monthYear].totalRevenue += orderTotal;
          historyByMonth[monthYear].orderCount += 1;
          
          const itemsString = data.items.map(i => `${i.qty}x ${i.name}`).join(", ");
          
          historyByMonth[monthYear].orders.push({
            date: dateObj.toLocaleDateString(),
            time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            table: data.table_number,
            items: itemsString,
            total: orderTotal // Now uses the fallback calculator!
          });
        }
      });

      Object.values(historyByMonth).forEach(monthGroup => {
        monthGroup.orders.sort((a, b) => new Date(b.date) - new Date(a.date));
      });

      setMonthlyHistory(historyByMonth);
      setIsLoadingHistory(false);
    });

    return () => { unsubLive(); unsubHistory(); };
  }, []);

  // --- PDF GENERATION GENERATOR ---
  const downloadMonthPDF = (monthData) => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(22);
      doc.setTextColor(40);
      doc.text("Mysuru Cafe - Sales Report", 14, 22);
      
      doc.setFontSize(14);
      doc.setTextColor(100);
      doc.text(`Month: ${monthData.label}`, 14, 32);
      doc.text(`Total Orders: ${monthData.orderCount}  |  Total Revenue: Rs. ${monthData.totalRevenue.toLocaleString()}`, 14, 40);

      const tableColumn = ["Date", "Time", "Table", "Items Ordered", "Total (Rs)"];
      const tableRows = [];

      monthData.orders.forEach(order => {
        tableRows.push([
          order.date,
          order.time,
          order.table,
          order.items,
          order.total
        ]);
      });

      autoTable(doc, {
        startY: 48,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 3: { cellWidth: 80 } } 
      });

      doc.save(`MysuruCafe_Report_${monthData.label.replace(" ", "_")}.pdf`);
      
    } catch (error) {
      console.error("PDF Generation Error:", error);
      alert("Something went wrong while generating the PDF. Check the console.");
    }
  };

  // --- SAFE END OF DAY RESET ---
  const endOfDayReset = async () => {
    const confirmReset = window.confirm("This will unlock all tables and clear any hanging alerts. Do this after closing. Continue?");
    if (!confirmReset) return;

    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      TOTAL_TABLES.forEach(tableNum => {
        batch.set(doc(db, "tables", tableNum.toString()), { is_active: false, locked_by: null }, { merge: true });
      });
      const activeAlerts = await getDocs(query(collection(db, "alerts"), where("status", "==", "active")));
      activeAlerts.forEach((alertDoc) => {
        batch.update(doc(db, "alerts", alertDoc.id), { status: "resolved" });
      });
      await batch.commit();
      alert("✅ End of Day Reset Complete.");
    } catch (error) {
      console.error("Reset failed:", error);
      alert("Failed to reset tables.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: "30px", fontFamily: "'Inter', 'Segoe UI', sans-serif", backgroundColor: COLORS.background, minHeight: "100vh" }}>
      
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", backgroundColor: COLORS.white, padding: "20px 30px", borderRadius: "16px", boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ backgroundColor: "#EFF6FF", padding: "12px", borderRadius: "12px", fontSize: "28px" }}>📈</div>
          <div>
            <h1 style={{ margin: 0, color: COLORS.primaryText, fontSize: "28px", fontWeight: "900", letterSpacing: "-0.5px" }}>Owner Dashboard</h1>
            <p style={{ margin: 0, color: COLORS.secondaryText, fontWeight: "600" }}>Financials & Reports</p>
          </div>
        </div>
        <button onClick={handleLogout} style={{ backgroundColor: "#FEE2E2", color: "#DC2626", border: "none", padding: "12px 24px", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: "pointer" }}>
          Logout
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: "15px", marginBottom: "30px", borderBottom: `2px solid ${COLORS.border}`, paddingBottom: "10px" }}>
        <button onClick={() => setActiveTab("today")} style={{ backgroundColor: "transparent", border: "none", fontSize: "16px", fontWeight: "bold", cursor: "pointer", color: activeTab === "today" ? COLORS.primaryText : COLORS.secondaryText, borderBottom: activeTab === "today" ? `3px solid ${COLORS.primaryText}` : "none" }}>📊 Today's Performance</button>
        <button onClick={() => setActiveTab("history")} style={{ backgroundColor: "transparent", border: "none", fontSize: "16px", fontWeight: "bold", cursor: "pointer", color: activeTab === "history" ? COLORS.primaryText : COLORS.secondaryText, borderBottom: activeTab === "history" ? `3px solid ${COLORS.primaryText}` : "none" }}>📁 Monthly Reports (PDF)</button>
      </div>

      {activeTab === "today" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "25px", marginBottom: "40px" }}>
            {/* REVENUE WIDGET */}
            <div style={{ backgroundColor: COLORS.cardBg, padding: "25px", borderRadius: "16px", boxShadow: "0 4px 10px rgba(0,0,0,0.03)", borderTop: `4px solid ${COLORS.success}` }}>
              <h3 style={{ margin: "0 0 10px 0", color: COLORS.secondaryText, fontSize: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>Today's Revenue</h3>
              <p style={{ margin: 0, fontSize: "42px", fontWeight: "900", color: COLORS.primaryText }}>₹{dailyRevenue.toLocaleString()}</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "15px", paddingTop: "15px", borderTop: "1px solid #E5E7EB" }}>
                <div>
                  <span style={{ display: "block", color: COLORS.secondaryText, fontSize: "13px" }}>Completed Orders</span>
                  <strong style={{ fontSize: "18px", color: COLORS.primaryText }}>{totalOrders}</strong>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ display: "block", color: COLORS.secondaryText, fontSize: "13px" }}>Avg. Order Value</span>
                  <strong style={{ fontSize: "18px", color: COLORS.primaryText }}>₹{totalOrders > 0 ? Math.round(dailyRevenue / totalOrders) : 0}</strong>
                </div>
              </div>
            </div>

            {/* BEST SELLERS WIDGET */}
            <div style={{ backgroundColor: COLORS.cardBg, padding: "25px", borderRadius: "16px", boxShadow: "0 4px 10px rgba(0,0,0,0.03)" }}>
              <h3 style={{ margin: "0 0 20px 0", color: COLORS.secondaryText, fontSize: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>🔥 Top Selling Items (Today)</h3>
              {popularItems.length === 0 ? (
                <p style={{ color: COLORS.secondaryText, fontStyle: "italic" }}>No sales data yet for today.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {popularItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ backgroundColor: "#F3F4F6", padding: "4px 10px", borderRadius: "6px", fontWeight: "bold", fontSize: "14px", color: COLORS.primaryText }}>#{i + 1}</span>
                        <span style={{ fontWeight: "600", color: COLORS.primaryText }}>{item.name}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: "800", color: COLORS.success, display: "block" }}>{item.qty} sold</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <h2 style={{ color: COLORS.primaryText, marginBottom: "20px", fontSize: "22px" }}>Operations</h2>
          <div style={{ backgroundColor: COLORS.cardBg, padding: "25px", borderRadius: "16px", boxShadow: "0 4px 10px rgba(0,0,0,0.03)", border: "1px solid #E5E7EB", maxWidth: "400px" }}>
            <div style={{ fontSize: "32px", marginBottom: "15px" }}>🌙</div>
            <h3 style={{ margin: "0 0 10px 0", color: COLORS.primaryText, fontSize: "18px" }}>End of Day Reset</h3>
            <p style={{ color: COLORS.secondaryText, fontSize: "14px", lineHeight: "1.5", marginBottom: "20px" }}>
              Releases all table locks and clears alerts. Run this after closing.
            </p>
            <button onClick={endOfDayReset} disabled={isProcessing} style={{ width: "100%", padding: "14px", backgroundColor: "#1F2937", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "15px", cursor: isProcessing ? "not-allowed" : "pointer" }}>
              {isProcessing ? "Processing..." : "Run End of Day Reset"}
            </button>
          </div>
        </>
      )}

      {activeTab === "history" && (
        <div>
          <p style={{ color: COLORS.secondaryText, marginBottom: "30px", fontSize: "16px" }}>
            Download complete sales logs classified by month. These PDFs include full item breakdowns for every order.
          </p>
          
          {isLoadingHistory ? (
            <p>Loading historical data...</p>
          ) : Object.keys(monthlyHistory).length === 0 ? (
            <div style={{ padding: "40px", backgroundColor: COLORS.white, borderRadius: "12px", textAlign: "center", border: `1px dashed ${COLORS.border}` }}>
              <p style={{ color: COLORS.secondaryText }}>No historical order data found.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
              {Object.values(monthlyHistory)
                .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
                .map((monthData, index) => (
                <div key={index} style={{ backgroundColor: COLORS.white, borderRadius: "12px", padding: "25px", boxShadow: "0 4px 12px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                    <div>
                      <h3 style={{ margin: "0 0 5px 0", fontSize: "20px", color: COLORS.primaryText }}>{monthData.label}</h3>
                      <span style={{ color: COLORS.secondaryText, fontSize: "14px", fontWeight: "500" }}>{monthData.orderCount} Total Orders</span>
                    </div>
                    <div style={{ fontSize: "28px" }}>📄</div>
                  </div>
                  
                  <div style={{ marginBottom: "25px", paddingTop: "15px", borderTop: `1px dashed ${COLORS.border}` }}>
                    <span style={{ display: "block", color: COLORS.secondaryText, fontSize: "13px", marginBottom: "5px" }}>Monthly Revenue</span>
                    <strong style={{ fontSize: "24px", color: COLORS.success }}>₹{monthData.totalRevenue.toLocaleString()}</strong>
                  </div>

                  <button 
                    onClick={() => downloadMonthPDF(monthData)}
                    style={{ marginTop: "auto", width: "100%", padding: "14px", backgroundColor: "#4F46E5", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "15px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", transition: "0.2s" }}
                    onMouseOver={(e) => e.target.style.backgroundColor = "#4338CA"}
                    onMouseOut={(e) => e.target.style.backgroundColor = "#4F46E5"}
                  >
                    ⬇️ Download PDF Report
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}