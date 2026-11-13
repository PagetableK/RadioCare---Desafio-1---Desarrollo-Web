# RadioCare — Desafío 2 · Desarrollo Web con Firebase

> **Centro de Diagnóstico Radiológico por Ultrasonido** — Sistema de agendamiento clínico en línea y consola administrativa para coordinadores.

**Equipo:** Farmeadores de Aura
| Integrante | Rol |
|---|---|
| Iliana Abigail Huezo Cañas | Integrante 1 — Autenticación y flujo del paciente |
| German Eduardo Suazo Aparicio | Integrante 2 — Agendamiento de citas y servicios |
| Pablo Ismael Sánchez Hernández | Integrante 3 — Panel del Coordinador, Procesamiento de datos y Seguridad Backend |

---

## 1. Planteamiento del Problema

RadioCare atiende la necesidad de un centro de diagnóstico por ultrasonido de gestionar digitalmente el flujo completo de sus citas: desde que el paciente solicita su estudio en línea hasta que el coordinador clínico lo confirma, asigna un radiólogo y actualiza su estado. El sistema reemplaza la coordinación manual por teléfono y elimina errores de agenda, mejorando la experiencia de pacientes y personal.

### Problema Identificado

- Pacientes sin forma de agendar citas fuera del horario de atención telefónica.
- Coordinadores sin visibilidad en tiempo real del estado de la agenda diaria.
- Ausencia de trazabilidad de qué médico atiende cada estudio.
- Ningún mecanismo de seguridad que impida el acceso cruzado de roles a datos sensibles.

---

## 2. Arquitectura Tecnológica

```
RadioCare/
├── index.html              # Landing page institucional
├── acceso.html             # Login y registro de pacientes
├── citas.html              # Formulario de agendamiento (pacientes)
├── mis-citas.html          # Portal de paciente: historial y autogestión
├── panel-clinico.html      # Consola administrativa (solo coordinadores)
├── servicios.html          # Catálogo de estudios radiológicos
├── nosotros.html           # Información del centro
│
├── css/
│   ├── base.css            # Variables de diseño, layout global y componentes
│   ├── panel.css           # Estilos del panel clínico y componentes reutilizables
│   └── ...                 # Estilos específicos por página
│
└── js/
    ├── services/
    │   ├── firebase.config.js  # Configuración e inicialización Singleton de Firebase
    │   ├── auth.service.js     # Auth: registro, login, logout, onAuthChange, caché
    │   ├── citas.service.js    # CRUD de citas (flujo paciente + métodos admin)
    │   └── estudios.service.js # Catálogo de estudios + seed automático
    ├── pages/
    │   ├── navbar.js           # Navbar reactivo con Avatar Dropdown
    │   ├── acceso.page.js      # Lógica de acceso: login / registro
    │   ├── citas.page.js       # Formulario de agendamiento
    │   ├── mis-citas.page.js   # Portal del paciente con historial
    │   ├── panel.page.js       # Consola del coordinador (KPIs, filtros, acciones)
    │   └── ...
    └── utils/
        ├── ui.js               # Helpers de UI reutilizables
        └── validators.js       # Validaciones de formularios
```

### Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 semántico + CSS3 (Variables Custom Properties) + JavaScript ES Modules nativo (sin bundler) |
| Autenticación | Firebase Authentication v10 (email/password) |
| Base de Datos | Cloud Firestore (NoSQL, tiempo real) |
| Seguridad | Firestore Security Rules v2 |
| Hosting | GitHub Pages |

### Colecciones Firestore

| Colección | Propósito | Documentos |
|---|---|---|
| `usuarios` | Perfil clínico completo del usuario (uid como ID) | `uid`, `nombre`, `apellido`, `email`, `dui`, `fechaNacimiento`, `sexoBiologico`, `rol`, `createdAt` |
| `estudios` | Catálogo de procedimientos radiológicos | `id`, `nombre`, `categoria`, `duracion`, `preparacion`, `precioAproximado`, `activo` |
| `citas` | Solicitudes de cita médica | `usuarioId`, `estudio`, `agenda.fecha`, `agenda.horario`, `estado`, `medicoAsignado`, `contacto`, `createdAt`, `updatedAt` |

---

## 3. Guía de Prueba de los Procesos Funcionales

> ⚠️ **Las credenciales de prueba se enviarán de forma separada por Moodle.** No se publican en el repositorio por razones de seguridad.

### 3.1 Flujo del Paciente

**Rol:** `paciente`

1. **Acceso y Registro**
   - Ir a `acceso.html`.
   - Usar la pestaña **"Crear cuenta"** para registrar un nuevo paciente con nombre, apellidos, correo, contraseña, DUI, fecha de nacimiento y sexo biológico.
   - Tras el registro, el sistema redirige automáticamente a `mis-citas.html`.

2. **Agendamiento de Cita**
   - Desde el avatar en la barra de navegación, seleccionar **"Mis Citas"**.
   - Hacer clic en **"+ Solicitar nueva cita"** para ir a `citas.html`.
   - Completar el formulario: seleccionar el estudio, fecha preferida, franja horaria y datos de contacto.
   - Confirmar el envío. La cita queda en estado **"Pendiente"** en Firestore.

3. **Ver Historial de Citas**
   - En `mis-citas.html`, se muestra la tabla con todas las citas propias ordenadas por fecha.
   - El botón **ⓘ Preparación** abre un modal con las instrucciones de preparación médica para cada estudio.
   - Las citas en estado **"Pendiente"** muestran un botón **"Cancelar cita"** para autogestión.

4. **Restricción de Acceso**
   - Si el paciente intenta acceder a `panel-clinico.html`, el sistema lo redirige a `acceso.html` inmediatamente.

---

### 3.2 Flujo del Coordinador

