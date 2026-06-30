import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

// Demo Firebase configuration - REPLACE WITH YOUR ACTUAL CONFIG
const firebaseConfig = {
  apiKey: "demo-api-key-replace-with-actual",
  authDomain: "demo-project.firebaseapp.com",
  projectId: "demo-project-id",
  storageBucket: "demo-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Keep auth session across refreshes/restarts in browser.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set Firebase auth persistence:", err);
});
