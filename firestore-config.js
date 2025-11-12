// --- Firestore & Imgbb Integration for Smart HSR ---
// ✅ يحفظ الملاحظات بشكل دائم في Firestore
// ✅ يرفع الصور إلى Imgbb ويخزن الروابط في السحابة

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// 🔹 إعدادات Firebase الخاصة بك (Smart HSR الرسمي)
const firebaseConfig = {
  apiKey: "AIzaSyBfClVxFIXgUXL4olEv5SepUDtzk0dq3lo",
  authDomain: "gen-lang-client-0349944917.firebaseapp.com",
  projectId: "gen-lang-client-0349944917",
  storageBucket: "gen-lang-client-0349944917.firebasestorage.app",
  messagingSenderId: "883065484771",
  appId: "1:883065484771:web:c907bb5a51f68caad75cd6",
  measurementId: "G-V8WG5M8V5B"
};

// 🔹 تهيئة التطبيق وقاعدة البيانات
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔹 مفتاح Imgbb (استبدله بمفتاحك)
const imgbbApiKey = "e4c94d2d9f8f8dbf0a57e67e6e2f9f5c"; // ⚠️ ضع مفتاحك من imgbb.com

// --- 1. تحميل الملاحظات من Firestore ---
export async function loadObservations() {
  const snapshot = await getDocs(collection(db, "observations"));
  const data = [];
  snapshot.forEach((docSnap) => {
    data.push({ id: docSnap.id, ...docSnap.data() });
  });
  return data.sort((a, b) => b.createdAt - a.createdAt);
}

// --- 2. إضافة ملاحظة جديدة (مع رفع صورة إلى Imgbb) ---
export async function addObservation(observation, file) {
  try {
    let imageUrl = "";
    if (file) {
      imageUrl = await uploadToImgbb(file);
    }

    const newDoc = {
      ...observation,
      imagePath: imageUrl,
      createdAt: Date.now(),
      updatedAt: serverTimestamp(),
      status: "PENDING",
    };

    const docRef = await addDoc(collection(db, "observations"), newDoc);
    console.log("✅ Observation added:", docRef.id);
    return { id: docRef.id, ...newDoc };
  } catch (error) {
    console.error("❌ Error adding observation:", error);
  }
}

// --- 3. تحديث الملاحظة عند الإغلاق التنفيذي ---
export async function closeObservation(id, afterFile, note) {
  try {
    const afterImageUrl = await uploadToImgbb(afterFile);

    const docRef = doc(db, "observations", id);
    await updateDoc(docRef, {
      afterImagePath: afterImageUrl,
      resolutionNote: note,
      status: "COMPLETED",
      closedAt: serverTimestamp(),
    });

    console.log("✅ Observation closed successfully:", id);
    return afterImageUrl;
  } catch (error) {
    console.error("❌ Error closing observation:", error);
  }
}

// --- 4. رفع الصورة إلى Imgbb ---
async function uploadToImgbb(file) {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (data.success) {
    console.log("📸 Uploaded to Imgbb:", data.data.url);
    return data.data.url;
  } else {
    throw new Error("Upload to Imgbb failed");
  }
}

