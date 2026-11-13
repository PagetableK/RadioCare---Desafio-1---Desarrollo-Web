/**
 * RadioCare - Servicio de Personal Médico Radiólogo (doctores.service.js)
 * Integración con colección 'doctores' en Firestore (Firebase v10 Modular SDK).
 *
 * Responsabilidades:
 *   1. inicializarDoctoresSeed() – Semillero inicial de médicos base si la colección está vacía.
 *   2. obtenerDoctores()         – Listar médicos ordenados alfabéticamente.
 *   3. crearDoctor()             – Registrar un nuevo médico radiólogo.
 *   4. actualizarDoctor()        – Modificar datos clínicos de un médico existente.
 *   5. eliminarDoctor()          – Eliminar definitivamente un médico de Firestore.
 */

import { db } from "./firebase.config.js";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/** Médicos base predefinidos para inicialización */
const DOCTORES_SEED = [
  {
    nombre: "Dr. Gerardo Franco",
    especialidad: "Doppler Vascular y Ecografía General",
    jvpm: "14230",
    activo: true
  },
  {
    nombre: "Dra. Itzel Suazo Sorto",
    especialidad: "Radiología de Mama y Ultrasonografía",
    jvpm: "15890",
    activo: true
  },
  {
    nombre: "Dra. Susana Cruz",
    especialidad: "Resonancia Magnética y Tomografía",
    jvpm: "16742",
    activo: true
  }
];

/**
 * Verifica si la colección 'doctores' está vacía y, de ser así, inserta
 * automáticamente los médicos base predefinidos.
 * @returns {Promise<Array<object>>} Arreglo con los doctores tras la inicialización.
 */
export async function inicializarDoctoresSeed() {
  try {
    const colRef = collection(db, "doctores");
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      console.log("Colección 'doctores' vacía. Insertando médicos base...");
      const promesas = DOCTORES_SEED.map(docData =>
        addDoc(colRef, {
          ...docData,
          createdAt: serverTimestamp()
        })
      );
      await Promise.all(promesas);
      console.log("Médicos base insertados exitosamente en Firestore.");
    }

    return await obtenerDoctores();
  } catch (error) {
    console.error("Error al inicializar seed de doctores:", error);
    throw error;
  }
}

/**
 * Consulta y retorna todos los doctores registrados en Firestore,
 * ordenados alfabéticamente por su nombre completo.
 * @returns {Promise<Array<object>>} Lista ordenada de doctores.
 */
export async function obtenerDoctores() {
  try {
    const colRef = collection(db, "doctores");
    const snapshot = await getDocs(colRef);
    const doctores = [];

    snapshot.forEach(docSnap => {
      doctores.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    // Ordenamiento alfabético en memoria para resiliencia ante índices compuestos
    doctores.sort((a, b) =>
      (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" })
    );

    return doctores;
  } catch (error) {
    console.error("Error al obtener doctores desde Firestore:", error);
    throw error;
  }
}

/**
 * Crea un nuevo registro de médico radiólogo en Firestore.
 * @param {object} param0
 * @param {string} param0.nombre       - Nombre completo del doctor (ej. Dr. Carlos Mendoza)
 * @param {string} param0.especialidad - Especialidad médica (ej. Doppler Vascular)
 * @param {string} [param0.jvpm]       - Código JVPM opcional
 * @returns {Promise<object>} Objeto creado con su ID generado.
 */
export async function crearDoctor({ nombre, especialidad, jvpm = "" }) {
  if (!nombre || !String(nombre).trim()) {
    throw new Error("El nombre completo del médico es obligatorio.");
  }
  if (!especialidad || !String(especialidad).trim()) {
    throw new Error("La especialidad del médico es obligatoria.");
  }

  try {
    const colRef = collection(db, "doctores");
    const payload = {
      nombre: String(nombre).trim(),
      especialidad: String(especialidad).trim(),
      jvpm: jvpm ? String(jvpm).trim() : "",
      activo: true,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(colRef, payload);
    console.log(`Doctor "${payload.nombre}" creado exitosamente con ID:`, docRef.id);
    return { id: docRef.id, ...payload };
  } catch (error) {
    console.error("Error al crear doctor en Firestore:", error);
    throw error;
  }
}

/**
 * Actualiza la información de un doctor existente en Firestore.
 * @param {string} id - ID del documento en la colección 'doctores'.
 * @param {object} param1
 * @param {string} param1.nombre
 * @param {string} param1.especialidad
 * @param {string} [param1.jvpm]
 * @returns {Promise<boolean>}
 */
export async function actualizarDoctor(id, { nombre, especialidad, jvpm = "" }) {
  if (!id) {
    throw new Error("El identificador del doctor es obligatorio para actualizar.");
  }
  if (!nombre || !String(nombre).trim()) {
    throw new Error("El nombre completo del médico es obligatorio.");
  }
  if (!especialidad || !String(especialidad).trim()) {
    throw new Error("La especialidad del médico es obligatoria.");
  }

  try {
    const docRef = doc(db, "doctores", id);
    const payload = {
      nombre: String(nombre).trim(),
      especialidad: String(especialidad).trim(),
      jvpm: jvpm ? String(jvpm).trim() : "",
      updatedAt: serverTimestamp()
    };

    await updateDoc(docRef, payload);
    console.log(`Doctor ${id} actualizado exitosamente.`);
    return true;
  } catch (error) {
    console.error(`Error al actualizar doctor ${id} en Firestore:`, error);
    throw error;
  }
}

/**
 * Elimina físicamente un doctor de la colección 'doctores' en Firestore.
 * @param {string} id - ID del documento a eliminar.
 * @returns {Promise<boolean>}
 */
export async function eliminarDoctor(id) {
  if (!id) {
    throw new Error("El identificador del doctor es obligatorio para eliminar.");
  }

  try {
    const docRef = doc(db, "doctores", id);
    await deleteDoc(docRef);
    console.log(`Doctor ${id} eliminado definitivamente de Firestore.`);
    return true;
  } catch (error) {
    console.error(`Error al eliminar doctor ${id} de Firestore:`, error);
    throw error;
  }
}

