/**
 * RadioCare - Servicio de Autenticación (Firebase v10 Modular SDK)
 * Gestiona el ciclo de vida de usuarios, roles clínicos y estado de sesión reactivo.
 */

import { auth, db } from "./firebase.config.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Re-exportar auth y db por si algún módulo los requiere desde aquí
export { auth, db };

// Clave estandarizada para el objeto de sesión y perfil clínico en localStorage
export const USER_CACHE_KEY = 'rc_user_cache';

// Estado de usuario en caché en memoria para revalidación inmediata
let usuarioCache = null;

/**
 * Serializa y almacena en localStorage el objeto de sesión y perfil clínico (rc_user_cache).
 * Estructura de negocio: { uid, nombre, apellido, email, rol, ultimaActividad }
 * No almacena contraseñas ni credenciales sensibles.
 * @param {object} userData
 * @param {string} [uidFallback]
 * @returns {object|null}
 */
export function guardarUsuarioEnLocalStorage(userData, uidFallback = '') {
  if (!userData) return null;
  try {
    const cachePayload = {
      uid: userData.uid || uidFallback || '',
      nombre: userData.nombre || '',
      apellido: userData.apellido || '',
      email: userData.email || '',
      rol: (userData.rol || 'paciente').toLowerCase(),
      ultimaActividad: new Date().toISOString()
    };
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cachePayload));
    return cachePayload;
  } catch (error) {
    console.warn("Advertencia: No se pudo guardar rc_user_cache en localStorage:", error);
    return null;
  }
}

/**
 * Obtiene y deserializa el objeto de perfil clínico ligero desde localStorage.
 * @returns {object|null}
 */
export function obtenerUsuarioDeLocalStorage() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Advertencia: No se pudo leer rc_user_cache de localStorage:", error);
    return null;
  }
}

/**
 * Registra un nuevo paciente en Firebase Auth y crea su documento en Firestore con su perfil clínico inicial.
 * Recibe un objeto con la estructura:
 * { nombre, apellido, email, password, dui, fechaNacimiento, sexoBiologico }
 * El rol asignado siempre es 'paciente' y no es configurable por el cliente.
 * @param {object|string} datos - Objeto con datos del paciente o nombre (para compatibilidad).
 * @param {string} [apellidoParam]
 * @param {string} [emailParam]
 * @param {string} [passwordParam]
 * @param {string} [duiParam]
 * @param {string} [fechaNacimientoParam]
 * @param {string} [sexoBiologicoParam]
 */
export async function registrarPaciente(datos, apellidoParam, emailParam, passwordParam, duiParam, fechaNacimientoParam, sexoBiologicoParam) {
  try {
    let payload;
    if (datos && typeof datos === 'object') {
      payload = datos;
    } else {
      payload = {
        nombre: datos,
        apellido: apellidoParam,
        email: emailParam,
        password: passwordParam,
        dui: duiParam,
        fechaNacimiento: fechaNacimientoParam,
        sexoBiologico: sexoBiologicoParam
      };
    }

    const {
      nombre = '',
      apellido = '',
      email = '',
      password = '',
      dui = '',
      fechaNacimiento = '',
      sexoBiologico = ''
    } = payload;

    if (!nombre || !apellido || !email || !password) {
      throw new Error("Los campos obligatorios de identificación y acceso deben completarse para el registro.");
    }

    const emailLimpio = email.trim().toLowerCase();
    const nombreLimpio = nombre.trim();
    const apellidoLimpio = apellido.trim();
    const duiLimpio = typeof dui === 'string' ? dui.trim() : '';

    // 1. Crear usuario en Firebase Authentication
    const credenciales = await createUserWithEmailAndPassword(auth, emailLimpio, password);
    const user = credenciales.user;

    // 2. Actualizar displayName en Firebase Auth para referencia inmediata
    try {
      await updateProfile(user, {
        displayName: `${nombreLimpio} ${apellidoLimpio}`
      });
    } catch (profileErr) {
      console.warn("Advertencia: No se pudo actualizar el display name en Auth:", profileErr);
    }

    // 3. Documento en colección 'usuarios' con ID igual a user.uid
    // Perfil clínico completo en Firestore desde el primer momento
    const userData = {
      uid: user.uid,
      nombre: nombreLimpio,
      apellido: apellidoLimpio,
      email: emailLimpio,
      dui: duiLimpio,
      fechaNacimiento: fechaNacimiento,
      sexoBiologico: sexoBiologico,
      rol: 'paciente',
      createdAt: serverTimestamp()
    };

    const userDocRef = doc(db, 'usuarios', user.uid);
    await setDoc(userDocRef, userData);

    usuarioCache = { ...userData };

    // Serializar y almacenar objeto de negocio rc_user_cache en localStorage
    guardarUsuarioEnLocalStorage(userData, user.uid);

    return {
      authUser: user,
      userData
    };
  } catch (error) {
    console.error("Error en registrarPaciente:", error);
    throw error;
  }
}

/**
 * Autentica credenciales en Firebase Auth y obtiene el documento del usuario desde Firestore.
 */
