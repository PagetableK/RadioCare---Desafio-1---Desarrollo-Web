/**
 * RadioCare - Controlador de Navegación y Sesión Reactiva (navbar.js)
 * Maneja el estado de autenticación en la barra de navegación, revalidación anti-BFCache
 * y el componente interactivo Avatar Dropdown (Estilo ChocoMapaSV).
 */

import { onAuthChange, cerrarSesion, obtenerUsuarioActual, auth } from "../services/auth.service.js";

/**
 * Asegura la disponibilidad de los estilos del Avatar Dropdown.
 * Los estilos institucionales han sido centralizados en css/base.css para evitar inyecciones dinámicas.
 */
function asegurarEstilosDropdown() {
  // Estilos centralizados en css/base.css
}

/**
 * Localiza o crea el contenedor del ítem de autenticación en la barra de navegación.
 * @returns {HTMLElement | null}
 */
function obtenerContenedorAuth() {
  // 1. Si existe un elemento explícito con id 'nav-auth-container'
  let container = document.getElementById('nav-auth-container');
  if (container) return container;

  // 2. Buscar si hay una lista de navegación .nav__lista
  const navLista = document.querySelector('.nav__lista');
  if (!navLista) return null;

  // 3. Si en la lista ya existe un enlace hacia acceso.html, usamos su li contenedor
  const accesoLink = navLista.querySelector('a[href*="acceso.html"]');
  if (accesoLink && accesoLink.closest('li')) {
    container = accesoLink.closest('li');
    container.id = 'nav-auth-container';
    return container;
  }

  // 4. Si la lista contiene el botón CTA estándar al final (ej. Agendar cita),
  // agregamos el contenedor de auth al final de la lista.
  container = document.createElement('li');
  container.id = 'nav-auth-container';
  container.className = 'rc-nav-item';
  navLista.appendChild(container);
  return container;
}

/**
 * Renderiza el estado "Sin Sesión Activa" en la barra de navegación:
 * Muestra el botón de llamada a la acción estándar que enlaza a acceso.html.
 * @param {HTMLElement} container
 */
function renderizarEstadoSinSesion(container) {
  if (!container) return;
  container.innerHTML = `
    <a class="btn btn--primario rc-btn-auth" href="acceso.html" id="nav-btn-acceso">
      Acceso
    </a>
  `;
}

/**
 * Renderiza el estado "Con Sesión Activa" en la barra de navegación:
 * Reemplaza el botón por el Avatar interactivo y el Dropdown contextual (Estilo ChocoMapaSV).
 * 
 * @param {HTMLElement} container
 * @param {object} authUser
 * @param {object} userData
 */
