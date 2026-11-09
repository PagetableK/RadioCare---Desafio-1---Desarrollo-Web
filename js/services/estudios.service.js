/**
 * RadioCare - Servicio de Catálogo de Estudios Clínicos (Firestore Modular SDK)
 * Gestiona la consulta de estudios radiológicos y la siembra inicial (Seed) de datos.
 */

import { db } from "./auth.service.js";
import { 
  collection, 
  getDocs, 
  doc, 
  query, 
  where, 
  writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Catálogo inicial representativo con estudios categorizados según la oferta de RadioCare.
 * Categorías estándar: "Ultrasonografía", "Doppler", "Tejidos Blandos", "Procedimientos"
 */
export const CATALOGO_INICIAL_SEED = [
  {
    id: "us-abdominal",
    nombre: "Ultrasonido Abdominal Superior y Completo",
    categoria: "Ultrasonografía",
    duracion: "20 – 30 min",
    preparacion: "Ayuno estricto de 6 a 8 horas (evitar sólidos y lácteos). Puede tomar agua pura sin gas. No suspender medicación habitual.",
    precioAproximado: 45.00,
    activo: true,
    descripcion: "Evaluación ecográfica exhaustiva de hígado, vesícula biliar, páncreas, bazo, riñones y grandes vasos abdominales."
  },
  {
    id: "us-pelvico",
    nombre: "Ultrasonido Pélvico Ginecológico / Vesicoprostático",
    categoria: "Ultrasonografía",
    duracion: "20 – 25 min",
    preparacion: "Ingerir 1 litro de agua pura 1 hora antes de su cita y retener la orina para una óptima ventana acústica vesical.",
    precioAproximado: 40.00,
    activo: true,
    descripcion: "Exploración de vejiga, útero, ovarios o próstata para descartar quistes, masas o alteraciones anatómicas."
  },
  {
    id: "us-renal",
    nombre: "Ultrasonido Renal y de Vías Urinarias",
    categoria: "Ultrasonografía",
    duracion: "20 – 25 min",
    preparacion: "Ayuno de 4 horas e ingesta de 3 a 4 vasos de agua 45 minutos antes del examen con vejiga cómodamente llena.",
    precioAproximado: 42.00,
    activo: true,
    descripcion: "Detección temprana de litiasis renal (cálculos), hidronefrosis, quistes y valoración del parénquima renal bilateral."
  },
  {
    id: "us-obstetrico",
    nombre: "Ultrasonido Obstétrico de Detalle Anatómico",
    categoria: "Ultrasonografía",
    duracion: "30 – 40 min",
    preparacion: "No requiere ayuno. Ropa cómoda de dos piezas. Presentar estudios ecográficos y carné de control prenatal previos.",
    precioAproximado: 55.00,
    activo: true,
    descripcion: "Monitoreo del bienestar fetal, valoración biométrica, placenta, líquido amniótico y anatomía general en alta resolución."
  },
  {
    id: "doppler-carotideo",
    nombre: "Eco Doppler Carotídeo y Vertebral",
    categoria: "Doppler",
    duracion: "30 – 45 min",
    preparacion: "No requiere ayuno ni preparación especial con líquidos. Acudir con cuello despejado, sin collares ni accesorios metálicos.",
    precioAproximado: 75.00,
    activo: true,
    descripcion: "Análisis hemodinámico y detección de placas ateromatosas o estenosis en arterias carótidas y vertebrales."
  },
  {
    id: "doppler-venoso-inf",
    nombre: "Doppler Venoso de Miembros Inferiores (Bilateral)",
    categoria: "Doppler",
    duracion: "35 – 45 min",
    preparacion: "No requiere ayuno. Acudir con prendas cómodas y fáciles de retirar de la cintura hacia abajo (short o falda holgada).",
    precioAproximado: 80.00,
    activo: true,
    descripcion: "Descarte de trombosis venosa profunda (TVP), insuficiencia valvular venosa y mapeo de varices periféricas."
  },
  {
    id: "doppler-arterial-inf",
    nombre: "Doppler Arterial de Miembros Inferiores",
    categoria: "Doppler",
    duracion: "35 – 45 min",
    preparacion: "No requiere ayuno. Se recomienda reposo de 10 minutos previo al examen. No fumar al menos 2 horas antes de la prueba.",
    precioAproximado: 85.00,
    activo: true,
    descripcion: "Evaluación de enfermedad arterial periférica, flujo sistólico, resistencias y permeabilidad arterial en piernas y pies."
  },
  {
    id: "us-mama",
    nombre: "Ultrasonido de Mama de Alta Resolución",
    categoria: "Tejidos Blandos",
    duracion: "25 – 35 min",
    preparacion: "No aplicarse desodorante, talcos, lociones ni cremas en senos ni axilas el día del estudio. Ropa cómoda de dos piezas.",
    precioAproximado: 45.00,
    activo: true,
    descripcion: "Diferenciación de lesiones quísticas versus sólidas, nódulos y evaluación axilar complementaria a la mamografía."
  },
  {
    id: "us-tiroides",
    nombre: "Ultrasonido de Tiroides y Cuello",
    categoria: "Tejidos Blandos",
    duracion: "20 – 30 min",
    preparacion: "Sin ayuno. Acudir con el cuello libre de accesorios. Llevar resultados previos de perfil tiroideo (TSH, T4L) si dispone.",
    precioAproximado: 40.00,
    activo: true,
    descripcion: "Clasificación TIRADS de nódulos tiroideos, evaluación de glándulas submandibulares, parótidas y cadenas ganglionares."
  },
  {
    id: "us-msk-hombro",
    nombre: "Músculo-esquelético: Hombro y Articulaciones",
    categoria: "Tejidos Blandos",
    duracion: "25 – 35 min",
    preparacion: "No requiere ayuno. Llevar ropa sin mangas o blusa/camisa suelta. Presentar radiografías o resonancias previas si existen.",
    precioAproximado: 50.00,
    activo: true,
    descripcion: "Estudio dinámico en tiempo real del manguito rotador, tendón del bíceps, bursas y articulación acromioclavicular."
  },
  {
    id: "proc-biopsia-caaf",
    nombre: "Punción Aspiración con Aguja Fina (CAAF) Guiada",
    categoria: "Procedimientos",
    duracion: "40 – 50 min",
    preparacion: "Presentar pruebas recientes de tiempos de coagulación (TP, TTP) e informe previo. Venir acompañado. Ayuno ligero de 2 h.",
    precioAproximado: 120.00,
    activo: true,
    descripcion: "Procedimiento mínimamente invasivo con visualización ecográfica en tiempo real para toma citológica segura de nódulos."
  },
  {
    id: "proc-marcaje",
    nombre: "Marcaje Prequirúrgico con Guía Ecográfica",
    categoria: "Procedimientos",
    duracion: "30 – 40 min",
    preparacion: "Ayuno de 4 horas. Presentar orden médica por escrito del cirujano tratante y expediente de imágenes previas.",
    precioAproximado: 95.00,
    activo: true,
    descripcion: "Localización milimétrica y marcaje dérmico o con arpón de lesiones no palpables para cirugía conservadora."
  }
];

/**
 * Comprueba si la colección 'estudios' está vacía en Firestore.
 * Si no hay registros, inserta de forma automática el catálogo inicial seed mediante un batch atómico.
 * 
 * @returns {Promise<{ sembrado: boolean, total: number, mensaje: string }>}
 */
export async function inicializarCatalogoSeed() {
  try {
    const colRef = collection(db, 'estudios');
    const snapshot = await getDocs(colRef);

    if (!snapshot.empty) {
      return {
        sembrado: false,
        total: snapshot.size,
        mensaje: `La colección ya cuenta con ${snapshot.size} estudios registrados.`
      };
    }

    // Si está vacía, sembramos el catálogo con un writeBatch de Firestore
    const batch = writeBatch(db);

    for (const estudio of CATALOGO_INICIAL_SEED) {
      const docRef = doc(db, 'estudios', estudio.id);
      batch.set(docRef, estudio);
    }

    await batch.commit();

    return {
      sembrado: true,
      total: CATALOGO_INICIAL_SEED.length,
      mensaje: `Catálogo inicial sembrado con éxito (${CATALOGO_INICIAL_SEED.length} estudios clínicos insertados).`
    };
  } catch (error) {
    console.error("Error al inicializar catálogo seed en Firestore:", error);
    // En caso de que Firebase esté offline o sin credenciales aún, no rompemos la UI
    return {
      sembrado: false,
      total: CATALOGO_INICIAL_SEED.length,
      mensaje: "No se pudo conectar con Firestore para sembrar datos remotos. Se usará catálogo en memoria.",
      error
    };
  }
}

/**
 * Consulta y retorna la lista de todos los estudios activos desde Firestore.
 * Si la colección está vacía o recién inicializada, ejecuta el seed automáticamente.
 * 
 * @returns {Promise<Array<object>>} Arreglo con los estudios médicos activos.
 */
export async function obtenerEstudios() {
  try {
    const colRef = collection(db, 'estudios');
    const consultaActivos = query(colRef, where('activo', '==', true));
    const snapshot = await getDocs(consultaActivos);

    if (snapshot.empty) {
      // Si no hay datos, intentamos sembrar automáticamente
      await inicializarCatalogoSeed();
      const snapshotReintento = await getDocs(consultaActivos);
      
      if (!snapshotReintento.empty) {
        return snapshotReintento.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
      }

      // Si aún estuviera vacío por temas de emulador o permisos, retornamos el catálogo representativo local
      return CATALOGO_INICIAL_SEED.filter(e => e.activo);
    }

    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (error) {
    console.warn("Aviso: Error consultando Firestore (posible modo offline o API Key placeholder). Utilizando catálogo local:", error);
    // Fallback de resiliencia: la interfaz nunca debe quedar rota si Firebase no tiene red
    return CATALOGO_INICIAL_SEED.filter(e => e.activo);
  }
}