export async function iniciarSesion(email, password) {
  try {
    if (!email || !password) {
      throw new Error("Debe ingresar correo electrónico y contraseña.");
    }

    const emailLimpio = email.trim().toLowerCase();

    // 1. Iniciar sesión en Firebase Auth
    const credenciales = await signInWithEmailAndPassword(auth, emailLimpio, password);
    const user = credenciales.user;

    // 2. Obtener documento de Firestore para extraer rol y metadatos clínicos
    const userDocRef = doc(db, 'usuarios', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    let userData;

    if (userDocSnap.exists()) {
      userData = userDocSnap.data();
    } else {
      const partesNombre = (user.displayName || '').split(' ');
      userData = {
        uid: user.uid,
        nombre: partesNombre[0] || user.email.split('@')[0],
        apellido: partesNombre.slice(1).join(' ') || '',
        email: user.email,
        rol: 'paciente'
      };
      try {
        await setDoc(userDocRef, { ...userData, createdAt: serverTimestamp() });
      } catch (e) {
        console.warn("No se pudo autogenerar documento de usuario:", e);
      }
    }

    usuarioCache = { ...userData };

    // Serializar y almacenar objeto de negocio rc_user_cache en localStorage
    guardarUsuarioEnLocalStorage(userData, user.uid);

    return {
      authUser: user,
      userData
    };
  } catch (error) {
    console.error("Error en iniciarSesion:", error);
    throw error;
  }
}

/**
 * Cierra la sesión activa en Firebase Auth y limpia el estado local en memoria y storage.
 */
export async function cerrarSesion() {
  try {
    await signOut(auth);
    usuarioCache = null;
    sessionStorage.removeItem('rc_user_cache');
    localStorage.removeItem('rc_user_cache');
  } catch (error) {
    console.error("Error en cerrarSesion:", error);
    throw error;
  }
}

/**
 * Retorna los datos del usuario logueado en Firestore o null si no hay sesión.
 * @param {boolean} [forzarRefresco=false] Si es true, ignora la caché y consulta Firestore.
 */
export function obtenerUsuarioActual(forzarRefresco = false) {
  return new Promise((resolve) => {
    if (!forzarRefresco && auth.currentUser && usuarioCache && usuarioCache.uid === auth.currentUser.uid) {
      resolve(usuarioCache);
      return;
    }

    if (!forzarRefresco && auth.currentUser) {
      const cacheLocal = obtenerUsuarioDeLocalStorage();
      if (cacheLocal && cacheLocal.uid === auth.currentUser.uid) {
        usuarioCache = { ...cacheLocal };
        resolve(usuarioCache);
        return;
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        usuarioCache = null;
        resolve(null);
        return;
      }

      try {
        const userDocRef = doc(db, 'usuarios', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          usuarioCache = userDocSnap.data();
          guardarUsuarioEnLocalStorage(usuarioCache, user.uid);
          resolve(usuarioCache);
        } else {
          const defaultData = {
            uid: user.uid,
            email: user.email,
            nombre: user.displayName || user.email.split('@')[0],
            apellido: '',
            rol: 'paciente'
          };
          usuarioCache = defaultData;
          guardarUsuarioEnLocalStorage(defaultData, user.uid);
          resolve(defaultData);
        }
      } catch (err) {
        console.error("Error al obtener datos en obtenerUsuarioActual:", err);
        const fallback = {
          uid: user.uid,
          email: user.email,
          nombre: user.displayName || user.email.split('@')[0],
          apellido: '',
          rol: 'paciente'
        };
        guardarUsuarioEnLocalStorage(fallback, user.uid);
        resolve(fallback);
      }
    });
  });
}


/**
 * Actualiza la caché local de usuario en memoria con nuevos datos y sincroniza localStorage.
 * @param {object} nuevosDatos 
 */
export function actualizarCacheUsuario(nuevosDatos) {
  if (nuevosDatos && usuarioCache) {
    usuarioCache = { ...usuarioCache, ...nuevosDatos };
  } else if (nuevosDatos) {
    usuarioCache = { ...nuevosDatos };
  }
  if (usuarioCache) {
    guardarUsuarioEnLocalStorage(usuarioCache);
  }
}

/**
 * Wrapper reactivo sobre onAuthStateChanged que consulta Firestore y emite
 * al callback un objeto unificado { authUser, userData }.
 * Sincroniza automáticamente rc_user_cache en localStorage.
 */
export function onAuthChange(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError("El callback provisto a onAuthChange debe ser una función.");
  }

  return onAuthStateChanged(auth, async (authUser) => {
    if (!authUser) {
      usuarioCache = null;
      sessionStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(USER_CACHE_KEY);
      callback({ authUser: null, userData: null });
      return;
    }

    try {
      const userDocRef = doc(db, 'usuarios', authUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      let userData;
      if (userDocSnap.exists()) {
        userData = userDocSnap.data();
      } else {
        const nombrePartes = (authUser.displayName || '').split(' ');
        userData = {
          uid: authUser.uid,
          email: authUser.email,
          nombre: nombrePartes[0] || authUser.email.split('@')[0],
          apellido: nombrePartes.slice(1).join(' ') || '',
          rol: 'paciente'
        };
      }

      usuarioCache = { ...userData };
      guardarUsuarioEnLocalStorage(userData, authUser.uid);
      callback({ authUser, userData });
    } catch (error) {
      console.error("Error al obtener documento en onAuthChange:", error);
      const fallbackData = {
        uid: authUser.uid,
        email: authUser.email,
        nombre: authUser.displayName || authUser.email.split('@')[0],
        apellido: '',
        rol: 'paciente'
      };
      usuarioCache = fallbackData;
      guardarUsuarioEnLocalStorage(fallbackData, authUser.uid);
      callback({ authUser, userData: fallbackData });
    }
  });
}