function renderizarEstadoConSesion(container, authUser, userData) {
  if (!container) return;

  const nombreCompleto = `${userData?.nombre || ''} ${userData?.apellido || ''}`.trim() || 
                         authUser?.displayName || 
                         (authUser?.email ? authUser.email.split('@')[0] : 'Usuario');

  const inicial = (userData?.nombre?.[0] || authUser?.displayName?.[0] || authUser?.email?.[0] || 'U').toUpperCase();
  const email = userData?.email || authUser?.email || '';
  const rol = (userData?.rol || 'paciente').toLowerCase();

  // Configuración de los enlaces condicionales según el rol del usuario
  let enlacesRolHtml = '';

  if (rol === 'coordinador') {
    enlacesRolHtml = `
      <a href="panel-clinico.html" class="rc-dropdown-item" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        <div class="rc-dropdown-item-meta">
          <strong>Panel Clínico</strong>
          <small>Gestión & Coordinación</small>
        </div>
      </a>
    `;
  } else {
    // Rol 'paciente' (o predeterminado):
    // 1. Enlace a "Mis Citas" (mis-citas.html)
    // 2. Enlace a "Mi Información" (mi-informacion.html)
    enlacesRolHtml = `
      <a href="mis-citas.html" class="rc-dropdown-item" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <circle cx="12" cy="15" r="1.5"/>
        </svg>
        <div class="rc-dropdown-item-meta">
          <strong>Mis Citas</strong>
          <small>Portal de Pacientes</small>
        </div>
      </a>
      <a href="mi-informacion.html" class="rc-dropdown-item" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <div class="rc-dropdown-item-meta">
          <strong>Mi Información</strong>
          <small>Expediente personal</small>
        </div>
      </a>
    `;
  }

  const logoutIcono = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  `;

  container.innerHTML = `
    <div class="rc-avatar-wrapper" id="rc-avatar-wrapper">
      <button 
        type="button" 
        id="rc-avatar-btn" 
        class="rc-avatar-btn" 
        aria-haspopup="true" 
        aria-expanded="false" 
        aria-label="Abrir menú de cuenta de ${nombreCompleto}"
        title="${nombreCompleto} (${rol})">
        ${inicial}
      </button>

      <div 
        id="rc-avatar-dropdown" 
        class="rc-avatar-dropdown" 
        role="menu" 
        aria-hidden="true" 
        aria-label="Menú contextual de usuario">
        
        <!-- Encabezado con información del usuario -->
        <div class="rc-dropdown-header">
          <span class="rc-dropdown-tag">CUENTA ACTIVA</span>
          <p class="rc-dropdown-nombre">${nombreCompleto}</p>
          <p class="rc-dropdown-email">${email}</p>
          <span class="rc-dropdown-rol rc-dropdown-rol--${rol}">
            ● ${rol === 'coordinador' ? 'Coordinador Clínico' : 'Paciente'}
          </span>
        </div>

        <div class="rc-dropdown-divider" role="separator"></div>

        <!-- Enlaces según rol de usuario -->
        ${enlacesRolHtml}

        <div class="rc-dropdown-divider" role="separator"></div>

        <!-- Opción para Cerrar Sesión -->
        <button type="button" id="rc-btn-logout" class="rc-dropdown-item rc-dropdown-item--logout" role="menuitem">
          ${logoutIcono}
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  `;

  // Inicializar eventos del avatar y menú flotante
  const avatarWrapper = container.querySelector('#rc-avatar-wrapper');
  const avatarBtn = container.querySelector('#rc-avatar-btn');
  const dropdown = container.querySelector('#rc-avatar-dropdown');
  const btnLogout = container.querySelector('#rc-btn-logout');

  if (!avatarBtn || !dropdown) return;

  const cerrarDropdown = () => {
    dropdown.classList.remove('rc-dropdown--activo');
    avatarBtn.setAttribute('aria-expanded', 'false');
    dropdown.setAttribute('aria-hidden', 'true');
  };

  const abrirDropdown = () => {
    dropdown.classList.add('rc-dropdown--activo');
    avatarBtn.setAttribute('aria-expanded', 'true');
    dropdown.setAttribute('aria-hidden', 'false');
  };

  const alternarDropdown = () => {
    const estaAbierto = dropdown.classList.contains('rc-dropdown--activo');
    if (estaAbierto) {
      cerrarDropdown();
    } else {
      abrirDropdown();
    }
  };

  // Toggle al hacer clic en el botón de avatar
  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    alternarDropdown();
  });

  // Cerrar al hacer clic fuera del dropdown
  const onDocumentClick = (e) => {
    if (!avatarWrapper.contains(e.target)) {
      cerrarDropdown();
    }
  };
  document.removeEventListener('click', onDocumentClick);
  document.addEventListener('click', onDocumentClick);

  // Cerrar al presionar la tecla Escape
  const onKeydown = (e) => {
    if (e.key === 'Escape' && dropdown.classList.contains('rc-dropdown--activo')) {
      cerrarDropdown();
      avatarBtn.focus();
    }
  };
  document.removeEventListener('keydown', onKeydown);
  document.addEventListener('keydown', onKeydown);

  // Manejador del botón "Cerrar sesión"
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        btnLogout.disabled = true;
        btnLogout.style.opacity = '0.6';
        await cerrarSesion();
        // Redirigir al inicio institucional
        window.location.href = 'index.html';
      } catch (err) {
        console.error("Error al cerrar sesión desde navbar:", err);
        localStorage.removeItem('rc_user_cache');
        sessionStorage.removeItem('rc_user_cache');
        window.location.href = 'index.html';
      }
    });
  }
}

/**
 * Pre-renderiza de inmediato el avatar circular con la inicial a partir de rc_user_cache en localStorage,
 * eliminando el parpadeo de la barra de navegación mientras Firebase Auth revalida en segundo plano.
 * @param {HTMLElement} container
 * @returns {boolean} True si se pudo pre-renderizar desde caché
 */
function prerenderizarDesdeCache(container) {
  if (!container) return false;
  try {
    const raw = localStorage.getItem('rc_user_cache');
    if (!raw) return false;
    const cachedUser = JSON.parse(raw);
    if (cachedUser && (cachedUser.uid || cachedUser.email || cachedUser.nombre)) {
      renderizarEstadoConSesion(container, cachedUser, cachedUser);
      return true;
    }
  } catch (err) {
    console.warn("Aviso: Error leyendo rc_user_cache para pre-renderizado de navbar:", err);
  }
  return false;
}

/**
 * Revalidación forzosa de sesión.
 * Utilizado para el evento pageshow (BFCache) y para sincronización manual.
 */
export async function revalidarSesion() {
  try {
    const contenedor = obtenerContenedorAuth();
    if (!contenedor) return;

    const usuario = await obtenerUsuarioActual();
    if (usuario && auth.currentUser) {
      renderizarEstadoConSesion(contenedor, auth.currentUser, usuario);
    } else {
      renderizarEstadoSinSesion(contenedor);
    }
  } catch (error) {
    console.warn("Aviso en revalidarSesion:", error);
  }
}

/**
 * Inicializador principal del navbar
 */
function iniciarNavbar() {
  asegurarEstilosDropdown();
  const contenedor = obtenerContenedorAuth();

  // 1. Si existe rc_user_cache en localStorage, pre-renderizar de inmediato el avatar circular
  if (contenedor) {
    prerenderizarDesdeCache(contenedor);
  }

  // 2. Escuchar reactivamente los cambios en el estado de autenticación con Firebase
  onAuthChange(({ authUser, userData }) => {
    const cont = obtenerContenedorAuth();
    if (!cont) return;

    if (authUser && userData) {
      renderizarEstadoConSesion(cont, authUser, userData);
    } else {
      renderizarEstadoSinSesion(cont);
    }
  });

  // REVALIDACIÓN FORZOSA ANTI-BFCACHE:
  // Evita que el botón "Atrás" o "Adelante" del navegador muestre estados caducados desde la memoria caché.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      revalidarSesion();
    }
  });
}

// Pre-renderizado ultra-temprano síncrono si el contenedor de auth ya existe en el DOM
const contenedorInmediato = obtenerContenedorAuth();
if (contenedorInmediato) {
  asegurarEstilosDropdown();
  prerenderizarDesdeCache(contenedorInmediato);
}

// Ejecución al cargar el DOM o inmediatamente si ya está listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarNavbar);
} else {
  iniciarNavbar();
}

