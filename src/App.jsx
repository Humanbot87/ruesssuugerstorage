import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, 
  Minus, 
  Search, 
  Package, 
  Archive, 
  Hammer, 
  Trash2, 
  LayoutGrid, 
  List as ListIcon,
  PlusCircle,
  X,
  Loader2,
  AlertCircle,
  User,
  CheckCircle2,
  Clock,
  Camera,
  Image as ImageIcon,
  AlertTriangle,
  Tag as TagIcon,
  ArrowRightLeft,
  RotateCcw,
  History,
  LogOut,
  ShoppingCart,
  Info,
  ShieldCheck,
  Users,
  KeyRound
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  query,
  getDocs,
  serverTimestamp,
  arrayUnion,
  where
} from 'firebase/firestore';
import { 
  getAuth, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut 
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

const appId = "ruess-suuger-storage-v2";
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const UNITS = ['Stk.', 'Paar', 'Pkg.', 'Set', 'Liter', 'Meter', 'Kiste'];

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [members, setMembers] = useState([]);

  // UI State
  const [viewMode, setViewMode] = useState('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterType, setFilterType] = useState('All'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Auth State
  const [authStep, setAuthStep] = useState('identify');
  const [authForm, setAuthForm] = useState({ firstName: '', lastName: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [isAuthChecking, setIsAuthChecking] = useState(false);
  const [targetMember, setTargetMember] = useState(null);

  const [newItem, setNewItem] = useState({
    name: '',
    quantity: 1,
    minStock: 5,
    location: 'Bastelraum',
    unit: 'Stk.',
    tags: '',
    image: null
  });

  const [newMemberName, setNewMemberName] = useState({ first: '', last: '' });

  // 1. Authentifizierung & Nutzer-Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
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
          setTargetMember(null);
          setAuthForm({ firstName: '', lastName: '', password: '' });
        }
      } catch (err) {
        console.error("Auth error:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Daten-Sync
  useEffect(() => {
    if (!user) return;
    
    const invUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Firestore inv error:", err));

    const memUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Firestore mem error:", err));

    return () => { invUnsub(); memUnsub(); };
  }, [user]);

  const getInternalEmail = (name) => `${name.toLowerCase().trim().replace(/\s+/g, '.')}@rs.v2`;

  const handleIdentify = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthChecking(true);
    const fullName = `${authForm.firstName.trim()} ${authForm.lastName.trim()}`;
    
    try {
      const memberRef = collection(db, 'artifacts', appId, 'public', 'data', 'member_registry');
      const querySnapshot = await getDocs(memberRef);
      const allMembers = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const memberMatch = allMembers.find(m => (m.fullName || "").toLowerCase().trim() === fullName.toLowerCase().trim());

      if (memberMatch) {
        setTargetMember(memberMatch);
        setTimeout(() => {
          setAuthStep(memberMatch.isInitialized ? 'login' : 'setup_password');
        }, 50);
      } else if (fullName.toLowerCase() === 'raphael drago') {
        setTargetMember({ fullName: 'Raphael Drago', role: 'admin', isInitialized: false });
        setTimeout(() => {
          setAuthStep('setup_password');
        }, 50);
      } else {
        setAuthError("Name nicht auf der Liste. Ein Admin muss dich zuerst erfassen.");
      }
    } catch (err) {
      setAuthError("Verbindung zum Server fehlgeschlagen.");
    } finally {
      setIsAuthChecking(false);
    }
  };

  const handleAuthAction = async (e) => {
    e.preventDefault();
    if (!targetMember) return;
    setAuthError('');
    setIsAuthChecking(true);
    const email = getInternalEmail(targetMember.fullName);
    try {
      if (authStep === 'setup_password') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, authForm.password);
        await updateProfile(userCredential.user, { displayName: targetMember.fullName });
        
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', userCredential.user.uid), {
          fullName: targetMember.fullName, 
          uid: userCredential.user.uid, 
          role: targetMember.role || 'member',
          isInitialized: true, 
          email: email, 
          createdAt: serverTimestamp()
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
      } else {
        setAuthError("Anmeldung fehlgeschlagen.");
      }
    } finally {
      setIsAuthChecking(false);
    }
  };

  const updateQty = async (item, delta, specificType = null) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
    let newQty = item.quantity || 0;
    let newBorrowed = item.borrowedQuantity || 0;

    if (specificType === 'ausgeliehen') {
        if (newQty <= 0) return;
        newQty -= 1;
        newBorrowed += 1;
    } else if (specificType === 'zurückgebracht') {
        if (newBorrowed <= 0) return;
        newQty += 1;
        newBorrowed -= 1;
    } else {
        newQty = Math.max(0, newQty + delta);
    }

    const logEntry = {
      user: user.displayName || 'Unbekannt',
      action: specificType || (delta > 0 ? 'ausgelegt' : 'entnommen'),
      amount: 1,
      timestamp: new Date().toISOString()
    };

    await updateDoc(itemRef, { 
      quantity: newQty, 
      borrowedQuantity: newBorrowed,
      updatedBy: user.displayName || 'System',
      updatedAt: new Date().toISOString(),
      lastAction: `${user.displayName}: ${logEntry.action}`,
      history: arrayUnion(logEntry)
    });
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!user || !newItem.name) return;
    setIsSaving(true);

    const trimmedName = newItem.name.trim();
    const existingItem = items.find(i => (i.name || "").toLowerCase() === trimmedName.toLowerCase());
    const tagArray = newItem.tags ? newItem.tags.split(',').map(t => t.trim()).filter(t => t) : [];

    try {
      if (existingItem) {
        const addedQty = parseInt(newItem.quantity) || 0;
        const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', existingItem.id);
        await updateDoc(itemRef, {
          quantity: (existingItem.quantity || 0) + addedQty,
          updatedBy: user.displayName,
          updatedAt: new Date().toISOString(),
          history: arrayUnion({ user: user.displayName, action: 'Bestand addiert', amount: addedQty, timestamp: new Date().toISOString() })
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
          ...newItem,
          name: trimmedName,
          tags: tagArray,
          quantity: parseInt(newItem.quantity) || 0,
          minStock: parseInt(newItem.minStock) || 0,
          borrowedQuantity: 0,
          updatedBy: user.displayName,
          updatedAt: new Date().toISOString(),
          history: [{ user: user.displayName, action: 'erfasst', amount: newItem.quantity, timestamp: new Date().toISOString() }]
        });
      }
      setIsModalOpen(false);
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 5, unit: 'Stk.', tags: '', image: null });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const exportToExcel = () => {
    const headers = ["Name", "Bestand", "Ausgeliehen", "Lagerort", "Warn-Limit"];
    const csvContent = [headers.join(";"), ...items.map(i => [i.name || '-', i.quantity || 0, i.borrowedQuantity || 0, i.location || '-', i.minStock || 0].join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Inventar_RS_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const name = i.name || "";
      const tags = i.tags || [];
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = name.toLowerCase().includes(searchLower) || tags.some(t => t.toLowerCase().includes(searchLower));
      const matchesLocation = filterLocation === 'All' || i.location === filterLocation;
      
      let matchesType = true;
      if (filterType === 'Ausgeliehen') {
        matchesType = (i.borrowedQuantity || 0) > 0;
      } else if (filterType === 'Besorgen') {
        matchesType = (i.quantity || 0) <= (i.minStock || 0);
      }

      return matchesSearch && matchesLocation && matchesType;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, searchTerm, filterLocation, filterType]);

  const besorgenCount = items.filter(i => (i.quantity || 0) <= (i.minStock || 0)).length;
  const ausgeliehenCount = items.filter(i => (i.borrowedQuantity || 0) > 0).length;

  const isUserAdmin = userData?.role === 'admin' || user?.displayName === 'Raphael Drago';

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 text-center">
      <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
      <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">Synchronisierung läuft...</p>
    </div>
  );

  // --- LOGIN UI ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#161616] border border-gray-800 p-10 rounded-[3rem] shadow-2xl">
          <div className="text-center mb-10">
             <Package className="mx-auto text-orange-500 mb-4" size={52} />
             <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white leading-none">
               <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
             </h1>
             <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em] mt-2 italic">Lagerverwaltung</p>
          </div>
          
          <form onSubmit={authStep === 'identify' ? handleIdentify : handleAuthAction} className="space-y-4">
            {authStep === 'identify' ? (
              <div className="space-y-4">
                <input required type="text" placeholder="Vorname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})} />
                <input required type="text" placeholder="Nachname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-2 bg-orange-600/10 rounded-xl border border-orange-500/20 mb-2">
                  <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">Hallo</p>
                  <p className="text-white font-black">{targetMember?.fullName || "Mitglied"}</p>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-4 text-gray-700" size={18} />
                  <input required autoFocus type="password" placeholder="Passwort" className="w-full bg-black border border-orange-500/50 rounded-2xl p-4 pl-12 text-white outline-none focus:ring-1 focus:ring-orange-500" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                </div>
              </div>
            )}

            {authError && <div className="text-red-500 text-[10px] font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center">{authError}</div>}
            
            <button type="submit" disabled={isAuthChecking} className="w-full bg-orange-600 p-4 rounded-2xl font-black uppercase text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
              {isAuthChecking ? <Loader2 className="animate-spin" size={18} /> : (authStep === 'identify' ? 'Weiter' : 'Anmelden')}
            </button>

            {authStep !== 'identify' && (
              <button type="button" onClick={() => { setAuthStep('identify'); setAuthError(''); }} className="w-full text-gray-600 text-[10px] font-bold uppercase mt-2 hover:text-white transition-colors py-2">
                Abbrechen
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  // --- DASHBOARD UI ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans selection:bg-orange-500/30">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex flex-col">
          <h1 className="text-lg font-black uppercase italic tracking-tighter leading-none">
            <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
          </h1>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{user.displayName}</span>
            {isUserAdmin && <ShieldCheck size={10} className="text-orange-500" />}
          </div>
        </div>
        <div className="flex gap-2">
          {isUserAdmin && (
            <button onClick={() => setIsAdminPanelOpen(true)} className="p-2.5 bg-gray-800 rounded-xl text-orange-500 hover:bg-orange-500 hover:text-white transition-all shadow-lg">
              <Users size={20}/>
            </button>
          )}
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2.5 rounded-xl text-white shadow-lg active:scale-95 transition-all"><PlusCircle size={20}/></button>
          <button onClick={() => signOut(auth)} className="bg-gray-800 p-2.5 rounded-xl text-gray-500 hover:text-red-500 transition-all"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-6xl mx-auto pb-20">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
                <input type="text" placeholder="Gegenstand oder Tag suchen..." className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 transition-all shadow-inner" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex bg-[#161616] border border-gray-800 rounded-2xl p-1 shrink-0">
                <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-orange-600 text-white' : 'text-gray-600'}`}><LayoutGrid size={20}/></button>
                <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'text-gray-600'}`}><ListIcon size={20}/></button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button onClick={() => setFilterType('All')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${filterType === 'All' ? 'bg-white border-white text-black shadow-lg shadow-white/10' : 'bg-gray-800/30 border-gray-800 text-gray-500'}`}>Alle</button>
                <button onClick={() => setFilterType('Besorgen')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap flex items-center gap-2 ${filterType === 'Besorgen' ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/20' : 'bg-red-900/10 border-red-900/20 text-red-500/70'}`}><ShoppingCart size={14} /> Besorgen ({besorgenCount})</button>
                <button onClick={() => setFilterType('Ausgeliehen')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap flex items-center gap-2 ${filterType === 'Ausgeliehen' ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-900/20' : 'bg-orange-900/10 border-orange-900/20 text-orange-500/70'}`}><ArrowRightLeft size={14} /> Ausgeliehen ({ausgeliehenCount})</button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {['All', 'Bastelraum', 'Archivraum'].map(loc => (
                <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase border transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 border-orange-500 text-white' : 'bg-gray-800/20 border-gray-800/50 text-gray-600 hover:text-gray-400'}`}>{loc === 'All' ? 'Alle Räume' : loc}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Hinzufügen Button oberhalb der Artikel */}
        <button onClick={() => setIsModalOpen(true)} className="w-full flex items-center justify-center gap-3 bg-orange-600/10 border border-orange-500/20 hover:bg-orange-600/20 p-5 rounded-3xl transition-all mb-8 group shadow-xl">
          <PlusCircle className="text-orange-500 group-hover:scale-110 transition-transform" />
          <span className="font-black uppercase tracking-widest text-orange-500 text-xs italic">Neuer Artikel erfassen</span>
        </button>

        {filteredItems.length === 0 ? (
          <div className="text-center py-24 bg-black/20 border-2 border-dashed border-gray-800 rounded-[3rem] shadow-inner">
            <Info className="mx-auto text-gray-800 mb-4" size={48} />
            <p className="text-gray-600 font-bold uppercase text-[10px] tracking-widest">Keine Artikel gefunden</p>
          </div>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map(item => {
                const quantity = item.quantity || 0;
                const minStock = item.minStock || 0;
                const bedarf = Math.max(0, minStock - quantity);
                const isCritical = quantity <= minStock;
                return (
                  <div key={item.id} className={`bg-[#161616] rounded-[2.5rem] overflow-hidden border border-gray-800 shadow-xl flex flex-col group hover:border-gray-700 transition-all ${isCritical ? 'ring-1 ring-red-500/30' : ''}`}>
                    <div className="h-44 bg-black flex items-center justify-center relative overflow-hidden border-b border-gray-800/50">
                      {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.name} /> : <ImageIcon className="text-gray-900 opacity-30" size={64} />}
                      {isCritical && (<div className="absolute top-3 left-3 flex flex-col gap-1"><div className="bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase shadow-lg animate-pulse tracking-tighter">Nachfüllen</div><div className="bg-white text-black text-[10px] font-black px-2 py-1 rounded-lg shadow-xl flex items-center gap-1"><ShoppingCart size={10} /> +{bedarf} {item.unit || 'Stk.'}</div></div>)}
                      {(item.borrowedQuantity || 0) > 0 && (<div className="absolute top-3 right-3 bg-orange-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase shadow-lg border border-orange-400/30">{item.borrowedQuantity} Verliehen</div>)}
                    </div>
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-lg text-white truncate pr-2 leading-tight">{item.name || 'Unbenannt'}</h3>
                        <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                      </div>
                      <div className="flex gap-2 items-center mb-4 text-[9px] text-gray-600 font-bold uppercase tracking-widest italic">{item.location || '-'}</div>

                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-4">
                          {item.tags.map((tag, idx) => (
                            <span key={idx} className="bg-gray-800/50 text-gray-400 text-[8px] px-2 py-0.5 rounded-lg border border-gray-700 flex items-center gap-1"><TagIcon size={8} /> {tag}</span>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-gray-800/50 shadow-inner">
                        <button onClick={() => updateQty(item, -1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 text-gray-400 transition-colors"><Minus size={18}/></button>
                        <div className="text-center">
                          <span className={`text-3xl font-black ${isCritical ? 'text-red-500' : 'text-orange-500'}`}>{quantity}</span>
                          <span className="block text-[8px] text-gray-600 font-bold uppercase mt-1 tracking-tighter">{item.unit || 'Stk.'} (Limit: {minStock})</span>
                        </div>
                        <button onClick={() => updateQty(item, 1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 text-gray-400 transition-colors"><Plus size={18}/></button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4">
                          <button onClick={() => updateQty(item, 0, 'ausgeliehen')} disabled={quantity <= 0} className="flex items-center justify-center gap-2 py-2 rounded-xl text-[9px] font-black uppercase border border-orange-500/20 text-orange-500 hover:bg-orange-500/10 disabled:opacity-30">Ausleihen</button>
                          <button onClick={() => updateQty(item, 0, 'zurückgebracht')} disabled={!item.borrowedQuantity} className="flex items-center justify-center gap-2 py-2 rounded-xl text-[9px] font-black uppercase bg-green-600/10 border border-green-500/20 text-green-500 hover:bg-green-600/20 disabled:opacity-30">Zurück</button>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-800/50 flex justify-between items-center text-[7px] font-bold text-gray-700 uppercase tracking-tighter">
                         <span className="flex items-center gap-1"><History size={8}/> {item.updatedBy || 'System'}</span>
                         <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#161616] border border-gray-800 rounded-[2rem] overflow-hidden divide-y divide-gray-800 shadow-2xl">
              {filteredItems.map(item => {
                const quantity = item.quantity || 0;
                const minStock = item.minStock || 0;
                const isCritical = quantity <= minStock;
                return (
                  <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-black/20 transition-all group">
                    <div className="w-14 h-14 rounded-2xl bg-black flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800 group-hover:border-orange-500/30 transition-colors shadow-inner">
                      {item.image ? <img src={item.image} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="text-gray-900" size={24} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate text-sm leading-tight">{item.name || 'Unbenannt'}</h3>
                      <div className="flex gap-2 items-center mt-1 text-[8px] font-black uppercase text-gray-600 tracking-widest">{item.location || '-'} {(item.borrowedQuantity || 0) > 0 && <span className="text-orange-500 border border-orange-500/20 px-1.5 rounded-md ml-2">Verliehen: {item.borrowedQuantity}</span>}</div>
                    </div>
                    <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-2xl border border-gray-800 shadow-inner">
                      <button onClick={() => updateQty(item, -1)} className="text-gray-500 hover:text-white transition-colors"><Minus size={16}/></button>
                      <div className="flex flex-col items-center">
                        <span className={`text-xl font-black min-w-[2ch] text-center ${isCritical ? 'text-red-500' : 'text-orange-500'}`}>{quantity}</span>
                        <span className="text-[7px] text-gray-700 font-bold uppercase">{item.unit || 'Stk.'}</span>
                      </div>
                      <button onClick={() => updateQty(item, 1)} className="text-gray-500 hover:text-white transition-colors"><Plus size={16}/></button>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => updateQty(item, 0, 'ausgeliehen')} disabled={quantity <= 0} className="p-2.5 bg-orange-600/10 text-orange-500 rounded-xl hover:bg-orange-600/20 transition-all disabled:opacity-30 border border-orange-500/10"><ArrowRightLeft size={18}/></button>
                      <button onClick={() => setItemToDelete(item)} className="p-2.5 text-gray-700 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>

      {/* --- ADMIN PANEL MODAL --- */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-[#161616] w-full max-w-2xl rounded-[2.5rem] border border-orange-500/10 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a]">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-orange-500" size={24} />
                <div>
                   <h2 className="text-xl font-black uppercase italic tracking-tighter leading-tight text-white">Admin Control</h2>
                   <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Vereins-Stammdaten</p>
                </div>
              </div>
              <button onClick={() => setIsAdminPanelOpen(false)} className="bg-gray-800 p-3 rounded-2xl hover:bg-gray-700 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-8 flex-1 custom-scrollbar">
              <button onClick={exportToExcel} className="w-full bg-green-600/10 border border-green-600/30 p-5 rounded-3xl flex items-center justify-center gap-3 text-green-500 uppercase font-black text-xs hover:bg-green-600/20 transition-all shadow-xl">
                <FileSpreadsheet size={24} /> Bestandsliste Exportieren (CSV)
              </button>
              
              <div className="space-y-4 pt-4 border-t border-gray-800">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 px-1"><PlusCircle size={14}/> Mitglied einladen</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const fullName = `${newMemberName.first.trim()} ${newMemberName.last.trim()}`;
                  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), { fullName, role: 'member', isInitialized: false });
                  setNewMemberName({ first: '', last: '' });
                }} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input required placeholder="Vorname" className="bg-black p-4 rounded-2xl border border-gray-800 text-sm outline-none focus:border-orange-500 transition-all" value={newMemberName.first} onChange={e => setNewMemberName({...newMemberName, first: e.target.value})} />
                  <input required placeholder="Nachname" className="bg-black p-4 rounded-2xl border border-gray-800 text-sm outline-none focus:border-orange-500 transition-all" value={newMemberName.last} onChange={e => setNewMemberName({...newMemberName, last: e.target.value})} />
                  <button type="submit" className="bg-orange-600 p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-orange-500 transition-all shadow-lg active:scale-95">Erfassen</button>
                </form>
              </div>

              <div className="space-y-4 pb-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 px-1"><Users size={14}/> Mitgliederverwaltung</h3>
                <div className="grid gap-2">
                  {members.map(m => (
                    <div key={m.id} className="bg-black/40 p-4 rounded-2xl border border-gray-800 flex justify-between items-center group">
                      <div>
                        <p className="font-bold text-sm text-white">{m.fullName || "Unbekannt"}</p>
                        <p className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-1 ${m.isInitialized ? 'bg-green-600/10 text-green-500' : 'bg-yellow-600/10 text-yellow-500'}`}>
                          {m.isInitialized ? 'Aktiv' : 'Wartet auf Login'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {m.fullName !== 'Raphael Drago' && (
                          <button onClick={async () => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id), { role: m.role === 'admin' ? 'member' : 'admin' })} className={`p-2.5 rounded-xl transition-all shadow-lg ${m.role === 'admin' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-600 hover:text-orange-500'}`}>
                            <ShieldCheck size={18} />
                          </button>
                        )}
                        {m.fullName !== 'Raphael Drago' && (
                          <button onClick={async () => { if(confirm('Mitglied entfernen?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id)) }} className="p-2.5 rounded-xl bg-gray-800 text-gray-600 hover:text-red-500 transition-all shadow-lg">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW ITEM MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-[#161616] w-full max-w-md rounded-[3rem] p-8 border border-gray-800 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase italic tracking-tighter text-white leading-none">Artikel aufnehmen</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveItem} className="space-y-6">
              <div onClick={() => fileInputRef.current.click()} className="h-44 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer relative group hover:border-orange-500 transition-all shadow-inner">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" alt="Preview" /> : <div className="text-center group-hover:scale-110 transition-transform"><Camera className="mx-auto text-gray-800 mb-2" size={32}/><p className="text-[10px] font-bold uppercase text-gray-600">Foto hinzufügen</p></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (ev) => { setNewItem({...newItem, image: ev.target.result}); }; reader.readAsDataURL(file); }} />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Name & Tags</label>
                <input required placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 shadow-inner" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <input placeholder="Tags (z.B. Schminke, Neon)..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 shadow-inner text-xs" value={newItem.tags} onChange={e => setNewItem({...newItem, tags: e.target.value})} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Anzahl & Einheit</label>
                  <div className="flex gap-2">
                    <input type="number" className="flex-1 bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                    <select className="bg-black p-4 rounded-2xl border border-gray-800 text-white text-xs outline-none" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Warn-Limit</label>
                  <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Bastelraum' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Archivraum' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Archiv</button>
              </div>
              
              <button type="submit" disabled={isSaving} className="w-full bg-orange-600 p-5 rounded-3xl font-black uppercase text-white shadow-xl shadow-orange-900/40 hover:bg-orange-500 active:scale-95 transition-all mt-4 italic tracking-widest leading-none disabled:opacity-50">
                {isSaving ? 'Verarbeitung...' : 'Speichern'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- DELETE DIALOG --- */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#1a1a1a] p-10 rounded-[3rem] text-center border border-red-900/20 max-w-sm shadow-2xl shadow-red-900/10">
            <div className="w-20 h-20 bg-red-950/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><AlertTriangle size={48} /></div>
            <h3 className="text-xl font-black mb-2 italic text-white uppercase tracking-tighter leading-tight text-center leading-none">Wirklich löschen?</h3>
            <p className="text-gray-600 text-sm mb-10 leading-relaxed text-center">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> wirklich endgültig entfernen?</p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setItemToDelete(null)} className="bg-gray-800 py-4 rounded-2xl font-bold text-gray-400 hover:text-white transition-all shadow-lg font-black uppercase text-[10px]">Nein</button>
              <button onClick={async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id)); setItemToDelete(null); }} className="bg-red-600 py-4 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all font-black uppercase text-[10px]">Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// React Bootstrapping
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
