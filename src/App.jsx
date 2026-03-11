import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Archive, Hammer, Trash2, 
  PlusCircle, X, Loader2, AlertCircle, User, CheckCircle2, 
  Clock, Camera, Image as ImageIcon, AlertTriangle, Sparkles, BrainCircuit
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, query 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
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

// --- KI API Konfiguration (Gemini) ---
const apiKey = ""; // Wird von der Umgebung bereitgestellt

async function callGeminiAI(prompt, imageData = null) {
  const model = "gemini-2.5-flash-preview-09-2025";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  let contents = [];
  if (imageData) {
    // Falls ein Bild vorhanden ist (Base64)
    const base64Data = imageData.split(',')[1];
    contents = [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
      ]
    }];
  } else {
    contents = [{ parts: [{ text: prompt }] }];
  }

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: "Du bist ein hilfreicher Lager-Assistent für einen Schweizer Fasnachts-Verein namens RüssSuuger Ämme. Antworte kurz, präzise und freundlich auf Schweizerdeutsch oder Deutsch." }]
    }
  };

  // Exponential Backoff für API-Retries
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("API Request failed");
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (e) {
      if (i === 4) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef(null);

  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null
  });

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Auth Error", err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const analyzeItemWithAI = async () => {
    if (!newItem.image && !newItem.name) return;
    setAiLoading(true);
    try {
      const prompt = newItem.image 
        ? "Analysiere dieses Bild. Was ist das für ein Gegenstand? Schlage einen kurzen Namen und einen passenden Lagerort (Bastelraum oder Archivraum) vor." 
        : `Gib mir eine kurze Info zu diesem Lager-Gegenstand: ${newItem.name}. Wo sollte man das am besten lagern?`;
      
      const aiResult = await callGeminiAI(prompt, newItem.image);
      alert("KI Vorschlag: " + aiResult);
    } catch (err) {
      console.error("AI Error", err);
    } finally {
      setAiLoading(false);
    }
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
        ...newItem, quantity: parseInt(newItem.quantity), minStock: parseInt(newItem.minStock), updatedAt: new Date().toISOString()
      });
      setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, status: 'Verfügbar', image: null });
      setIsModalOpen(false);
    } catch (err) { console.error("Save Error", err); }
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item || !user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), { 
      quantity: Math.max(0, item.quantity + delta), updatedAt: new Date().toISOString() 
    });
  };

  const toggleStatus = async (id, cur) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), { 
      status: cur === 'Verfügbar' ? 'Ausgeliehen' : 'Verfügbar' 
    });
  };

  const filtered = useMemo(() => {
    return items.filter(i => {
      const s = i.name.toLowerCase().includes(searchTerm.toLowerCase());
      const l = filterLocation === 'All' || i.location === filterLocation;
      const st = filterStatus === 'All' || (i.status || 'Verfügbar') === filterStatus;
      return s && l && st;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchTerm, filterLocation, filterStatus]);

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <h1 className="text-xl font-black uppercase tracking-tighter"><span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span> Ämme</h1>
        <div className="flex gap-2">
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2 rounded-lg text-white shadow-lg shadow-orange-900/20 active:scale-95"><PlusCircle /></button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-600" size={18} />
            <input type="text" placeholder="Inventar durchsuchen..." className="w-full bg-[#161616] p-3 pl-10 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all shadow-inner" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button onClick={() => setFilterLocation('All')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterLocation === 'All' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Alle</button>
            <button onClick={() => setFilterLocation('Bastelraum')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterLocation === 'Bastelraum' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Bastelraum</button>
            <button onClick={() => setFilterLocation('Archivraum')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterLocation === 'Archivraum' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Archiv</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <div key={item.id} className="bg-[#161616] rounded-2xl overflow-hidden border border-gray-800 shadow-xl group">
              <div className="h-40 bg-black flex items-center justify-center relative">
                {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <ImageIcon className="text-gray-800" size={48} />}
                {item.status === 'Ausgeliehen' && <div className="absolute inset-0 bg-orange-900/40 backdrop-blur-sm flex items-center justify-center font-bold text-xs uppercase tracking-widest text-white">Ausgeliehen</div>}
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
                <button onClick={() => toggleStatus(item.id, item.status)} className="w-full mt-3 p-2 bg-gray-800 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:bg-gray-700 transition-all">
                  {item.status === 'Ausgeliehen' ? 'Verfügbar machen' : 'Als Ausgeliehen markieren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#161616] w-full max-w-md rounded-3xl p-6 border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold italic">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div className="flex gap-2">
                <div onClick={() => fileInputRef.current.click()} className="flex-1 h-32 bg-black rounded-xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-all">
                  {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <Camera className="text-gray-700" />}
                  <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleImageChange} />
                </div>
                {(newItem.image || newItem.name) && (
                  <button 
                    type="button" 
                    onClick={analyzeItemWithAI}
                    disabled={aiLoading}
                    className="w-16 bg-orange-600/20 text-orange-500 rounded-xl flex flex-col items-center justify-center gap-2 border border-orange-500/30 hover:bg-orange-600/30 transition-all disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="animate-spin" size={24} /> : <Sparkles size={24} />}
                    <span className="text-[8px] font-black uppercase">AI</span>
                  </button>
                )}
              </div>
              <input required type="text" placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[10px] text-gray-500 uppercase font-bold ml-2">Menge</label>
                   <input type="number" className="w-full bg-black p-4 rounded-xl border border-gray-800" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] text-gray-500 uppercase font-bold ml-2">Warn-Limit</label>
                   <input type="number" className="w-full bg-black p-4 rounded-xl border border-gray-800" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-3 rounded-xl text-xs font-bold transition-all ${newItem.location === 'Bastelraum' ? 'bg-blue-600 text-white' : 'bg-black text-gray-600'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-3 rounded-xl text-xs font-bold transition-all ${newItem.location === 'Archivraum' ? 'bg-purple-600 text-white' : 'bg-black text-gray-600'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-orange-900/20 active:scale-95 transition-all">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-6 backdrop-blur-md">
          <div className="bg-[#1a1a1a] p-8 rounded-3xl text-center border border-red-900/20 max-w-xs shadow-2xl">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h3 className="text-lg font-bold mb-6 italic text-white">Wirklich löschen?</h3>
            <div className="flex gap-4">
              <button onClick={() => setItemToDelete(null)} className="flex-1 bg-gray-800 p-3 rounded-xl font-bold">Nein</button>
              <button onClick={async () => {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id));
                setItemToDelete(null);
              }} className="flex-1 bg-red-600 p-3 rounded-xl font-bold text-white shadow-lg shadow-red-900/20">Ja</button>
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

                
