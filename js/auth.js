/* =========================================
   FIREBASE CONFIG & AUTHENTICATION
   JANGAN DIUBAH BAGIAN CONFIG
   ========================================= */
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDcNTpwmwKj46KTqPAh70cI2bjHMytjxBY",
  authDomain: "financial-demon.firebaseapp.com",
  projectId: "financial-demon",
  storageBucket: "financial-demon.firebasestorage.app",
  messagingSenderId: "37203944244",
  appId: "1:37203944244:web:ff1e170a665d77190afb61",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export db & auth agar bisa dipakai di app.js
export { auth, db };

/* =========================================
   LOGIN LOGIC (Hanya jalan di login.html)
   ========================================= */
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

if (loginForm) {
  // Cek jika sudah login, lempar ke dashboard
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = "index.html";
    }
  });

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // Berhasil login
        window.location.href = "index.html";
      })
      .catch((error) => {
        loginError.style.display = "block";
        loginError.textContent = "Login Failed: " + error.message;
      });
  });
}

/* =========================================
   AUTH CHECK (Hanya jalan di index.html)
   ========================================= */
if (!loginForm) {
  // Berarti kita tidak di login.html
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // Jika tidak ada user, tendang ke login
      window.location.href = "login.html";
    } else {
      // User ada, jalankan logic dashboard (app.js akan handle ini)
      console.log("Logged in as: ", user.email);
    }
  });
}
