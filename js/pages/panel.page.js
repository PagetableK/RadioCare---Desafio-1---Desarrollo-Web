/**
 * RadioCare - Lógica del Panel Clínico (panel.page.js)
 * Protección de ruta según rol: sólo accesible por coordinadores clínicos.
 */

import { onAuthChange } from "../services/auth.service.js";

const saludoEl = document.getElementById('saludo-coordinador');
const infoEl = document.getElementById('info-coordinador');

onAuthChange(({ authUser, userData }) => {
  if (!authUser || !userData) {
    // Si no hay sesión activa, redirigir a acceso
    window.location.replace('acceso.html');
    return;
  }

  const rol = (userData.rol || 'paciente').toLowerCase();

  // Si un paciente intenta ingresar al panel de coordinación, redirigir a mis-citas
  if (rol !== 'coordinador') {
    alert("Acceso denegado: Esta área está reservada exclusivamente para el personal de coordinación clínica.");
    window.location.replace('mis-citas.html');
    return;
  }

  // Personalizar saludo del panel
  if (saludoEl) {
    saludoEl.textContent = `Bienvenido(a), Coord. ${userData.nombre} ${userData.apellido || ''}`.trim();
  }
  if (infoEl) {
    infoEl.textContent = `Sesión activa como Coordinador(a) Clínico(a) (${userData.email}). Panel de operaciones radiológicas del día.`;
  }
});

