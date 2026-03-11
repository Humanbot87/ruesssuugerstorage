import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Minus, 
  Search, 
  Package, 
  Archive, 
  Hammer, 
  Trash2, 
  PlusCircle, 
  X, 
  Loader2, 
  AlertCircle, 
  User, 
  CheckCircle2, 
  Clock, 
  Camera, 
  ImageIcon, 
  AlertTriangle 
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
  query 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';

// ========================================================
// FIREBASE KONFIGURATION & INITIALISIERUNG
// ========================================================
const getFirebaseConfig = () => {
  try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.error("Fehler beim Parsen der System-Konfiguration", e);
  }
  // Fallback auf deine Projektdaten
  return {
    apiKey: "AIzaSyCkkwwicLEYX2EcdBpMtuyXRSZB35AaR0o",
    authDomain: "ruesssuugerstorage.firebaseapp.com",
    databaseURL: "https://ruesssuugerstorage-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ruesssuugerstorage",
    storageBucket: "ruesssuugerstorage.firebasestorage.app",
    messagingSenderId: "268045537391",
    appId: "1:268045537391:web:3b30913efcf97ee6fe3d9a"
  };
};

const firebaseConfig = getFirebaseConfig();
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruess-suuger-storage-v1';

/**
 * RüssSuuger Ämme Storage App
 * Hauptkomponente für die Inventarverwaltung
 */