**Rol:** `coordinador`

1. **Acceso al Panel Clínico**
   - Ir a `acceso.html` e iniciar sesión con la cuenta de coordinador (credenciales por Moodle).
   - El sistema detecta el rol `coordinador` y redirige automáticamente a `panel-clinico.html`.

2. **Visualización de KPIs en Tiempo Real**
   - El panel muestra 4 tarjetas de indicadores calculados en memoria:
     - **Estudios programados hoy:** Citas cuya `fechaPreferida` es la fecha local actual.
     - **Pendientes de confirmación:** Citas con `estado == 'pendiente'`.
     - **Estudio más solicitado:** Calculado con `.reduce()` sobre toda la colección.
     - **Total de citas registradas:** Conteo global.

3. **Búsqueda y Filtros**
   - **Barra de búsqueda reactiva:** Escribir nombre, apellidos o DUI para filtrar en tiempo real (evento `input`).
   - **Filtro de Estado:** Seleccionar "Todos", "Pendiente", "Confirmada", "Completada" o "Cancelada".
   - **Filtro de Radiólogo:** Filtrar por médico asignado o "Sin asignar".
   - Los filtros son **combinables simultáneamente**.

4. **Acciones Rápidas en la Tabla**
   - **Cambiar Estado:** Usar el selector desplegable en la fila; el control se deshabilita mientras se escribe en Firestore y aparece un toast de confirmación.
   - **Asignar Radiólogo:** Selector con el personal oficial: Dr. Gerardo Franco, Dra. Itzel Suazo Sorto, Dra. Susana Cruz.
   - **Eliminar Cita:** Clic en el botón rojo de papelera → aparece un modal de confirmación antes de ejecutar `deleteDoc` en Firestore.

5. **Restricción de Acceso**
   - Si un paciente o un usuario no autenticado intenta acceder a `panel-clinico.html`, el guardián de ruta lo redirige a `acceso.html` al instante.
   - La protección Anti-BFCache impide que el botón **"Atrás"** del navegador evite la validación de sesión.

---

## 4. Reglas de Seguridad Firestore

El archivo `firestore.rules` implementa un modelo de seguridad por roles con dos funciones helper:

- **`estaAutenticado()`** — Verifica sesión válida de Firebase Auth.
- **`esCoordinador()`** — Lee el documento `/usuarios/{uid}` del solicitante y verifica `rol == 'coordinador'`.

| Colección | Acción | Regla |
|---|---|---|
| `usuarios` | read | Propio usuario O coordinador |
| `usuarios` | create | Solo el propio usuario, con `rol == 'paciente'` forzado |
| `usuarios` | update | Propio usuario sin cambiar `rol` O coordinador |
| `estudios` | read | Pública (cualquier visitante) |
| `estudios` | write | Solo coordinador |
| `citas` | create | Paciente autenticado; `usuarioId == uid` y `estado == 'pendiente'` |
| `citas` | read | Propia cita (paciente) O coordinador |
| `citas` | update | Paciente: solo si `estado == 'pendiente'` y solo hacia `'pendiente'/'cancelada'` O coordinador (libre) |
| `citas` | delete | Solo coordinador |

Para desplegar las reglas en producción:

```bash
firebase deploy --only firestore:rules
```

---

## 5. Instrucciones de Despliegue en GitHub Pages

### Pre-requisitos

- Repositorio público en GitHub.
- Proyecto de Firebase activo con Firestore y Authentication habilitados.

### Pasos

1. **Clonar o subir el repositorio** a tu cuenta de GitHub.

2. **Verificar la configuración de Firebase** en `js/services/firebase.config.js`:
   - Todos los valores (`apiKey`, `authDomain`, `projectId`, etc.) deben corresponder a tu proyecto de Firebase.

3. **Activar GitHub Pages:**
   - Ir a **Settings → Pages** en el repositorio.
   - En **Source**, seleccionar la rama `main` (o `master`) y la carpeta **`/ (root)`**.
   - Hacer clic en **Save**.

4. **Agregar el dominio de GitHub Pages a Firebase Auth:**
   - En Firebase Console → **Authentication → Settings → Authorized domains**.
   - Agregar: `<tu-usuario>.github.io`

5. **Desplegar Firestore Security Rules:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add   # seleccionar tu proyecto
   firebase deploy --only firestore:rules
   ```

6. **Acceder a la aplicación** en:
   ```
   https://<tu-usuario>.github.io/<nombre-del-repositorio>/
   ```

---

## 6. Credenciales de Prueba

> 🔒 **Las credenciales de las cuentas de prueba (paciente y coordinador) se proporcionan de forma confidencial por la plataforma Moodle del curso.**
>
> **No se publican contraseñas en este repositorio** siguiendo las buenas prácticas de seguridad.

Para obtener las credenciales, consultar la entrega correspondiente en Moodle.

---

## 7. Requisitos Implementados

| # | Requisito | Entregable |
|---|---|---|
| 3 | Reglas de seguridad: paciente crea su propia cita | `firestore.rules` |
| 4 | Reglas de seguridad: roles diferenciados | `firestore.rules` |
| 9 | KPIs calculados en memoria en tiempo real | `panel.page.js` → `calcularKPIs()` |
| 11 | Búsqueda reactiva y filtros combinados | `panel.page.js` → `aplicarFiltrosYRenderizar()` |
| 12 | Ordenamiento cronológico con `.sort()` | `panel.page.js` |
| 14 | Acciones rápidas con retroalimentación visual | `panel.page.js` + `panel-clinico.html` |
| 15 | Reglas de seguridad completas | `firestore.rules` |
| 17 | Documentación de entrega | `README.md` |

---

*©2026 RadioCare — Centro de Diagnóstico Radiológico por Ultrasonido. Proyecto académico ESEN.*
