import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Archive, Hammer, Trash2, 
  PlusCircle, X, Loader2, AlertCircle, User, CheckCircle2, 
  Clock, Camera, Image as ImageIcon, AlertTriangle, LogOut, Key, Settings, ShieldCheck, UserCheck,
  ArrowLeft, Download, FileSpreadsheet, Hash, Sparkles, Brain, UserPlus, ShieldAlert, ChevronRight
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, getDoc, setDoc, query, where, getDocs
} from 'firebase/firestore';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile 
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

// Initialisierung
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "ruess-suuger-storage-v1";

// --- KI Konfiguration ---
const apiKey = ""; // Wird von der Umgebung bereitgestellt

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [members, setMembers] = useState([]); 
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [authStep, setAuthStep] = useState('identify'); // identify, setup_password, login
  const [authForm, setAuthForm] = useState({ firstName: '', lastName: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [targetMember, setTargetMember] = useState(null);

  const [activeTab, setActiveTab] = useState('inventory'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); 
  const fileInputRef = useRef(null);

  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, image: null
  });

  const [newMemberName, setNewMemberName] = useState({ first: '', last: '' });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const userDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', u.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        } else {
          // Fallback für Raphael Drago initial
          if (u.displayName === 'Raphael Drago') setUserData({ role: 'admin', firstName: 'Raphael', lastName: 'Drago' });
        }
        setUser(u);
      } else {
        setUser(null);
        setUserData(null);
        setAuthStep('identify');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;
    const invUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const memUnsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { invUnsub(); memUnsub(); };
  }, [user]);

  const getInternalEmail = (name) => `${name.toLowerCase().trim().replace(/\s+/g, '.')}@rs.storage`;

  const handleIdentify = async (e) => {
    e.preventDefault();
    setAuthError('');
    const fullName = `${authForm.firstName.trim()} ${authForm.lastName.trim()}`;
    
    // Initial-Setup für Raphael Drago
    if (fullName === 'Raphael Drago' && members.length === 0) {
      setTargetMember({ fullName: 'Raphael Drago', role: 'admin', isInitialized: false });
      setAuthStep('setup_password');
      return;
    }

    const memberMatch = members.find(m => m.fullName.toLowerCase() === fullName.toLowerCase());
    if (memberMatch) {
      setTargetMember(memberMatch);
      setAuthStep(memberMatch.isInitialized ? 'login' : 'setup_password');
    } else {
      setAuthError("Name nicht auf der Liste. Ein Admin muss dich hinzufügen.");
    }
  };

  const handleAuthAction = async (e) => {
    e.preventDefault();
    setAuthError('');
    const email = getInternalEmail(targetMember.fullName);

    try {
      if (authStep === 'setup_password') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, authForm.password);
        await updateProfile(userCredential.user, { displayName: targetMember.fullName });
        
        const memberId = targetMember.id || userCredential.user.uid;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', userCredential.user.uid), {
          fullName: targetMember.fullName,
          uid: userCredential.user.uid,
          role: targetMember.role || 'member',
          isInitialized: true,
          email: email
        });
        if (targetMember.id) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', targetMember.id));
      } else {
        await signInWithEmailAndPassword(auth, email, authForm.password);
      }
    } catch (err) {
      setAuthError("Passwort falsch oder technischer Fehler.");
    }
  };

  const analyzeImageWithAI = async (base64Data) => {
    setIsAnalyzing(true);
    const pureBase64 = base64Data.split(',')[1];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Was ist das? Antworte nur mit dem Namen des Gegenstands." }, { inlineData: { mimeType: "image/png", data: pureBase64 } }] }]
        })
      });
      const result = await response.json();
      const aiName = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (aiName) setNewItem(prev => ({ ...prev, name: aiName }));
    } catch (e) { console.error("AI Error", e); }
    setIsAnalyzing(false);
  };

  const exportToExcel = () => {
    const headers = ["Name", "Menge", "Lagerort", "Warn-Limit"];
    const csv = [headers.join(";"), ...items.map(i => [i.name, i.quantity, i.location, i.minStock].join(";"))].join("\n");
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.setAttribute("download", "Inventar.csv");
    link.click();
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#161616] border border-gray-800 p-8 rounded-[2.5rem] shadow-2xl">
          <h1 className="text-2xl font-black text-center mb-8 uppercase italic"><span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span></h1>
          <form onSubmit={authStep === 'identify' ? handleIdentify : handleAuthAction} className="space-y-4">
            {authStep === 'identify' ? (
              <>
                <input required type="text" placeholder="Vorname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white" value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})} />
                <input required type="text" placeholder="Nachname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white" value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})} />
              </>
            ) : (
              <input required autoFocus type="password" placeholder="Passwort" className="w-full bg-black border border-orange-500/50 rounded-2xl p-4 text-white" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
            )}
            {authError && <p className="text-red-500 text-[10px] font-bold text-center">{authError}</p>}
            <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black uppercase text-white shadow-lg">
              {authStep === 'identify' ? 'Weiter' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isUserAdmin = userData?.role === 'admin' || user.displayName === 'Raphael Drago';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-lg font-black uppercase italic tracking-tighter leading-none text-orange-500">RüssSuuger</h1>
          <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{user.displayName}</span>
        </div>
        <div className="flex gap-2">
          {isUserAdmin && <button onClick={() => setIsAdminPanelOpen(true)} className="p-2.5 bg-gray-800 rounded-xl text-orange-500"><Users size={20}/></button>}
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2.5 rounded-xl text-white"><Plus size={20}/></button>
          <button onClick={() => signOut(auth)} className="bg-gray-800 p-2.5 rounded-xl text-gray-500"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input type="text" placeholder="Suchen..." className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 text-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {['All', 'Bastelraum', 'Archivraum'].map(loc => (
              <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${filterLocation === loc ? 'bg-orange-600 border-orange-500 text-white' : 'bg-gray-800/50 border-gray-800 text-gray-500'}`}>
                {loc === 'All' ? 'Alle' : loc}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.filter(i => (i.name.toLowerCase().includes(searchTerm.toLowerCase())) && (filterLocation === 'All' || i.location === filterLocation)).map(item => (
            <div key={item.id} className="bg-[#161616] rounded-3xl overflow-hidden border border-gray-800 shadow-xl group">
              <div className="h-44 bg-black flex items-center justify-center relative">
                {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-900" size={64} />}
              </div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg text-white truncate">{item.name}</h3>
                  <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500"><Trash2 size={16}/></button>
                </div>
                <p className="text-[10px] text-gray-600 font-bold uppercase mb-4">{item.location}</p>
                <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-gray-800/50">
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id), { quantity: Math.max(0, item.quantity - 1) })} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl"><Minus size={18}/></button>
                  <span className={`text-3xl font-black ${item.quantity <= item.minStock ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id), { quantity: item.quantity + 1 })} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl"><Plus size={18}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-xl">
          <div className="bg-[#161616] w-full max-w-2xl rounded-[2.5rem] border border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-black uppercase italic">Admin Panel</h2>
              <button onClick={() => setIsAdminPanelOpen(false)} className="bg-gray-800 p-2 rounded-full"><X size={20}/></button>
            </div>
            <div className="p-8 overflow-y-auto space-y-6">
              <button onClick={exportToExcel} className="w-full bg-green-600/10 border border-green-600/30 p-4 rounded-2xl flex items-center justify-center gap-2 text-green-500 uppercase font-black text-xs">
                <FileSpreadsheet size={20} /> Inventar Export (CSV)
              </button>
              <form onSubmit={async (e) => {
                e.preventDefault();
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), {
                  fullName: `${newMemberName.first} ${newMemberName.last}`, role: 'member', isInitialized: false
                });
                setNewMemberName({ first: '', last: '' });
              }} className="space-y-4 pt-4 border-t border-gray-800">
                <p className="text-[10px] font-bold uppercase text-gray-500">Mitglied hinzufügen</p>
                <div className="grid grid-cols-2 gap-2">
                  <input required placeholder="Vorname" className="bg-black p-4 rounded-2xl outline-none border border-gray-800 text-sm" value={newMemberName.first} onChange={e => setNewMemberName({...newMemberName, first: e.target.value})} />
                  <input required placeholder="Nachname" className="bg-black p-4 rounded-2xl outline-none border border-gray-800 text-sm" value={newMemberName.last} onChange={e => setNewMemberName({...newMemberName, last: e.target.value})} />
                </div>
                <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black uppercase text-xs shadow-lg">Mitglied Speichern</button>
              </form>
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-gray-500">Mitgliederliste</p>
                {members.map(m => (
                  <div key={m.id} className="bg-black/40 p-4 rounded-2xl border border-gray-800 flex justify-between items-center">
                    <span className="font-bold text-sm">{m.fullName} {m.role === 'admin' && '🛡️'}</span>
                    <button onClick={async () => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id), { role: m.role === 'admin' ? 'member' : 'admin' })} className="text-[9px] font-black uppercase text-orange-500">Admin-Status</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-xl">
          <div className="bg-[#161616] w-full max-w-md rounded-[2.5rem] p-8 border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase italic">Neuer Artikel</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
                ...newItem, quantity: parseInt(newItem.quantity), minStock: parseInt(newItem.minStock),
                updatedBy: user.displayName, updatedAt: new Date().toISOString()
              });
              setIsModalOpen(false);
              setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, image: null });
            }} className="space-y-4">
              <div onClick={() => fileInputRef.current.click()} className="h-40 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer relative">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <div className="text-center"><Camera className="mx-auto text-gray-800 mb-2" size={32}/><p className="text-[9px] font-bold uppercase text-gray-600">Foto aufnehmen</p></div>}
                {isAnalyzing && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files[0];
                  if(!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    setNewItem({...newItem, image: ev.target.result});
                    analyzeImageWithAI(ev.target.result);
                  };
                  reader.readAsDataURL(file);
                }} />
              </div>
              <input required placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 text-white" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Menge" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                <input type="number" placeholder="Warn-Limit" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border ${newItem.location === 'Bastelraum' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border ${newItem.location === 'Archivraum' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Archiv</butt
