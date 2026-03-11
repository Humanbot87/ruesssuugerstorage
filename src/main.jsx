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
import { initializeApp } from 'firebase/app';
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

// ========================================================
// DEINE FIREBASE KONFIGURATION (Fest integriert)
// ========================================================
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

// Initialisierung
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All'); 
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

  // Authentifizierung
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth-Fehler:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Daten laden
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
    }, (error) => {
      console.error("Firestore-Fehler:", error);
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
        quantity: parseInt(newItem.quantity),
        minStock: parseInt(newItem.minStock),
        updatedAt: new Date().toISOString()
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', category: 'Allgemein', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (error) { console.error("Hinzufügen Fehler:", error); }
  };

  const updateQuantity = async (id, delta) => {
    if (!user) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    await updateDoc(itemRef, { 
      quantity: Math.max(0, item.quantity + delta),
      updatedAt: new Date().toISOString()
    });
  };

  const toggleStatus = async (id, currentStatus) => {
    if (!user) return;
    const newStatus = currentStatus === 'Verfügbar' ? 'Ausgeliehen' : 'Verfügbar';
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    await updateDoc(itemRef, { status: newStatus });
  };

  const confirmDelete = async () => {
    if (!user || !itemToDelete) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id);
    await deleteDoc(itemRef);
    setItemToDelete(null);
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = filterLocation === 'All' || item.location === filterLocation;
      const matchesStatus = filterStatus === 'All' || (item.status || 'Verfügbar') === filterStatus;
      return matchesSearch && matchesLocation && matchesStatus;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchTerm, filterLocation, filterStatus]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex items-baseline">
          <span className="text-xl font-black text-gray-500 uppercase">Rüss</span>
          <span className="text-xl font-black text-orange-500 uppercase">Suuger</span>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2 rounded-xl text-white active:scale-95 transition-all">
          <PlusCircle size={24} />
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input type="text" placeholder="Suchen..." className="w-full bg-[#161616] border border-gray-800 rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-orange-500/50 text-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => setFilterLocation('All')} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${filterLocation === 'All' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Alle</button>
            <button onClick={() => setFilterLocation('Bastelraum')} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${filterLocation === 'Bastelraum' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Bastelraum</button>
            <button onClick={() => setFilterLocation('Archivraum')} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${filterLocation === 'Archivraum' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Archiv</button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-[#0d0d0d] rounded-3xl border-2 border-dashed border-gray-800">
            <Package className="mx-auto w-16 h-16 text-gray-800 mb-4" />
            <p className="text-gray-500 italic">Keine Artikel gefunden</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className="bg-[#161616] border border-gray-800 rounded-[2rem] overflow-hidden flex flex-col shadow-xl">
                <div className="h-44 bg-black relative flex items-center justify-center">
                  {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-900" size={64} />}
                  {item.status === 'Ausgeliehen' && <div className="absolute inset-0 bg-orange-950/40 backdrop-blur-[2px] flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-white">Ausgeliehen</div>}
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="text-[10px] uppercase font-black text-orange-500/70 tracking-widest block mb-1">{item.location}</span>
                      <h3 className="text-lg font-bold text-white truncate">{item.name}</h3>
                    </div>
                    <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500"><Trash2 size={18} /></button>
                  </div>
                  <div className="mt-auto bg-black/40 p-4 rounded-2xl border border-gray-800/50 flex items-center justify-between">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-2 bg-gray-800 rounded-xl"><Minus size={18}/></button>
                    <span className={`text-3xl font-black ${item.quantity <= item.minStock ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-2 bg-gray-800 rounded-xl"><Plus size={18}/></button>
                  </div>
                  <button onClick={() => toggleStatus(item.id, item.status)} className={`mt-4 w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${item.status === 'Ausgeliehen' ? 'bg-orange-600/10 text-orange-500 border border-orange-500/20' : 'bg-gray-800/40 text-gray-500'}`}>
                    {item.status === 'Ausgeliehen' ? 'Auf Verfügbar setzen' : 'Als Ausgeliehen markieren'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#161616] border border-gray-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-white italic">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-5">
              <div onClick={() => fileInputRef.current?.click()} className="h-40 bg-black rounded-2xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <Camera className="text-gray-800" size={32} />}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
              </div>
              <input required type="text" placeholder="Bezeichnung" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Menge" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                <input type="number" placeholder="Limit" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl font-bold text-xs ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white' : 'bg-black text-gray-700 border border-gray-800'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl font-bold text-xs ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white' : 'bg-black text-gray-700 border border-gray-800'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 p-5 rounded-3xl font-black text-white uppercase tracking-widest shadow-xl shadow-orange-900/30">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/95">
          <div className="bg-[#1a1a1a] p-8 rounded-[2rem] text-center border border-red-900/20 max-w-xs shadow-2xl">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h3 className="text-lg font-bold text-white mb-6 italic">Wirklich löschen?</h3>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 bg-gray-800 py-3 rounded-xl font-bold">Nein</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 py-3 rounded-xl font-bold text-white">Ja</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================================
// RENDERING (Das sorgt dafür, dass die Seite nicht weiß bleibt)
// ========================================================
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
