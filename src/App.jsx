import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Archive, Hammer, Trash2, 
  PlusCircle, X, Loader2, AlertCircle, User, CheckCircle2, 
  Clock, Camera, Image as ImageIcon, AlertTriangle, MoreVertical 
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, query 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
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

// Initialisierung (Vermeidet Mehrfachanmeldungen)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "ruess-suuger-storage-v1";

/**
 * RüssSuuger Ämme Storage
 * Optimiert für Mobile Deletion und sauberes Branding.
 */
export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const fileInputRef = useRef(null);

  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null
  });

  // 1. Authentifizierung
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth-Fehler:", err);
        if (isMounted) setError("Login fehlgeschlagen.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (isMounted) setUser(u);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 2. Daten laden
  useEffect(() => {
    if (!user) return;
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(data);
      setLoading(false);
    }, (err) => {
      console.error("Firestore-Fehler:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // UI Handlers
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!user || !newItem.name) return;
    try {
      const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
      await addDoc(inventoryRef, {
        ...newItem, quantity: parseInt(newItem.quantity) || 0, 
        minStock: parseInt(newItem.minStock) || 0, updatedAt: new Date().toISOString()
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item || !user) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    await updateDoc(itemRef, { quantity: Math.max(0, (item.quantity || 0) + delta) });
  };

  const deleteItem = async () => {
    if (!itemToDelete || !user) return;
    try {
      const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id);
      await deleteDoc(itemRef);
      setItemToDelete(null);
    } catch (err) { console.error(err); }
  };

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
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        setNewItem(prev => ({ ...prev, image: canvas.toDataURL('image/jpeg', 0.6) }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
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
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-orange-500 w-12 h-12 mb-4" />
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest animate-pulse italic">Lager wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans selection:bg-orange-500/30">
      {/* Header mit zusammengeschriebenem Namen */}
      <header className="border-b border-gray-800 bg-[#111]/95 backdrop-blur-md sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <h1 className="text-xl font-black uppercase italic flex items-baseline gap-0">
          <span style={{ color: '#6b7280' }}>Rüss</span><span style={{ color: '#f97316' }}>Suuger</span> 
          <span style={{ color: '#6b7280' }} className="ml-1.5 text-[10px] not-italic tracking-[0.2em]">ÄMME</span>
        </h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 hover:bg-orange-500 p-2.5 rounded-2xl text-white shadow-lg active:scale-95 transition-all">
          <PlusCircle size={24} />
        </button>
      </header>

      <main className="p-4 max-w-6xl mx-auto pb-24">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
            <input 
              type="text" 
              placeholder="Suchen..." 
              className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 text-white shadow-inner focus:border-orange-500/50" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {['All', 'Bastelraum', 'Archivraum'].map((loc) => (
              <button 
                key={loc} 
                onClick={() => setFilterLocation(loc)} 
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-800/40 text-gray-500 hover:text-gray-300'}`}
              >
                {loc === 'All' ? 'Alle Räume' : loc}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(item => (
            <div key={item.id} className="bg-[#161616] border border-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col group hover:border-orange-500/30 transition-all duration-500">
              <div className="h-48 bg-black relative flex items-center justify-center border-b border-gray-800/50">
                {item.image ? (
                  <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                ) : (
                  <ImageIcon className="text-gray-900 group-hover:text-gray-800 transition-colors" size={64} strokeWidth={1} />
                )}
                
                {/* Lösch-Button für Mobile: Größere Touch-Fläche oben rechts */}
                <button 
                  onClick={() => setItemToDelete(item)}
                  className="absolute top-4 right-4 p-3 bg-black/60 backdrop-blur-md rounded-2xl text-gray-400 hover:text-red-500 hover:bg-black transition-all active:scale-90"
                  aria-label="Artikel löschen"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              <div className="p-7 flex-1 flex flex-col">
                <div className="mb-4">
                  <span className="text-[9px] uppercase font-black text-orange-500/70 tracking-widest block mb-1">{item.location}</span>
                  <h3 className="text-lg font-bold text-white truncate">{item.name}</h3>
                </div>
                
                <div className="mt-auto bg-black/40 p-4 rounded-3xl border border-gray-800/50 flex items-center justify-between shadow-inner">
                  <button onClick={() => updateQty(item.id, -1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400">
                    <Minus size={18}/>
                  </button>
                  <div className="text-center">
                    <span className={`text-3xl font-black tracking-tighter ${item.quantity <= (item.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>
                      {item.quantity}
                    </span>
                    <span className="block text-[8px] text-gray-600 uppercase font-bold tracking-widest mt-0.5 italic">Stück</span>
                  </div>
                  <button onClick={() => updateQty(item.id, 1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400">
                    <Plus size={18}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Modal: Hinzufügen */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-md">
          <div className="bg-[#161616] w-full max-w-md rounded-[3rem] p-8 border border-gray-800 shadow-2xl animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-6">
              <div onClick={() => fileInputRef.current?.click()} className="h-44 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all group">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" alt="Vorschau" /> : <div className="text-center"><Camera className="mx-auto text-gray-800 mb-2 group-hover:text-orange-500/50 transition-colors" size={32}/><p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Kamera</p></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
              </div>
              <input required type="text" placeholder="Bezeichnung" className="w-full bg-black p-5 rounded-2xl outline-none border border-gray-800 focus:border-orange-500/50 text-white transition-all shadow-inner" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Menge" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                <input type="number" placeholder="Limit" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white' : 'bg-black text-gray-700 border border-gray-800'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white' : 'bg-black text-gray-700 border border-gray-800'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 p-5 rounded-3xl font-black text-white uppercase tracking-[0.2em] shadow-xl shadow-orange-900/30 active:scale-95 transition-all mt-4 italic">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Löschen (Mobile Optimiert) */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="bg-[#1a1a1a] p-10 rounded-[3.5rem] text-center border border-red-900/20 max-w-sm shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-950/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-black mb-4 italic text-white uppercase tracking-tighter">Wirklich löschen?</h3>
            <p className="text-gray-500 text-sm mb-10 leading-relaxed px-2">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> endgültig aus dem Inventar entfernen?</p>
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={deleteItem} 
                className="w-full bg-red-600 py-5 rounded-3xl font-black uppercase text-xs tracking-widest text-white shadow-lg shadow-red-900/30 active:scale-95 transition-all"
              >
                Ja, endgültig löschen
              </button>
              <button 
                onClick={() => setItemToDelete(null)} 
                className="w-full bg-gray-800 py-5 rounded-3xl font-black uppercase text-xs tracking-widest text-gray-400 hover:text-white transition-colors"
              >
                Abbrechen
              </button>
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
