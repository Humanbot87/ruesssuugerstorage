import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Trash2, PlusCircle, X, Loader2, 
  AlertCircle, LogOut, KeyRound, ShieldCheck, FileSpreadsheet, 
  Users, ChevronRight, UserPlus, ShieldAlert, ImageIcon, Camera, AlertTriangle, History,
  ArrowRightLeft, RotateCcw, ShoppingCart, Info, Sparkles, TrendingUp
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, getDoc, setDoc, query, where, serverTimestamp, arrayUnion, getDocs
} from 'firebase/firestore';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile 
} from 'firebase/auth';

// --- Firebase Konfiguration ---
const firebaseConfig = {
  apiKey: "AIzaSyCkkwwicLEYX2EcdBpMtuyXRSZB35AaR0o",
  authDomain: "ruesssuugerstorage.firebaseapp.com",
  databaseURL: "https://ruesssuugerstorage-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ruesssuugerstorage",
  storageBucket: "ruesssuugerstorage.firebasestorage.app",
  messagingSenderId: "268045537391",
  appId: "1:268045537391:web:3b30913efcf97ee6fe3d9a"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// appId v2 für saubere Datenstruktur
const appId = "ruess-suuger-storage-v2";

const apiKey = ""; // API Key wird automatisch vom System injiziert

// --- KI Helper Funktion mit Exponential Backoff ---
async function callAI(url, payload) {
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
  }
  throw new Error("KI Schnittstelle nicht erreichbar");
}

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [members, setMembers] = useState([]); 
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiRecommendationLoading, setAiRecommendationLoading] = useState(null); 
  const [authStep, setAuthStep] = useState('identify'); 
  const [authForm, setAuthForm] = useState({ firstName: '', lastName: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [isAuthChecking, setIsAuthChecking] = useState(false);
  const [targetMember, setTargetMember] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterType, setFilterType] = useState('All'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const fileInputRef = useRef(null);

  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 5, image: null
  });

  const [newMemberName, setNewMemberName] = useState({ first: '', last: '' });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const userDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', u.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        } else if (u.displayName === 'Raphael Drago') {
          setUserData({ role: 'admin', fullName: 'Raphael Drago' });
        }
        setUser(u);
      } else {
        setUser(null);
        setUserData(null);
        setAuthStep('identify');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;
    const invUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const memUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { invUnsub(); memUnsub(); };
  }, [user]);

  const getInternalEmail = (name) => `${name.toLowerCase().trim().replace(/\s+/g, '.')}@rs.v2`;

  const handleIdentify = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthChecking(true);
    const fullName = `${authForm.firstName.trim()} ${authForm.lastName.trim()}`;
    
    try {
      const memberQuery = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'),
        where("fullName", "==", fullName)
      );
      const querySnapshot = await getDocs(memberQuery);

      if (!querySnapshot.empty) {
        const memberData = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
        setTargetMember(memberData);
        if (memberData.isInitialized) {
          setAuthStep('login'); 
        } else {
          setAuthStep('setup_password');
        }
      } else {
        const isMainAdmin = fullName.toLowerCase() === 'raphael drago';
        if (isMainAdmin) {
          setTargetMember({ fullName: 'Raphael Drago', role: 'admin', isInitialized: false });
          setAuthStep('setup_password');
        } else {
          setAuthError("Name nicht auf der Liste. Raphael Drago muss dich zuerst erfassen.");
        }
      }
    } catch (err) {
      console.error("Identify Error:", err);
      setAuthError("Verbindung zum Server fehlgeschlagen.");
    } finally {
      setIsAuthChecking(false);
    }
  };

  const handleAuthAction = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthChecking(true);
    const email = getInternalEmail(targetMember.fullName);
    try {
      if (authStep === 'setup_password') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, authForm.password);
        await updateProfile(userCredential.user, { displayName: targetMember.fullName });
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', userCredential.user.uid), {
          fullName: targetMember.fullName, uid: userCredential.user.uid, role: targetMember.role || 'member',
          isInitialized: true, email: email, createdAt: serverTimestamp()
        });
        if (targetMember.id && targetMember.id !== userCredential.user.uid) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', targetMember.id));
        }
      } else {
        await signInWithEmailAndPassword(auth, email, authForm.password);
      }
    } catch (err) {
      if (err.code === 'auth/wrong-password') {
        setAuthError("Passwort ist nicht korrekt.");
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError("Dieses Konto wurde bereits aktiviert. Bitte logge dich normal ein.");
        setAuthStep('login');
      } else {
        setAuthError("Fehler bei der Anmeldung: " + err.message);
      }
    } finally {
      setIsAuthChecking(false);
    }
  };

  const logMovement = async (itemId, type, diff) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemId);
    const logEntry = {
      user: user.displayName,
      action: type,
      amount: Math.abs(diff),
      timestamp: new Date().toISOString()
    };
    
    let actionText = "";
    if (type === 'ausgeliehen') actionText = `${user.displayName} hat ${logEntry.amount} Stk. ausgeliehen`;
    else if (type === 'zurückgebracht') actionText = `${user.displayName} hat ${logEntry.amount} Stk. zurückgebracht`;
    else actionText = `${user.displayName} hat ${logEntry.amount} Stk. ${type}`;

    await updateDoc(itemRef, {
      updatedBy: user.displayName,
      updatedAt: new Date().toISOString(),
      lastAction: actionText,
      history: arrayUnion(logEntry)
    });
  };

  const updateQty = async (item, delta, specificType = null) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
    let newQty = item.quantity;
    let newBorrowed = item.borrowedQuantity || 0;

    if (specificType === 'ausgeliehen') {
        newQty = Math.max(0, item.quantity - 1);
        newBorrowed += 1;
    } else if (specificType === 'zurückgebracht') {
        newQty += 1;
        newBorrowed = Math.max(0, newBorrowed - 1);
    } else {
        newQty = Math.max(0, item.quantity + delta);
    }

    await updateDoc(itemRef, { quantity: newQty, borrowedQuantity: newBorrowed });
    let type = specificType || (delta > 0 ? 'ausgelegt' : 'entnommen');
    await logMovement(item.id, type, delta === 0 ? 1 : delta);
  };

  const recommendMinStockWithAI = async (item) => {
    setAiRecommendationLoading(item.id);
    try {
      const historyStr = (item.history || [])
        .slice(-10)
        .map(h => `${h.action}: ${h.amount} Stk am ${new Date(h.timestamp).toLocaleDateString()}`)
        .join(', ');

      const prompt = `Analysiere die Nutzungshistorie für den Gegenstand "${item.name}": [${historyStr}]. Aktuelle Mindestmenge ist ${item.minStock}. Empfiehl eine neue optimale Mindestmenge als Zahl basierend auf der Frequenz der Entnahmen. Antworte NUR mit der Zahl und einer sehr kurzen Begründung (max 1 Satz).`;
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const result = await callAI(url, { contents: [{ parts: [{ text: prompt }] }] });
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      
      if (aiText) {
          const match = aiText.match(/\d+/);
          const suggestedNum = match ? parseInt(match[0]) : item.minStock;
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id), {
            aiRecommendedMin: suggestedNum,
            aiReason: aiText
          });
      }
    } catch (e) { console.error("AI Recommendation Error", e); }
    setAiRecommendationLoading(null);
  };

  const generateImageWithAI = async (itemName) => {
    try {
      const promptText = `Ein klares, freigestelltes Produktfoto von ${itemName} auf neutralem, hellem Hintergrund für einen Fasnachts-Verein. Professionell ausgeleuchtet, keine Texte im Bild.`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
      const result = await callAI(url, { 
        instances: { prompt: promptText }, 
        parameters: { sampleCount: 1 } 
      });
      if (result.predictions?.[0]?.bytesBase64Encoded) {
        return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
      }
    } catch (err) {
      console.error("Image generation failed", err);
    }
    return null;
  };

  const analyzeImageWithAI = async (base64Data) => {
    setIsAnalyzing(true);
    const pureBase64 = base64Data.split(',')[1];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const result = await callAI(url, {
        contents: [{ parts: [{ text: "Was ist das? Antworte nur mit dem Namen des Gegenstands (max 3 Wörter)." }, { inlineData: { mimeType: "image/jpeg", data: pureBase64 } }] }]
      });
      const aiName = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (aiName) setNewItem(prev => ({ ...prev, name: aiName }));
    } catch (e) { console.error("AI Error", e); }
    setIsAnalyzing(false);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!user || !newItem.name) return;
    setIsSaving(true);

    const trimmedName = newItem.name.trim();
    const existingItem = items.find(i => i.name.toLowerCase() === trimmedName.toLowerCase());

    try {
      if (existingItem) {
        // Bestehenden Artikel aktualisieren (Addieren)
        const addedQty = parseInt(newItem.quantity);
        const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', existingItem.id);
        
        await updateDoc(itemRef, {
          quantity: existingItem.quantity + addedQty,
          updatedBy: user.displayName,
          updatedAt: new Date().toISOString(),
          lastAction: `${user.displayName} hat ${addedQty} Stk. zum Bestand addiert.`,
          history: arrayUnion({
            user: user.displayName,
            action: 'bestand_erhoeht',
            amount: addedQty,
            timestamp: new Date().toISOString()
          })
        });
      } else {
        // Neuen Artikel anlegen (ggf. mit KI-Bild)
        let finalImage = newItem.image;
        if (!finalImage) {
          finalImage = await generateImageWithAI(trimmedName);
        }

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
          ...newItem,
          name: trimmedName,
          image: finalImage,
          quantity: parseInt(newItem.quantity),
          minStock: parseInt(newItem.minStock),
          borrowedQuantity: 0,
          updatedBy: user.displayName,
          updatedAt: new Date().toISOString(),
          lastAction: `Neu erfasst von ${user.displayName}.`,
          history: [{ user: user.displayName, action: 'erfasst', amount: newItem.quantity, timestamp: new Date().toISOString() }],
          currentStatus: 'verfügbar'
        });
      }
      setIsModalOpen(false);
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 5, image: null });
    } catch (err) {
      console.error("Save error", err);
    } finally {
      setIsSaving(false);
    }
  };

  const exportToExcel = () => {
    const headers = ["Name", "Bestand", "Ausgeliehen", "Lagerort", "Warn-Limit", "Bedarf"];
    const csvContent = [headers.join(";"), ...items.map(i => {
        const bedarf = Math.max(0, i.minStock - i.quantity);
        return [i.name, i.quantity, i.borrowedQuantity || 0, i.location, i.minStock, bedarf].join(";");
    })].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.body.appendChild(document.createElement("a"));
    link.href = URL.createObjectURL(blob);
    link.download = `Inventar_RS_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = filterLocation === 'All' || i.location === filterLocation;
      
      let matchesType = true;
      if (filterType === 'Ausgeliehen') {
        matchesType = (i.borrowedQuantity || 0) > 0;
      } else if (filterType === 'Besorgen') {
        matchesType = i.quantity <= i.minStock;
      }

      return matchesSearch && matchesLocation && matchesType;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchTerm, filterLocation, filterType]);

  const besorgenCount = items.filter(i => i.quantity <= i.minStock).length;
  const ausgeliehenCount = items.filter(i => (i.borrowedQuantity || 0) > 0).length;

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#161616] border border-gray-800 p-8 rounded-[2.5rem] shadow-2xl">
          <div className="text-center mb-8">
             <Package className="mx-auto text-orange-500 mb-4" size={48} />
             <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white">
               <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
             </h1>
             <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2 italic">Cloud-Inventar v2</p>
          </div>
          <form onSubmit={authStep === 'identify' ? handleIdentify : handleAuthAction} className="space-y-4">
            {authStep === 'identify' ? (
              <>
                <input required type="text" placeholder="Vorname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})} />
                <input required type="text" placeholder="Nachname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})} />
              </>
            ) : (
              <div className="space-y-2 animate-in fade-in slide-in-from-right-2">
                <p className="text-xs text-orange-500 font-bold text-center mb-4 uppercase tracking-tighter">Hallo {targetMember.fullName}</p>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-4 text-gray-700" size={18} />
                  <input required autoFocus type="password" placeholder={authStep === 'setup_password' ? "Neues Passwort wählen" : "Passwort eingeben"} className="w-full bg-black border border-orange-500/50 rounded-2xl p-4 pl-12 text-white outline-none" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                </div>
              </div>
            )}
            {authError && <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20"><AlertCircle size={14} /><p>{authError}</p></div>}
            <button type="submit" disabled={isAuthChecking} className="w-full bg-orange-600 p-4 rounded-2xl font-black uppercase text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                {isAuthChecking ? <Loader2 className="animate-spin" size={18} /> : (authStep === 'identify' ? 'Weiter' : (authStep === 'setup_password' ? 'Konto aktivieren' : 'Anmelden'))}
            </button>
            {authStep !== 'identify' && <button type="button" onClick={() => {setAuthStep('identify'); setAuthError('');}} className="w-full text-gray-600 text-[10px] font-bold uppercase hover:text-white transition-colors mt-2">Abbrechen</button>}
          </form>
        </div>
      </div>
    );
  }

  const isUserAdmin = userData?.role === 'admin' || user.displayName === 'Raphael Drago';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans selection:bg-orange-500/30">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex flex-col">
          <h1 className="text-lg font-black uppercase italic tracking-tighter leading-none">
            <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
          </h1>
          <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{user.displayName} {isUserAdmin && '🛡️'}</span>
        </div>
        <div className="flex gap-2">
          {isUserAdmin && <button onClick={() => setIsAdminPanelOpen(true)} className="p-2.5 bg-gray-800 rounded-xl text-orange-500 hover:bg-orange-500 hover:text-white transition-all shadow-lg"><Users size={20}/></button>}
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2.5 rounded-xl text-white shadow-lg active:scale-95 transition-all"><Plus size={20}/></button>
          <button onClick={() => signOut(auth)} className="bg-gray-800 p-2.5 rounded-xl text-gray-500 hover:text-red-500 transition-all"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input type="text" placeholder="Gegenstand suchen..." className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 transition-all shadow-inner" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button onClick={() => setFilterType('All')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${filterType === 'All' ? 'bg-white border-white text-black shadow-lg shadow-white/10' : 'bg-gray-800/30 border-gray-800 text-gray-500'}`}>Alle</button>
                <button onClick={() => setFilterType('Besorgen')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap flex items-center gap-2 ${filterType === 'Besorgen' ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/20' : 'bg-red-900/10 border-red-900/20 text-red-500/70'}`}><ShoppingCart size={14} /> Besorgen ({besorgenCount})</button>
                <button onClick={() => setFilterType('Ausgeliehen')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap flex items-center gap-2 ${filterType === 'Ausgeliehen' ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-900/20' : 'bg-orange-900/10 border-orange-900/20 text-orange-500/70'}`}><ArrowRightLeft size={14} /> Ausgeliehen ({ausgeliehenCount})</button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {['All', 'Bastelraum', 'Archivraum'].map(loc => (
                <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-tighter border transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600/20 border-orange-500/50 text-orange-500' : 'bg-gray-800/20 border-gray-800/50 text-gray-600 hover:text-gray-400'}`}>{loc === 'All' ? 'Alle Räume' : loc}</button>
              ))}
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
            <div className="text-center py-20 bg-black/20 border-2 border-dashed border-gray-800 rounded-[3rem]"><Info size={48} className="mx-auto text-gray-800 mb-4" /><p className="text-gray-600 font-bold uppercase tracking-widest text-xs italic">Keine Einträge vorhanden</p></div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map(item => {
                const bedarf = Math.max(0, item.minStock - item.quantity);
                const isCritical = item.quantity <= item.minStock;
                return (
                <div key={item.id} className={`bg-[#161616] rounded-3xl overflow-hidden border border-gray-800 shadow-xl group hover:border-gray-700 transition-all flex flex-col ${isCritical ? 'ring-1 ring-red-500/30' : ''}`}>
                    <div className="h-44 bg-black flex items-center justify-center relative overflow-hidden border-b border-gray-800/50">
                        {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.name} /> : <ImageIcon className="text-gray-900 opacity-30" size={64} />}
                        {isCritical && (<div className="absolute top-2 left-2 flex flex-col gap-1"><div className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase shadow-lg">Nachfüllen</div><div className="bg-white text-black text-[10px] font-black px-2 py-1 rounded-lg shadow-xl flex items-center gap-1"><ShoppingCart size={10} /> +{bedarf} Stk.</div></div>)}
                        {(item.borrowedQuantity || 0) > 0 && (<div className="absolute top-2 right-2 bg-orange-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase shadow-lg border border-orange-400/30">{item.borrowedQuantity} Ausgeliehen</div>)}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-1"><h3 className="font-bold text-lg text-white truncate pr-2 leading-tight">{item.name}</h3><button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500 transition-colors"><Trash2 size={16}/></button></div>
                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-4 italic">{item.location}</p>
                        <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-gray-800/50 shadow-inner">
                            <button onClick={() => updateQty(item, -1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors shadow-lg"><Minus size={18}/></button>
                            <div className="text-center"><span className={`text-3xl font-black ${isCritical ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span><span className="block text-[8px] text-gray-600 font-bold uppercase mt-1 tracking-tighter">Bestand (Limit: {item.minStock})</span></div>
                            <button onClick={() => updateQty(item, 1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors shadow-lg"><Plus size={18}/></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button onClick={() => updateQty(item, 0, 'ausgeliehen')} disabled={item.quantity === 0} className={`flex items-center justify-center gap-2 py-2 rounded-xl text-[9px] font-black uppercase border transition-all active:scale-95 disabled:opacity-30 ${item.currentStatus === 'ausgeliehen' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-orange-600/10 border-orange-500/20 text-orange-500'}`}><ArrowRightLeft size={12} /> Ausleihen</button>
                            <button onClick={() => updateQty(item, 0, 'zurückgebracht')} disabled={(item.borrowedQuantity || 0) === 0} className="flex items-center justify-center gap-2 bg-green-600/10 hover:bg-green-600/20 border border-green-500/20 py-2 rounded-xl text-[9px] font-black uppercase text-green-500 transition-all active:scale-95 disabled:opacity-30"><RotateCcw size={12} /> Zurück</button>
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-800/50">
                            <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2 text-[8px] font-black uppercase text-gray-500"><History size={10} /> Letzte Aktivität</div><button onClick={() => recommendMinStockWithAI(item)} className="text-orange-500 hover:text-white transition-colors" title="KI Mindestmengen-Empfehlung">{aiRecommendationLoading === item.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}</button></div>
                            <p className="text-[10px] text-gray-400 font-medium italic line-clamp-1 mb-2">{item.lastAction || 'Keine Bewegungen.'}</p>
                            {item.aiRecommendedMin && (<div className="bg-orange-600/5 border border-orange-500/10 rounded-lg p-2 mb-2 animate-in fade-in slide-in-from-top-1"><div className="flex items-center gap-1 text-orange-400 text-[8px] font-black uppercase mb-1"><TrendingUp size={10} /> KI Empfehlung</div><p className="text-[9px] text-gray-500 leading-tight">Empfohlener Minimalbestand: <span className="text-white font-bold">{item.aiRecommendedMin}</span></p><p className="text-[8px] text-gray-600 italic mt-1">{item.aiReason}</p></div>)}
                            <div className="flex justify-between items-center text-[7px] font-bold text-gray-700 uppercase tracking-tighter"><span>Nutzer: {item.updatedBy || 'N/A'}</span><span>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span></div>
                        </div>
                    </div>
                </div>
                );
            })}
            </div>
        )}
      </main>

      {/* ADMIN PANEL */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-[#161616] w-full max-w-2xl rounded-[2.5rem] border border-orange-500/10 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center"><div className="flex items-center gap-3"><ShieldCheck className="text-orange-500" size={24} /><div><h2 className="text-xl font-black uppercase italic tracking-tighter leading-tight text-white">Admin Control</h2><p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Vereins-Stammdaten</p></div></div><button onClick={() => setIsAdminPanelOpen(false)} className="bg-gray-800 p-3 rounded-2xl hover:bg-gray-700"><X size={20}/></button></div>
            <div className="p-8 overflow-y-auto space-y-8 flex-1 custom-scrollbar"><button onClick={exportToExcel} className="w-full bg-green-600/10 border border-green-600/30 p-5 rounded-2xl flex items-center justify-center gap-3 text-green-500 uppercase font-black text-xs hover:bg-green-600/20 transition-all shadow-xl"><FileSpreadsheet size={24} /> Bestandsliste Exportieren (CSV)</button><div className="space-y-4 pt-4 border-t border-gray-800"><h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 px-1"><PlusCircle size={14}/> Mitglied einladen</h3><form onSubmit={async (e) => { e.preventDefault(); const fullName = `${newMemberName.first.trim()} ${newMemberName.last.trim()}`; await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), { fullName, role: 'member', isInitialized: false }); setNewMemberName({ first: '', last: '' }); }} className="grid grid-cols-1 sm:grid-cols-3 gap-2"><input required placeholder="Vorname" className="bg-black p-4 rounded-2xl border border-gray-800 text-sm outline-none focus:border-orange-500" value={newMemberName.first} onChange={e => setNewMemberName({...newMemberName, first: e.target.value})} /><input required placeholder="Nachname" className="bg-black p-4 rounded-2xl border border-gray-800 text-sm outline-none focus:border-orange-500" value={newMemberName.last} onChange={e => setNewMemberName({...newMemberName, last: e.target.value})} /><button type="submit" className="bg-orange-600 p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-orange-500 transition-all shadow-lg active:scale-95">Erfassen</button></form></div><div className="space-y-4 pb-4"><h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 px-1"><Users size={14}/> Mitgliederverwaltung</h3><div className="grid gap-2">{members.map(m => (<div key={m.id} className="bg-black/40 p-4 rounded-2xl border border-gray-800 flex justify-between items-center group hover:border-orange-500/20 transition-all"><div><p className="font-bold text-sm text-white">{m.fullName}</p><p className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-1 ${m.isInitialized ? 'bg-green-600/10 text-green-500' : 'bg-yellow-600/10 text-yellow-500'}`}>{m.isInitialized ? 'Aktiv' : 'Wartet auf Login'}</p></div><div className="flex gap-2">{m.fullName !== 'Raphael Drago' && <button onClick={async () => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id), { role: m.role === 'admin' ? 'member' : 'admin' })} className={`p-2.5 rounded-xl transition-all shadow-lg ${m.role === 'admin' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-600 hover:text-orange-500'}`}><ShieldCheck size={18} /></button>}{m.fullName !== 'Raphael Drago' && <button onClick={async () => { if(confirm('Mitglied wirklich löschen?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id)) }} className="p-2.5 rounded-xl bg-gray-800 text-gray-600 hover:text-red-500 transition-all shadow-lg"><Trash2 size={18} /></button>}</div></div>))}</div></div></div>
          </div>
        </div>
      )}

      {/* NEW ITEM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-[#161616] w-full max-w-md rounded-[2.5rem] p-8 border border-gray-800 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-black uppercase italic tracking-tighter text-white">Neuaufnahme</h2><button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button></div>
            <form onSubmit={handleSaveItem} className="space-y-5">
              <div onClick={() => fileInputRef.current.click()} className="h-44 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer relative group hover:border-orange-500 transition-all shadow-inner">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" alt="Preview" /> : <div className="text-center group-hover:scale-110 transition-transform"><Camera className="mx-auto text-gray-800 mb-2" size={32}/><p className="text-[10px] font-bold uppercase text-gray-600">Foto aufnehmen</p></div>}
                {(isAnalyzing || isSaving) && <div className="absolute inset-0 bg-black/70 flex items-center justify-center flex-col gap-2"><Loader2 className="animate-spin text-orange-500" /><p className="text-[10px] text-white font-bold uppercase tracking-widest animate-pulse italic">{isSaving && !newItem.image ? 'KI generiert Bild...' : 'Verarbeitung...'}</p></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (ev) => { setNewItem({...newItem, image: ev.target.result}); analyzeImageWithAI(ev.target.result); }; reader.readAsDataURL(file); }} />
              </div>
              <div className="space-y-2"><label className="text-[10px] text-gray-500 uppercase font-black ml-2">Artikel Name</label><input required placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 shadow-inner" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><label className="text-[10px] text-gray-500 uppercase font-black ml-2">Initial-Bestand</label><input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} /></div><div className="space-y-2"><label className="text-[10px] text-gray-500 uppercase font-black ml-2">Warn-Menge</label><input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} /></div></div>
              <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Bastelraum' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Bastelraum</button><button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Archivraum' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Archiv</button></div>
              <button type="submit" disabled={isSaving} className="w-full bg-orange-600 p-5 rounded-3xl font-black uppercase text-white shadow-xl mt-4 italic tracking-widest leading-none disabled:opacity-50">{isSaving ? 'Speichere...' : 'Speichern'}</button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DIALOG */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#1a1a1a] p-10 rounded-[3rem] text-center border border-red-900/20 max-w-sm shadow-2xl"><div className="w-20 h-20 bg-red-950/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><AlertTriangle size={48} /></div><h3 className="text-xl font-black mb-2 italic text-white uppercase tracking-tighter leading-tight text-center">Gegenstand löschen?</h3><p className="text-gray-600 text-sm mb-10 leading-relaxed text-center">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> wirklich endgültig entfernen?</p><div className="grid grid-cols-2 gap-4"><button onClick={() => setItemToDelete(null)} className="bg-gray-800 py-4 rounded-2xl font-bold text-gray-400 hover:text-white transition-all shadow-lg">Nein</button><button onClick={async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id)); setItemToDelete(null); }} className="bg-red-600 py-4 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all">Ja, löschen</button></div></div>
        </div>
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
