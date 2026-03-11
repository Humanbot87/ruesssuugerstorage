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
  onAuthStateChanged 
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

// Sichere Initialisierung
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
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null
  });

  // Authentifizierung
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth).catch(err => {
          console.error("Auth-Fehler:", err);
          setError("Anmeldung fehlgeschlagen. Bitte Internet prüfen.");
          setLoading(false);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Daten abrufen
  useEffect(() => {
    if (!user) return;

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
      console.error("Firestore-Fehler:", err);
      setError("Daten konnten nicht geladen werden (Regeln prüfen!).");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Bild-Upload Logik
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
        quantity: parseInt(newItem.quantity) || 0,
        minStock: parseInt(newItem.minStock) || 0,
        updatedAt: new Date().toISOString()
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const updateQuantity = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    await updateDoc(itemRef, { quantity: Math.max(0, (item.quantity || 0) + delta) });
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = filterLocation === 'All' || item.location === filterLocation;
      return matchesSearch && matchesLocation;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, searchTerm, filterLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Lager wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-white font-bold mb-2">Fehler beim Start</h2>
        <p className="text-gray-500 text-sm mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="bg-orange-600 px-6 py-2 rounded-xl text-white font-bold">Neu versuchen</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="font-black text-xl flex items-center gap-1 uppercase tracking-tighter">
          <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 hover:bg-orange-500 p-2.5 rounded-xl text-white shadow-lg shadow-orange-900/20 active:scale-95 transition-all">
          <PlusCircle size={24} />
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input type="text" placeholder="Suche..." className="w-full bg-[#161616] border border-gray-800 rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-orange-500/50 text-white shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {['All', 'Bastelraum', 'Archivraum'].map((loc) => (
              <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-800/50 text-gray-500 hover:text-gray-300'}`}>
                {loc === 'All' ? 'Alle' : loc}
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-[#0d0d0d] rounded-3xl border-2 border-dashed border-gray-800">
            <Package className="mx-auto w-16 h-16 text-gray-800 mb-4" />
            <p className="text-gray-600 font-bold uppercase tracking-[0.2em] text-[10px]">Keine Artikel gefunden</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-[#161616] border border-gray-800 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl group hover:border-orange-500/30 transition-all duration-300">
                <div className="h-44 bg-black flex items-center justify-center relative border-b border-gray-800/50 overflow-hidden">
                  {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <ImageIcon className="text-gray-900" size={64} />}
                  {item.status === 'Ausgeliehen' && <div className="absolute inset-0 bg-orange-900/40 backdrop-blur-[1px] flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-white">Ausgeliehen</div>}
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-lg text-white truncate pr-2">{item.name}</h3>
                    <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                  </div>
                  <p className="text-[10px] text-orange-500/70 uppercase font-black tracking-widest mb-4 italic">{item.location}</p>
                  
                  <div className="mt-auto flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-gray-800/50 shadow-inner">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-2.5 bg-gray-800 rounded-xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Minus size={18}/></button>
                    <div className="text-center">
                      <span className={`text-3xl font-black ${item.quantity <= (item.minStock || 0) ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                    </div>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-2.5 bg-gray-800 rounded-xl hover:bg-gray-700 active:scale-90 transition-all text-gray-400"><Plus size={18}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal - Neuer Artikel */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#161616] w-full max-w-md rounded-[2.5rem] p-8 border border-gray-800 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-5">
              <div onClick={() => fileInputRef.current.click()} className="h-40 bg-black rounded-2xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <div className="text-center"><Camera className="mx-auto text-gray-800 mb-2" size={32}/><p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Foto</p></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
              </div>
              <input required type="text" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500/50" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Bezeichnung..." />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} placeholder="Menge" />
                <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} placeholder="Warnlimit" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-black text-gray-600 border border-gray-800'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'bg-black text-gray-600 border border-gray-800'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 p-5 rounded-3xl font-black text-white uppercase tracking-widest shadow-xl shadow-orange-900/30 hover:bg-orange-500 active:scale-95 transition-all mt-4 italic">Artikel Speichern</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Löschen */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#1a1a1a] p-10 rounded-[3rem] text-center border border-red-900/20 max-w-sm shadow-2xl">
            <div className="w-20 h-20 bg-red-950/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-black mb-4 italic text-white uppercase tracking-tighter">Wirklich löschen?</h3>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 bg-gray-800 py-4 rounded-2xl font-bold text-gray-400">Nein</button>
              <button onClick={async () => {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id));
                setItemToDelete(null);
              }} className="flex-1 bg-red-600 py-4 rounded-2xl font-bold text-white shadow-lg shadow-red-900/30">Ja, löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rendering
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
