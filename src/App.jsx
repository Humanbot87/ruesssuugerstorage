import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  History
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
  query,
  where,
  getDocs,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
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

  // 1. Authentifizierung
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

  // 2. Daten-Sync
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
      const memberQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), where("fullName", "==", fullName));
      const querySnapshot = await getDocs(memberQuery);

      if (!querySnapshot.empty) {
        const memberData = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
        setTargetMember(memberData);
        setAuthStep(memberData.isInitialized ? 'login' : 'setup_password');
      } else if (fullName.toLowerCase() === 'raphael drago') {
        setTargetMember({ fullName: 'Raphael Drago', role: 'admin', isInitialized: false });
        setAuthStep('setup_password');
      } else {
        setAuthError("Name nicht auf der Liste. Admin muss dich zuerst erfassen.");
      }
    } catch (err) {
      setAuthError("Verbindung fehlgeschlagen.");
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
      setAuthError("Passwort falsch oder technischer Fehler.");
    } finally {
      setIsAuthChecking(false);
    }
  };

  const updateQty = async (item, delta, specificType = null) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
    let newQty = item.quantity;
    let newBorrowed = item.borrowedQuantity || 0;

    if (specificType === 'ausgeliehen') {
        if (item.quantity <= 0) return;
        newQty = item.quantity - 1;
        newBorrowed += 1;
    } else if (specificType === 'zurückgebracht') {
        if (newBorrowed <= 0) return;
        newQty = item.quantity + 1;
        newBorrowed -= 1;
    } else {
        newQty = Math.max(0, item.quantity + delta);
    }

    const logEntry = {
      user: user.displayName,
      action: specificType || (delta > 0 ? 'ausgelegt' : 'entnommen'),
      amount: 1,
      timestamp: new Date().toISOString()
    };

    await updateDoc(itemRef, { 
      quantity: newQty, 
      borrowedQuantity: newBorrowed,
      updatedBy: user.displayName,
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
    const existingItem = items.find(i => i.name.toLowerCase() === trimmedName.toLowerCase());
    const tagArray = newItem.tags ? newItem.tags.split(',').map(t => t.trim()).filter(t => t) : [];

    try {
      if (existingItem) {
        const addedQty = parseInt(newItem.quantity);
        const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', existingItem.id);
        await updateDoc(itemRef, {
          quantity: existingItem.quantity + addedQty,
          updatedBy: user.displayName,
          updatedAt: new Date().toISOString(),
          history: arrayUnion({ user: user.displayName, action: 'Bestand addiert', amount: addedQty, timestamp: new Date().toISOString() })
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
          ...newItem,
          name: trimmedName,
          tags: tagArray,
          quantity: parseInt(newItem.quantity),
          minStock: parseInt(newItem.minStock),
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

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = i.name.toLowerCase().includes(searchLower) || (i.tags && i.tags.some(t => t.toLowerCase().includes(searchLower)));
      const matchesLocation = filterLocation === 'All' || i.location === filterLocation;
      return matchesSearch && matchesLocation;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchTerm, filterLocation]);

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#161616] border border-gray-800 p-10 rounded-[3rem] shadow-2xl">
          <div className="text-center mb-10">
             <Package className="mx-auto text-orange-500 mb-4" size={52} />
             <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white">
               <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
             </h1>
             <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em] mt-2 italic">Lagerverwaltung</p>
          </div>
          <form onSubmit={authStep === 'identify' ? handleIdentify : handleAuthAction} className="space-y-4">
            {authStep === 'identify' ? (
              <>
                <input required type="text" placeholder="Vorname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all" value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})} />
                <input required type="text" placeholder="Nachname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all" value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})} />
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-orange-500 font-bold text-center mb-4 uppercase">Hallo {targetMember.fullName}</p>
                <input required autoFocus type="password" placeholder="Dein Passwort" className="w-full bg-black border border-orange-500/50 rounded-2xl p-4 text-white outline-none" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
              </div>
            )}
            {authError && <div className="text-red-500 text-[10px] font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center">{authError}</div>}
            <button type="submit" disabled={isAuthChecking} className="w-full bg-orange-600 p-4 rounded-2xl font-black uppercase text-white shadow-lg flex items-center justify-center gap-2">
              {isAuthChecking ? <Loader2 className="animate-spin" size={18} /> : (authStep === 'identify' ? 'Weiter' : 'Anmelden')}
            </button>
            {authStep !== 'identify' && <button type="button" onClick={() => setAuthStep('identify')} className="w-full text-gray-600 text-[10px] font-bold uppercase mt-2">Zurück</button>}
          </form>
        </div>
      </div>
    );
  }

  const isUserAdmin = userData?.role === 'admin' || user.displayName === 'Raphael Drago';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex flex-col">
          <h1 className="text-lg font-black uppercase italic tracking-tighter leading-none">
            <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
          </h1>
          <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{user.displayName}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="p-2.5 bg-gray-800 rounded-xl text-gray-400">
            {viewMode === 'grid' ? <ListIcon size={20}/> : <LayoutGrid size={20}/>}
          </button>
          <button onClick={() => signOut(auth)} className="bg-gray-800 p-2.5 rounded-xl text-gray-500 hover:text-red-500"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-6xl mx-auto">
        {/* Suchen & Filter */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input type="text" placeholder="Gegenstand oder Tag suchen..." className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {['All', 'Bastelraum', 'Archivraum'].map(loc => (
              <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 border-orange-500 text-white' : 'bg-gray-800/50 border-gray-800 text-gray-500'}`}>{loc === 'All' ? 'Alle Räume' : loc}</button>
            ))}
          </div>
        </div>

        {/* Hinzufügen Button oberhalb */}
        <button onClick={() => setIsModalOpen(true)} className="w-full flex items-center justify-center gap-3 bg-orange-600/10 border border-orange-500/20 hover:bg-orange-600/20 p-5 rounded-3xl transition-all mb-8 group">
          <PlusCircle className="text-orange-500 group-hover:scale-110 transition-transform" />
          <span className="font-black uppercase tracking-widest text-orange-500 text-xs">Neuer Artikel erfassen</span>
        </button>

        {filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-black/20 border-2 border-dashed border-gray-800 rounded-[3rem]"><Info className="mx-auto text-gray-800 mb-4" /><p className="text-gray-600 font-bold uppercase text-xs">Keine Artikel gefunden</p></div>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-[#161616] rounded-[2.5rem] overflow-hidden border border-gray-800 shadow-xl flex flex-col group">
                  <div className="h-44 bg-black flex items-center justify-center relative overflow-hidden border-b border-gray-800/50">
                    {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.name} /> : <ImageIcon className="text-gray-900 opacity-30" size={64} />}
                    {item.quantity <= item.minStock && <div className="absolute top-3 left-3 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase shadow-lg animate-pulse">Nachfüllen</div>}
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-lg text-white truncate pr-2 leading-tight">{item.name}</h3>
                      <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500"><Trash2 size={16}/></button>
                    </div>
                    <div className="flex gap-2 items-center mb-4">
                      <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest italic">{item.location}</span>
                    </div>

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {item.tags.map((tag, idx) => (
                          <span key={idx} className="bg-gray-800/50 text-gray-400 text-[8px] px-2 py-0.5 rounded-lg border border-gray-700 flex items-center gap-1">
                            <TagIcon size={8} /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-gray-800/50 shadow-inner">
                      <button onClick={() => updateQty(item, -1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 text-gray-400 transition-colors"><Minus size={18}/></button>
                      <div className="text-center">
                        <span className={`text-3xl font-black ${item.quantity <= item.minStock ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                        <span className="block text-[8px] text-gray-600 font-bold uppercase mt-1">{item.unit || 'Stk.'}</span>
                      </div>
                      <button onClick={() => updateQty(item, 1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 text-gray-400 transition-colors"><Plus size={18}/></button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <button onClick={() => updateQty(item, 0, 'ausgeliehen')} disabled={item.quantity <= 0} className="flex items-center justify-center gap-2 py-2 rounded-xl text-[9px] font-black uppercase border border-orange-500/20 text-orange-500 hover:bg-orange-500/10 disabled:opacity-30"><ArrowRightLeft size={12} /> Ausleihen</button>
                        <button onClick={() => updateQty(item, 0, 'zurückgebracht')} disabled={!item.borrowedQuantity} className="flex items-center justify-center gap-2 py-2 rounded-xl text-[9px] font-black uppercase bg-green-600/10 border border-green-500/20 text-green-500 hover:bg-green-600/20 disabled:opacity-30"><RotateCcw size={12} /> Zurück</button>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-800/50 flex justify-between items-center text-[7px] font-bold text-gray-700 uppercase">
                       <span>{item.updatedBy || 'N/A'}</span>
                       <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#161616] border border-gray-800 rounded-3xl overflow-hidden divide-y divide-gray-800">
              {filteredItems.map(item => (
                <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-black/20 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-black flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800">
                    {item.image ? <img src={item.image} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="text-gray-900" size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white truncate text-sm">{item.name}</h3>
                    <div className="flex gap-2 items-center mt-0.5">
                      <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">{item.location}</span>
                      {item.tags && item.tags.slice(0, 2).map((t, i) => <span key={i} className="text-[7px] text-orange-500/50 font-bold uppercase">#{t}</span>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-black px-3 py-1.5 rounded-xl border border-gray-800">
                    <button onClick={() => updateQty(item, -1)} className="text-gray-600"><Minus size={14}/></button>
                    <span className={`text-lg font-black min-w-[2ch] text-center ${item.quantity <= item.minStock ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                    <button onClick={() => updateQty(item, 1)} className="text-gray-600"><Plus size={14}/></button>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => updateQty(item, 0, 'ausgeliehen')} className="p-2 text-orange-500 hover:bg-orange-500/10 rounded-lg"><ArrowRightLeft size={16}/></button>
                    <button onClick={() => setItemToDelete(item)} className="p-2 text-gray-700 hover:text-red-500"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {/* NEW ITEM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-[#161616] w-full max-w-md rounded-[3rem] p-8 border border-gray-800 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase italic tracking-tighter text-white">Artikel aufnehmen</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveItem} className="space-y-6">
              <div onClick={() => fileInputRef.current.click()} className="h-44 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer relative group hover:border-orange-500 transition-all shadow-inner">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" alt="Preview" /> : <div className="text-center group-hover:scale-110 transition-transform"><Camera className="mx-auto text-gray-800 mb-2" size={32}/><p className="text-[10px] font-bold uppercase text-gray-600">Foto hinzufügen</p></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (ev) => { setNewItem({...newItem, image: ev.target.result}); }; reader.readAsDataURL(file); }} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Name & Tags</label>
                <input required placeholder="Bezeichnung (z.B. Schminkkoffer)..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 shadow-inner" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                <input placeholder="Tags mit Komma trennen (z.B. Schminke, Neon)..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 shadow-inner text-xs" value={newItem.tags} onChange={e => setNewItem({...newItem, tags: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Menge & Einheit</label>
                  <div className="flex gap-2">
                    <input type="number" className="flex-1 bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                    <select className="bg-black p-4 rounded-2xl border border-gray-800 text-white text-xs outline-none" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Warn-Limit</label>
                  <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Lagerort</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Bastelraum' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Bastelraum</button>
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Archivraum' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Archiv</button>
                </div>
              </div>

              <button type="submit" disabled={isSaving} className="w-full bg-orange-600 p-5 rounded-3xl font-black uppercase text-white shadow-xl shadow-orange-900/40 hover:bg-orange-500 active:scale-95 transition-all mt-4 italic tracking-widest leading-none disabled:opacity-50">
                {isSaving ? 'Verarbeitung...' : 'Speichern'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DIALOG */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#1a1a1a] p-10 rounded-[3rem] text-center border border-red-900/20 max-w-sm shadow-2xl">
            <div className="w-20 h-20 bg-red-950/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><AlertTriangle size={48} /></div>
            <h3 className="text-xl font-black mb-2 italic text-white uppercase tracking-tighter leading-tight text-center">Gegenstand löschen?</h3>
            <p className="text-gray-600 text-sm mb-10 leading-relaxed text-center">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> wirklich endgültig entfernen?</p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setItemToDelete(null)} className="bg-gray-800 py-4 rounded-2xl font-bold text-gray-400 hover:text-white transition-all shadow-lg">Nein</button>
              <button onClick={async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id)); setItemToDelete(null); }} className="bg-red-600 py-4 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all">Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
