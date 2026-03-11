import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Archive, Hammer, Trash2, 
  PlusCircle, X, Loader2, AlertCircle, User, CheckCircle2, 
  Clock, Camera, Image as ImageIcon, AlertTriangle, LogOut, KeyRound,
  ShieldCheck, FileSpreadsheet, Users
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, query, getDocs, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged, signOut, updateProfile 
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

const appId = "ruess-suuger-storage-v1";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Hilfsfunktion für den internen E-Mail-Login
const nameToEmail = (first, last) => {
  const cleanFirst = first.trim().toLowerCase().replace(/\s+/g, '');
  const cleanLast = last.trim().toLowerCase().replace(/\s+/g, '');
  return `${cleanFirst}.${cleanLast}@ruess-suuger.internal`;
};

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  
  // Auth State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const fileInputRef = useRef(null);
  
  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null
  });

  const isAdmin = user?.displayName === 'Raphael Drago';

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Inventory Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
    return onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  // Member Listener (Nur für Admin)
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'members'));
    return onSnapshot(q, (snapshot) => {
      setMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [isAdmin]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const email = nameToEmail(firstName, lastName);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: fullName });
        // In Stammdaten speichern
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', userCredential.user.uid), {
          fullName,
          email,
          createdAt: serverTimestamp()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setAuthError('Konto nicht gefunden. Klicke unten auf "Registrieren" für den Erst-Login.');
      } else if (err.code === 'auth/wrong-password') {
        setAuthError('Falsches Passwort.');
      } else {
        setAuthError('Fehler: ' + err.message);
      }
    }
  };

  const exportToExcel = () => {
    const headers = ["Name", "Menge", "Lagerort", "Warn-Limit", "Status", "Zuletzt Geändert"];
    const csvContent = [
      headers.join(";"),
      ...items.map(i => [
        i.name, 
        i.quantity, 
        i.location, 
        i.minStock, 
        i.status || 'Verfügbar',
        i.updatedAt ? new Date(i.updatedAt).toLocaleDateString() : '-'
      ].join(";"))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Inventar_RuessSuuger_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), {
      quantity: Math.max(0, item.quantity + delta),
      updatedAt: new Date().toISOString(),
      updatedBy: user.displayName
    });
  };

  const filtered = useMemo(() => {
    return items.filter(i => {
      const s = i.name.toLowerCase().includes(searchTerm.toLowerCase());
      const l = filterLocation === 'All' || i.location === filterLocation;
      return s && l;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchTerm, filterLocation]);

  if (authLoading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#161616] rounded-3xl p-8 border border-gray-800 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-orange-600/10 rounded-full mb-4 animate-pulse">
              <Package className="text-orange-500" size={40} />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-white">
              <span className="text-gray-500">Rüss</span>Suuger Storage
            </h1>
            <p className="text-gray-500 text-xs mt-2 uppercase tracking-widest font-bold">
              {isRegistering ? 'Erst-Registrierung' : 'Mitglieder Login'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input required type="text" placeholder="Vorname" className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={firstName} onChange={e => setFirstName(e.target.value)} />
              <input required type="text" placeholder="Nachname" className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <div className="relative">
              <KeyRound className="absolute left-4 top-4 text-gray-600" size={20} />
              <input required type="password" placeholder="Passwort" className="w-full bg-black p-4 pl-12 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            {authError && <p className="text-red-500 text-xs text-center font-bold bg-red-500/10 p-2 rounded-lg">{authError}</p>}

            <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-orange-900/20 active:scale-95 transition-all">
              {isRegistering ? 'Konto anlegen' : 'Einloggen'}
            </button>
          </form>

          <button 
            onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
            className="w-full mt-6 text-gray-600 text-[10px] font-bold uppercase tracking-widest hover:text-orange-500 transition-colors"
          >
            {isRegistering ? 'Zurück zum Login' : 'Erstes Mal hier? Jetzt registrieren'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex flex-col">
           <h1 className="text-lg font-black uppercase tracking-tighter leading-none"><span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span></h1>
           <div className="flex items-center gap-1">
             <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{user.displayName}</span>
             {isAdmin && <ShieldCheck size={10} className="text-orange-500" />}
           </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => setIsAdminPanelOpen(true)} className="bg-gray-800 p-2 rounded-lg text-orange-500 hover:bg-gray-700">
              <ShieldCheck size={20} />
            </button>
          )}
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2 rounded-lg text-white shadow-lg active:scale-95"><PlusCircle size={20}/></button>
          <button onClick={() => signOut(auth)} className="bg-gray-800 p-2 rounded-lg text-gray-400 hover:text-white"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-600" size={18} />
            <input type="text" placeholder="Suche..." className="w-full bg-[#161616] p-3 pl-10 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Bastelraum', 'Archivraum'].map(loc => (
              <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                {loc === 'All' ? 'Alle' : loc}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <div key={item.id} className="bg-[#161616] rounded-2xl overflow-hidden border border-gray-800 shadow-xl group">
              <div className="h-40 bg-black flex items-center justify-center relative">
                {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <ImageIcon className="text-gray-800" size={48} />}
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg truncate">{item.name}</h3>
                  <button onClick={() => setItemToDelete(item)} className="text-gray-700 hover:text-red-500"><Trash2 size={16}/></button>
                </div>
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-4 tracking-wider">{item.location}</p>
                <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-gray-800/50">
                  <button onClick={() => updateQty(item.id, -1)} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700"><Minus size={16}/></button>
                  <div className="text-center">
                    <span className={`text-2xl font-black ${item.quantity <= item.minStock ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                  </div>
                  <button onClick={() => updateQty(item.id, 1)} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700"><Plus size={16}/></button>
                </div>
                <div className="mt-2 flex justify-between items-center px-1">
                  <span className="text-[8px] text-gray-700 font-bold uppercase">{item.updatedBy || 'Unbekannt'}</span>
                  <span className="text-[8px] text-gray-700 font-bold">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ADMIN PANEL MODAL */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-md">
          <div className="bg-[#161616] w-full max-w-2xl rounded-3xl p-6 border border-orange-500/20 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-orange-500" />
                <h2 className="text-xl font-bold uppercase italic">Admin Panel</h2>
              </div>
              <button onClick={() => setIsAdminPanelOpen(false)} className="bg-gray-800 p-2 rounded-full"><X size={20}/></button>
            </div>

            <div className="flex gap-4 mb-8">
              <button 
                onClick={exportToExcel}
                className="flex-1 bg-green-600/10 border border-green-600/30 p-4 rounded-2xl flex items-center justify-center gap-3 text-green-500 hover:bg-green-600/20 transition-all"
              >
                <FileSpreadsheet size={24} />
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase leading-none">Exportieren</p>
                  <p className="text-xs font-bold">Excel/CSV Liste</p>
                </div>
              </button>
            </div>

            <h3 className="text-xs font-black uppercase tracking-widest text-gray-600 mb-4 flex items-center gap-2">
              <Users size={14} /> Registrierte Mitglieder ({members.length})
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {members.map(m => (
                <div key={m.id} className="bg-black/40 p-3 rounded-xl border border-gray-800 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-sm text-white">{m.fullName}</p>
                    <p className="text-[9px] text-gray-600 font-bold uppercase">{m.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] text-gray-700 font-bold uppercase tracking-tighter">Registriert am</p>
                    <p className="text-[10px] text-gray-500 font-bold italic">{m.createdAt?.toDate().toLocaleDateString() || '-'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NEW ITEM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#161616] w-full max-w-md rounded-3xl p-6 border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold italic text-white uppercase">Neuaufnahme</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
                ...newItem,
                quantity: parseInt(newItem.quantity),
                minStock: parseInt(newItem.minStock),
                updatedAt: new Date().toISOString(),
                updatedBy: user.displayName
              });
              setIsModalOpen(false);
              setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null });
            }} className="space-y-4">
              <div onClick={() => fileInputRef.current.click()} className="h-32 bg-black rounded-xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500 transition-all">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <Camera className="text-gray-700" />}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setNewItem({...newItem, image: ev.target.result});
                  reader.readAsDataURL(file);
                }} />
              </div>
              <input required type="text" placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 text-white" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Menge" className="w-full bg-black p-4 rounded-xl border border-gray-800" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                <input type="number" placeholder="Limit" className="w-full bg-black p-4 rounded-xl border border-gray-800" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-3 rounded-xl text-xs font-bold transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white' : 'bg-black text-gray-600'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-3 rounded-xl text-xs font-bold transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white' : 'bg-black text-gray-600'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black text-white uppercase tracking-widest mt-4">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DIALOG */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#1a1a1a] p-8 rounded-3xl text-center border border-red-900/20 max-w-xs shadow-2xl">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h3 className="text-lg font-bold mb-6 italic text-white underline decoration-red-500">Wirklich löschen?</h3>
            <div className="flex gap-4">
              <button onClick=
