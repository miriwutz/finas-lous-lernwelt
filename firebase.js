import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYNfbB4BBHnMj-TYxJBi-Kl5-MbAauRBM",
  authDomain: "lernwald.firebaseapp.com",
  projectId: "lernwald",
  storageBucket: "lernwald.firebasestorage.app",
  messagingSenderId: "788608073748",
  appId: "1:788608073748:web:4052612fb5202be8232701"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SPACE_ID = "family";
const spaceRef = doc(db, "spaces", SPACE_ID);

const defaultState = {
  version: 2,
  tree: { name: "Unser Wochenbaum", targetLeaves: 20, startedAt: new Date().toISOString() },
  tasks: [
    { id:"fina-lesen", child:"fina", title:"Lesen", note:"10 Minuten im Lesebuch", type:"paper", url:"", done:false },
    { id:"fina-lernen", child:"fina", title:"Lernwörter", note:"Ein paar Wörter ins Heft", type:"paper", url:"", done:false },
    { id:"lou-englisch", child:"lou", title:"Englisch üben", note:"Eine passende Lernseite öffnen", type:"online", url:"", done:false },
    { id:"lou-latein", child:"lou", title:"Latein – Einstieg", note:"Erste Wörter wiederholen", type:"paper", url:"", done:false }
  ],
  learningLeaves: [],
  roots: [],
  forest: [],
  updatedAt: null
};

async function ensureSpace(){
  const snap = await getDoc(spaceRef);
  if(!snap.exists()){
    await setDoc(spaceRef, {...defaultState, updatedAt: serverTimestamp()});
  }
}

export {
  auth, db, spaceRef, defaultState,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ensureSpace, onSnapshot, updateDoc, runTransaction, serverTimestamp
};