export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authAttempted, setAuthAttempted] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const fileInputRef = useRef(null);

  const [newItem, setNewItem] = useState({
    name: '',
    quantity: 1,
    location: 'Bastelraum',
    category: 'Allgemein',
    minStock: 0,
    status: 'Verfügbar',
    image: null
  });

  // 1. Authentifizierung mit Fallback-Logik (Regel 3)
  useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenErr) {
            console.warn("Custom Token fehlgeschlagen (Mismatch?), wechsle zu anonym...", tokenErr.message);
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Kritischer Auth-Fehler:", err);
        if (isMounted) {
          setError(`Verbindung fehlgeschlagen: ${err.message}. Bitte prüfe die Firebase-Einstellungen.`);
        }
      } finally {
        if (isMounted) setAuthAttempted(true);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (isMounted) {
        setUser(u);
        if (u) setError(null);
      }
    });

    // Timeout für Ladebildschirm (Sicherheitsnetz)
    const timer = setTimeout(() => {
      if (isMounted && loading && !error) {
        console.warn("Lade-Timeout erreicht.");
      }
    }, 8000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // 2. Daten-Synchronisation (Regel 1 & 2)
  useEffect(() => {
    if (!user || !authAttempted) return;

    // Pfad nach Regel 1: /artifacts/{appId}/public/data/inventory
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const q = query(inventoryRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItems(itemsData);
      setLoading(false);
    }, (err) => {
      console.error("Firestore Fehler:", err);
      if (err.code === 'permission-denied') {
        setError("Zugriff verweigert. Bitte prüfe deine Firestore-Regeln.");
      } else {
        setError(`Datenfehler: ${err.message}`);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authAttempted]);

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
      const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
      await addDoc(inventoryRef, {
        ...newItem,
        quantity: parseInt(newItem.quantity) || 0,
        minStock: parseInt(newItem.minStock) || 0,
        updatedAt: new Date().toISOString()
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', category: 'Allgemein', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (err) { 
      console.error(err);
      setError("Speichern fehlgeschlagen. Bitte prüfe die Internetverbindung."); 
    }
  };

  const updateQuantity = async (id, delta) => {
    if (!user) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
      await updateDoc(itemRef, { 
        quantity: Math.max(0, (item.quantity || 0) + delta),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      setError("Menge konnte nicht geändert werden.");
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    if (!user) return;
    const newStatus = currentStatus === 'Verfügbar' ? 'Ausgeliehen' : 'Verfügbar';
    try {
      const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
      await updateDoc(itemRef, { status: newStatus });
    } catch (err) {
      setError("Status konnte nicht geändert werden.");
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = filterLocation === 'All' || item.location === filterLocation;
      return matchesSearch && matchesLocation;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, searchTerm, filterLocation]);

  // Lade-Screen
  if (!authAttempted && !error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-6" />
        <p className="text-gray-500 font-bold tracking-widest uppercase text-[10px] animate-pulse">Verbindung zu RüssSuuger Cloud...</p>
      </div>
    );
  }

  // Error-Screen
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-950/20 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-white font-black uppercase tracking-tighter text-xl mb-4 italic">Verbindungs-Fehler</h2>
        <div className="max-w-xs bg-red-950/10 border border-red-900/20 p-5 rounded-3xl mb-8">
          <p className="text-red-400 text-xs font-medium leading-relaxed">{error}</p>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="bg-orange-600 hover:bg-orange-500 px-10 py-4 rounded-2xl text-white font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-orange-900/20"
        >
          Neu laden
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans selection:bg-orange-500/30 pb-12">
      <header className="border-b border-gray-800 bg-[#111]/90 backdrop-blur-md sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-black text-gray-500 uppercase tracking-tighter">Rüss</span>
          <span className="text-xl font-black text-orange-500 uppercase tracking-tighter">Suuger</span>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="bg-orange-600 hover:bg-orange-500 p-2.5 rounded-2xl text-white shadow-lg active:scale-95 transition-all flex items-center gap-2"
        >
          <PlusCircle size={20} />
          <span className="hidden sm:inline text-xs font-black uppercase tracking-wider">Neu</span>
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input 
              type="text" 
              placeholder="Suche im Bastelraum..." 
              className="w-full bg-[#161616] border border-gray-800 rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-orange-500/50 text-white shadow-inner" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {['All', 'Bastelraum', 'Archivraum'].map((loc) => (
              <button 
                key={loc}
                onClick={() => setFilterLocation(loc)} 
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'bg-gray-800/40 text-gray-500 hover:text-gray-300'}`}
              >
                {loc === 'All' ? 'Alle Räume' : loc}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
             <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-4" />
             <p className="text-gray-600 font-bold uppercase tracking-[0.2em] text-[10px]">Bestand wird synchronisiert...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-24 bg-[#0d0d0d] rounded-[3rem] border-2 border-dashed border-gray-800">
            <Package className="mx-auto w-16 h-16 text-gray-800 mb-4" strokeWidth={1} />
            <p className="text-gray-600 font-bold uppercase tracking-[0.2em] text-[10px]">Keine Treffer</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-[#161616] border border-gray-800 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl group hover:border-orange-500/30 transition-all duration-500">
                <div className="h-48 bg-black relative flex items-center justify-center overflow-hidden border-b border-gray-800/50">
                  {item.image ? (
                    <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.name} />
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
                <div className="p-7 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="text-[9px] uppercase font-black tracking-widest block mb-1.5 text-orange-500/70">{item.location}</span>
                      <h3 className="text-lg font-bold text-white truncate leading-tight">{item.name}</h3>
                    </div>
                    <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                  
                  <div className="mt-auto bg-black/40 p-4 rounded-3xl border border-gray-800/50 flex items-center justify-between shadow-inner">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Minus size={18}/></button>
                    <div className="text-center">
                      <span className={`text-3xl font-black tracking-tighter ${item.quantity <= (item.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>{item.quantity}</span>
                      <span className="block text-[8px] text-gray-600 uppercase font-bold tracking-widest mt-0.5">Stück</span>
                    </div>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Plus size={18}/></button>
                  </div>
                  
                  <button 
                    onClick={() => toggleStatus(item.id, item.status)} 
                    className={`mt-5 w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${item.status === 'Ausgeliehen' ? 'bg-orange-600/10 text-orange-500 border border-orange-500/20 hover:bg-orange-600/20' : 'bg-gray-800/40 text-gray-600 border border-transparent hover:bg-gray-800/80 hover:text-gray-400'}`}
                  >
                    {item.status === 'Ausgeliehen' ? 'Verfügbar machen' : 'Ausgeliehen markieren'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal - Hinzufügen */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
          <div className="bg-[#161616] border border-gray-800 w-full max-w-md rounded-[3rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black ml-2 tracking-widest">Foto</label>
                <div onClick={() => fileInputRef.current?.click()} className="h-44 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all group">
                  {newItem.image ? (
                    <img src={newItem.image} className="w-full h-full object-cover" alt="Vorschau" />
                  ) : (
                    <div className="text-center">
                      <Camera className="mx-auto text-gray-800 mb-2 group-hover:text-orange-500/50 transition-colors" size={32} />
                      <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Kamera öffnen</p>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black ml-2 tracking-widest">Bezeichnung</label>
                <input required type="text" className="w-full bg-black p-5 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500/50 transition-all placeholder:text-gray-800 shadow-inner" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Was ist es?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2 tracking-widest">Startmenge</label>
                  <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2 tracking-widest">Warnlimit</label>
                  <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black ml-2 tracking-widest">Lagerort</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-black text-gray-700 border border-gray-800'}`}>Bastelraum</button>
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'bg-black text-gray-700 border border-gray-800'}`}>Archiv</button>
                </div>
              </div>
              <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 p-5 rounded-[2rem] font-black text-white uppercase tracking-[0.2em] shadow-xl shadow-orange-900/30 active:scale-95 transition-all mt-6 italic">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Löschen */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/98 backdrop-blur-xl">
          <div className="bg-[#1a1a1a] p-10 rounded-[3.5rem] text-center border border-red-900/20 max-w-sm shadow-2xl">
            <div className="w-20 h-20 bg-red-950/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-black mb-4 italic text-white uppercase tracking-tighter">Wirklich löschen?</h3>
            <p className="text-gray-500 text-sm mb-10 leading-relaxed px-2">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> endgültig entfernen?</p>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 bg-gray-800 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-gray-400 hover:text-white transition-colors">Abbruch</button>
              <button onClick={async () => {
                try {
                  const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id);
                  await deleteDoc(itemRef);
                  setItemToDelete(null);
                } catch (e) { setError("Löschen fehlgeschlagen."); }
              }} className="flex-1 bg-red-600 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg shadow-red-900/30 active:scale-95 transition-all">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
