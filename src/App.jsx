import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Trash2, PlusCircle, X, Loader2, 
  AlertCircle, LogOut, KeyRound, ShieldCheck, FileSpreadsheet, 
  Users, ChevronRight, UserPlus, ShieldAlert, ImageIcon, Camera, AlertTriangle, History,
  ArrowRightLeft, RotateCcw
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, getDoc, setDoc, query, where, serverTimestamp, arrayUnion
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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// appId auf v2 für saubere Datenstruktur mit Historie
const appId = "ruess-suuger-storage-v2";

const apiKey = ""; // Gemini API Key

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [members, setMembers] = useState([]); 
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [authStep, setAuthStep] = useState('identify'); 
  const [authForm, setAuthForm] = useState({ firstName: '', lastName: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [targetMember, setTargetMember] = useState(null);

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
        } else if (u.displayName === 'Raphael Drago') {
          setUserData({ role: 'admin', fullName: 'Raphael Drago' });
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

  const getInternalEmail = (name) => `${name.toLowerCase().trim().replace(/\s+/g, '.')}@rs.v2`;

  const handleIdentify = async (e) => {
    e.preventDefault();
    setAuthError('');
    const fullName = `${authForm.firstName.trim()} ${authForm.lastName.trim()}`;
    const isMainAdmin = fullName.toLowerCase() === 'raphael drago';
    const existingMember = members.find(m => m.fullName.toLowerCase() === fullName.toLowerCase());

    if (isMainAdmin && (!existingMember || !existingMember.isInitialized)) {
      setTargetMember({ fullName: 'Raphael Drago', role: 'admin', isInitialized: false });
      setAuthStep('setup_password');
      return;
    }

    if (existingMember) {
      setTargetMember(existingMember);
      setAuthStep(existingMember.isInitialized ? 'login' : 'setup_password');
    } else {
      setAuthError("Name nicht auf der Liste. Raphael Drago muss dich zuerst erfassen.");
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
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', userCredential.user.uid), {
          fullName: targetMember.fullName, uid: userCredential.user.uid, role: targetMember.role || 'member',
          isInitialized: true, email: email, createdAt: serverTimestamp()
        });
        if (targetMember.id && targetMember.id !== userCredential.user.uid) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', targetMember.id));
        }
      } else {
        await signInWithEmailAndPassword(auth, email, authForm.password);
      }
    } catch (err) {
      setAuthError("Fehler: " + err.message);
    }
  };

  // Protokoll-Funktion für Bestandsänderungen
  const logMovement = async (itemId, type, diff) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemId);
    const logEntry = {
      user: user.displayName,
      action: type, // 'entnommen', 'ausgelegt', 'ausgeliehen', 'zurückgebracht'
      amount: Math.abs(diff),
      timestamp: new Date().toISOString()
    };
    
    let actionText = "";
    if (type === 'ausgeliehen') actionText = `${user.displayName} hat ${logEntry.amount} Stk. ausgeliehen`;
    else if (type === 'zurückgebracht') actionText = `${user.displayName} hat ${logEntry.amount} Stk. zurückgebracht`;
    else actionText = `${user.displayName} hat ${logEntry.amount} Stk. ${type}`;

    await updateDoc(itemRef, {
      updatedBy: user.displayName,
      updatedAt: new Date().toISOString(),
      lastAction: actionText,
      history: arrayUnion(logEntry)
    });
  };

  const updateQty = async (item, delta, specificType = null) => {
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
    const newQty = Math.max(0, item.quantity + delta);
    await updateDoc(itemRef, { quantity: newQty });
    
    let type = specificType;
    if (!type) {
        type = delta > 0 ? 'ausgelegt' : 'entnommen';
    }
    await logMovement(item.id, type, delta);
  };

  const analyzeImageWithAI = async (base64Data) => {
    setIsAnalyzing(true);
    const pureBase64 = base64Data.split(',')[1];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Was ist das? Antworte nur mit dem Namen (max 3 Wörter)." }, { inlineData: { mimeType: "image/jpeg", data: pureBase64 } }] }]
        })
      });
      const result = await response.json();
      const aiName = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (aiName) setNewItem(prev => ({ ...prev, name: aiName }));
    } catch (e) { console.error("AI Error", e); }
    setIsAnalyzing(false);
  };

  const exportToExcel = () => {
    const headers = ["Name", "Menge", "Lagerort", "Warn-Limit", "Zuletzt von"];
    const csvContent = [headers.join(";"), ...items.map(i => [i.name, i.quantity, i.location, i.minStock, i.updatedBy || '-'].join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.body.appendChild(document.createElement("a"));
    link.href = URL.createObjectURL(blob);
    link.download = `Lager_RS_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#161616] border border-gray-800 p-8 rounded-[2.5rem] shadow-2xl">
          <div className="text-center mb-8">
             <Package className="mx-auto text-orange-500 mb-4" size={48} />
             <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white">
               <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
             </h1>
             <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2 italic">Cloud-Inventar v2</p>
          </div>
          <form onSubmit={authStep === 'identify' ? handleIdentify : handleAuthAction} className="space-y-4">
            {authStep === 'identify' ? (
              <>
                <input required type="text" placeholder="Vorname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})} />
                <input required type="text" placeholder="Nachname" className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-white outline-none focus:border-orange-500 transition-all shadow-inner" value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})} />
              </>
            ) : (
              <div className="space-y-2 animate-in fade-in slide-in-from-right-2">
                <p className="text-xs text-orange-500 font-bold text-center mb-4 uppercase tracking-tighter">Hallo {targetMember.fullName}</p>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-4 text-gray-700" size={18} />
                  <input required autoFocus type="password" placeholder={authStep === 'setup_password' ? "Neues Passwort wählen" : "Passwort eingeben"} className="w-full bg-black border border-orange-500/50 rounded-2xl p-4 pl-12 text-white outline-none" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                </div>
              </div>
            )}
            {authError && <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20"><AlertCircle size={14} /><p>{authError}</p></div>}
            <button type="submit" className="w-full bg-orange-600 p-4 rounded-2xl font-black uppercase text-white shadow-lg active:scale-95 transition-all">{authStep === 'identify' ? 'Weiter' : (authStep === 'setup_password' ? 'Konto aktivieren' : 'Anmelden')}</button>
            {authStep !== 'identify' && <button type="button" onClick={() => {setAuthStep('identify'); setAuthError('');}} className="w-full text-gray-600 text-[10px] font-bold uppercase hover:text-white transition-colors mt-2">Abbrechen</button>}
          </form>
        </div>
      </div>
    );
  }

  const isUserAdmin = userData?.role === 'admin' || user.displayName === 'Raphael Drago';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans">
      <header className="border-b border-gray-800 bg-[#111] sticky top-0 z-30 p-4 flex justify-between items-center shadow-xl">
        <div className="flex flex-col">
          <h1 className="text-lg font-black uppercase italic tracking-tighter leading-none">
            <span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span>
          </h1>
          <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{user.displayName} {isUserAdmin && '🛡️'}</span>
        </div>
        <div className="flex gap-2">
          {isUserAdmin && <button onClick={() => setIsAdminPanelOpen(true)} className="p-2.5 bg-gray-800 rounded-xl text-orange-500 hover:bg-orange-500 hover:text-white transition-all shadow-lg"><Users size={20}/></button>}
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2.5 rounded-xl text-white shadow-lg active:scale-95 transition-all"><Plus size={20}/></button>
          <button onClick={() => signOut(auth)} className="bg-gray-800 p-2.5 rounded-xl text-gray-500 hover:text-red-500 transition-all"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input type="text" placeholder="Gegenstand suchen..." className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 transition-all shadow-inner" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {['All', 'Bastelraum', 'Archivraum'].map(loc => (
              <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${filterLocation === loc ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-900/20' : 'bg-gray-800/50 border-gray-800 text-gray-500 hover:text-gray-300'}`}>{loc === 'All' ? 'Alle' : loc}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.filter(i => (i.name.toLowerCase().includes(searchTerm.toLowerCase())) && (filterLocation === 'All' || i.location === filterLocation)).map(item => (
            <div key={item.id} className="bg-[#161616] rounded-3xl overflow-hidden border border-gray-800 shadow-xl group hover:border-gray-700 transition-all flex flex-col">
              <div className="h-44 bg-black flex items-center justify-center relative overflow-hidden border-b border-gray-800/50">
                {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.name} /> : <ImageIcon className="text-gray-900 opacity-30" size={64} />}
                {item.quantity <= (item.minStock || 0) && <div className="absolute top-2 left-2 bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase shadow-lg">Nachfüllen</div>}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg text-white truncate pr-2 leading-tight">{item.name}</h3>
                  <button onClick={() => setItemToDelete(item)} className="text-gray-800 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                </div>
                <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-4 italic">{item.location}</p>
                
                <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-gray-800/50 shadow-inner">
                  <button onClick={() => updateQty(item, -1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors shadow-lg"><Minus size={18}/></button>
                  <div className="text-center">
                    <span className={`text-3xl font-black ${item.quantity <= (item.minStock || 0) ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>{item.quantity}</span>
                    <span className="block text-[8px] text-gray-600 font-bold uppercase mt-1">Limit: {item.minStock || 0}</span>
                  </div>
                  <button onClick={() => updateQty(item, 1)} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors shadow-lg"><Plus size={18}/></button>
                </div>

                {/* Ausleih-Sektion */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                    <button 
                        onClick={() => updateQty(item, -1, 'ausgeliehen')}
                        className="flex items-center justify-center gap-2 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/20 py-2 rounded-xl text-[9px] font-black uppercase text-orange-500 transition-all active:scale-95"
                    >
                        <ArrowRightLeft size={12} /> Ausleihen
                    </button>
                    <button 
                        onClick={() => updateQty(item, 1, 'zurückgebracht')}
                        className="flex items-center justify-center gap-2 bg-green-600/10 hover:bg-green-600/20 border border-green-500/20 py-2 rounded-xl text-[9px] font-black uppercase text-green-500 transition-all active:scale-95"
                    >
                        <RotateCcw size={12} /> Zurück
                    </button>
                </div>
                
                {/* Protokoll-Anzeige */}
                <div className="mt-4 pt-3 border-t border-gray-800/50">
                  <div className="flex items-center gap-2 text-[8px] font-black uppercase text-gray-500 mb-1">
                    <History size={10} /> Letzte Bewegung
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium italic line-clamp-1">
                    {item.lastAction || 'Noch keine Bewegungen erfasst.'}
                  </p>
                  <div className="mt-2 flex justify-between items-center text-[7px] font-bold text-gray-700 uppercase tracking-tighter">
                     <span>Zuletzt von: {item.updatedBy || 'System'}</span>
                     <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ADMIN PANEL */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 p-4 flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-[#161616] w-full max-w-2xl rounded-[2.5rem] border border-orange-500/10 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-orange-500" size={24} />
                <div>
                   <h2 className="text-xl font-black uppercase italic tracking-tighter leading-tight">Admin Control</h2>
                   <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Stammdaten & Mitglieder</p>
                </div>
              </div>
              <button onClick={() => setIsAdminPanelOpen(false)} className="bg-gray-800 p-3 rounded-2xl hover:bg-gray-700"><X size={20}/></button>
            </div>
            <div className="p-8 overflow-y-auto space-y-8 flex-1 custom-scrollbar">
              <button onClick={exportToExcel} className="w-full bg-green-600/10 border border-green-600/30 p-5 rounded-2xl flex items-center justify-center gap-3 text-green-500 uppercase font-black text-xs hover:bg-green-600/20 transition-all shadow-xl shadow-green-900/10">
                <FileSpreadsheet size={24} /> Bestandsliste Exportieren (CSV)
              </button>
              <div className="space-y-4 pt-4 border-t border-gray-800">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 px-1"><PlusCircle size={14}/> Mitglied einladen</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const fullName = `${newMemberName.first.trim()} ${newMemberName.last.trim()}`;
                  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'member_registry'), { fullName, role: 'member', isInitialized: false });
                  setNewMemberName({ first: '', last: '' });
                }} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input required placeholder="Vorname" className="bg-black p-4 rounded-2xl border border-gray-800 text-sm outline-none focus:border-orange-500" value={newMemberName.first} onChange={e => setNewMemberName({...newMemberName, first: e.target.value})} />
                  <input required placeholder="Nachname" className="bg-black p-4 rounded-2xl border border-gray-800 text-sm outline-none focus:border-orange-500" value={newMemberName.last} onChange={e => setNewMemberName({...newMemberName, last: e.target.value})} />
                  <button type="submit" className="bg-orange-600 p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-orange-500 transition-all shadow-lg active:scale-95">Erfassen</button>
                </form>
              </div>
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 px-1"><Users size={14}/> Mitgliederverwaltung</h3>
                <div className="grid gap-2">
                  {members.map(m => (
                    <div key={m.id} className="bg-black/40 p-4 rounded-2xl border border-gray-800 flex justify-between items-center group hover:border-orange-500/20 transition-all">
                      <div><p className="font-bold text-sm text-white">{m.fullName}</p><p className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-1 ${m.isInitialized ? 'bg-green-600/10 text-green-500' : 'bg-yellow-600/10 text-yellow-500'}`}>{m.isInitialized ? 'Aktiv' : 'Wartet auf Login'}</p></div>
                      <div className="flex gap-2">
                        {m.fullName !== 'Raphael Drago' && <button onClick={async () => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id), { role: m.role === 'admin' ? 'member' : 'admin' })} className={`p-2.5 rounded-xl transition-all shadow-lg ${m.role === 'admin' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-600 hover:text-orange-500'}`}><ShieldCheck size={18} /></button>}
                        {m.fullName !== 'Raphael Drago' && <button onClick={async () => { if(confirm('Löschen?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'member_registry', m.id)) }} className="p-2.5 rounded-xl bg-gray-800 text-gray-600 hover:text-red-500 transition-all shadow-lg"><Trash2 size={18} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW ITEM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 p-4 flex items-center justify-center backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-[#161616] w-full max-w-md rounded-[2.5rem] p-8 border border-gray-800 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase italic tracking-tighter">Neuaufnahme</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'), {
                ...newItem, quantity: parseInt(newItem.quantity), minStock: parseInt(newItem.minStock),
                updatedBy: user.displayName, updatedAt: new Date().toISOString(),
                lastAction: `${user.displayName} hat den Artikel neu erfasst.`,
                history: [{ user: user.displayName, action: 'erfasst', amount: newItem.quantity, timestamp: new Date().toISOString() }]
              });
              setIsModalOpen(false);
              setNewItem({ name: '', quantity: 1, location: 'Bastelraum', minStock: 0, image: null });
            }} className="space-y-5">
              <div onClick={() => fileInputRef.current.click()} className="h-44 bg-black rounded-3xl border-2 border-dashed border-gray-800 flex items-center justify-center overflow-hidden cursor-pointer relative group hover:border-orange-500 transition-all shadow-inner">
                {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" alt="Preview" /> : <div className="text-center group-hover:scale-110 transition-transform"><Camera className="mx-auto text-gray-800 mb-2" size={32}/><p className="text-[10px] font-bold uppercase text-gray-600">Foto aufnehmen</p></div>}
                {isAnalyzing && <div className="absolute inset-0 bg-black/70 flex items-center justify-center flex-col gap-2"><Loader2 className="animate-spin text-orange-500" /><p className="text-[10px] text-white font-bold uppercase tracking-widest animate-pulse italic">KI erkennt Artikel...</p></div>}
                <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files[0];
                  if(!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => { setNewItem({...newItem, image: ev.target.result}); analyzeImageWithAI(ev.target.result); };
                  reader.readAsDataURL(file);
                }} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Artikel Name</label>
                <input required placeholder="Bezeichnung..." className="w-full bg-black p-4 rounded-2xl outline-none border border-gray-800 text-white focus:border-orange-500 shadow-inner" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Anzahl</label>
                  <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-black ml-2">Warn-Menge</label>
                  <input type="number" className="w-full bg-black p-4 rounded-2xl border border-gray-800 text-white outline-none focus:border-orange-500 shadow-inner" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Bastelraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Bastelraum' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Bastelraum</button>
                <button type="button" onClick={() => setNewItem({...newItem, location: 'Archivraum'})} className={`p-4 rounded-2xl text-[10px] font-black uppercase border transition-all shadow-lg ${newItem.location === 'Archivraum' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black border-gray-800 text-gray-600'}`}>Archiv</button>
              </div>
              <button type="submit" className="w-full bg-orange-600 p-5 rounded-3xl font-black uppercase text-white shadow-xl shadow-orange-900/40 hover:bg-orange-500 active:scale-95 transition-all mt-4 italic tracking-widest">Speichern</button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DIALOG */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/98 z-[60] flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#1a1a1a] p-10 rounded-[3rem] text-center border border-red-900/20 max-w-sm shadow-2xl">
            <div className="w-20 h-20 bg-red-950/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><AlertTriangle size={48} /></div>
            <h3 className="text-xl font-black mb-2 italic text-white uppercase tracking-tighter leading-tight">Gegenstand löschen?</h3>
            <p className="text-gray-600 text-sm mb-10 leading-relaxed">Möchtest du <span className="text-white font-bold italic">"{itemToDelete.name}"</span> wirklich endgültig entfernen?</p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setItemToDelete(null)} className="bg-gray-800 py-4 rounded-2xl font-bold text-gray-400 hover:text-white transition-all shadow-lg">Nein</button>
              <button onClick={async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', itemToDelete.id)); setItemToDelete(null); }} className="bg-red-600 py-4 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all">Ja, löschen</button>
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
