import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Archive, Hammer, Trash2, 
  PlusCircle, X, Loader2, AlertCircle, User, CheckCircle2, 
  Clock, Camera, Image as ImageIcon, AlertTriangle, LogOut, Key, UserPlus, Settings, Users
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, query, getDoc, setDoc, where 
} from 'firebase/firestore';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut 
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

// Initialisierung
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "ruess-suuger-storage-v1";

export default function App() {
  // --- States ---
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [members, setMembers] = useState([]); // Stammdaten für Admins
  
  // Auth Flow States
  const [authStep, setAuthStep] = useState('identify'); // identify, setup_password, login
  const [authForm, setAuthForm] = useState({ firstName: '', lastName: '', password: '' });
  const [authError, setAuthError] = useState('');

  // Dashboard States
  const [activeTab, setActiveTab] = useState('inventory'); // inventory, admin
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const fileInputRef = useRef(null);

  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null
  });

  // --- Auth Logik ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const userDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
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

  const generatePseudoEmail = (fn, ln) => {
    return `${fn.toLowerCase().trim()}.${ln.toLowerCase().trim()}@ruesssuuger.internal`;
  };

  const handleIdentify = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!authForm.firstName || !authForm.lastName) return;

    const memberId = `${authForm.firstName.toLowerCase()}_${authForm.lastName.toLowerCase()}`;
    try {
      const memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', memberId);
      const memberSnap = await getDoc(memberRef);

      if (!memberSnap.exists()) {
        setAuthError("Name nicht in den Stammdaten gefunden. Bitte Admin kontaktieren.");
        return;
      }

      const data = memberSnap.data();
      if (data.hasPassword) {
        setAuthStep('login');
      } else {
        setAuthStep('setup_password');
      }
    } catch (err) {
      setAuthError("Verbindungsfehler zur Datenbank.");
    }
  };

  const handleSetupPassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (authForm.password.length < 6) {
      setAuthError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    const email = generatePseudoEmail(authForm.firstName, authForm.lastName);
    const memberId = `${authForm.firstName.toLowerCase()}_${authForm.lastName.toLowerCase()}`;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, authForm.password);
      const u = userCredential.user;
      
      // Profil speichern
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid), {
        firstName: authForm.firstName,
        lastName: authForm.lastName,
        role: 'member'
      });

      // Registry aktualisieren
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', memberId), {
        hasPassword: true,
        uid: u.uid
      });

    } catch (err) {
      setAuthError("Fehler beim Erstellen des Logins.");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const email = generatePseudoEmail(authForm.firstName, authForm.lastName);
    try {
      await signInWithEmailAndPassword(auth, email, authForm.password);
    } catch (err) {
      setAuthError("Passwort nicht korrekt.");
    }
  };

  // --- Admin: Mitglieder hinzufügen ---
  const handleAddMemberToRegistry = async (e) => {
    e.preventDefault();
    const fn = e.target.fn.value.trim();
    const ln = e.target.ln.value.trim();
    if (!fn || !ln) return;

    const memberId = `${fn.toLowerCase()}_${ln.toLowerCase()}`;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', memberId), {
        firstName: fn,
        lastName: ln,
        hasPassword: false,
        addedAt: new Date().toISOString()
      });
      e.target.reset();
      alert(`${fn} wurde zu den Stammdaten hinzugefügt.`);
    } catch (err) {
      alert("Fehler beim Hinzufügen.");
    }
  };

  // --- Daten laden ---
  useEffect(() => {
    if (!user) return;
    
    // Inventar
    const invUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Mitglieder (nur für Admins sichtbar)
    let memUnsub = () => {};
    if (userData?.role === 'admin') {
      memUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), (snap) => {
        setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }

    return () => { invUnsub(); memUnsub(); };
  }, [user, userData]);

  // --- Inventar Funktionen ---
  const toggleItemStatus = async (item) => {
    const newStatus = item.status === 'Ausgeliehen' ? 'Verfügbar' : 'Ausgeliehen';
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id), {
      status: newStatus,
      updatedBy: userData?.firstName || 'System'
    });
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), {
      quantity: Math.max(0, (item.quantity || 0) + delta)
    });
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
        ...newItem,
        quantity: parseInt(newItem.quantity) || 0,
        minStock: parseInt(newItem.minStock) || 0,
        updatedAt: new Date().toISOString()
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const filtered = useMemo(() => {
    return items.filter(i => {
      const s = (i.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const l = filterLocation === 'All' || i.location === filterLocation;
      return s && l;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, searchTerm, filterLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-orange-500 w-12 h-12 mb-4" />
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Synchronisiere Cloud...</p>
      </div>
    );
  }

  // --- Auth View ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-black uppercase italic flex items-center justify-center gap-0">
              <span style={{ color: '#6b7280' }}>Rüss</span><span style={{ color: '#f97316' }}>Suuger</span> 
            </h1>
            <p className="text-gray-600 text-[10px] font-bold uppercase tracking-[0.3em] mt-2 italic">Ämme Storage</p>
          </div>

          <div className="bg-[#161616] border border-gray-800 p-8 rounded-[2.5rem] shadow-2xl">
            <form onSubmit={authStep === 'identify' ? handleIdentify : (authStep === 'setup_password' ? handleSetupPassword : handleLogin)} className="space-y-5">
              <div className="space-y-4">
                <input 
                  disabled={authStep !== 'identify'}
                  required type="text" placeholder="Vorname" 
                  className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white placeholder:text-gray-800 outline-none focus:border-orange-500/50 disabled:opacity-50"
                  value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})}
                />
                <input 
                  disabled={authStep !== 'identify'}
                  required type="text" placeholder="Nachname" 
                  className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white placeholder:text-gray-800 outline-none focus:border-orange-500/50 disabled:opacity-50"
                  value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})}
                />
              </div>

              {authStep !== 'identify' && (
                <div className="space-y-2 animate-in slide-in-from-top-4">
                  <p className="text-orange-500 text-[10px] font-black uppercase tracking-widest ml-2 flex items-center gap-2">
                    <Key size={12} /> {authStep === 'setup_password' ? 'Wähle ein Passwort (min. 6 Zeichen)' : 'Gib dein Passwort ein'}
                  </p>
                  <input required autoFocus type="password" placeholder="Passwort" className="w-full bg-black border border-orange-900/30 rounded-2xl p-4 text-white outline-none focus:border-orange-500" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                </div>
              )}

              {authError && <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl text-red-500 text-[10px] font-bold text-center">{authError}</div>}

              <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 p-5 rounded-3xl text-white font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                {authStep === 'identify' ? 'Prüfen' : 'Anmelden'}
              </button>

              {authStep !== 'identify' && (
                <button type="button" onClick={() => setAuthStep('identify')} className="w-full text-gray-600 text-[10px] font-black uppercase tracking-widest py-2">Zurück</button>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- Dashboard View ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans selection:bg-orange-500/30">
      <header className="border-b border-gray-800 bg-[#111]/95 backdrop-blur-md sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <h1 className="text-xl font-black uppercase italic flex items-baseline gap-0">
          <span style={{ color: '#6b7280' }}>Rüss</span><span style={{ color: '#f97316' }}>Suuger</span> 
          <span style={{ color: '#6b7280' }} className="ml-1.5 text-[10px] not-italic tracking-[0.2em]">ÄMME</span>
        </h1>
        <div className="flex items-center gap-2">
          {userData?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab(activeTab === 'inventory' ? 'admin' : 'inventory')}
              className={`p-2.5 rounded-2xl transition-all ${activeTab === 'admin' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              {activeTab === 'admin' ? <Package size={24} /> : <Settings size={24} />}
            </button>
          )}
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 hover:bg-orange-500 p-2.5 rounded-2xl text-white shadow-lg active:scale-95 transition-all">
            <PlusCircle size={24} />
          </button>
          <button onClick={() => signOut(auth)} className="bg-gray-800 hover:bg-gray-700 p-2.5 rounded-2xl text-gray-400 active:scale-95 transition-all">
            <LogOut size={24} />
          </button>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto pb-24">
        {activeTab === 'admin' ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-[#161616] border border-gray-800 p-8 rounded-[2.5rem] shadow-xl">
              <h2 className="text-xl font-black uppercase italic text-white mb-6 flex items-center gap-3">
                <Users className="text-orange-500" /> Mitglieder-Stammdaten
              </h2>
              <form onSubmit={handleAddMemberToRegistry} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="fn" required type="text" placeholder="Vorname" className="bg-black border border-gray-800 p-4 rounded-2xl text-white outline-none focus:border-orange-500" />
                <input name="ln" required type="text" placeholder="Nachname" className="bg-black border border-gray-800 p-4 rounded-2xl text-white outline-none focus:border-orange-500" />
                <button type="submit" className="bg-orange-600 p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-orange-500 transition-all">Mitglied hinzufügen</button>
              </form>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.map(m => (
                <div key={m.id} className="bg-[#111] border border-gray-800 p-5 rounded-3xl flex justify-between items-center">
                  <div>
                    <p className="font-bold text-white">{m.firstName} {m.lastName}</p>
                    <p className={`text-[9px] uppercase font-black tracking-widest ${m.hasPassword ? 'text-green-500' : 'text-gray-600'}`}>
                      {m.hasPassword ? 'Registriert' : 'Wartet auf Login'}
                    </p>
                  </div>
                  {!m.hasPassword && (
                    <button onClick={async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id))} className="text-gray-700 hover:text-red-500 transition-colors p-2">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 mb-8">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input type="text" placeholder="Inventar durchsuchen..." className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 text-white shadow-inner focus:border-orange-500/50" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {['All', 'Bastelraum', 'Archivraum'].map((loc) => (
                  <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-800/40 text-gray-500'}`}>{loc === 'All' ? 'Alle Räume' : loc}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map(item => (
                <div key={item.id} className="bg-[#161616] border border-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col group hover:border-orange-500/30 transition-all duration-500">
                  <div className="h-48 bg-black relative flex items-center justify-center border-b border-gray-800/50 overflow-hidden">
                    {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" /> : <ImageIcon className="text-gray-900" size={64} />}
                    <button onClick={() => setItemToDelete(item)} className="absolute top-4 right-4 p-3 bg-black/60 backdrop-blur-md rounded-2xl text-gray-400 hover:text-red-500 transition-all active:scale-90"><Trash2 size={20} /></button>
                    {item.status === 'Ausgeliehen' && (
                      <div className="absolute inset-0 bg-orange-950/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                        <div className="bg-orange-600 text-white text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2"><Clock size={12} /> Ausgeliehen</div>
                      </div>
                    )}
                  </div>
                  <div className="p-7 flex-1 flex flex-col">
                    <div className="mb-4">
                      <span className="text-[9px] uppercase font-black text-orange-500/70 tracking-widest block mb-1">{item.location}</span>
                      <h3 className="text-lg font-bold text-white truncate">{item.name}</h3>
                    </div>
                    <div className="mt-auto bg-black/40 p-4 rounded-3xl border border-gray-800/50 flex items-center justify-between shadow-inner mb-4">
                      <button onClick={() => updateQty(item.id, -1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 text-gray-400 active:scale-90"><Minus size={18}/></button>
                      <div className="text-center">
                        <span className={`text-3xl font-black tracking-tighter ${item.quantity <= (item.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>{item.quantity}</span>
                        <span className="block text-[8px] text-gray-600 uppercase font-bold tracking-widest mt-0.5 italic">Stück</span>
                      </div>
                      <button onClick={() => updateQty(item.id, 1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 text-gray-400 active:scale-90"><Plus size={18}/></button>
                    </div>
                    <button onClick={() => toggleItemStatus(item)} className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${item.status === 'Ausgeliehen' ? 'bg-green-600/10 text-green-500 border border-green-500/20' : 'bg-orange-600/10 text-orange-500 border border-orange-500/20'}`}>
                      {item.status === 'Ausgeliehen' ? <><CheckCircle2 size={14} /> Wieder im Lager</> : <><Clock size={14} /> Ausleihen</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Modals (Hinzufügen & Löschen) identisch mit vorheriger Version, nur Styling angepasst... */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-md">
          <div className="bg-[#161616] w-full max-w-md rounded-[3rem] p-8 border border-gray-800 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-6">
              <div onClick={() => fileInputRef.current?.click()} className="h-44 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all group">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" alt="Vorschau" /> : <div className="text-center"><Camera className="mx-auto text-gray-800 mb-2 group-hover:text-orange-500/50 transition-colors" size={32}/><p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Foto</p></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      const MAX = 400;
                      let w = img.width, h = img.height;
                      if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
                      else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                      canvas.width = w; canvas.height = h;
                      const ctx = canvas.getContext('2d');
                      ctx.drawImage(img, 0, 0, w, h);
                      setNewItem(prev => ({ ...prev, image: canvas.toDataURL('image/jpeg', 0.6) }));
                    };
                    img.src = event.target.result;
                  };
                  reader.readAsDataURL(file);
                }} />
              </div>
              <input required type="text" placeholder="Bezeichnung" className="w-full bg-black p-5 rounded-2xl outline-none border border-gray-800 focus:border-orange-500/50 text-white transition-all shadow-inner" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Menge" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                <input type="number" placeholder="Limit" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white shadow-lg' : 'bg-black text-gray-700 border border-gray-800'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white shadow-lg' : 'bg-black text-gray-700 border border-gray-800'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 p-5 rounded-3xl font-black text-white uppercase tracking-[0.2em] shadow-xl shadow-orange-900/30 active:scale-95 transition-all mt-4 italic">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="bg-[#1a1a1a] p-10 rounded-[3.5rem] text-center border border-red-900/20 max-w-sm shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-950/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-black mb-4 italic text-white uppercase tracking-tighter">Endgültig löschen?</h3>
            <p className="text-gray-500 text-sm mb-10 leading-relaxed px-2">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> entfernen?</p>
            <div className="grid grid-cols-1 gap-4">
              <button onClick={async () => {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id));
                setItemToDelete(null);
              }} className="w-full bg-red-600 py-5 rounded-3xl font-black uppercase text-xs tracking-widest text-white shadow-lg">Löschen</button>
              <button onClick={() => setItemToDelete(null)} className="w-full bg-gray-800 py-5 rounded-3xl font-black uppercase text-xs tracking-widest text-gray-400">Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rendering
const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<App />);
}
