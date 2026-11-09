/**
 * RadioCare - Servicio de Citas Médicas (citas.service.js)
 * Integración con colección 'citas' en Firestore con Firebase v10 Modular SDK.
 */

import { db } from "./auth.service.js";
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Registra una nueva cita médica en la colección 'citas' de Firestore.
 * Asegura la captura de usuarioId en la raíz del documento, estado 'pendiente' y createdAt.
 * @param {object} datosCita
 * @returns {Promise<object>} Objeto de la cita registrada con su ID de Firestore.
 */
export async function solicitarCita(datosCita) {
  try {
    const payload = {
      ...datosCita,
      usuarioId: datosCita.usuarioId || datosCita.pacienteUid,
      estado: 'pendiente',
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'citas'), payload);
    console.log("Cita médica registrada en Firestore con ID:", docRef.id);
    return { id: docRef.id, ...payload, estado: "pendiente" };
  } catch (error) {
    console.error("Error al registrar cita en Firestore:", error);
    throw error;
  }
}

/**
 * Consulta las citas registradas de un usuario en Firestore por su usuarioId.
 * Incluye fallback de filtrado en cliente para resiliencia ante índices o reglas.
 * @param {string} usuarioId
 * @returns {Promise<Array<object>>}
 */
export async function obtenerCitasPorUsuario(usuarioId) {
  if (!usuarioId) return [];

  const citas = [];
  try {
    const citasRef = collection(db, 'citas');
    const q = query(citasRef, where('usuarioId', '==', usuarioId));
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      citas.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Fallback: Si no trajo resultados, verificar si existen registros con pacienteUid
    if (citas.length === 0) {
      const qFallback = query(citasRef, where('pacienteUid', '==', usuarioId));
      const fallbackSnap = await getDocs(qFallback);
      fallbackSnap.forEach((docSnap) => {
        citas.push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    return citas;
  } catch (error) {
    console.warn("Aviso en consulta indexada de citas, ejecutando fallback en cliente:", error);
    try {
      const allSnap = await getDocs(collection(db, 'citas'));
      allSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.usuarioId === usuarioId || data.pacienteUid === usuarioId) {
          citas.push({ id: docSnap.id, ...data });
        }
      });
      return citas;
    } catch (fallbackError) {
      console.error("Error definitivo al obtener citas:", fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Cancela una cita médica actualizando su estado a 'cancelada' en Firestore.
 * @param {string} citaId
 * @returns {Promise<boolean>}
 */
export async function cancelarCita(citaId) {
  if (!citaId) throw new Error("ID de cita requerido para cancelar.");
  try {
    const citaRef = doc(db, 'citas', citaId);
    await updateDoc(citaRef, {
      estado: 'cancelada',
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error al cancelar cita en Firestore:", error);
    throw error;
  }
}
