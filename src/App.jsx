import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Archive, Hammer, Trash2, 
  PlusCircle, X, Loader2, AlertCircle, User, CheckCircle2, 
  Clock, Camera, Image as ImageIcon, AlertTriangle, LogOut, KeyRound
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, query, getDoc, setDoc 
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

// --- Hilfsfunktion: Name zu Email-Format wandeln ---
const nameToEmail = (first, last) => {
  const cleanFirst = first.trim().toLowerCase().replace(/\s+/g, '');
  const cleanLast = last.trim().toLowerCase().replace(/\s+/g, '');
  return `${cleanFirst}.${cleanLast}@ruess-suuger.internal`;
};

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  
  // Auth Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const fileInputRef = useRef(null);
  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Inventory Data Listener
  useEffect(() => {
    if (!user) return;
    setItemsLoading(true);
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setItemsLoading(false);
    }, (err) => {
      console.error("Firestore Error", err);
      setItemsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const email = nameToEmail(firstName, lastName);
    
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { 
          displayName: `${firstName.trim()} ${lastName.trim()}` 
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setAuthError('Konto nicht gefunden. Bitte wechsle zu "Erstmals registrieren".');
      } else if (err.code === 'auth/wrong-password') {
        setAuthError('Falsches Passwort.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('Dieser Name ist bereits registriert. Bitte logge dich normal ein.');
      } else {
        setAuthError('Fehler: ' + err.message);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleImageChange = (e) => {
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
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setNewItem(prev => ({ ...prev, image: canvas.toDataURL('image/jpeg', 0.6) }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!user || !newItem.name) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
        ...newItem, 
        quantity: parseInt(newItem.quantity), 
        minStock: parseInt(newItem.minStock), 
        updatedAt: new Date().toISOString(),
        updatedBy: user.displayName || user.email
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (err) { console.error("Save Error", err); }
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item || !user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), { 
      quantity: Math.max(0, item.quantity + delta), 
      updatedAt: new Date().toISOString(),
      updatedBy: user.displayName || user.email
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

  // --- LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#161616] rounded-3xl p-8 border border-gray-800 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-orange-600/10 rounded-full mb-4">
              <Package className="text-orange-500" size={40} />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-white">
              <span className="text-gray-500">Rüss</span>Suuger Storage
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {isRegistering ? 'Erstelle dein persönliches Lager-Konto' : 'Bitte melde dich mit deinem Namen an'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input required type="text" placeholder="Vorname" className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={firstName} onChange={e => setFirstName(e.target.value)} />
              <input required type="text" placeholder="Nachname" className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <div className="relative">
              <KeyRound className="absolute left-4 top-4 text-gray-600" size={20} />
              <input required type="password" placeholder="Passwort" className="w-full bg-black p-4 pl-12 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-xl flex items-center gap-3 text-red-500 text-xs">
                <AlertCircle size={16} /> {authError}
              </div>
            )}

            <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-orange-900/20 active:scale-95 transition-all">
              {isRegistering ? 'Konto erstellen' : 'Anmelden'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
              className="text-gray-500 text-xs hover:text-orange-500 transition-colors"
            >
              {isRegistering ? 'Habe bereits ein Konto' : 'Noch kein Konto? Hier registrieren'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP UI ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex flex-col">
           <h1 className="text-lg font-black uppercase tracking-tighter leading-none"><span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span></h1>
           <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{user.displayName}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2 rounded-lg text-white shadow-lg active:scale-95 transition-all"><PlusCircle /></button>
          <button onClick={handleLogout} className="bg-gray-800 p-2 rounded-lg text-gray-400 hover:text-white transition-all"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-600" size={18} />
            <input type="text" placeholder="Suchen..." className="w-full bg-[#161616] p-3 pl-10 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all shadow-inner" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Bastelraum', 'Archivraum'].map(loc => (
              <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                {loc === 'All' ? 'Alle' : loc}
              </button>
            ))}
          </div>
        </div>

        {itemsLoading ? (
           <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-700" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => (
              <div key={item.id} className="bg-[#161616] rounded-2xl overflow-hidden border border-gray-800 shadow-xl group">
                <div className="h-40 bg-black flex items-center justify-center relative">
                  {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <ImageIcon className="text-gray-800" size={48} />}
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-lg truncate">{item.name}</h3>
                    <button onClick={() => setItemToDelete(item)} className="text-gray-700 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                  </div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-4 tracking-wider">{item.location}</p>
                  <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-gray-800/50">
                    <button onClick={() => updateQty(item.id, -1)} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"><Minus size={16}/></button>
                    <div className="text-center">
                      <span className={`text-2xl font-black ${item.quantity <= item.minStock ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                    </div>
                    <button onClick={() => updateQty(item.id, 1)} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"><Plus size={16}/></button>
                  </div>
                  {item.updatedBy && <p className="text-[8px] text-gray-700 mt-2 uppercase font-bold text-right">Zuletzt: {item.updatedBy}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL NEUER ARTIKEL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#161616] w-full max-w-md rounded-3xl p-6 border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold italic text-white">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div onClick={() => fileInputRef.current.click()} className="h-32 bg-black rounded-xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <Camera className="text-gray-700" />}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
              </div>
              <input required type="text" placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[10px] text-gray-500 uppercase font-bold ml-2">Menge</label>
                   <input type="number" className="w-full bg-black p-4 rounded-xl border border-gray-800 text-white" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] text-gray-500 uppercase font-bold ml-2">Warn-Limit</label>
                   <input type="number" className="w-full bg-black p-4 rounded-xl border border-gray-800 text-white" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-3 rounded-xl text-xs font-bold transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-black text-gray-600 border border-gray-800'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-3 rounded-xl text-xs font-bold transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'bg-black text-gray-600 border border-gray-800'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-orange-900/20 active:scale-95 transition-all mt-4">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DIALOG */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#1a1a1a] p-8 rounded-3xl text-center border border-red-900/20 max-w-xs shadow-2xl">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h3 className="text-lg font-bold mb-6 italic text-white">Wirklich löschen?</h3>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 bg-gray-800 p-3 rounded-xl font-bold text-gray-300 hover:bg-gray-700 transition-colors">Nein</button>
              <button onClick={async () => {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id));
                setItemToDelete(null);
              }} className="flex-1 bg-red-600 p-3 rounded-xl font-bold text-white shadow-lg shadow-red-900/20 hover:bg-red-500 transition-colors">Ja</button>
            </div>
          </div>
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

