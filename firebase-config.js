// =============================
// Firebase Configuration File
// =============================

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBQ9iNZn0uxdkDSjKV6IlXGC5FW5-lxgZI",
  authDomain: "smart-hsr-manager.firebaseapp.com",
  projectId: "smart-hsr-manager",
  storageBucket: "smart-hsr-manager.appspot.com", // ✅ التصحيح هنا
  messagingSenderId: "38965508031",
  appId: "1:38965508031:web:6fd0b6c6b0b63fa513930a"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
