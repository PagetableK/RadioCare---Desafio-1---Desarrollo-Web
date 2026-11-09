/**
 * RadioCare - Controlador de Navegación y Sesión Reactiva (navbar.js)
 * Maneja el estado de autenticación en la barra de navegación, revalidación anti-BFCache
 * y el componente interactivo Avatar Dropdown (Estilo ChocoMapaSV).
 */

import { onAuthChange, cerrarSesion, obtenerUsuarioActual, auth } from "../services/auth.service.js";

// ID estático para inyección de estilos de forma limpia y única
const STYLES_ID = 'rc-navbar-avatar-styles';

/**
 * Inyecta dinámicamente las reglas CSS para el Avatar Dropdown si no existen en el DOM.
 * Utiliza variables nativas de RadioCare para preservar la estética oscura institucional.
 */
function asegurarEstilosDropdown() {
  if (document.getElementById(STYLES_ID)) return;

  const styleEl = document.createElement('style');
  styleEl.id = STYLES_ID;
  styleEl.textContent = `
    /* =========================================================
       RadioCare - Avatar Dropdown (Estilo ChocoMapaSV)
       ========================================================= */
    .rc-nav-item {
      display: inline-flex;
      align-items: center;
      position: relative;
    }

    .rc-avatar-wrapper {
      position: relative;
      display: inline-block;
    }

    /* Botón circular de Avatar */
    .rc-avatar-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--color-iris-pulse, #5350cc) 0%, var(--color-iris-glow, #403cd5) 100%);
      border: 2px solid var(--color-clinical-cyan, #00b1ff);
      color: var(--color-cloud-white, #ffffff);
      font-family: inherit;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.02em;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 177, 255, 0.25);
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      outline: none;
      padding: 0;
      user-select: none;
    }

    .rc-avatar-btn:hover,
    .rc-avatar-btn:focus-visible {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 177, 255, 0.45);
      border-color: var(--color-mint-vital, #00ffaa);
    }

    .rc-avatar-btn[aria-expanded="true"] {
      border-color: var(--color-mint-vital, #00ffaa);
      box-shadow: 0 0 0 3px rgba(0, 255, 170, 0.3);
    }

    /* Menú flotante Dropdown */
    .rc-avatar-dropdown {
      position: absolute;
      top: calc(100% + 14px);
      right: 0;
      width: 290px;
      background: rgba(22, 22, 92, 0.97);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-iris-border, #4846c6);
      border-radius: 20px;
      box-shadow: 0 20px 45px rgba(10, 10, 45, 0.65), 0 0 0 1px rgba(177, 166, 246, 0.15);
      padding: 16px;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px) scale(0.97);
      transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), 
                  transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), 
                  visibility 0.22s;
      pointer-events: none;
    }

    .rc-avatar-dropdown.rc-dropdown--activo {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Encabezado del Dropdown */
    .rc-dropdown-header {
      padding-bottom: 12px;
    }

    .rc-dropdown-tag {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-mint-vital, #00ffaa);
      margin-bottom: 6px;
    }

    .rc-dropdown-nombre {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-cloud-white, #ffffff);
      line-height: 1.25;
      margin: 0 0 4px 0;
      word-break: break-word;
    }

    .rc-dropdown-email {
      font-size: 13px;
      color: var(--color-ash, #d8d8e3);
      line-height: 1.3;
      margin: 0 0 8px 0;
      word-break: break-all;
    }

    .rc-dropdown-rol {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 9999px;
      text-transform: capitalize;
    }

    .rc-dropdown-rol--paciente {
      background: rgba(0, 177, 255, 0.15);
      border: 1px solid var(--color-clinical-cyan, #00b1ff);
      color: var(--color-clinical-cyan, #00b1ff);
    }

    .rc-dropdown-rol--coordinador {
      background: rgba(0, 255, 170, 0.15);
      border: 1px solid var(--color-mint-vital, #00ffaa);
      color: var(--color-mint-vital, #00ffaa);
    }

    /* Separador visual */
    .rc-dropdown-divider {
      height: 1px;
      background: var(--color-iris-border, #4846c6);
      margin: 10px -16px;
      opacity: 0.7;
    }

    /* Elementos interactivos del menú */
    .rc-dropdown-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border-radius: 12px;
      background: transparent;
      border: none;
      color: var(--color-cloud-white, #ffffff);
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
    }

    .rc-dropdown-item svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      stroke: var(--color-lilac-mist, #b1a6f6);
      transition: stroke 0.18s ease, transform 0.18s ease;
    }

    .rc-dropdown-item:hover,
    .rc-dropdown-item:focus-visible {
      background: var(--color-iris-shadow, #232269);
      color: var(--color-clinical-cyan, #00b1ff);
      transform: translateX(2px);
      outline: none;
    }

    .rc-dropdown-item:hover svg,
    .rc-dropdown-item:focus-visible svg {
      stroke: var(--color-clinical-cyan, #00b1ff);
      transform: scale(1.08);
    }

    .rc-dropdown-item-meta strong {
      display: block;
      font-size: 14px;
      line-height: 1.2;
    }

    .rc-dropdown-item-meta small {
      display: block;
      font-size: 11px;
      color: var(--color-fog, #9494a9);
      margin-top: 2px;
    }

    /* Opción de Cerrar Sesión */
    .rc-dropdown-item--logout {
      color: #ff8597;
    }

    .rc-dropdown-item--logout svg {
      stroke: #ff6b81;
    }

    .rc-dropdown-item--logout:hover,
    .rc-dropdown-item--logout:focus-visible {
      background: rgba(255, 77, 109, 0.14);
      color: #ffa4b2;
    }

    .rc-dropdown-item--logout:hover svg,
    .rc-dropdown-item--logout:focus-visible svg {
      stroke: #ffa4b2;
    }

    /* Animación genérica de entrada */
    @keyframes rcFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes rcSpin {
      to { transform: rotate(360deg); }
    }

    /* Adaptación Responsiva para móviles */
    @media (max-width: 860px) {
      .rc-avatar-dropdown {
        position: static;
        width: 100%;
        margin-top: 10px;
        box-shadow: none;
        border-color: var(--color-iris-border, #4846c6);
        background: var(--color-deep-iris, #16165c);
      }
      
      .rc-avatar-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
      }
      
      .rc-avatar-btn {
        margin: 4px 0;
      }
    }
  `;

  document.head.appendChild(styleEl);
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
        window.location.href = 'index.html';
      }
    });
  }
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

  // Escuchar reactivamente los cambios en el estado de autenticación
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

// Ejecución al cargar el DOM o inmediatamente si ya está listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarNavbar);
} else {
  iniciarNavbar();
}

