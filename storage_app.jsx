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
  List,
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
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCkkwwicLEYX2EcdBpMtuyXRSZB35AaR0o",
  authDomain: "ruesssuugerstorage.firebaseapp.com",
  databaseURL: "https://ruesssuugerstorage-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ruesssuugerstorage",
  storageBucket: "ruesssuugerstorage.firebasestorage.app",
  messagingSenderId: "268045537391",
  appId: "1:268045537391:web:3b30913efcf97ee6fe3d9a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
    };

const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruess-suuger-storage-v1';

// Initialisierung der Firebase-Dienste
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const [viewMode, setViewMode] = useState('grid'); 
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

  // Authentifizierungs-Logik (MANDATORY RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
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

  // Daten-Synchronisation (MANDATORY RULE 1 & 2)
  useEffect(() => {
    if (!user) return;

    // Pfad folgt strikt der Regel für öffentliche Daten
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

  // Bildverarbeitung (Größenanpassung für Cloud-Speicher)
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
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
      const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
      await addDoc(inventoryRef, {
        ...newItem,
        quantity: parseInt(newItem.quantity),
        minStock: parseInt(newItem.minStock),
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
    } catch (error) {
      console.error("Hinzufügen-Fehler:", error);
    }
  };

  const updateQuantity = async (id, delta) => {
    if (!user) return;
    const item = items.find(i => i.id === id);
    if (!item) return;

    const newQuantity = Math.max(0, item.quantity + delta);
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    
    try {
      await updateDoc(itemRef, { 
        quantity: newQuantity,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Update-Fehler:", error);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    if (!user) return;
    const newStatus = currentStatus === 'Verfügbar' ? 'Ausgeliehen' : 'Verfügbar';
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id);
    try {
      await updateDoc(itemRef, { status: newStatus });
    } catch (error) {
      console.error("Status-Update-Fehler:", error);
    }
  };

  const confirmDelete = async () => {
    if (!user || !itemToDelete) return;
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id);
    try {
      await deleteDoc(itemRef);
      setItemToDelete(null);
    } catch (error) {
      console.error("Lösch-Fehler:", error);
    }
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
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-baseline shrink-0">
            <span className="text-2xl font-black text-gray-400">Rüss</span>
            <span className="text-2xl font-black text-orange-500">Suuger</span>
            <span className="text-2xl font-black text-gray-400 ml-2">Ämme</span>
            <span className="hidden md:inline text-[10px] bg-gray-800 text-gray-500 px-2 py-1 rounded ml-4 tracking-[0.2em] uppercase font-bold">Storage</span>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-orange-900/20 active:scale-95">
            <PlusCircle size={20} />
            <span className="hidden sm:inline font-bold">Neuer Artikel</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col space-y-4 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
              <input 
                type="text" 
                placeholder="Inventar durchsuchen..." 
                className="w-full bg-[#161616] border border-gray-800 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-white placeholder:text-gray-600 shadow-inner" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
            <div className="flex gap-2 p-1 bg-[#161616] border border-gray-800 rounded-2xl overflow-x-auto no-scrollbar">
              <button onClick={() => setFilterLocation('All')} className={`px-4 py-2 rounded-xl transition-all font-medium text-xs whitespace-nowrap ${filterLocation === 'All' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Alle Räume</button>
              <button onClick={() => setFilterLocation('Bastelraum')} className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-medium text-xs whitespace-nowrap ${filterLocation === 'Bastelraum' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}><Hammer size={14} /> Bastelraum</button>
              <button onClick={() => setFilterLocation('Archivraum')} className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-medium text-xs whitespace-nowrap ${filterLocation === 'Archivraum' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}><Archive size={14} /> Archiv</button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex gap-2 p-1 bg-[#161616] border border-gray-800 rounded-2xl">
              <button onClick={() => setFilterStatus('All')} className={`px-4 py-2 rounded-xl transition-all font-medium text-xs ${filterStatus === 'All' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>Alle Status</button>
              <button onClick={() => setFilterStatus('Verfügbar')} className={`px-4 py-2 rounded-xl transition-all font-medium text-xs flex items-center gap-2 ${filterStatus === 'Verfügbar' ? 'bg-green-600/20 text-green-400' : 'text-gray-500'}`}><CheckCircle2 size={12}/> Verfügbar</button>
              <button onClick={() => setFilterStatus('Ausgeliehen')} className={`px-4 py-2 rounded-xl transition-all font-medium text-xs flex items-center gap-2 ${filterStatus === 'Ausgeliehen' ? 'bg-orange-600/20 text-orange-400' : 'text-gray-500'}`}><User size={12}/> Ausgeliehen</button>
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-[2rem] bg-[#0d0d0d]">
            <Package className="mx-auto w-20 h-20 text-gray-800 mb-6" />
            <h3 className="text-xl font-bold text-gray-400 italic">"Nüd gfonde"</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map(item => (
              <div key={item.id} className={`bg-[#161616] border border-gray-800 rounded-[2rem] overflow-hidden group hover:border-orange-500/40 transition-all duration-500 shadow-xl flex flex-col ${item.status === 'Ausgeliehen' ? 'opacity-80' : ''}`}>
                <div className="relative h-48 bg-black overflow-hidden flex items-center justify-center border-b border-gray-800/50">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  ) : (
                    <div className="text-gray-800 group-hover:text-gray-700 transition-colors">
                      <ImageIcon size={64} strokeWidth={1} />
                    </div>
                  )}
                  {item.status === 'Ausgeliehen' && (
                    <div className="absolute inset-0 bg-orange-900/20 backdrop-blur-[1px] flex items-center justify-center">
                      <div className="bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2"><Clock size={12} /> Ausgeliehen</div>
                    </div>
                  )}
                </div>
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <span className={`text-[10px] uppercase tracking-widest font-black mb-1 block ${item.location === 'Bastelraum' ? 'text-blue-400' : 'text-purple-400'}`}>{item.location}</span>
                      <h3 className="text-lg font-bold text-white group-hover:text-orange-400 transition-colors truncate">{item.name}</h3>
                    </div>
                    <button onClick={() => setItemToDelete(item)} className="text-gray-700 hover:text-red-500 p-1 transition-colors"><Trash2 size={16} /></button>
                  </div>
                  <div className="flex items-center justify-between mt-6 bg-black/50 rounded-2xl p-4 border border-gray-800/40 shadow-inner">
                    <button onClick={() => updateQuantity(item.id, -1)} className="w-11 h-11 rounded-xl bg-[#222] flex items-center justify-center hover:bg-gray-700 hover:text-white transition-all text-gray-400 shadow-lg"><Minus size={20} /></button>
                    <div className="text-center">
                      <span className={`text-3xl font-black tracking-tighter ${item.quantity <= item.minStock ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'text-orange-500'}`}>{item.quantity}</span>
                      <span className="text-[9px] text-gray-600 block uppercase font-black tracking-widest mt-0.5">Stück</span>
                    </div>
                    <button onClick={() => updateQuantity(item.id, 1)} className="w-11 h-11 rounded-xl bg-[#222] flex items-center justify-center hover:bg-gray-700 hover:text-white transition-all text-gray-400 shadow-lg"><Plus size={20} /></button>
                  </div>
                  <button onClick={() => toggleStatus(item.id, item.status || 'Verfügbar')} className={`mt-4 w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-all ${item.status === 'Ausgeliehen' ? 'bg-orange-600/10 text-orange-500 border border-orange-500/20 hover:bg-orange-600/20' : 'bg-gray-800/50 text-gray-500 border border-gray-700/50 hover:bg-gray-700/50 hover:text-gray-300'}`}>
                    {item.status === 'Ausgeliehen' ? (<><User size={14} /> Markieren als: Verfügbar</>) : (<><CheckCircle2 size={14} /> Markieren als: Ausgeliehen</>)}
                  </button>
                  {item.quantity <= item.minStock && (<div className="mt-4 flex items-center justify-center gap-2 text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse py-1 bg-red-500/10 rounded-full"><AlertCircle size={12} /> Bestand kritisch!</div>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal zum Hinzufügen */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md transition-all">
          <div className="bg-[#161616] border border-gray-800 w-full max-w-md rounded-[2.5rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a]">
              <div><h2 className="text-2xl font-black text-white italic">Neuer Artikel</h2></div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors bg-gray-800/50 p-2 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest">Artikel-Foto</label>
                <div onClick={() => fileInputRef.current?.click()} className="relative w-full h-40 bg-black border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-orange-500/50 transition-all overflow-hidden group">
                  {newItem.image ? (<><img src={newItem.image} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><Camera className="text-white" size={32} /></div></>) : (<div className="text-center p-4"><Camera className="mx-auto text-gray-700 mb-2" size={32} /><p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">Foto aufnehmen</p></div>)}
                  <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
                </div>
              </div>
              <div className="space-y-2"><label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest">Bezeichnung</label><input required type="text" className="w-full bg-black border border-gray-800 rounded-2xl p-4 focus:ring-2 focus:ring-orange-500/50 outline-none text-white transition-all placeholder:text-gray-700" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} placeholder="z.B. Konfetti..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest">Menge</label><input type="number" className="w-full bg-black border border-gray-800 rounded-2xl p-4 focus:ring-2 focus:ring-orange-500/50 outline-none text-white transition-all" value={newItem.quantity} onChange={(e) => setNewItem({...newItem, quantity: e.target.value})} /></div>
                <div className="space-y-2"><label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest">Limit</label><input type="number" className="w-full bg-black border border-gray-800 rounded-2xl p-4 focus:ring-2 focus:ring-orange-500/50 outline-none text-white transition-all" value={newItem.minStock} onChange={(e) => setNewItem({...newItem, minStock: e.target.value})} /></div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest">Lagerort</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl border flex items-center justify-center gap-2 font-bold text-xs transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-500'}`}><Hammer size={16} /> Bastelraum</button>
                  <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl border flex items-center justify-center gap-2 font-bold text-xs transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black border-gray-800 text-gray-500'}`}><Archive size={16} /> Archiv</button>
                </div>
              </div>
              <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-orange-900/40 transition-all active:scale-95 mt-4 uppercase tracking-widest italic sticky bottom-0">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {/* Lösch-Bestätigung */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-red-900/30 w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-950/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32} /></div>
            <h2 className="text-xl font-black text-white mb-2 italic">Wirklich löschen?</h2>
            <p className="text-gray-400 text-sm mb-8">Möchtest du <span className="text-white font-bold">"{itemToDelete.name}"</span> endgültig entfernen?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setItemToDelete(null)} className="py-4 rounded-xl bg-gray-800 text-gray-300 font-bold hover:bg-gray-700 transition-all">Abbrechen</button>
              <button onClick={confirmDelete} className="py-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 shadow-lg shadow-red-900/20 transition-all">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
