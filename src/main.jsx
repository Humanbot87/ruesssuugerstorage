import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Minus, Search, Package, Archive, Hammer, Trash2, 
  PlusCircle, X, Loader2, AlertCircle, User, CheckCircle2, 
  Clock, Camera, Image as ImageIcon, AlertTriangle 
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

// Initialisierung (Vermeidet Fehler bei Hot-Reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruess-suuger-storage-v1';

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const fileInputRef = useRef(null);

  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null
  });

  // Schritt 1: Authentifizierung (Regel 3 befolgen)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth-Fehler:", err);
        // Auch bei Fehler versuchen wir die UI anzuzeigen, falls anonym möglich ist
        if (!auth.currentUser) {
           signInAnonymously(auth).catch(e => console.error("Anonyme Auth fehlgeschlagen", e));
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Schritt 2: Daten laden (Regel 1 & 2 befolgen)
  useEffect(() => {
    if (!user) return;

    // Pfad: /artifacts/{appId}/public/data/inventory
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    
    const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(data);
      setLoading(false);
    }, (err) => {
      console.error("Firestore-Fehler:", err);
      // Wir setzen loading auf false, damit der User zumindest eine Fehlermeldung sieht statt des Hängens
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

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

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!user || !newItem.name) return;
    try {
      const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
      await addDoc(inventoryRef, {
        ...newItem, 
        quantity: parseInt(newItem.quantity) || 0, 
        minStock: parseInt(newItem.minStock) || 0, 
        updatedAt: new Date().toISOString()
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (err) { 
      console.error("Fehler beim Speichern:", err); 
    }
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item || !user) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    await updateDoc(itemRef, { 
      quantity: Math.max(0, (item.quantity || 0) + delta), 
      updatedAt: new Date().toISOString() 
    });
  };

  const toggleStatus = async (id, cur) => {
    if (!user) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    await updateDoc(itemRef, { 
      status: cur === 'Verfügbar' ? 'Ausgeliehen' : 'Verfügbar' 
    });
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
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Verbindung zum Lager wird hergestellt...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 selection:bg-orange-500/30">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <h1 className="text-xl font-black uppercase tracking-tighter italic">
          <span className="text-gray-500">Rüss</span>
          <span className="text-orange-500">Suuger</span> 
          <span className="text-gray-400 ml-2 not-italic">Ämme</span>
        </h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 hover:bg-orange-500 p-2 rounded-xl text-white transition-all shadow-lg active:scale-95">
          <PlusCircle size={24} />
        </button>
      </header>

      <main className="p-4 max-w-6xl mx-auto pb-20">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 text-gray-600" size={18} />
            <input 
              type="text" 
              placeholder="Inventar durchsuchen..." 
              className="w-full bg-[#161616] p-3.5 pl-10 rounded-2xl outline-none border border-gray-800 focus:border-orange-500/50 transition-all text-white placeholder:text-gray-700" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Bastelraum', 'Archivraum'].map((loc) => (
              <button 
                key={loc}
                onClick={() => setFilterLocation(loc)} 
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-800/40 text-gray-600 hover:text-gray-400'}`}
              >
                {loc === 'All' ? 'Alle Räume' : loc}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-[2.5rem] bg-[#0d0d0d]">
             <Package className="mx-auto w-16 h-16 text-gray-800 mb-4" strokeWidth={1} />
             <p className="text-gray-600 font-bold uppercase tracking-widest text-[10px]">Keine Artikel gefunden</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map(item => (
              <div key={item.id} className="bg-[#161616] rounded-[2.5rem] overflow-hidden border border-gray-800 shadow-2xl flex flex-col group hover:border-orange-500/30 transition-all duration-500">
                <div className="h-44 bg-black flex items-center justify-center relative border-b border-gray-800/50 overflow-hidden">
                  {item.image ? (
                    <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                  ) : (
                    <ImageIcon className="text-gray-900" size={64} strokeWidth={1} />
                  )}
                  {item.status === 'Ausgeliehen' && (
                    <div className="absolute inset-0 bg-orange-950/40 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="bg-orange-600 text-white text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2">
                        <Clock size={12} /> Ausgeliehen
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="text-[9px] uppercase font-black text-orange-500/70 tracking-widest block mb-1">{item.location}</span>
                      <h3 className="text-lg font-bold text-white truncate">{item.name}</h3>
                    </div>
                    <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500 transition-colors shrink-0"><Trash2 size={16}/></button>
                  </div>
                  
                  <div className="mt-auto bg-black/40 p-4 rounded-3xl border border-gray-800/50 flex items-center justify-between shadow-inner">
                    <button onClick={() => updateQty(item.id, -1)} className="p-2.5 bg-gray-800 rounded-xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Minus size={18}/></button>
                    <div className="text-center">
                      <span className={`text-3xl font-black tracking-tighter ${item.quantity <= (item.minStock || 0) ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                      <span className="block text-[8px] text-gray-600 uppercase font-bold tracking-widest mt-0.5">Stück</span>
                    </div>
                    <button onClick={() => updateQty(item.id, 1)} className="p-2.5 bg-gray-800 rounded-xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Plus size={18}/></button>
                  </div>

                  <button 
                    onClick={() => toggleStatus(item.id, item.status)} 
                    className={`w-full mt-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${item.status === 'Ausgeliehen' ? 'bg-orange-600/10 text-orange-500 border border-orange-500/20 hover:bg-orange-600/20' : 'bg-gray-800/40 text-gray-600 border border-transparent hover:bg-gray-800/80 hover:text-gray-400'}`}
                  >
                    {item.status === 'Ausgeliehen' ? 'Verfügbar machen' : 'Ausgeliehen markieren'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-md">
          <div className="bg-[#161616] w-full max-w-md rounded-[3rem] p-8 border border-gray-800 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-5">
              <div onClick={() => fileInputRef.current.click()} className="h-40 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all">
                {newItem.image ? (
                  <img src={newItem.image} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <Camera className="mx-auto text-gray-800 mb-2" size={32}/>
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Foto aufnehmen</p>
                  </div>
                )}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
              </div>
              <input required type="text" placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 focus:border-orange-500/50 text-white transition-all" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Menge" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                <input type="number" placeholder="Warnlimit" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white shadow-lg' : 'bg-black text-gray-700 border border-gray-800'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white shadow-lg' : 'bg-black text-gray-700 border border-gray-800'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 p-5 rounded-3xl font-black text-white uppercase tracking-[0.2em] shadow-xl shadow-orange-900/30 hover:bg-orange-500 active:scale-95 transition-all mt-4 italic">Artikel Speichern</button>
            </form>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#1a1a1a] p-10 rounded-[3rem] text-center border border-red-900/20 max-w-sm shadow-2xl">
            <div className="w-20 h-20 bg-red-950/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-black mb-4 italic text-white uppercase tracking-tighter">Wirklich löschen?</h3>
            <p className="text-gray-500 text-sm mb-10 leading-relaxed px-2">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> endgültig aus dem Inventar entfernen?</p>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 bg-gray-800 py-4 rounded-2xl font-bold text-gray-400">Nein</button>
              <button onClick={async () => {
                const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id);
                await deleteDoc(itemRef);
                setItemToDelete(null);
              }} className="flex-1 bg-red-600 py-4 rounded-2xl font-bold text-white shadow-lg shadow-red-900/30">Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
