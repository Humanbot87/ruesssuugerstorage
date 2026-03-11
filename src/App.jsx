import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, Minus, Search, Package, Trash2, PlusCircle, X, Loader2, 
  AlertCircle, LogOut, KeyRound, ShieldCheck, FileSpreadsheet, 
  Users, ChevronRight, UserPlus, ShieldAlert, Check
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, query, getDocs, setDoc, where, limit 
} from 'firebase/firestore';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged, signOut, updateProfile 
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

const appId = "ruess-suuger-storage-v2"; // Neue Version für geänderte Logik
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Hilfsfunktion für den E-Mail-Login
const nameToEmail = (name) => {
  const clean = name.trim().toLowerCase().replace(/\s+/g, '.');
  return `${clean}@ruess-suuger.internal`;
};

function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  
  // Login State
  const [step, setStep] = useState('name'); // 'name' oder 'password'
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [targetMember, setTargetMember] = useState(null);
  const [authError, setAuthError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState({ first: '', last: '' });
  
  const [newItem, setNewItem] = useState({
    name: '', quantity: 1, location: 'Bastelraum', minStock: 0, image: null
  });

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userDoc = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'members'), where("uid", "==", u.uid)));
        if (!userDoc.empty) {
          setUserData(userDoc.docs[0].data());
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setAuthLoading(false);
    });
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;
    const unsubItems = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'inventory')), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubMembers = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'members')), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubItems(); unsubMembers(); };
  }, [user]);

  // Login Ablauf
  const handleNextStep = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setAuthError('');
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    // Sonderfall: Raphael Drago als Initial-Admin anlegen, falls Datenbank leer ist
    if (fullName === 'Raphael Drago' && members.length === 0) {
      setTargetMember({ fullName: 'Raphael Drago', role: 'admin', isInitialized: false });
      setStep('password');
      setIsProcessing(false);
      return;
    }

    const memberDoc = members.find(m => m.fullName.toLowerCase() === fullName.toLowerCase());
    
    if (memberDoc) {
      setTargetMember(memberDoc);
      setStep('password');
    } else {
      setAuthError('Du stehst noch nicht auf der Mitgliederliste. Bitte kontaktiere einen Admin.');
    }
    setIsProcessing(false);
  };

  const handleFinalAuth = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setAuthError('');
    const email = nameToEmail(targetMember.fullName);

    try {
      if (!targetMember.isInitialized) {
        // Erster Login -> Account erstellen
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: targetMember.fullName });
        
        // Firestore-Eintrag aktualisieren
        const memberId = targetMember.id || userCredential.user.uid;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId), {
          fullName: targetMember.fullName,
          uid: userCredential.user.uid,
          role: targetMember.role || 'member',
          isInitialized: true,
          email: email
        });
      } else {
        // Normaler Login
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError('Passwort falsch oder Fehler bei der Anmeldung.');
      console.error(err);
    }
    setIsProcessing(false);
  };

  const addMember = async (e) => {
    e.preventDefault();
    const fullName = `${newMemberName.first.trim()} ${newMemberName.last.trim()}`;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'members'), {
      fullName,
      role: 'member',
      isInitialized: false
    });
    setNewMemberName({ first: '', last: '' });
  };

  const toggleAdmin = async (member) => {
    if (member.fullName === 'Raphael Drago') return; // Hauptadmin kann nicht herabgestuft werden
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', member.id), {
      role: member.role === 'admin' ? 'member' : 'admin'
    });
  };

  const exportToExcel = () => {
    const headers = ["Name", "Menge", "Lagerort", "Warn-Limit", "Zuletzt Geändert Von"];
    const csvContent = [
      headers.join(";"),
      ...items.map(i => [i.name, i.quantity, i.location, i.minStock, i.updatedBy || '-'].join(";"))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Lager_Export_${new Date().toLocaleDateString()}.csv`);
    link.click();
  };

  if (authLoading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  // --- LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-[#161616] rounded-3xl p-8 border border-gray-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-600 to-red-600"></div>
          
          <div className="text-center mb-10">
            <Package className="text-orange-500 mx-auto mb-4" size={48} />
            <h1 className="text-2xl font-black uppercase tracking-tighter text-white leading-none">
              Rüss<span className="text-orange-500">Suuger</span> Storage
            </h1>
            <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-[0.2em] font-bold">Mitglieder-Bereich</p>
          </div>

          <form onSubmit={step === 'name' ? handleNextStep : handleFinalAuth} className="space-y-4">
            {step === 'name' ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="grid grid-cols-2 gap-3">
                  <input required type="text" placeholder="Vorname" className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white placeholder:text-gray-700" value={firstName} onChange={e => setFirstName(e.target.value)} />
                  <input required type="text" placeholder="Nachname" className="w-full bg-black p-4 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white placeholder:text-gray-700" value={lastName} onChange={e => setLastName(e.target.value)} />
                </div>
                <button type="submit" disabled={isProcessing} className="w-full bg-white text-black p-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-500 hover:text-white transition-all group">
                  {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <>Weiter <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-orange-600/10 p-4 rounded-2xl border border-orange-500/20 mb-6 flex items-center gap-4">
                  <div className="bg-orange-600 p-2 rounded-lg text-white font-bold text-xs">OK</div>
                  <div className="text-left">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Willkommen,</p>
                    <p className="text-white font-black">{targetMember.fullName}</p>
                  </div>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-4 text-gray-600" size={20} />
                  <input required autoFocus type="password" placeholder={targetMember.isInitialized ? "Dein Passwort" : "Neues Passwort festlegen"} className="w-full bg-black p-4 pl-12 rounded-xl outline-none border border-gray-800 focus:border-orange-500 transition-all text-white" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <button type="submit" disabled={isProcessing} className="w-full bg-orange-600 text-white p-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-orange-900/20">
                  {isProcessing ? <Loader2 className="animate-spin" size={18} /> : (targetMember.isInitialized ? 'Anmelden' : 'Passwort setzen & Starten')}
                </button>
                <button type="button" onClick={() => {setStep('name'); setPassword('');}} className="w-full text-gray-600 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">Abbrechen</button>
              </div>
            )}

            {authError && (
              <div className="flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-xl border border-red-500/20 animate-in zoom-in-95">
                <AlertCircle size={16} />
                <p className="text-[10px] font-bold uppercase leading-tight">{authError}</p>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  const isUserAdmin = userData?.role === 'admin' || user.displayName === 'Raphael Drago';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans selection:bg-orange-500 selection:text-white">
      <header className="border-b border-gray-800 bg-[#111]/80 backdrop-blur-md sticky top-0 z-30 p-4 flex justify-between items-center">
        <div className="flex flex-col">
           <h1 className="text-lg font-black uppercase tracking-tighter leading-none"><span className="text-gray-500">Rüss</span><span className="text-orange-500">Suuger</span></h1>
           <div className="flex items-center gap-1">
             <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{user.displayName}</span>
             {isUserAdmin && <ShieldCheck size={10} className="text-orange-500" />}
           </div>
        </div>
        <div className="flex gap-2">
          {isUserAdmin && (
            <button onClick={() => setIsAdminPanelOpen(true)} className="bg-gray-800/50 p-2.5 rounded-xl text-orange-500 hover:bg-orange-500 hover:text-white transition-all">
              <Users size={20} />
            </button>
          )}
          <button onClick={() => setIsModalOpen(true)} className="bg-orange-600 p-2.5 rounded-xl text-white shadow-lg shadow-orange-900/40 active:scale-95 transition-all"><PlusCircle size={20}/></button>
          <button onClick={() => signOut(auth)} className="bg-gray-800/50 p-2.5 rounded-xl text-gray-500 hover:text-red-500 transition-all"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-600" size={18} />
            <input type="text" placeholder="Inventar durchsuchen..." className="w-full bg-[#161616] p-4 pl-12 rounded-2xl outline-none border border-gray-800 focus:border-orange-500 transition-all shadow-inner" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Bastelraum', 'Archivraum'].map(loc => (
              <button key={loc} onClick={() => setFilterLocation(loc)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${filterLocation === loc ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-900/20' : 'bg-gray-800/50 border-gray-800 text-gray-500 hover:text-gray-300'}`}>
                {loc === 'All' ? 'Alle Standorte' : loc}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.filter(i => (i.name.toLowerCase().includes(searchTerm.toLowerCase())) && (filterLocation === 'All' || i.location === filterLocation)).sort((a,b) => a.name.localeCompare(b.name)).map(item => (
            <div key={item.id} className="bg-[#161616] rounded-3xl overflow-hidden border border-gray-800 shadow-xl group transition-all hover:border-gray-700">
              <div className="h-44 bg-black flex items-center justify-center relative">
                {item.image ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.name} /> : <ImageIcon className="text-gray-800 opacity-20" size={64} />}
                {item.quantity <= item.minStock && <div className="absolute top-3 right-3 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-full animate-pulse uppercase tracking-widest">Niedriger Bestand</div>}
              </div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg text-white truncate pr-4">{item.name}</h3>
                  <button onClick={async () => { if(confirm('Löschen?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id)) }} className="text-gray-800 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                </div>
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-4">{item.location}</p>
                <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-gray-800/50 mb-3">
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id), { quantity: Math.max(0, item.quantity - 1), updatedBy: user.displayName })} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors"><Minus size={18}/></button>
                  <div className="text-center">
                    <span className={`text-3xl font-black ${item.quantity <= item.minStock ? 'text-red-500' : 'text-orange-500'}`}>{item.quantity}</span>
                  </div>
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id), { quantity: item.quantity + 1, updatedBy: user.displayName })} className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors"><Plus size={18}/></button>
                </div>
                <p className="text-[8px] text-gray-700 font-bold uppercase text-right">Zuletzt: {item.updatedBy || 'System'}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ADMIN PANEL */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-[#161616] w-full max-w-2xl rounded-[2.5rem] border border-orange-500/10 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-8 flex justify-between items-center border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-600 rounded-2xl text-white shadow-lg shadow-orange-900/20"><Users size={24} /></div>
                <div>
                   <h2 className="text-xl font-black uppercase italic tracking-tighter">Mitglieder & Verwaltung</h2>
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">Stammdaten Management</p>
                </div>
              </div>
              <button onClick={() => setIsAdminPanelOpen(false)} className="bg-gray-800 p-3 rounded-2xl hover:bg-gray-700 transition-colors"><X size={20}/></button>
            </div>

            <div className="p-8 overflow-y-auto space-y-8 flex-1">
              {/* EXPORT SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={exportToExcel} className="flex items-center gap-4 bg-green-600/10 border border-green-600/20 p-5 rounded-3xl group hover:bg-green-600/20 transition-all">
                  <div className="p-3 bg-green-600 rounded-2xl text-white"><FileSpreadsheet size={24}/></div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase text-green-500 leading-none mb-1">Inventar Liste</p>
                    <p className="text-[10px] text-green-500/60 font-bold">Als Excel (CSV) exportieren</p>
                  </div>
                </button>
              </div>

              {/* ADD MEMBER SECTION */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-600 flex items-center gap-2 px-1"><UserPlus size={14}/> Mitglied hinzufügen</h3>
                <form onSubmit={addMember} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input required type="text" placeholder="Vorname" className="bg-black p-4 rounded-2xl outline-none border border-gray-800 focus:border-orange-500 text-sm" value={newMemberName.first} onChange={e => setNewMemberName({...newMemberName, first: e.target.value})} />
                  <input required type="text" placeholder="Nachname" className="bg-black p-4 rounded-2xl outline-none border border-gray-800 focus:border-orange-500 text-sm" value={newMemberName.last} onChange={e => setNewMemberName({...newMemberName, last: e.target.value})} />
                  <button type="submit" className="bg-orange-600 p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-orange-500 shadow-lg shadow-ora
