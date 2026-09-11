import { signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import Kitchen from "./Kitchen";
import Owner from "./Owner";

const MENU_ITEMS = [
  { id: "1", name: "Samosa", price: 40, desc: "Deep-fried pastry filled with spiced potatoes", category: "Starters", isVeg: true },
  { id: "2", name: "Onion Pakora", price: 60, desc: "Crispy onion fritters in chickpea batter", category: "Starters", isVeg: true },
  { id: "3", name: "Paneer Tikka", price: 180, desc: "Marinated grilled cottage cheese cubes", category: "Starters", isVeg: true },
  { id: "4", name: "Chicken Tikka", price: 220, desc: "Boneless chicken marinated in yogurt", category: "Starters", isVeg: false },
  { id: "5", name: "Roasted Papad", price: 20, desc: "Crispy thin lentil crackers", category: "Starters", isVeg: true },
  { id: "6", name: "Butter Naan", price: 45, desc: "Soft leavened wheat flatbread with butter", category: "Breads", isVeg: true },
  { id: "7", name: "Tandoori Roti", price: 25, desc: "Unleavened whole wheat flatbread", category: "Breads", isVeg: true },
  { id: "8", name: "Aloo Paratha", price: 60, desc: "Stuffed flatbread with spiced potatoes", category: "Breads", isVeg: true },
  { id: "9", name: "Jeera Rice", price: 120, desc: "Basmati rice flavored with cumin seeds", category: "Rice Dishes", isVeg: true },
  { id: "10", name: "Chicken Biryani", price: 250, desc: "Fragrant spiced rice layered with tender chicken", category: "Rice Dishes", isVeg: false },
  { id: "11", name: "Veg Pulao", price: 150, desc: "Mildly spiced rice cooked with mixed vegetables", category: "Rice Dishes", isVeg: true },
  { id: "12", name: "Paneer Butter Masala", price: 200, desc: "Creamy tomato-based curry with paneer", category: "Main Course", isVeg: true },
  { id: "13", name: "Dal Tadka", price: 130, desc: "Yellow lentils tempered with ghee and garlic", category: "Main Course", isVeg: true },
  { id: "14", name: "Aloo Gobi", price: 140, desc: "Spiced dry curry with potato and cauliflower", category: "Main Course", isVeg: true },
  { id: "15", name: "Chicken Curry", price: 240, desc: "Classic homestyle chicken cooked in spiced gravy", category: "Main Course", isVeg: false },
  { id: "16", name: "Mutton Rogan Josh", price: 350, desc: "Slow-cooked aromatic lamb curry", category: "Main Course", isVeg: false },
  { id: "19", name: "Gulab Jamun", price: 50, desc: "Deep-fried milk balls soaked in sugar syrup", category: "Desserts", isVeg: true },
  { id: "20", name: "Rasmalai", price: 70, desc: "Soft paneer discs in sweetened milk", category: "Desserts", isVeg: true },
  { id: "21", name: "Rice Kheer", price: 60, desc: "Rice pudding flavored with cardamom", category: "Desserts", isVeg: true },
  { id: "22", name: "Sweet Lassi", price: 80, desc: "Thick, sweet yogurt-based drink", category: "Beverages", isVeg: true },
  { id: "23", name: "Filter Coffee", price: 40, desc: "Strong decoction-style coffee with milk", category: "Beverages", isVeg: true },
  { id: "24", name: "Masala Chai", price: 30, desc: "Hot spiced Indian tea", category: "Beverages", isVeg: true },
  { id: "25", name: "Fresh Lime Soda", price: 60, desc: "Refreshing sweet and salt cooler", category: "Beverages", isVeg: true }
];

const CATEGORIES = ["Starters", "Breads", "Rice Dishes", "Main Course", "Desserts", "Beverages"];

const COLORS = {
  background: "#F9FAFB", primaryText: "#111827", secondaryText: "#6B7280", 
  accent: "#E63946", accentLight: "#FFEDEF", success: "#10B981", white: "#FFFFFF", border: "#F3F4F6"
};

const DietBadge = ({ isVeg }) => (
  <div style={{ border: `1.5px solid ${isVeg ? '#10B981' : '#EF4444'}`, width: "12px", height: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "2px", marginBottom: "4px" }}>
    <div style={{ backgroundColor: isVeg ? '#10B981' : '#EF4444', borderRadius: "50%", width: "6px", height: "6px" }} />
  </div>
);

export default function App() {
  const [view, setView] = useState("customer");
  const [activeTab, setActiveTab] = useState("Starters");
  const [dietFilter, setDietFilter] = useState("All"); 
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showBill, setShowBill] = useState(false); 
  const [cart, setCart] = useState([]);
  const [cookingInstructions, setCookingInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const [tableNumber, setTableNumber] = useState(null);
  
  // Security State Variables
  const [isTableActive, setIsTableActive] = useState(false);
  const [isCheckingTable, setIsCheckingTable] = useState(true);
  const [unlockRequested, setUnlockRequested] = useState(false);

  const [waiterCalled, setWaiterCalled] = useState(false);
  const [crowdStatus, setCrowdStatus] = useState({ text: "Low", time: "10-15 mins", color: "#10B981", bg: "#ECFDF5" });
  const [outOfStock, setOutOfStock] = useState([]);
  const [tableOrders, setTableOrders] = useState([]); 
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    // 🚨 FIXED: Anonymous Login Restored for Customers (Prevents hanging database writes)
    const urlCheck = new URL(window.location.href);
    if (urlCheck.searchParams.get("portal") !== "admin") {
      signInAnonymously(auth).catch(console.error);
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        const url = new URL(window.location.href);
        const isPortal = url.searchParams.get("portal") === "admin";
        
        if (isPortal) {
          if (user.email === "owner@mysurucafe.com") setView("owner");
          else if (user.email === "kitchen@mysurucafe.com") setView("kitchen");
        }
      }
    });

    const validateRouting = async () => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

      if (params.get("portal") === "admin") {
        setView("login");
        window.history.replaceState({}, document.title, "/?portal=admin");
        return;
      }

      const token = params.get("t"); 
      if (token) {
        try {
          const tokenRef = doc(db, "table_tokens", token);
          const docSnap = await getDoc(tokenRef);

          if (docSnap.exists() && docSnap.data().restaurant_id === "mysuru_cafe") {
            const data = docSnap.data();
            if (data.table_number) {
              const oldTable = sessionStorage.getItem("customer_table_session");
              if (oldTable && parseInt(oldTable) !== data.table_number) {
                 sessionStorage.removeItem("meal_session_id");
                 sessionStorage.removeItem("cart"); 
              }
              sessionStorage.setItem("customer_table_session", data.table_number);
              setTableNumber(data.table_number); 
              window.history.replaceState({}, document.title, "/Digi-QR-Menu/");          
             }
          }
        } catch (error) {
          console.error("Security check failed:", error);
        }
      } else {
        const existingSession = sessionStorage.getItem("customer_table_session");
        if (existingSession) setTableNumber(existingSession);
      }
    };

    validateRouting();
    return () => unsubscribe();
  }, []);

  // Table Security Effect
  useEffect(() => {
    if (!tableNumber) {
      setIsCheckingTable(false);
      return;
    }

    const unsubTable = onSnapshot(doc(db, "tables", tableNumber.toString()), (docSnap) => {
      if (docSnap.exists() && docSnap.data().is_active === true) {
        setIsTableActive(true);
        setUnlockRequested(false); // Reset if unlocked by staff
      } else {
        setIsTableActive(false);
      }
      setIsCheckingTable(false);
    });
    
    return () => unsubTable();
  }, [tableNumber]);

  useEffect(() => {
    if (!tableNumber) return;

    const qOrders = query(collection(db, "orders"), where("restaurant_id", "==", "mysuru_cafe"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      let activeCount = 0;
      const myTableOrders = [];
      const todayString = new Date().toDateString();

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === "pending" || data.status === "preparing") activeCount++;
        
        const orderDateObj = data.created_at ? data.created_at.toDate() : new Date();

        if (data.status === "rejected" && data.meal_session_id === sessionStorage.getItem("meal_session_id")) {
          sessionStorage.removeItem("customer_table_session");
          sessionStorage.removeItem("meal_session_id");
          sessionStorage.removeItem("cart");
          window.location.href = "/Digi-QR-Menu/";
        }

        if (data.table_number === parseInt(tableNumber) && orderDateObj.toDateString() === todayString && data.status !== "paid" && data.status !== "rejected") {
          myTableOrders.push({ id: doc.id, ...data });
        }
      });

      setTableOrders(myTableOrders);
      if (activeCount <= 2) setCrowdStatus({ text: "Low", time: "10-15 mins", color: "#059669", bg: "#ECFDF5" }); 
      else if (activeCount <= 5) setCrowdStatus({ text: "Moderate", time: "15-25 mins", color: "#D97706", bg: "#FFFBEB" }); 
      else setCrowdStatus({ text: "High", time: "30-45 mins", color: "#DC2626", bg: "#FEF2F2" }); 
    });

    const unsubMenu = onSnapshot(doc(db, "settings", "mysuru_cafe"), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().outOfStock)) {
        setOutOfStock(docSnap.data().outOfStock);
      } else {
        setOutOfStock([]);
      }
    });

    return () => { unsubOrders(); unsubMenu(); };
  }, [tableNumber]);

  useEffect(() => {
    if (showBill && tableOrders.length === 0) {
      setShowBill(false);
      setShowFeedback(true);
    }
  }, [tableOrders, showBill]);

  const requestUnlock = async () => {
    try {
      setUnlockRequested(true); // Updates UI instantly
      await addDoc(collection(db, "alerts"), { 
        restaurant_id: "mysuru_cafe", 
        table_number: parseInt(tableNumber), 
        type: "unlock_request", 
        status: "active", 
        created_at: serverTimestamp() 
      });
    } catch (error) {
      alert("Network error. Please call a waiter.");
      setUnlockRequested(false);
    }
  };

  const callWaiter = async () => {
    setWaiterCalled(true);
    await addDoc(collection(db, "alerts"), { restaurant_id: "mysuru_cafe", table_number: parseInt(tableNumber), type: "waiter", status: "active", created_at: serverTimestamp() });
    setTimeout(() => setWaiterCalled(false), 5000); 
  };

  const submitFeedback = async (rating) => {
    await addDoc(collection(db, "feedbacks"), { 
      restaurant_id: "mysuru_cafe", 
      table_number: parseInt(tableNumber), 
      rating: rating, 
      created_at: serverTimestamp() 
    });
    
    setFeedbackSubmitted(true);
    sessionStorage.removeItem("customer_table_session");
    sessionStorage.removeItem("meal_session_id");
    sessionStorage.removeItem("cart");
    
    setTimeout(() => { window.location.href = "/Digi-QR-Menu/"; }, 3000);
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      return existing ? prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === id);
      if (existing.qty > 1) return prev.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c);
      const newCart = prev.filter(item => item.id !== id);
      if (newCart.length === 0) setIsCartOpen(false);
      return newCart;
    });
  };
  
  const calculateCartTotal = () => cart.reduce((total, item) => total + (item.price * item.qty), 0);
  const calculateGrandTotal = () => tableOrders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + (item.price * item.qty), 0), 0);

  const sanitizeInput = (str) => {
    if (!str) return "";
    return str.replace(/[<>]/g, ""); 
  };

  const placeOrder = async () => {
    if (cart.length === 0 || isSubmitting) return; 
    
    setIsSubmitting(true);
    try {
      const safeInstructions = sanitizeInput(cookingInstructions);

      let mealSessionId = sessionStorage.getItem("meal_session_id");
      if (!mealSessionId) {
        mealSessionId = "session_" + Date.now().toString(36);
        sessionStorage.setItem("meal_session_id", mealSessionId);
      }

      await addDoc(collection(db, "orders"), {
        restaurant_id: "mysuru_cafe",
        table_number: parseInt(tableNumber),
        items: cart,
        special_instructions: safeInstructions,
        payment_method: "Pay at Counter",
        status: "pending",
        meal_session_id: mealSessionId, 
        created_at: serverTimestamp()
      });
      
      setOrderSent(true); 
      setIsCartOpen(false); 
      setCart([]); 
      setCookingInstructions("");
    } catch (error) { 
      console.error(error); 
      alert("Something went wrong. Please try again.");
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(""); 
    setIsSubmitting(true);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userEmail = userCredential.user.email;
      
      if (userEmail === "owner@mysurucafe.com") setView("owner");
      else if (userEmail === "kitchen@mysurucafe.com") setView("kitchen");
    } catch (error) {
      console.error("Login failed:", error);
      setLoginError("Invalid credentials. Access Denied.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view === "login") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: COLORS.background, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <form onSubmit={handleLogin} style={{ backgroundColor: COLORS.white, padding: "40px", borderRadius: "16px", boxShadow: "0 10px 25px rgba(0,0,0,0.05)", width: "90%", maxWidth: "380px" }}>
          <div style={{ textAlign: "center", marginBottom: "30px" }}>
            <h2 style={{ margin: "0 0 10px 0", color: COLORS.primaryText, fontSize: "28px", fontWeight: "900" }}>Staff Portal</h2>
            <p style={{ margin: 0, color: COLORS.secondaryText, fontSize: "14px", fontWeight: "600" }}>Authorized personnel only</p>
          </div>
          {loginError && (
            <div style={{ backgroundColor: "#FEF2F2", color: "#DC2626", padding: "12px", borderRadius: "8px", fontSize: "14px", marginBottom: "20px", textAlign: "center", fontWeight: "700", border: "1px solid #FCA5A5" }}>
              {loginError}
            </div>
          )}
          <input type="email" placeholder="Staff Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: "14px", marginBottom: "15px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontSize: "15px", fontWeight: "500", backgroundColor: "#F9FAFB", color: COLORS.primaryText }} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: "14px", marginBottom: "25px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontSize: "15px", fontWeight: "500", backgroundColor: "#F9FAFB", color: COLORS.primaryText }} />
          <button type="submit" disabled={isSubmitting} style={{ width: "100%", backgroundColor: COLORS.primaryText, color: "white", padding: "16px", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: "800", cursor: "pointer", boxShadow: "0 10px 20px rgba(0,0,0,0.1)", transition: "0.2s", opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? "Verifying..." : "Secure Login"}
          </button>
        </form>
      </div>
    );
  }
  
  if (view === "kitchen") return <Kitchen />;
  if (view === "owner") return <Owner />;

  if (!tableNumber && view === "customer") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: COLORS.background, padding: "20px", textAlign: "center", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <svg style={{ animation: "pulse 2s infinite", marginBottom: "20px" }} width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>
          <path d="M16 2v4"></path><path d="M8 2v4"></path>
        </svg>
        <h2 style={{ color: COLORS.primaryText, marginBottom: "10px", fontSize: "24px", fontWeight: "800" }}>Tap to Order</h2>
        <p style={{ color: COLORS.secondaryText, fontSize: "16px", maxWidth: "280px", lineHeight: "1.6" }}>
          Gently tap your phone against the table's <strong>NFC Tag</strong>, or scan the QR code to view the menu.
        </p>
        <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }`}</style>
      </div>
    );
  }

  // Security Bouncer & Unlock Request Logic
  if (isCheckingTable && tableNumber) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: COLORS.background, fontFamily: "'Inter', sans-serif" }}>
        <h3 style={{ color: COLORS.primaryText }}>Securely connecting to Table {tableNumber}...</h3>
      </div>
    );
  }

  if (!isTableActive && tableNumber && view === "customer") {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: COLORS.background, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px", textAlign: "center", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <div style={{ fontSize: "60px", marginBottom: "20px" }}>🔒</div>
        <h1 style={{ color: COLORS.primaryText, fontSize: "28px", margin: "0 0 10px 0", fontWeight: "900" }}>Table Locked</h1>
        
        {unlockRequested ? (
          <div style={{ backgroundColor: "#ECFDF5", padding: "15px", borderRadius: "12px", border: "1px solid #6EE7B7", marginTop: "15px" }}>
            <h3 style={{ color: COLORS.success, margin: "0 0 5px 0", fontSize: "16px" }}>Request Sent!</h3>
            <p style={{ color: "#065F46", fontSize: "14px", margin: 0 }}>The staff will unlock your menu in just a moment...</p>
          </div>
        ) : (
          <>
            <p style={{ color: COLORS.secondaryText, fontSize: "16px", maxWidth: "300px", lineHeight: "1.6", marginBottom: "30px" }}>
              Welcome to Mysuru Cafe! Please tap below to request access to the digital menu.
            </p>
            <button 
              onClick={requestUnlock}
              style={{ padding: "16px 30px", backgroundColor: COLORS.primaryText, color: "white", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "800", cursor: "pointer", boxShadow: "0 10px 20px rgba(0,0,0,0.1)" }}
            >
              Unlock Menu
            </button>
          </>
        )}
      </div>
    );
  }

  if (orderSent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: COLORS.background, textAlign: "center", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "20px" }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h2 style={{ color: COLORS.primaryText, fontSize: "26px", fontWeight: "800" }}>Order Received!</h2>
        <p style={{ color: COLORS.secondaryText, marginBottom: "40px" }}>The chef is preparing your food.</p>
        <button onClick={() => setOrderSent(false)} style={{ padding: "16px 35px", backgroundColor: COLORS.primaryText, color: "white", border: "none", borderRadius: "30px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 10px 15px rgba(0,0,0,0.1)" }}>
          View Menu
        </button>
      </div>
    );
  }

  if (showBill) {
    return (
      <div style={{ backgroundColor: COLORS.background, minHeight: "100vh", padding: "20px", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <button onClick={() => setShowBill(false)} style={{ backgroundColor: "transparent", border: "none", fontSize: "24px", cursor: "pointer", color: COLORS.primaryText, marginBottom: "20px", fontWeight: "bold" }}>← Back</button>
        <div style={{ backgroundColor: COLORS.white, padding: "30px", borderRadius: "16px", boxShadow: "0 10px 25px rgba(0,0,0,0.05)", maxWidth: "400px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: COLORS.primaryText, margin: "0 0 5px 0", fontWeight: "900" }}>Mysore Cafe</h2>
          <p style={{ color: COLORS.secondaryText, margin: "0 0 20px 0", fontWeight: "600" }}>Table {tableNumber} • Digital Receipt</p>
          <hr style={{ borderTop: `1px dashed ${COLORS.border}`, marginBottom: "20px" }} />
          <div style={{ textAlign: "left", marginBottom: "20px" }}>
            {tableOrders.map((order) => (
              <div key={order.id} style={{ marginBottom: "15px" }}>
                {order.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", color: COLORS.primaryText, fontWeight: "600" }}>
                    <span>{item.qty}x {item.name}</span>
                    <span>₹{item.price * item.qty}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <hr style={{ borderTop: `1px dashed ${COLORS.border}`, marginBottom: "20px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "22px", fontWeight: "900", color: COLORS.success, marginBottom: "30px" }}>
            <span>Grand Total</span>
            <span>₹{calculateGrandTotal()}</span>
          </div>
          
          <div style={{ padding: "16px", backgroundColor: "#F3F4F6", color: COLORS.secondaryText, borderRadius: "12px", fontWeight: "700" }}>
            Waiters will process your payment at the table.
          </div>
          
        </div>
      </div>
    );
  }

  if (showFeedback) {
    return (
       <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: COLORS.background, textAlign: "center", padding: "20px", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
          {!feedbackSubmitted ? (
            <div style={{ backgroundColor: COLORS.white, padding: "40px 20px", borderRadius: "16px", boxShadow: "0 10px 20px rgba(0,0,0,0.05)", width: "100%", maxWidth: "400px" }}>
              <h2 style={{ color: COLORS.primaryText, marginBottom: "10px", fontSize: "28px", fontWeight: "900" }}>How was your food?</h2>
              <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "20px" }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => submitFeedback(star)} style={{ background: "none", border: "none", fontSize: "40px", cursor: "pointer" }}>⭐</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "15px" }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><h2 style={{ margin: 0, color: COLORS.primaryText, fontWeight: "900", fontSize: "32px" }}>Thank You!</h2><p style={{ color: COLORS.secondaryText, marginTop: "10px", fontWeight: "600" }}>We hope to see you again.</p></div>
          )}
        </div>
    );
  }

  const filteredMenu = MENU_ITEMS.filter(item => {
    const categoryMatch = item.category === activeTab;
    const dietMatch = dietFilter === "All" ? true : (dietFilter === "Veg" ? item.isVeg : !item.isVeg);
    return categoryMatch && dietMatch;
  });

  return (
    <div style={{ position: "relative", minHeight: "100vh", paddingBottom: "100px", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFF", zIndex: -3 }}></div>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundImage: "url('https://images.unsplash.com/photo-1546833999-b9f581a1996d?q=80&w=1000')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, zIndex: -2 }}></div>

      <div style={{ backgroundColor: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(5px)", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${COLORS.border}` }}>
        <div>
          <h1 style={{ margin: 0, color: COLORS.primaryText, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Mysore Cafe</h1>
          <span style={{ fontSize: "12px", color: COLORS.secondaryText, fontWeight: "600" }}>Table {tableNumber}</span>
        </div>
        <button onClick={callWaiter} disabled={waiterCalled} style={{ backgroundColor: waiterCalled ? "#ECFDF5" : COLORS.accentLight, color: waiterCalled ? COLORS.success : COLORS.accent, border: "none", padding: "8px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
          {waiterCalled ? "✓ Waiter Called" : "🔔 Call Waiter"}
        </button>
      </div>

      <div style={{ maxWidth: "450px", margin: "0 auto", padding: "20px" }}>
        <div style={{ backgroundColor: crowdStatus.bg, border: `1px solid ${crowdStatus.color}40`, padding: "14px 18px", borderRadius: "12px", marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 10px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "24px" }}>👨‍🍳</span>
            <div>
              <span style={{ display: "block", color: crowdStatus.color, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px" }}>Kitchen Traffic</span>
              <strong style={{ color: crowdStatus.color, fontSize: "16px", fontWeight: "900" }}>{crowdStatus.text}</strong>
            </div>
          </div>
          <div style={{ textAlign: "right", backgroundColor: COLORS.white, padding: "8px 14px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.02)" }}>
            <span style={{ display: "block", color: COLORS.secondaryText, fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>Est. Wait</span>
            <strong style={{ color: crowdStatus.color, fontSize: "15px", fontWeight: "900" }}>{crowdStatus.time}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", overflowX: "auto", paddingBottom: "5px" }}>
          {CATEGORIES.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap", backgroundColor: activeTab === tab ? COLORS.primaryText : "rgba(255,255,255,0.7)", color: activeTab === tab ? COLORS.white : COLORS.secondaryText }}>{tab}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", backgroundColor: "rgba(255,255,255,0.9)", padding: "5px", borderRadius: "8px", border: `1px solid ${COLORS.border}` }}>
          {["All", "Veg", "Non-Veg"].map(filter => (
            <button key={filter} onClick={() => setDietFilter(filter)} style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "none", backgroundColor: dietFilter === filter ? COLORS.background : "transparent", color: dietFilter === filter ? COLORS.primaryText : COLORS.secondaryText, fontWeight: "700", cursor: "pointer", transition: "0.2s" }}>{filter}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {filteredMenu.length === 0 ? (
            <div style={{ textAlign: "center", color: COLORS.secondaryText, padding: "30px 0", fontWeight: "bold" }}>No {dietFilter} items found.</div>
          ) : (
            filteredMenu.map((item) => {
              const isAvailable = !outOfStock.includes(item.id);
              const qtyInCart = cart.find(c => c.id === item.id)?.qty || 0;

              return (
                <div key={item.id} style={{ backgroundColor: COLORS.white, padding: "18px", borderRadius: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 15px rgba(0,0,0,0.04)", opacity: isAvailable ? 1 : 0.6 }}>
                  <div style={{ flex: 1, paddingRight: "15px" }}>
                    <DietBadge isVeg={item.isVeg} />
                    <h4 style={{ margin: "4px 0", color: COLORS.primaryText, fontSize: "17px", fontWeight: "800" }}>{item.name}</h4>
                    <strong style={{ display: "block", color: COLORS.primaryText, fontSize: "15px", marginBottom: "6px" }}>₹{item.price}</strong>
                    <p style={{ margin: 0, color: COLORS.secondaryText, fontSize: "13px", lineHeight: "1.4" }}>{item.desc}</p>
                  </div>
                  <div style={{ width: "90px", flexShrink: 0 }}>
                    {isAvailable ? (
                      qtyInCart > 0 ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.accentLight, border: `1px solid ${COLORS.accent}`, borderRadius: "8px", padding: "6px 8px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                          <button onClick={() => removeFromCart(item.id)} style={{ backgroundColor: "transparent", color: COLORS.accent, border: "none", fontSize: "18px", fontWeight: "900", cursor: "pointer", width: "20px", display: "flex", justifyContent: "center" }}>-</button>
                          <span style={{ color: COLORS.accent, fontWeight: "800", fontSize: "14px" }}>{qtyInCart}</span>
                          <button onClick={() => addToCart(item)} style={{ backgroundColor: "transparent", color: COLORS.accent, border: "none", fontSize: "18px", fontWeight: "900", cursor: "pointer", width: "20px", display: "flex", justifyContent: "center" }}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item)} style={{ width: "100%", backgroundColor: COLORS.white, color: COLORS.accent, border: `1px solid ${COLORS.border}`, padding: "8px 0", borderRadius: "8px", fontSize: "14px", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                          ADD
                        </button>
                      )
                    ) : (
                      <div style={{ width: "100%", backgroundColor: "#F3F4F6", color: "#9CA3AF", textAlign: "center", padding: "8px 0", borderRadius: "8px", fontSize: "12px", fontWeight: "800", border: `1px solid ${COLORS.border}` }}>Sold Out</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", width: "90%", maxWidth: "450px", display: "flex", gap: "10px", zIndex: 100 }}>
        {tableOrders.length > 0 && cart.length === 0 && (
          <button onClick={() => setShowBill(true)} style={{ width: "100%", backgroundColor: COLORS.primaryText, color: "white", padding: "16px", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            View Final Bill (₹{calculateGrandTotal()})
          </button>
        )}
        {cart.length > 0 && (
          <button onClick={() => setIsCartOpen(true)} style={{ width: "100%", backgroundColor: COLORS.success, color: "white", padding: "16px", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "700", display: "flex", justifyContent: "space-between", cursor: "pointer", boxShadow: "0 10px 25px rgba(16, 185, 129, 0.3)" }}>
            <span>{cart.reduce((total, item) => total + item.qty, 0)} Items | ₹{calculateCartTotal()}</span>
            <span>View Cart →</span>
          </button>
        )}
      </div>

      {isCartOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: COLORS.background, zIndex: 200, overflowY: "auto", paddingBottom: "100px" }}>
          <div style={{ backgroundColor: COLORS.white, padding: "15px 20px", display: "flex", alignItems: "center", borderBottom: `1px solid ${COLORS.border}`, position: "sticky", top: 0 }}>
            <button onClick={() => setIsCartOpen(false)} style={{ backgroundColor: "transparent", border: "none", fontSize: "24px", cursor: "pointer", marginRight: "15px" }}>←</button>
            <h2 style={{ margin: 0, color: COLORS.primaryText, fontSize: "20px", fontWeight: "800" }}>Review Order</h2>
          </div>
          <div style={{ maxWidth: "450px", margin: "0 auto", padding: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "25px" }}>
              {cart.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: 0, color: COLORS.primaryText, fontSize: "16px", fontWeight: "700" }}>{item.name}</h4>
                    <span style={{ color: COLORS.secondaryText, fontSize: "14px", fontWeight: "600" }}>₹{item.price * item.qty}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", backgroundColor: COLORS.accentLight, border: `1px solid ${COLORS.accent}`, borderRadius: "8px", padding: "4px 8px" }}>
                    <button onClick={() => removeFromCart(item.id)} style={{ backgroundColor: "transparent", color: COLORS.accent, border: "none", fontSize: "18px", fontWeight: "900", cursor: "pointer", padding: "0 10px" }}>-</button>
                    <span style={{ fontWeight: "800", color: COLORS.accent, width: "20px", textAlign: "center" }}>{item.qty}</span>
                    <button onClick={() => addToCart(item)} style={{ backgroundColor: "transparent", color: COLORS.accent, border: "none", fontSize: "18px", fontWeight: "900", cursor: "pointer", padding: "0 10px" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <textarea value={cookingInstructions} onChange={(e) => setCookingInstructions(e.target.value)} placeholder="Chef Instructions (e.g., extra spicy)" style={{ width: "100%", boxSizing: "border-box", padding: "15px", borderRadius: "12px", border: `1px solid ${COLORS.border}`, minHeight: "80px", marginBottom: "20px", fontFamily: "inherit", resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px dashed ${COLORS.border}`, paddingTop: "20px", marginBottom: "40px" }}>
              <h3 style={{ margin: "0", fontSize: "18px", fontWeight: "800" }}>Total to Pay</h3>
              <h3 style={{ margin: "0", color: COLORS.success, fontSize: "18px", fontWeight: "900" }}>₹{calculateCartTotal()}</h3>
            </div>
            
            <button 
              onClick={placeOrder} 
              disabled={isSubmitting || cart.length === 0} 
              style={{ 
                width: "100%", 
                backgroundColor: (isSubmitting || cart.length === 0) ? "#9CA3AF" : COLORS.primaryText, 
                color: "white", 
                padding: "18px", 
                border: "none", 
                borderRadius: "12px", 
                fontSize: "16px", 
                fontWeight: "800", 
                cursor: (isSubmitting || cart.length === 0) ? "not-allowed" : "pointer", 
                boxShadow: "0 10px 20px rgba(0,0,0,0.1)" 
              }}
            >
              {isSubmitting ? "Sending to Kitchen..." : "Place Order"}
            </button>
            
          </div>
        </div>
      )}
    </div>
  );
}