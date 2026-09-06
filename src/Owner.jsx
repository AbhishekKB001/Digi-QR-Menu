import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const COLORS = { background: "#F9FAFB", primaryText: "#111827", secondaryText: "#6B7280", success: "#10B981", white: "#FFFFFF" };

export default function Owner() {
  const [activeTab, setActiveTab] = useState("overview"); 
  const [stats, setStats] = useState({ active: 0, completedToday: 0, revenueToday: 0 });
  const [groupedOrders, setGroupedOrders] = useState({});
  const [ratingStat, setRatingStat] = useState({ average: "0.0", count: 0 });
  const [feedbacksList, setFeedbacksList] = useState([]); 

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/Digi-QR-Menu/?portal=admin";
  };

  useEffect(() => {
    const qOrders = query(collection(db, "orders"), where("restaurant_id", "==", "mysuru_cafe"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      let activeCount = 0; let completedTodayCount = 0; let totalRevenueToday = 0;
      const historyGroups = {}; 
      const todayString = new Date().toDateString();

      const rawOrders = [];
      snapshot.forEach((document) => rawOrders.push({ id: document.id, ...document.data() }));
      rawOrders.sort((a, b) => (a.created_at?.toMillis() || 0) - (b.created_at?.toMillis() || 0));

      rawOrders.forEach((data) => {
        const orderTotal = data.items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
        const orderDateObj = data.created_at ? data.created_at.toDate() : new Date();
        const isToday = orderDateObj.toDateString() === todayString;
        const dateHeader = orderDateObj.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        if (data.status === "pending" || data.status === "preparing") activeCount++;
        if ((data.status === "completed" || data.status === "paid") && isToday) {
          completedTodayCount++; totalRevenueToday += orderTotal;
        }

        if (!historyGroups[dateHeader]) historyGroups[dateHeader] = {};

        const sessionId = data.meal_session_id || data.id;

        if (historyGroups[dateHeader][sessionId]) {
          historyGroups[dateHeader][sessionId].total += orderTotal;
          if (data.status !== "paid") {
            historyGroups[dateHeader][sessionId].status = data.status;
          }
        } else {
          historyGroups[dateHeader][sessionId] = { 
            id: sessionId, 
            table_number: data.table_number,
            total: orderTotal, 
            dateObj: orderDateObj, 
            status: data.status 
          };
        }
      });

      const finalGrouped = {};
      Object.keys(historyGroups).forEach(date => {
        finalGrouped[date] = Object.values(historyGroups[date]).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
      });
      
      setStats({ active: activeCount, completedToday: completedTodayCount, revenueToday: totalRevenueToday });
      setGroupedOrders(finalGrouped);
    });

    const qFeedback = query(collection(db, "feedbacks"), where("restaurant_id", "==", "mysuru_cafe"));
    const unsubFeedback = onSnapshot(qFeedback, (snapshot) => {
      let totalStars = 0; let reviewCount = 0;
      const todayString = new Date().toDateString();
      const allFeedbacks = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        const dateObj = data.created_at ? data.created_at.toDate() : new Date();
        allFeedbacks.push({ id: doc.id, dateObj, ...data });
        if (dateObj.toDateString() === todayString) { totalStars += data.rating; reviewCount++; }
      });
      
      setRatingStat({ average: reviewCount > 0 ? (totalStars / reviewCount).toFixed(1) : "0.0", count: reviewCount });
      setFeedbacksList(allFeedbacks);
    });

    return () => { unsubOrders(); unsubFeedback(); };
  }, []);

  const getRatingForOrder = (order) => {
    const orderTime = order.dateObj.getTime();
    const possibleFeedbacks = feedbacksList.filter(fb => fb.table_number === order.table_number && fb.dateObj && fb.dateObj.getTime() >= orderTime && (fb.dateObj.getTime() - orderTime) < (4 * 60 * 60 * 1000) );
    if (possibleFeedbacks.length > 0) {
      possibleFeedbacks.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
      return possibleFeedbacks[0].rating;
    }
    return "-";
  };

  const sortedDates = Object.keys(groupedOrders).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div style={{ padding: "30px", fontFamily: "'Inter', 'Segoe UI', sans-serif", backgroundColor: COLORS.background, minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", backgroundColor: COLORS.white, padding: "15px 25px", borderRadius: "16px", boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ backgroundColor: "#E0E7FF", padding: "10px", borderRadius: "12px" }}>
            <span style={{ fontSize: "28px" }}>📈</span>
          </div>
          <div>
            <h1 style={{ margin: 0, color: COLORS.primaryText, fontSize: "28px", fontWeight: "900", letterSpacing: "-0.5px" }}>Executive Dashboard</h1>
            <p style={{ margin: 0, color: COLORS.secondaryText, fontWeight: "600" }}>Financials & Ledger</p>
          </div>
        </div>
        <button 
          onClick={handleLogout} 
          style={{ backgroundColor: "#FEE2E2", color: "#DC2626", border: "none", padding: "12px 24px", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: "pointer", transition: "0.2s" }}
        >
          Secure Logout
        </button>
      </div>

      <div style={{ display: "flex", gap: "15px", marginBottom: "30px", borderBottom: `2px solid #E5E7EB`, paddingBottom: "10px" }}>
        <button onClick={() => setActiveTab("overview")} style={{ backgroundColor: "transparent", border: "none", fontSize: "16px", fontWeight: "bold", cursor: "pointer", color: activeTab === "overview" ? "#4F46E5" : COLORS.secondaryText, borderBottom: activeTab === "overview" ? `3px solid #4F46E5` : "none" }}>📊 Overview</button>
        <button onClick={() => setActiveTab("history")} style={{ backgroundColor: "transparent", border: "none", fontSize: "16px", fontWeight: "bold", cursor: "pointer", color: activeTab === "history" ? "#4F46E5" : COLORS.secondaryText, borderBottom: activeTab === "history" ? `3px solid #4F46E5` : "none" }}>📁 Order Ledger</button>
      </div>

      {activeTab === "overview" && (
        <div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div style={{ backgroundColor: COLORS.white, padding: "25px", borderRadius: "16px", flex: "1", minWidth: "250px", borderTop: `6px solid #4F46E5`, boxShadow: "0 4px 10px rgba(0,0,0,0.03)" }}>
              <p style={{ margin: "0 0 10px 0", color: COLORS.secondaryText, fontSize: "14px", fontWeight: "bold" }}>TODAY'S REVENUE</p>
              <h2 style={{ margin: 0, color: COLORS.primaryText, fontSize: "48px" }}>₹{stats.revenueToday}</h2>
            </div>
            <div style={{ backgroundColor: COLORS.white, padding: "25px", borderRadius: "16px", flex: "1", minWidth: "250px", borderTop: `6px solid ${COLORS.success}`, boxShadow: "0 4px 10px rgba(0,0,0,0.03)" }}>
              <p style={{ margin: "0 0 10px 0", color: COLORS.secondaryText, fontSize: "14px", fontWeight: "bold" }}>COMPLETED ITEMS TODAY</p>
              <h2 style={{ margin: 0, color: COLORS.primaryText, fontSize: "48px" }}>{stats.completedToday}</h2>
            </div>
            <div style={{ backgroundColor: COLORS.white, padding: "25px", borderRadius: "16px", flex: "1", minWidth: "250px", borderTop: `6px solid #F59E0B`, boxShadow: "0 4px 10px rgba(0,0,0,0.03)" }}>
              <p style={{ margin: "0 0 10px 0", color: COLORS.secondaryText, fontSize: "14px", fontWeight: "bold" }}>CUSTOMER RATING (TODAY)</p>
              <h2 style={{ margin: 0, color: COLORS.primaryText, fontSize: "48px", display: "flex", alignItems: "center", gap: "10px" }}>
                ⭐ {ratingStat.average} <span style={{ fontSize: "16px", color: COLORS.secondaryText, fontWeight: "normal" }}>({ratingStat.count} reviews)</span>
              </h2>
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div>
          {sortedDates.map(date => (
            <div key={date} style={{ marginBottom: "40px" }}>
              <h3 style={{ color: COLORS.primaryText, backgroundColor: "#E5E7EB", display: "inline-block", padding: "8px 16px", borderRadius: "8px", fontSize: "16px" }}>📅 {date}</h3>
              <div style={{ backgroundColor: COLORS.white, borderRadius: "16px", padding: "20px", marginTop: "15px", overflowX: "auto", boxShadow: "0 4px 10px rgba(0,0,0,0.02)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "700px" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid #F3F4F6`, color: COLORS.secondaryText }}>
                      <th style={{ padding: "15px 10px" }}>Time</th>
                      <th style={{ padding: "15px 10px" }}>Table</th>
                      <th style={{ padding: "15px 10px" }}>Status</th>
                      <th style={{ padding: "15px 10px" }}>Rating</th>
                      <th style={{ padding: "15px 10px", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedOrders[date].map(order => {
                      const rating = getRatingForOrder(order);
                      return (
                        <tr key={order.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                          <td style={{ padding: "15px 10px", color: COLORS.primaryText, fontWeight: "600" }}>{order.dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: "15px 10px", color: COLORS.primaryText, fontWeight: "800" }}>Table {order.table_number}</td>
                          <td style={{ padding: "15px 10px" }}>
                            <span style={{ backgroundColor: order.status === "paid" ? "#ECFDF5" : "#FFFBEB", color: order.status === "paid" ? "#059669" : "#D97706", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700" }}>
                              {order.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: "15px 10px", fontSize: "15px", color: rating !== "-" ? "#F59E0B" : COLORS.secondaryText, fontWeight: "bold" }}>
                            {rating !== "-" ? `⭐ ${rating}` : "-"}
                          </td>
                          <td style={{ padding: "15px 10px", textAlign: "right", color: COLORS.success, fontWeight: "800" }}>₹{order.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}