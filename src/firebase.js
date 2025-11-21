// firebase.js
import { initializeApp } from "firebase/app";
// *** FIX: Import getFirestore from the 'firebase/firestore' package ***
import { getFirestore } from 'firebase/firestore'; 
import { getAnalytics } from "firebase/analytics"; 

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBC_qznpJYi3BN5RHdjMi8jIdwac2S2QmM",
  authDomain: "bolo-4e8ea.firebaseapp.com",
  databaseURL: "YOUR_DATABASE_URL", // Added this back for clarity, though it might not be strictly needed for Firestore
  projectId: "bolo-4e8ea",
  storageBucket: "bolo-4e8ea.firebasestorage.app",
  messagingSenderId: "857889902036",
  appId: "1:857889902036:web:6312ec48ee280243dd1a41",
  measurementId: "G-RWJSG484WV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app); // Analytics is optional, commented out if not used
const db = getFirestore(app); // Now getFirestore is defined
const COLLECTION_NAME = 'sign_language_vectors';

// Export the initialized Firestore instance and the collection name
export { db, COLLECTION_NAME };