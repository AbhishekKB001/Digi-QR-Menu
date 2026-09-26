import { signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, getDoc, updateDoc } from "firebase/firestore";
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
  background: "#F4F6F9", primaryText: "#1C1C1C", secondaryText: "#666666",
  blinkitYellow: "#F8CB46", blinkitGreen: "#0C831F", white: "#FFFFFF", border: "#E8E8E8"
};

const DietBadge = ({ isVeg }) => (
  <div style={{ border: `1px solid ${isVeg ? '#0C831F' : '#E23744'}`, width: "12px", height: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "2px", marginBottom: "6px" }}>
    <div style={{ backgroundColor: isVeg ? '#0C831F' : '#E23744', borderRadius: "50%", width: "6px", height: "6px" }} />
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
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isTableActive, setIsTableActive] = useState(false);
  const [isCheckingTable, setIsCheckingTable] = useState(true);
  const [isLockedByOther, setIsLockedByOther] = useState(false); 
  
  const [hasScannedToken, setHasScannedToken] = useState(false);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [outOfStock, setOutOfStock] = useState([]);
  const [tableOrders, setTableOrders] = useState([]); 
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const urlCheck = new URL(window.location.href);
    if (urlCheck.searchParams.get("portal") !== "admin") {
      signInAnonymously(auth).catch((error) => {
        alert("MOBILE ERROR (Auth): " + error.code + " | " + error.message);
      });
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthReady(true);
        const url = new URL(window.location.href);
        if (url.searchParams.get("portal") === "admin") {
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
        window.history.replaceState({}, document.title, "/Digi-QR-Menu/?portal=admin");
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
              
              setHasScannedToken(true); 

              const oldTable = localStorage.getItem("customer_table_session");
              if (oldTable && parseInt(oldTable) !== data.table_number) {
                 localStorage.removeItem("meal_session_id");
              }
              localStorage.setItem("customer_table_session", data.table_number);
              setTableNumber(data.table_number); 
              
              window.history.replaceState({}, document.title, "/Digi-QR-Menu/");          
             }
          } else {
             alert("MOBILE ERROR: Invalid QR token or Table does not exist in DB.");
          }
        } catch (error) {
          alert("MOBILE ERROR (Database): " + error.code + " | " + error.message);
        }
      } else {
        const existingSession = localStorage.getItem("customer_table_session");
        if (existingSession) setTableNumber(existingSession);
      }
    };

    validateRouting();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!tableNumber || !isAuthReady || !auth.currentUser) return; 
  
    const tableRef = doc(db, "tables", tableNumber.toString());
  
    const unsubTable = onSnapshot(tableRef, async (docSnap) => {
      if (docSnap.exists() && docSnap.data().is_active === true) {
        const data = docSnap.data();
        const myUid = auth.currentUser.uid;
        
        setCart(data.shared_cart || []);

        if (hasScannedToken) {
          if (data.locked_by !== myUid) {
            try { await updateDoc(tableRef, { locked_by: myUid }); } catch (err) {}
          }
          setIsLockedByOther(false);
          setIsTableActive(true);
          setHasScannedToken(false);
        } 
        else {
          if (data.locked_by && data.locked_by !== myUid) {
            setIsLockedByOther(true);
            setIsTableActive(false);
          } 
          else if (!data.locked_by) {
            try { await updateDoc(tableRef, { locked_by: myUid }); } catch (err) {}
            setIsLockedByOther(false);
            setIsTableActive(true);
          } 
          else {
            setIsLockedByOther(false);
            setIsTableActive(true);
          }
        }

      } else {
        setIsTableActive(false);
        setCart([]);
      }
      setIsCheckingTable(false);
    });
    
    return () => unsubTable();
  }, [tableNumber, isAuthReady, hasScannedToken]);

  useEffect(() => {
    if (!tableNumber || !isAuthReady) return;

    const qOrders = query(collection(db, "orders"), where("restaurant_id", "==", "mysuru_cafe"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const myTableOrders = [];
      const todayString = new Date().toDateString();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const orderDateObj = data.created_at ? data.created_at.toDate() : new Date();

        if (data.status === "rejected" && data.meal_session_id === localStorage.getItem("meal_session_id")) {
          localStorage.removeItem("customer_table_session");
          localStorage.removeItem("meal_session_id");
          window.location.href = "/Digi-QR-Menu/";
        }

        if (data.table_number === parseInt(tableNumber) && orderDateObj.toDateString() === todayString && data.status !== "paid" && data.status !== "rejected") {
          myTableOrders.push({ id: doc.id, ...data });
        }
      });

      setTableOrders(myTableOrders);
    });

    const unsubMenu = onSnapshot(doc(db, "settings", "mysuru_cafe"), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().outOfStock)) {
        setOutOfStock(docSnap.data().outOfStock);
      } else {
        setOutOfStock([]);
      }
    });

    return () => { unsubOrders(); unsubMenu(); };
  }, [tableNumber, isAuthReady]);

  useEffect(() => {
    if (showBill && tableOrders.length === 0) {
      setShowBill(false);
      setShowFeedback(true);
    }
  }, [tableOrders, showBill]);

  const releaseMyLock = async () => {
    const confirmRelease = window.confirm("Are you sure you want to release the menu? You will have to scan the QR code again to order.");
    if (confirmRelease) {
      try {
        await updateDoc(doc(db, "tables", tableNumber.toString()), { 
          locked_by: null,
          shared_cart: []
        });
        localStorage.removeItem("customer_table_session");
        window.location.href = "/Digi-QR-Menu/";
      } catch (err) {
        alert("Failed to release table.");
      }
    }
  };

  const callWaiter = async () => {
    setWaiterCalled(true);
    await addDoc(collection(db, "alerts"), { restaurant_id: "mysuru_cafe", table_number: parseInt(tableNumber), type: "waiter", status: "active", created_at: serverTimestamp() });
    setTimeout(() => setWaiterCalled(false), 5000); 
  };

  const requestBill = async () => {
    try {
      setBillRequested(true);
      await addDoc(collection(db, "alerts"), { restaurant_id: "mysuru_cafe", table_number: parseInt(tableNumber), type: "bill", status: "active", created_at: serverTimestamp() });
      alert("We are fetching your bill! A waiter will be there shortly. 🛎️");
    } catch (error) {
      setBillRequested(false);
    }
  };

  const submitFeedback = async (rating) => {
    await addDoc(collection(db, "feedbacks"), { restaurant_id: "mysuru_cafe", table_number: parseInt(tableNumber), rating: rating, created_at: serverTimestamp() });
    setFeedbackSubmitted(true);
    localStorage.removeItem("customer_table_session");
    localStorage.removeItem("meal_session_id");
    setTimeout(() => { window.location.href = "/Digi-QR-Menu/"; }, 3000);
  };

  const addToCart = async (item) => {
    if(!tableNumber) return;
    const existing = cart.find(c => c.id === item.id);
    const newCart = existing ? cart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c) : [...cart, { ...item, qty: 1 }];
    await updateDoc(doc(db, "tables", tableNumber.toString()), { shared_cart: newCart });
  };

  const removeFromCart = async (id) => {
    if(!tableNumber) return;
    const existing = cart.find(c => c.id === id);
    const newCart = existing.qty > 1 ? cart.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c) : cart.filter(item => item.id !== id);
    await updateDoc(doc(db, "tables", tableNumber.toString()), { shared_cart: newCart });
  };
  
  const calculateCartTotal = () => cart.reduce((total, item) => total + (item.price * item.qty), 0);
  const calculateGrandTotal = () => tableOrders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + (item.price * item.qty), 0), 0);
  const sanitizeInput = (str) => { if (!str) return ""; return str.replace(/[<>]/g, ""); };

  const placeOrder = async () => {
    if (cart.length === 0 || isSubmitting) return; 
    setIsSubmitting(true);
    
    try {
      const safeInstructions = sanitizeInput(cookingInstructions);
      let mealSessionId = localStorage.getItem("meal_session_id");
      if (!mealSessionId) {
        mealSessionId = "session_" + Date.now().toString(36);
        localStorage.setItem("meal_session_id", mealSessionId);
      }
      const orderTotal = cart.reduce((total, item) => total + (item.price * item.qty), 0);
  
      await addDoc(collection(db, "orders"), {
        customer_uid: auth.currentUser.uid,
        total_price: orderTotal,
        restaurant_id: "mysuru_cafe", 
        table_number: parseInt(tableNumber), 
        items: cart, 
        special_instructions: safeInstructions, 
        payment_method: "Pay at Counter", 
        status: "pending", 
        meal_session_id: mealSessionId, 
        created_at: serverTimestamp()
      });
      
      await updateDoc(doc(db, "tables", tableNumber.toString()), { shared_cart: [] });

      setOrderSent(true); 
      setIsCartOpen(false); 
      setCookingInstructions("");
      
    } catch (error) { 
      alert("Something went wrong. Please try again.");
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(""); setIsSubmitting(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (userCredential.user.email === "owner@mysurucafe.com") setView("owner");
      else if (userCredential.user.email === "kitchen@mysurucafe.com") setView("kitchen");
    } catch (error) {
      setLoginError("Invalid credentials.");
    } finally { setIsSubmitting(false); }
  };

  if (view === "login") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: COLORS.background, fontFamily: "'Inter', sans-serif" }}>
        <form style={{ backgroundColor: COLORS.white, padding: "40px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", width: "90%", maxWidth: "380px" }} onSubmit={handleLogin}>
          <div style={{ textAlign: "center", marginBottom: "30px" }}>
            <h2 style={{ margin: "0 0 5px 0", color: COLORS.primaryText, fontSize: "24px", fontWeight: "800" }}>Staff Portal</h2>
          </div>
          {loginError && (<div style={{ color: "#DC2626", fontSize: "14px", marginBottom: "20px", textAlign: "center", fontWeight: "600" }}>{loginError}</div>)}
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", padding: "14px", marginBottom: "15px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontSize: "15px", fontWeight: "500", backgroundColor: "#050606", outline: "none" }} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: "14px", marginBottom: "25px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontSize: "15px", fontWeight: "500", backgroundColor: "#050606", outline: "none" }} />
          <button type="submit" disabled={isSubmitting} style={{ width: "100%", backgroundColor: COLORS.blinkitGreen, color: "white", padding: "16px", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: "800", cursor: "pointer" }}>
            {isSubmitting ? "Verifying..." : "Login"}
          </button>
        </form>
      </div>
    );
  }
  
  if (view === "kitchen") return <Kitchen />;
  if (view === "owner") return <Owner />;

  if (!tableNumber && view === "customer") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: COLORS.background, fontFamily: "'Inter', sans-serif" }}>
        <div className="premium-nfc-wrapper">
          <div className="premium-nfc-card">
            <h1 className="restaurant-title">Mysuru Cafe</h1>
            <div className="icon-stage">
              <div className="pulse-ring"></div>
              <div className="pulse-ring delay"></div>
              <div className="icon-circle">🛜📱</div>
            </div>
            <h2 className="nfc-heading">Tap NFC Tag</h2>
            <p className="nfc-subtitle">Hold your phone near the NFC sticker on your table to view the menu.</p>
            <div className="nfc-divider"></div>
            <p className="nfc-fallback">Camera not picking it up? <br/>Scan the QR code instead.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isCheckingTable && tableNumber) {
    return (
      <div className="premium-nfc-wrapper">
        <div className="premium-nfc-card">
          <h1 className="restaurant-title">Mysuru Cafe</h1>
          <div className="icon-stage">
            <div className="pulse-ring"></div>
            <div className="pulse-ring delay"></div>
            <div className="icon-circle">🛜📱</div>
          </div>
          <h2 className="nfc-heading">Connecting...</h2>
          <p className="nfc-subtitle">Connecting to Table {tableNumber}. Please hold your phone near the NFC sticker to view the menu.</p>
          <div className="nfc-divider"></div>
          <p className="nfc-fallback">Camera not picking it up? <br/>Scan the QR code instead.</p>
        </div>
      </div>
    );
  }

  // 🚨 THE NEW INACTIVE SCREEN WITH THE TAKE BACK BUTTON 🚨
  if (isLockedByOther && view === "customer") {
    return (
      <div className="premium-nfc-wrapper">
        <div className="premium-nfc-card" style={{ paddingBottom: "25px" }}>
          <h1 className="restaurant-title">Mysuru Cafe</h1>
          <div className="icon-circle" style={{ margin: "0 auto 1.5rem" }}>🔄</div>
          <h2 className="nfc-heading">Menu is with a Friend</h2>
          <p className="nfc-subtitle">
            Another phone at your table has taken control of the menu to place an order.
          </p>
          <div className="nfc-divider"></div>
          <p className="nfc-fallback" style={{ marginBottom: "15px" }}>
            <strong>Want to order instead?</strong><br/>
            Tap the NFC tag again, or click below to take the menu back!
          </p>
          <button 
            onClick={async () => {
              try {
                // Instantly steal the lock back without scanning!
                await updateDoc(doc(db, "tables", tableNumber.toString()), { 
                  locked_by: auth.currentUser.uid 
                });
              } catch(e) {
                alert("Could not take over table.");
              }
            }} 
            style={{ width: "100%", padding: "14px", backgroundColor: COLORS.blinkitGreen, color: "white", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 10px rgba(12, 131, 31, 0.2)" }}
          >
            🔄 Take Menu Back
          </button>
        </div>
      </div>
    );
  }

  if (showFeedback) {
    return (
       <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: COLORS.background, textAlign: "center", padding: "20px", fontFamily: "'Inter', sans-serif" }}>
          {!feedbackSubmitted ? (
            <div style={{ backgroundColor: COLORS.white, padding: "40px 20px", borderRadius: "12px", width: "100%", maxWidth: "400px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <h2 style={{ color: COLORS.primaryText, marginBottom: "20px", fontSize: "24px", fontWeight: "800" }}>Rate your food</h2>
              <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => submitFeedback(star)} style={{ background: "none", border: "none", fontSize: "40px", cursor: "pointer" }}>⭐</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <h2 style={{ margin: 0, color: COLORS.primaryText, fontWeight: "900", fontSize: "28px" }}>Thank You!</h2>
              <p style={{ color: COLORS.secondaryText, marginTop: "10px", fontWeight: "600" }}>Have a great day.</p>
            </div>
          )}
        </div>
    );
  }

  if (!isTableActive && tableNumber && view === "customer") {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: COLORS.background, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <h1 style={{ color: COLORS.primaryText, fontSize: "24px", margin: "0 0 10px 0", fontWeight: "900" }}>Table Locked</h1>
        <p style={{ color: COLORS.secondaryText }}>This table is currently locked by staff.</p>
      </div>
    );
  }

  if (orderSent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: COLORS.background, textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <h2 style={{ color: COLORS.primaryText, fontSize: "26px", fontWeight: "900" }}>Order Received</h2>
        <p style={{ color: COLORS.secondaryText, marginBottom: "40px", fontWeight: "500" }}>Kitchen is preparing your food.</p>
        <button onClick={() => setOrderSent(false)} style={{ padding: "14px 30px", backgroundColor: COLORS.blinkitYellow, color: COLORS.primaryText, border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: "800", cursor: "pointer" }}>
          Back to Menu
        </button>
      </div>
    );
  }

 if (showBill) {
    return (
      <div style={{ background: "linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)", minHeight: "100vh", padding: "20px", fontFamily: "'Inter', sans-serif" }}>
        <button onClick={() => setShowBill(false)} style={{ backgroundColor: "transparent", border: "none", fontSize: "24px", cursor: "pointer", color: COLORS.primaryText, marginBottom: "15px", fontWeight: "900" }}>←</button>
        
        <div style={{ backgroundColor: "#1A1A1A", padding: "25px", borderRadius: "16px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)", maxWidth: "400px", margin: "0 auto" }}>
          <h2 style={{ color: "#FFFFFF", margin: "0 0 5px 0", fontWeight: "900", fontSize: "24px", letterSpacing: "-0.5px" }}>Mysore Cafe</h2>
          <p style={{ color: "#A3A3A3", margin: "0 0 20px 0", fontWeight: "600", fontSize: "14px" }}>Table {tableNumber} • Digital Receipt</p>
          <hr style={{ borderTop: `1px dashed #404040`, marginBottom: "20px" }} />
          <div style={{ textAlign: "left", marginBottom: "20px" }}>
            {tableOrders.map((order) => (
              <div key={order.id} style={{ marginBottom: "15px" }}>
                {order.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", color: "#FFFFFF", fontWeight: "600", fontSize: "15px" }}>
                    <span>{item.qty} x {item.name}</span>
                    <span>₹{item.price * item.qty}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          
          <hr style={{ borderTop: `1px dashed #404040`, marginBottom: "20px" }} />
          
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "22px", fontWeight: "900", color: "#FFFFFF", marginBottom: "20px" }}>
            <span>Total to pay</span>
            <span style={{ color: COLORS.blinkitGreen }}>₹{calculateGrandTotal()}</span>
          </div>
          
          <button 
            onClick={requestBill} 
            disabled={billRequested}
            style={{ 
              width: "100%", padding: "16px", 
              backgroundColor: billRequested ? "#4B5563" : "#EA580C",
              color: "white", border: "none", borderRadius: "12px", fontSize: "16px", 
              fontWeight: "bold", cursor: billRequested ? "not-allowed" : "pointer", 
              boxShadow: billRequested ? "none" : "0 4px 15px rgba(234, 88, 12, 0.3)",
              transition: "0.2s"
            }}>
            {billRequested ? "✓ Waiter Notified" : "🛎️ Ready to Pay (Call Waiter)"}
          </button>
        </div>
      </div>
    );
  }

  const filteredMenu = MENU_ITEMS.filter(item => {
    const categoryMatch = item.category === activeTab;
    const dietMatch = dietFilter === "All" ? true : (dietFilter === "Veg" ? item.isVeg : !item.isVeg);
    return categoryMatch && dietMatch;
  });

  return (
    <div style={{ background: "linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)", minHeight: "100vh", paddingBottom: "100px", fontFamily: "'Inter', sans-serif" }}>
      
      <div style={{ backgroundColor: COLORS.blinkitYellow, padding: "20px 20px 15px 20px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "15px" }}>
          <div>
            <h1 style={{ margin: 0, color: COLORS.primaryText, fontSize: "24px", fontWeight: "900", letterSpacing: "-0.5px" }}>Mysore Cafe</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: COLORS.blinkitGreen }}></div>
              <span style={{ fontSize: "14px", color: COLORS.primaryText, fontWeight: "700" }}>Table {tableNumber}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={callWaiter} disabled={waiterCalled} style={{ backgroundColor: "white", color: COLORS.primaryText, border: "none", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "800", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
              {waiterCalled ? "✓ Waiter Notified" : "Call Waiter"}
            </button>
            <button onClick={releaseMyLock} style={{ backgroundColor: "#1C1C1C", color: "white", border: "none", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "800", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
              🚪 Leave Table
            </button>
          </div>
        </div>
        
        <div className="hide-scroll" style={{ display: "flex", gap: "10px", overflowX: "auto" }}>
          {CATEGORIES.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "14px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap", backgroundColor: activeTab === tab ? COLORS.primaryText : "white", color: activeTab === tab ? "white" : COLORS.primaryText, transition: "0.1s" }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "15px" }}>
        
        <div style={{ backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", padding: "10px", borderRadius: "8px", marginBottom: "15px", fontSize: "12px", color: "#DC2626", textAlign: "center", fontWeight: "600" }}>
          ⚠️ Do not close your browser until you are finished ordering.
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {["All", "Veg", "Non-Veg"].map(filter => (
            <button key={filter} onClick={() => setDietFilter(filter)} style={{ padding: "6px 14px", borderRadius: "6px", border: `1px solid ${dietFilter === filter ? COLORS.primaryText : COLORS.border}`, backgroundColor: dietFilter === filter ? "#E8E8E8" : "white", color: COLORS.primaryText, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
              {filter}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", backgroundColor: "white", padding: "15px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {filteredMenu.length === 0 ? (
            <div style={{ textAlign: "center", color: COLORS.secondaryText, padding: "20px", fontWeight: "600", fontSize: "14px" }}>No items found.</div>
          ) : (
            filteredMenu.map((item, index) => {
              const isAvailable = !outOfStock.includes(item.id);
              const qtyInCart = cart.find(c => c.id === item.id)?.qty || 0;

              return (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "15px", borderBottom: index === filteredMenu.length - 1 ? "none" : `1px solid ${COLORS.border}`, opacity: isAvailable ? 1 : 0.5, paddingTop: index === 0 ? "0" : "15px" }}>
                  <div style={{ flex: 1, paddingRight: "15px" }}>
                    <DietBadge isVeg={item.isVeg} />
                    <h4 style={{ margin: "2px 0 4px 0", color: COLORS.primaryText, fontSize: "15px", fontWeight: "700" }}>{item.name}</h4>
                    <p style={{ margin: "0 0 8px 0", color: COLORS.secondaryText, fontSize: "13px", lineHeight: "1.4" }}>{item.desc}</p>
                    <strong style={{ color: COLORS.primaryText, fontSize: "15px", fontWeight: "800" }}>₹{item.price}</strong>
                  </div>
                  
                  <div style={{ width: "85px", flexShrink: 0, marginTop: "10px" }}>
                    {isAvailable ? (
                      qtyInCart > 0 ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F3F9F5", border: `1px solid ${COLORS.blinkitGreen}`, borderRadius: "6px", padding: "6px 8px" }}>
                          <button onClick={() => removeFromCart(item.id)} style={{ backgroundColor: "transparent", color: COLORS.blinkitGreen, border: "none", fontSize: "16px", fontWeight: "900", cursor: "pointer", padding: "0 5px" }}>-</button>
                          <span style={{ color: COLORS.blinkitGreen, fontWeight: "800", fontSize: "14px" }}>{qtyInCart}</span>
                          <button onClick={() => addToCart(item)} style={{ backgroundColor: "transparent", color: COLORS.blinkitGreen, border: "none", fontSize: "16px", fontWeight: "900", cursor: "pointer", padding: "0 5px" }}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item)} style={{ width: "100%", backgroundColor: "#F3F9F5", color: COLORS.blinkitGreen, border: `1px solid ${COLORS.blinkitGreen}`, padding: "8px 0", borderRadius: "6px", fontSize: "13px", fontWeight: "800", cursor: "pointer", textTransform: "uppercase" }}>
                          ADD
                        </button>
                      )
                    ) : (
                      <div style={{ width: "100%", backgroundColor: "#F4F6F9", color: "#9CA3AF", textAlign: "center", padding: "8px 0", borderRadius: "6px", fontSize: "12px", fontWeight: "700" }}>Sold Out</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, width: "100%", zIndex: 100, backgroundColor: COLORS.background }}>
        <div style={{ maxWidth: "480px", margin: "0 auto", padding: "10px 15px 15px 15px" }}>
          {tableOrders.length > 0 && cart.length === 0 && (
            <button onClick={() => setShowBill(true)} style={{ width: "100%", backgroundColor: COLORS.primaryText, color: "white", padding: "16px", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "800", cursor: "pointer" }}>
              View Bill (₹{calculateGrandTotal()})
            </button>
          )}
          {cart.length > 0 && (
            <button onClick={() => setIsCartOpen(true)} style={{ width: "100%", backgroundColor: COLORS.blinkitGreen, color: "white", padding: "16px 20px", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "800", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", opacity: 0.9 }}>{cart.reduce((total, item) => total + item.qty, 0)} items</span>
                <span>₹{calculateCartTotal()}</span>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>View Cart <span>▶</span></span>
            </button>
          )}
        </div>
      </div>

      {isCartOpen && (
        <div style={{ 
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
          background: "linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)",
          zIndex: 200, overflowY: "auto", paddingBottom: "120px" 
        }}>
          <div style={{ backgroundColor: "white", padding: "15px 20px", display: "flex", alignItems: "center", position: "sticky", top: 0, borderBottom: `1px solid ${COLORS.border}` }}>
            <button onClick={() => setIsCartOpen(false)} style={{ backgroundColor: "transparent", border: "none", fontSize: "24px", cursor: "pointer", marginRight: "15px", color: COLORS.primaryText, fontWeight: "900" }}>←</button>
            <h2 style={{ margin: 0, color: COLORS.primaryText, fontSize: "18px", fontWeight: "800" }}>Review Order</h2>
          </div>
          <div style={{ maxWidth: "480px", margin: "0 auto", padding: "15px" }}>
            
            <div style={{ backgroundColor: "white", padding: "15px", borderRadius: "12px", marginBottom: "15px" }}>
              <h3 style={{ margin: "0 0 15px 0", fontSize: "15px", fontWeight: "800", color: COLORS.primaryText }}>Items added</h3>
              {cart.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                  <div>
                    <h4 style={{ margin: 0, color: COLORS.primaryText, fontSize: "14px", fontWeight: "700" }}>{item.name}</h4>
                    <span style={{ color: COLORS.secondaryText, fontSize: "14px", fontWeight: "600" }}>₹{item.price * item.qty}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", backgroundColor: "#F3F9F5", border: `1px solid ${COLORS.blinkitGreen}`, borderRadius: "6px", padding: "4px 6px" }}>
                    <button onClick={() => removeFromCart(item.id)} style={{ backgroundColor: "transparent", color: COLORS.blinkitGreen, border: "none", fontSize: "16px", fontWeight: "900", cursor: "pointer", padding: "0 10px" }}>-</button>
                    <span style={{ fontWeight: "800", color: COLORS.blinkitGreen, width: "20px", textAlign: "center", fontSize: "13px" }}>{item.qty}</span>
                    <button onClick={() => addToCart(item)} style={{ backgroundColor: "transparent", color: COLORS.blinkitGreen, border: "none", fontSize: "16px", fontWeight: "900", cursor: "pointer", padding: "0 10px" }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: "white", padding: "15px", borderRadius: "12px", marginBottom: "15px" }}>
              <textarea 
                value={cookingInstructions} 
                onChange={(e) => setCookingInstructions(e.target.value)} 
                placeholder="Any cooking instructions? (e.g. less spicy)" 
                style={{ 
                  width: "100%", boxSizing: "border-box", padding: "16px", borderRadius: "8px", 
                  border: "1px solid #333333", backgroundColor: "#1A1A1A", color: "#FFFFFF", 
                  minHeight: "80px", fontFamily: "inherit", fontSize: "14px", fontWeight: "500", 
                  outline: "none", resize: "none" 
                }} 
              />
            </div>
            
            <div style={{ backgroundColor: "white", padding: "15px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
              <h3 style={{ margin: "0", fontSize: "16px", fontWeight: "800", color: COLORS.primaryText }}>Grand Total</h3>
              <h3 style={{ margin: "0", color: COLORS.primaryText, fontSize: "18px", fontWeight: "900" }}>₹{calculateCartTotal()}</h3>
            </div>
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, width: "100%", boxSizing: "border-box", backgroundColor: "white", padding: "15px", borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ maxWidth: "480px", margin: "0 auto", boxSizing: "border-box" }}>
              <button onClick={placeOrder} disabled={isSubmitting || cart.length === 0} style={{ width: "100%", boxSizing: "border-box", backgroundColor: COLORS.blinkitGreen, color: "white", padding: "16px", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: "800", cursor: "pointer" }}>
                {isSubmitting ? "Sending..." : "Place Order at Table"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}