import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, 
  Minus, 
  Search, 
  Package, 
  Trash2, 
  LayoutGrid, 
  List as ListIcon,
  X,
  Loader2,
  AlertCircle,
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
  KeyRound,
  FileSpreadsheet
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
  getDocs,
  serverTimestamp,
  arrayUnion,
  query
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
  const [activeTab, setActiveTab] = useState('ALLE'); 
  const [activeNav, setActiveNav] = useState('INVENTAR'); 
  const [searchTerm, setSearchTerm] = useState('');
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
    name: '', quantity: 1, minStock: 5, location: 'Bastelraum', unit: 'Stk.', tags: '', image: null
  });

  const [newMemberName, setNewMemberName] = useState({ first: '', last: '' });

  // 1. Authentifizierung
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
        setAuthStep(memberMatch.isInitialized ? 'login' : 'setup_password');
      } else if (fullName.toLowerCase() === 'raphael drago') {
        setTargetMember({ fullName: 'Raphael Drago', role: 'admin', isInitialized: false });
        setAuthStep('setup_password');
      } else {
        setAuthError("Name nicht auf der Liste.");
      }
    } catch (err) {
      setAuthError("Fehler bei der Identifizierung.");
    } finally { setIsAuthChecking(false); }
  };

  const handleAuthAction = async (e) => {
    e.preventDefault();
    setIsAuthChecking(true);
    const email = `${targetMember.fullName.toLowerCase().trim().replace(/\s+/g, '.')}@rs.v2`;
    try {
      if (authStep === 'setup_password') {
        const cred = await createUserWithEmailAndPassword(auth, email, authForm.password);
        await updateProfile(cred.user, { displayName: targetMember.fullName });
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', cred.user.uid), {
          fullName: targetMember.fullName, uid: cred.user.uid, role: targetMember.role || 'member', isInitialized: true, email: email, createdAt: serverTimestamp()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, authForm.password);
      }
    } catch (err) { setAuthError("Passwort falsch oder Fehler."); } finally { setIsAuthChecking(false); }
  };

  // --- Foto Kompression ---
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 800; // Maximale Auflösung für Cloud-Speicher
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // JPEG mit 60% Qualität -> Spart Platz, erhält Details
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setNewItem(prev => ({ ...prev, image: dataUrl }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const updateQty = async (item, delta, specificType = null) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
    let nQ = item.quantity || 0;
    let nB = item.borrowedQuantity || 0;
    if (specificType === 'ausgeliehen') { if (nQ <= 0) return; nQ -= 1; nB += 1; }
    else if (specificType === 'zurückgebracht') { if (nB <= 0) return; nQ += 1; nB -= 1; }
    else { nQ = Math.max(0, nQ + delta); }
    const logEntry = { user: user.displayName, action: specificType || (delta > 0 ? 'ausgelegt' : 'entnommen'), amount: 1, timestamp: new Date().toISOString() };
    await updateDoc(itemRef, { quantity: nQ, borrowedQuantity: nB, updatedBy: user.displayName, updatedAt: new Date().toISOString(), lastAction: `${user.displayName}: ${logEntry.action}`, history: arrayUnion(logEntry) });
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!newItem.name) return;
    setIsSaving(true);
    const trimmed = newItem.name.trim();
    const existing = items.find(i => (i.name || "").toLowerCase() === trimmed.toLowerCase());
    try {
      if (existing) {
        const added = parseInt(newItem.quantity) || 0;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', existing.id), {
          quantity: (existing.quantity || 0) + added, 
          updatedAt: new Date().toISOString(),
          updatedBy: user.displayName,
          history: arrayUnion({ user: user.displayName, action: 'Bestand addiert', amount: added, timestamp: new Date().toISOString() })
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
          ...newItem, 
          name: trimmed, 
          tags: newItem.tags ? newItem.tags.split(',').map(t => t.trim()).filter(t => t) : [], 
          quantity: parseInt(newItem.quantity) || 0, 
          minStock: parseInt(newItem.minStock) || 0, 
          borrowedQuantity: 0, 
          updatedBy: user.displayName, 
          updatedAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      setNewItem({ name: '', quantity: 1, minStock: 5, location: 'Bastelraum', unit: 'Stk.', tags: '', image: null });
    } catch (e) {
      console.error("Save error:", e);
    } finally { setIsSaving(false); }
  };

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const searchMatch = (i.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || (i.tags || []).some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      let tabMatch = true;
      if (activeTab === 'BASTELRAUM') tabMatch = i.location === 'Bastelraum';
      else if (activeTab === 'ARCHIV') tabMatch = i.location === 'Archivraum';
      else if (activeTab === 'IN GEBRAUCH') tabMatch = (i.borrowedQuantity || 0) > 0;
      else if (activeTab === 'BESORGEN') tabMatch = (i.quantity || 0) <= (i.minStock || 0);
      return searchMatch && tabMatch;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, searchTerm, activeTab]);

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="w-10 h-10 text-orange-500 animate-spin" /></div>;

  if (!user) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 text-gray-200">
      <div className="w-full max-w-sm bg-[#121212] p-8 rounded-[2.5rem] border border-gray-800 shadow-2xl">
        <div className="text-center mb-8">
          <Package className="mx-auto text-orange-500 mb-4" size={48} />
          <h1 className="text-2xl font-black uppercase italic tracking-tighter leading-none"><span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span></h1>
        </div>
        <form onSubmit={authStep === 'identify' ? handleIdentify : handleAuthAction} className="space-y-4">
          {authStep === 'identify' ? (
            <>
              <input required type="text" placeholder="Vorname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})} />
              <input required type="text" placeholder="Nachname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})} />
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
              <p className="text-xs text-orange-500 font-bold uppercase tracking-widest text-center">Hallo {targetMember?.fullName}</p>
              <div className="relative">
                <KeyRound className="absolute left-4 top-4 text-gray-700" size={18} />
                <input required autoFocus type="password" placeholder="Passwort" className="w-full bg-black border border-orange-500/30 rounded-2xl p-4 pl-12 outline-none" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
              </div>
            </div>
          )}
          {authError && <div className="text-red-500 text-[10px] font-bold text-center bg-red-500/10 p-3 rounded-xl">{authError}</div>}
          <button type="submit" disabled={isAuthChecking} className="w-full bg-orange-600 p-4 rounded-2xl font-black uppercase tracking-widest text-white shadow-lg active:scale-95 transition-all">
            {isAuthChecking ? <Loader2 className="animate-spin mx-auto" size={20} /> : (authStep === 'identify' ? 'Weiter' : 'Anmelden')}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080808] text-gray-300 font-sans flex flex-col pb-24">
      {/* Header */}
      <header className="p-6 pb-2 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter leading-none"><span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span></h1>
          <p className="text-[10px] text-gray-600 font-bold mt-1 uppercase tracking-widest">{items.length} Items total</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="bg-orange-900/20 px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-orange-500/20">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-orange-500 uppercase">{members.filter(m => m.isInitialized).length} aktiv</span>
          </div>
          {userData?.role === 'admin' && (
            <button onClick={() => setIsAdminPanelOpen(true)} className="p-1.5 bg-gray-900 rounded-lg text-gray-600 hover:text-orange-500 transition-all"><Users size={16}/></button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {['ALLE', 'BASTELRAUM', 'ARCHIV', 'IN GEBRAUCH', 'BESORGEN'].map(t => (
          <button 
            key={t} 
            onClick={() => setActiveTab(t)}
            className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === t ? 'bg-orange-500 text-black shadow-lg shadow-orange-900/30' : 'bg-[#1a1a1a] text-gray-600 border border-transparent hover:border-gray-800'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="px-6 mt-4 flex-1">
        {activeNav === 'SUCHE' && (
          <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
              <input autoFocus type="text" placeholder="Gegenstand suchen..." className="w-full bg-[#121212] p-4 pl-12 rounded-2xl border border-gray-800 outline-none focus:border-orange-500 text-white shadow-inner" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center opacity-40">
            <Package size={64} className="mb-4 text-gray-800" />
            <h3 className="text-lg font-black uppercase tracking-tighter text-gray-400">Noch nix da.</h3>
            <p className="text-xs">Drück den orangen Knopf.</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "space-y-3"}>
            {filteredItems.map(item => (
              <div key={item.id} className={`bg-[#121212] border border-gray-800/50 rounded-3xl overflow-hidden shadow-xl hover:border-orange-500/20 transition-all ${viewMode === 'list' ? 'flex items-center p-3 gap-3' : 'flex flex-col'}`}>
                <div className={viewMode === 'list' ? "w-14 h-14 rounded-xl overflow-hidden bg-black shrink-0" : "h-40 bg-black relative"}>
                  {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <ImageIcon className="m-auto text-gray-900" size={viewMode === 'list' ? 24 : 48} />}
                  {viewMode === 'grid' && (item.quantity <= (item.minStock || 0)) && (
                    <div className="absolute top-3 left-3 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase shadow-lg">Mangel</div>
                  )}
                </div>
                <div className="p-4 flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-white truncate leading-tight uppercase tracking-tight">{item.name}</h3>
                    {viewMode === 'grid' && <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500"><Trash2 size={14}/></button>}
                  </div>
                  <p className="text-[9px] text-gray-600 font-bold uppercase mb-2">{item.location}</p>
                  
                  <div className="flex items-center justify-between bg-black/40 p-3 rounded-2xl border border-gray-800 shadow-inner">
                    <button onClick={() => updateQty(item, -1)} className="p-1.5 bg-gray-900 rounded-lg text-gray-500"><Minus size={14}/></button>
                    <div className="text-center">
                      <span className={`text-xl font-black ${item.quantity <= (item.minStock || 0) ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                      <span className="text-[8px] text-gray-700 font-bold ml-1 uppercase">{item.unit || 'Stk.'}</span>
                    </div>
                    <button onClick={() => updateQty(item, 1)} className="p-1.5 bg-gray-900 rounded-lg text-gray-500"><Plus size={14}/></button>
                  </div>
                </div>
                {viewMode === 'grid' && (
                  <div className="px-4 pb-4 flex gap-2">
                    <button onClick={() => updateQty(item, 0, 'ausgeliehen')} className="flex-1 py-2 bg-orange-600/10 text-orange-500 rounded-xl text-[9px] font-black uppercase border border-orange-500/10">Ausleihen</button>
                    <button onClick={() => updateQty(item, 0, 'zurückgebracht')} className="flex-1 py-2 bg-green-600/10 text-green-500 rounded-xl text-[9px] font-black uppercase border border-green-500/10">Zurück</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-[#0c0c0c] border-t border-gray-900 px-6 py-4 flex justify-between items-center z-40 backdrop-blur-md">
        <button onClick={() => { setActiveNav('INVENTAR'); setActiveTab('ALLE'); }} className={`flex flex-col items-center gap-1 transition-all ${activeNav === 'INVENTAR' ? 'text-orange-500' : 'text-gray-600'}`}>
          <LayoutGrid size={24} />
          <span className="text-[8px] font-bold uppercase tracking-widest">Inventar</span>
        </button>
        <button onClick={() => setActiveNav('SUCHE')} className={`flex flex-col items-center gap-1 transition-all ${activeNav === 'SUCHE' ? 'text-orange-500' : 'text-gray-600'}`}>
          <Search size={24} />
          <span className="text-[8px] font-bold uppercase tracking-widest">Suche</span>
        </button>
        
        {/* Foto Button */}
        <div className="relative -mt-12">
          <button onClick={() => setIsModalOpen(true)} className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(234,88,12,0.4)] border-4 border-[#080808] active:scale-90 transition-all text-black">
            <Camera size={28} />
          </button>
        </div>

        <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className={`flex flex-col items-center gap-1 transition-all text-gray-600`}>
          {viewMode === 'grid' ? <ListIcon size={24} /> : <LayoutGrid size={24} />}
          <span className="text-[8px] font-bold uppercase tracking-widest">Ansicht</span>
        </button>
        <button onClick={() => { const csv = items.map(i => [i.name, i.quantity, i.location].join(";")).join("\n"); const b = new Blob([csv], {type: 'text/csv'}); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'Lager.csv'; l.click(); }} className="flex flex-col items-center gap-1 text-gray-600">
          <FileSpreadsheet size={24} />
          <span className="text-[8px] font-bold uppercase tracking-widest">Export</span>
        </button>
      </nav>

      {/* Modal: Add Item */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6 animate-in fade-in">
          <div className="w-full max-w-md bg-[#121212] rounded-[3rem] p-8 border border-gray-800 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase italic tracking-tighter text-white">Aufnahme</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full text-gray-400"><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveItem} className="space-y-6">
              <div onClick={() => fileInputRef.current.click()} className="h-40 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex items-center justify-center relative cursor-pointer group overflow-hidden">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <div className="text-center"><Camera className="mx-auto text-gray-800 mb-2 group-hover:text-orange-500 transition-colors" size={32} /><p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Foto aufnehmen</p></div>}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  hidden 
                  accept="image/*" 
                  capture="environment"
                  onChange={handleImageChange} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-gray-600 font-bold uppercase tracking-widest ml-1">Bezeichnung</label>
                <input required className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 shadow-inner" placeholder="Name..." value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              </div>
              
              {/* Gleichkrosse Felder für Bestand und Warn-Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-600 font-bold uppercase tracking-widest ml-1">Bestand</label>
                  <input type="number" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-600 font-bold uppercase tracking-widest ml-1">Warn-Limit</label>
                  <input type="number" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label className="text-[10px] text-gray-600 font-bold uppercase tracking-widest ml-1">Einheit</label>
                   <select className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 shadow-inner text-sm" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
                     {UNITS.map(u => <option key={u} value={u} className="bg-[#121212]">{u}</option>)}
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] text-gray-600 font-bold uppercase tracking-widest ml-1">Standort</label>
                   <div className="grid grid-cols-2 gap-1 h-[54px]">
                    <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`rounded-xl text-[8px] font-black uppercase transition-all flex items-center justify-center ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-600'}`}>Bastel</button>
                    <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`rounded-xl text-[8px] font-black uppercase transition-all flex items-center justify-center ${newItem.location === 'Archivraum' ? 'bg-orange-500 text-black' : 'bg-gray-900 text-gray-600'}`}>Archiv</button>
                   </div>
                </div>
              </div>

              <button type="submit" disabled={isSaving} className="w-full bg-orange-600 p-5 rounded-3xl font-black uppercase text-white shadow-xl active:scale-95 transition-all">
                {isSaving ? 'Wird gespeichert...' : 'Artikel Speichern'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#121212] rounded-[3rem] p-8 border border-gray-800 shadow-2xl max-h-[80vh] flex flex-col no-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase italic tracking-tighter text-white">Stammdaten</h2>
              <button onClick={() => setIsAdminPanelOpen(false)} className="bg-gray-800 p-2 rounded-full text-gray-400"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar">
               <div className="bg-orange-600/5 p-4 rounded-3xl border border-orange-500/10 mb-4">
                  <h3 className="text-[10px] font-black uppercase text-orange-500 mb-3">Mitglied hinzufügen</h3>
                  <div className="flex gap-2">
                    <input className="flex-1 bg-black border border-gray-800 rounded-xl p-3 text-xs outline-none" placeholder="Vorname" value={newMemberName.first} onChange={e => setNewMemberName({...newMemberName, first: e.target.value})} />
                    <input className="flex-1 bg-black border border-gray-800 rounded-xl p-3 text-xs outline-none" placeholder="Nachname" value={newMemberName.last} onChange={e => setNewMemberName({...newMemberName, last: e.target.value})} />
                    <button onClick={async () => { if(!newMemberName.first || !newMemberName.last) return; await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), { fullName: `${newMemberName.first} ${newMemberName.last}`, isInitialized: false, role: 'member' }); setNewMemberName({first:'', last:''}); }} className="bg-orange-600 p-3 rounded-xl text-black font-black active:scale-90 transition-all"><Plus size={16}/></button>
                  </div>
               </div>
               {(members || []).map(m => (
                 <div key={m.id} className="bg-black/40 p-4 rounded-2xl flex justify-between items-center border border-gray-900 group">
                    <div>
                      <p className="font-bold text-sm text-white">{m?.fullName || "Unbekannt"}</p>
                      <p className={`text-[8px] font-bold uppercase ${m?.isInitialized ? 'text-green-500' : 'text-gray-600'}`}>{m?.isInitialized ? 'Aktiv' : 'Wartet'}</p>
                    </div>
                    {m?.fullName !== 'Raphael Drago' && (
                      <button onClick={async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id))} className="text-gray-700 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                    )}
                 </div>
               ))}
               <button onClick={() => signOut(auth)} className="w-full mt-4 p-4 rounded-2xl bg-gray-900 text-red-500 font-bold uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-red-950 transition-all"><LogOut size={14}/> Abmelden</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className="bg-[#121212] p-10 rounded-[3rem] border border-red-900/30 text-center max-w-xs shadow-2xl">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h3 className="text-white font-black uppercase italic text-lg mb-2">Entfernen?</h3>
            <p className="text-gray-500 text-xs mb-8 leading-relaxed">Sicher? "{itemToDelete.name}" wird endgültig aus der Cloud gelöscht.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setItemToDelete(null)} className="bg-gray-900 py-4 rounded-2xl font-bold text-gray-500 uppercase text-[10px]">Nein</button>
              <button onClick={async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id)); setItemToDelete(null); }} className="bg-red-600 py-4 rounded-2xl font-bold text-white uppercase text-[10px]">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// React Entry Point
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
