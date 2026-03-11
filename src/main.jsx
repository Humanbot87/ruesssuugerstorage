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
  Image as ImageIcon,
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

// --- Firebase Konfiguration (KORRIGIERT) ---
const firebaseConfig = {
  apiKey: "AIzaSyCkkwwicLEYX2EcdBpMtuyXRSZB35AaR0o",
  authDomain: "ruesssuugerstorage.firebaseapp.com",
  databaseURL: "https://ruesssuugerstorage-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ruesssuugerstorage",
  storageBucket: "ruesssuugerstorage.firebasestorage.app",
  messagingSenderId: "268045537391",
  appId: "1:268045537391:web:3b30913efcf97ee6fe3d9a"
};

// App-ID für die Pfadstruktur (Regel 1 konform)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruess-suuger-storage-v1';

// Firebase Initialisierung
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

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
    name: '',
    quantity: 1,
    location: 'Bastelraum',
    category: 'Allgemein',
    minStock: 0,
    status: 'Verfügbar',
    image: null
  });

  // 1. Authentifizierung (Sicherheits-Check & Fallback)
  useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (e) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth-Fehler:", err);
        if (isMounted) setError("Verbindung fehlgeschlagen. Bitte prüfe Internet & Firebase-Settings.");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (isMounted) {
        setUser(u);
        if (!u) {
          // Falls Auth hängen bleibt, erzwinge nach 5s einen Timeout-Fehler
          setTimeout(() => {
            if (isMounted && !auth.currentUser) setLoading(false);
          }, 5000);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 2. Daten-Synchronisation (Echtzeit)
  useEffect(() => {
    if (!user) return;

    // Pfad: /artifacts/{appId}/public/data/inventory
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const q = query(inventoryRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItems(itemsData);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Firestore Fehler:", err);
      if (err.code === 'permission-denied') {
        setError("Zugriff verweigert! Hast du die Regeln in Firebase veröffentlicht?");
      } else {
        setError("Fehler beim Laden: " + err.message);
      }
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
        const MAX_SIZE = 400;
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setNewItem(prev => ({ ...prev, image: dataUrl }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!user || !newItem.name) return;

    try {
      // Die Datenbank wird hier "automatisch" erstellt, sobald das erste Dokument geschrieben wird
      const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
      await addDoc(inventoryRef, {
        ...newItem,
        quantity: parseInt(newItem.quantity) || 0,
        minStock: parseInt(newItem.minStock) || 0,
        updatedAt: new Date().toISOString()
      });
      setNewItem({ 
        name: '', 
        quantity: 1, 
        location: 'Bastelraum', 
        category: 'Allgemein', 
        minStock: 0, 
        status: 'Verfügbar',
        image: null 
      });
      setIsModalOpen(false);
    } catch (err) {
      console.error("Speicher-Fehler:", err);
      alert("Fehler beim Speichern: " + err.message);
    }
  };

  const updateQuantity = async (id, delta) => {
    if (!user) return;
    const item = items.find(i => i.id === id);
    if (!item) return;

    const newQuantity = Math.max(0, (item.quantity || 0) + delta);
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    
    try {
      await updateDoc(itemRef, { 
        quantity: newQuantity,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Update-Fehler:", err);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    if (!user) return;
    const newStatus = currentStatus === 'Verfügbar' ? 'Ausgeliehen' : 'Verfügbar';
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    try {
      await updateDoc(itemRef, { status: newStatus });
    } catch (err) {
      console.error("Status-Update fehlgeschlagen.");
    }
  };

  const confirmDelete = async () => {
    if (!user || !itemToDelete) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id);
    try {
      await deleteDoc(itemRef);
      setItemToDelete(null);
    } catch (err) {
      console.error("Lösch-Fehler.");
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = (item.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = filterLocation === 'All' || item.location === filterLocation;
      return matchesSearch && matchesLocation;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, searchTerm, filterLocation]);

  if (loading && !error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">Lager-Cloud wird synchronisiert...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
        <h2 className="text-xl font-black text-white uppercase mb-4 tracking-tighter">System-Fehler</h2>
        <div className="bg-red-900/10 border border-red-900/20 p-6 rounded-3xl max-w-sm mb-6 text-red-400 text-xs">
          {error}
        </div>
        <button onClick={() => window.location.reload()} className="bg-orange-600 px-10 py-4 rounded-2xl text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-orange-900/20">
          Neu laden
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans selection:bg-orange-500/30">
      <header className="border-b border-gray-800 bg-[#111]/90 backdrop-blur-md sticky top-0 z-30 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-baseline shrink-0">
            <span className="text-2xl font-black text-gray-500 uppercase tracking-tighter">Rüss</span>
            <span className="text-2xl font-black text-orange-500 uppercase tracking-tighter">Suuger</span>
            <span className="text-2xl font-black text-gray-500 ml-2 uppercase tracking-tighter italic text-xs">Ämme</span>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg">
            <PlusCircle size={20} />
            <span className="hidden sm:inline font-bold text-xs uppercase tracking-widest">Neuer Artikel</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input 
              type="text" 
              placeholder="Suche im Inventar..." 
              className="w-full bg-[#161616] border border-gray-800 rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-orange-500/50 text-white shadow-inner" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
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

        {filteredItems.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-[2.5rem] bg-[#0d0d0d]">
            <Package className="mx-auto w-16 h-16 text-gray-800 mb-6" />
            <p className="text-gray-600 font-bold uppercase tracking-[0.2em] text-[10px]">Keine Artikel im Lager</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-[#161616] border border-gray-800 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl group hover:border-orange-500/30 transition-all duration-500">
                <div className="h-48 bg-black relative flex items-center justify-center overflow-hidden border-b border-gray-800/50">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  ) : (
                    <ImageIcon className="text-gray-900 group-hover:text-gray-800 transition-colors" size={64} strokeWidth={1} />
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
                      <span className={`text-[9px] uppercase font-black tracking-widest block mb-1.5 ${item.location === 'Bastelraum' ? 'text-blue-500' : 'text-purple-500'}`}>{item.location}</span>
                      <h3 className="text-lg font-bold text-white truncate leading-tight">{item.name}</h3>
                    </div>
                    <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500 transition-colors p-1"><Trash2 size={18} /></button>
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto bg-black/40 p-4 rounded-3xl border border-gray-800/50 shadow-inner">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Minus size={18}/></button>
                    <div className="text-center">
                      <span className={`text-3xl font-black tracking-tighter ${item.quantity <= (item.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>{item.quantity}</span>
                      <span className="block text-[8px] text-gray-600 uppercase font-bold tracking-widest mt-0.5 italic">Stück</span>
                    </div>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-3 bg-gray-800 rounded-2xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Plus size={18}/></button>
                  </div>
                  
                  <button 
                    onClick={() => toggleStatus(item.id, item.status || 'Verfügbar')} 
                    className={`mt-5 w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${item.status === 'Ausgeliehen' ? 'bg-orange-600/10 text-orange-500 border border-orange-500/20 hover:bg-orange-600/20' : 'bg-gray-800/40 text-gray-600 border border-transparent hover:bg-gray-800/80 hover:text-gray-400'}`}
                  >
                    {item.status === 'Ausgeliehen' ? <><User size={14} /> Verfügbar machen</> : <><CheckCircle2 size={14} /> Ausgeliehen markieren</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md transition-all">
          <div className="bg-[#161616] border border-gray-800 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a]">
              <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest ml-2">Foto aufnehmen</label>
                <div onClick={() => fileInputRef.current?.click()} className="relative w-full h-44 bg-black border-2 border-dashed border-gray-800 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-orange-500/50 transition-all overflow-hidden group">
                  {newItem.image ? (
                    <img src={newItem.image} className="w-full h-full object-cover" alt="Vorschau" />
                  ) : (
                    <div className="text-center p-4">
                      <Camera className="mx-auto text-gray-800 mb-2 group-hover:text-orange-500/50 transition-colors" size={32} />
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Kamera öffnen</p>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest ml-2">Bezeichnung</label>
                <input required type="text" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white focus:border-orange-500/50 transition-all outline-none" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} placeholder="z.B. Schminke, Klebeband..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest ml-2">Anzahl</label>
                  <input type="number" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500/50 transition-all" value={newItem.quantity} onChange={(e) => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest ml-2">Warn-Limit</label>
                  <input type="number" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500/50 transition-all" value={newItem.minStock} onChange={(e) => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest ml-2">Lagerort</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-black border-gray-800 text-gray-600'}`}>Bastelraum</button>
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 border-purple-500 text-white shadow-lg' : 'bg-black border-gray-800 text-gray-600'}`}>Archiv</button>
                </div>
              </div>
              
              <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-5 rounded-3xl shadow-xl shadow-orange-900/40 transition-all active:scale-95 mt-4 uppercase tracking-[0.2em] italic">Artikel Speichern</button>
            </form>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/98 backdrop-blur-xl transition-all">
          <div className="bg-[#1a1a1a] border border-red-900/20 w-full max-w-sm rounded-[3.5rem] p-10 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-950/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} /></div>
            <h2 className="text-xl font-black text-white mb-2 italic uppercase tracking-tighter">Wirklich löschen?</h2>
            <p className="text-gray-500 text-sm mb-10 leading-relaxed px-2">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> endgültig entfernen?</p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setItemToDelete(null)} className="py-4 rounded-2xl bg-gray-800 text-gray-400 font-black uppercase text-[10px] tracking-widest">Nein</button>
              <button onClick={confirmDelete} className="py-4 rounded-2xl bg-red-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
