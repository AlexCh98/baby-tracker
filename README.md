# Monitor Bebé

PWA para registrar tomas (pecho con cronómetro por lado, biberón, extracción), pañales, sueño, crecimiento (con percentiles OMS), medicación, temperatura, baños y notas. Los datos se comparten en tiempo real entre Android e iPhone mediante Firebase y la app funciona sin conexión.

## Puesta en marcha

1. **Firebase** (console.firebase.google.com):
   - Crea un proyecto y añade una app **Web**. Copia el `firebaseConfig` en `config.js`.
   - **Authentication** → habilita *Correo electrónico/contraseña*.
   - **Firestore Database** → crear en `eur3`, modo producción → pestaña **Reglas** → pega `firestore.rules` con vuestros dos emails.
2. **GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
3. Abrid `https://<usuario>.github.io/<repo>/` en cada móvil, cread cada uno vuestra cuenta e instalad:
   - iPhone: Safari → Compartir → *Añadir a pantalla de inicio*.
   - Android: Chrome → ⋮ → *Instalar aplicación*.
4. Opcional: cuando tengáis las dos cuentas creadas, en Authentication → Configuración → *Acciones del usuario*, desactivad la creación de cuentas nuevas.

Sin `config.js` la app arranca en **modo demo** (datos solo en el dispositivo).

## Actualizar

Al publicar cambios, sube la versión de `CACHE` en `sw.js`.

## Estructura

- `app.js`: interfaz y lógica
- `store.js`: datos (Firebase o demo local)
- `who.js`: tablas LMS de la OMS (0–24 meses) para peso, longitud y perímetro cefálico
- `lib/`: Firebase 13.1.0 y Chart.js 4.4.7 incluidos para que funcione sin conexión
