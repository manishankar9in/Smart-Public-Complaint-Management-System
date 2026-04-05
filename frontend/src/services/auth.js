import { auth } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail
} from "firebase/auth";
import { api } from '../utils/api';

export const AuthService = {
  register: async (email, password, name, role = 'user', locationData = {}) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Sync with our backend
      await api.post(`/auth/sync`, {
        firebase_uid: user.uid,
        email: user.email,
        name: name,
        role: role,
        ...locationData
      });

      const fullUser = { uid: user.uid, email: user.email, name, role, ...locationData };
      localStorage.setItem('auth_user', JSON.stringify(fullUser));
      return { success: true, user: fullUser };
    } catch (error) {
      console.error("Auth Register Error", error);
      return { success: false, message: error.message };
    }
  },

  login: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Get user profile from backend
      const res = await api.get(`/auth/${user.uid}`);
      const userData = res.data;
      
      localStorage.setItem('auth_user', JSON.stringify(userData));
      return { success: true, user: userData };
    } catch (error) {
      console.error("Auth Login Error", error);
      return { success: false, message: error.message };
    }
  },

  logout: async () => {
    await signOut(auth);
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
  },

  resetPassword: async (email) => {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  },

  getCurrentUser: () => {
    const userJson = localStorage.getItem('auth_user');
    return userJson ? JSON.parse(userJson) : null;
  }
};
