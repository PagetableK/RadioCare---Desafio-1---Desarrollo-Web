/**
 * RadioCare - Configuración Centralizada de Firebase v10 (Modular SDK)
 * Inicializa la plataforma y exporta las instancias de Auth y Firestore.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDzv-LysQnzCcCia3gNoMf7l9T-v-hK_t8",
  authDomain: "radiocare-3fff2.firebaseapp.com",
  projectId: "radiocare-3fff2",
  storageBucket: "radiocare-3fff2.firebasestorage.app",
  messagingSenderId: "475579817668",
  appId: "1:475579817668:web:81f0c65c0174ab90547391"
};

// Singleton para prevenir inicializaciones duplicadas en imports concurrentes
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);