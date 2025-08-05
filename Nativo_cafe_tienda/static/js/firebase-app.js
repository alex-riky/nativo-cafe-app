// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBR15MaGdT7JpTh0C3w1r1NkI8wmoSQRJU",
  authDomain: "nativo-cafe-tienda-85377.firebaseapp.com",
  projectId: "nativo-cafe-tienda-85377",
  storageBucket: "nativo-cafe-tienda-85377.firebasestorage.app",
  messagingSenderId: "1034154213401",
  appId: "1:1034154213401:web:5b654e7d816c875956aa88",
  measurementId: "G-CE58R1VV8F"
};

// Variables globales de Firebase
let app = null;
let auth = null;
let db = null;
let storage = null;

// Estado global de la aplicación
let currentUser = null;
let cart = [];
let products = [];
let isLoading = false;

// Inicialización de Firebase
async function initializeFirebase() {
    try {
        // Verificar que Firebase esté disponible
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK no está cargado');
        }

        // Inicializar Firebase
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();

        // CONFIGURACIÓN DE SEGURIDAD: Usar persistencia SESSION para evitar sesiones automáticas entre navegadores
        await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        console.log('Firebase configurado con persistencia SESSION para mayor seguridad');

        // SEGURIDAD ADICIONAL: Limpiar cualquier estado de autenticación previo no válido
        await clearInvalidSessions();

        console.log('Firebase inicializado correctamente');

        // Configurar listener de autenticación
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // VERIFICACIÓN DE SEGURIDAD: Asegurar que el usuario esté realmente autenticado
                try {
                    // Verificar que el token del usuario sea válido
                    const token = await user.getIdToken(true); // Force refresh
                    if (!token) {
                        console.log('Token inválido, cerrando sesión automáticamente');
                        await auth.signOut();
                        return;
                    }
                    
                    // Verificar que el email esté verificado para mayor seguridad
                    if (!user.emailVerified) {
                        console.log('Email no verificado, cerrando sesión automáticamente');
                        await auth.signOut();
                        return;
                    }
                    
                    console.log('Usuario autenticado y verificado:', user.email);
                    await loadUserData(user);
                    updateUI();
                } catch (error) {
                    console.error('Error verificando autenticación:', error);
                    console.log('Cerrando sesión por error de verificación');
                    await auth.signOut();
                }
            } else {
                console.log('Usuario no autenticado - acceso público');
                currentUser = null;
                
                // Limpiar carrito cuando se desautentica
                cart = [];
                updateCartUI();
                updateCartDisplay();
                
                // Actualizar UI para mostrar botón de "Iniciar sesión"
                updateUIForGuest();
            }
        });

        // Cargar datos iniciales
        await loadInitialData();

    } catch (error) {
        console.error('Error inicializando Firebase:', error);
        showNotification('Error al inicializar la aplicación: ' + error.message, 'error');
    }
}

// FUNCIÓN DE SEGURIDAD: Limpiar sesiones automáticas no válidas
async function clearInvalidSessions() {
    try {
        // Verificar si hay un usuario actual en Firebase
        const currentFirebaseUser = auth.currentUser;
        
        if (currentFirebaseUser) {
            console.log('Verificando validez de sesión existente...');
            
            // Intentar obtener un token fresco para verificar que la sesión sea válida
            try {
                const token = await currentFirebaseUser.getIdToken(true);
                
                // Verificar que el email esté verificado
                if (!currentFirebaseUser.emailVerified) {
                    console.log('Sesión encontrada pero email no verificado, cerrando sesión');
                    await auth.signOut();
                    return;
                }
                
                console.log('Sesión válida encontrada para:', currentFirebaseUser.email);
            } catch (tokenError) {
                console.log('Token inválido encontrado, cerrando sesión automáticamente');
                await auth.signOut();
            }
        } else {
            console.log('No hay sesión previa, iniciando con estado limpio');
        }
        
        // Asegurar que las variables globales estén limpias
        if (!auth.currentUser) {
            currentUser = null;
            cart = [];
        }
        
    } catch (error) {
        console.error('Error limpiando sesiones:', error);
        // En caso de error, asegurar estado limpio
        currentUser = null;
        cart = [];
    }
}

// Cargar datos del usuario desde Firestore
async function loadUserData(firebaseUser) {
    try {
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            currentUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                name: userData.name || firebaseUser.displayName || 'Usuario',
                role: userData.role || 'customer',
                photoURL: firebaseUser.photoURL || userData.photoURL || null,
                createdAt: userData.createdAt || new Date().toISOString()
            };
        } else {
            // Crear usuario si no existe
            currentUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                name: firebaseUser.displayName || 'Usuario',
                role: 'customer',
                photoURL: firebaseUser.photoURL || null,
                createdAt: new Date().toISOString()
            };
            
            await db.collection('users').doc(firebaseUser.uid).set(currentUser);
        }
        
        console.log('Datos de usuario cargados:', currentUser);
        
        // Cargar carrito específico del usuario
        await loadUserCart();
        
    } catch (error) {
        console.error('Error cargando datos del usuario:', error);
        currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || 'Usuario',
            role: 'customer',
            photoURL: firebaseUser.photoURL || null,
            createdAt: new Date().toISOString()
        };
        
        // Intentar cargar carrito aunque haya error con datos de usuario
        await loadUserCart();
    }
}

// Función de registro
async function registerUser(email, password, name) {
    try {
        isLoading = true;
        showNotification('Registrando usuario...', 'warning');

        // Crear usuario en Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Actualizar perfil
        await user.updateProfile({
            displayName: name
        });

        // Enviar correo de verificación
        await user.sendEmailVerification();
        console.log('Correo de verificación enviado a:', email);

        // Crear documento en Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            role: 'customer',
            createdAt: new Date().toISOString(),
            photoURL: null,
            emailVerified: false
        });

        // Cerrar sesión inmediatamente para forzar verificación
        await auth.signOut();

        showNotification('Usuario registrado exitosamente. Por favor verifica tu correo electrónico antes de iniciar sesión.', 'success');
        
        // Mostrar modal de verificación
        showEmailVerificationModal(email);

    } catch (error) {
        console.error('Error en registro:', error);
        let errorMessage = 'Error en el registro';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'Este email ya está registrado';
                break;
            case 'auth/weak-password':
                errorMessage = 'La contraseña debe tener al menos 6 caracteres';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Email inválido';
                break;
            default:
                errorMessage = error.message;
        }
        
        showNotification(errorMessage, 'error');
    } finally {
        isLoading = false;
    }
}

// Función de login
async function loginUser(email, password) {
    try {
        isLoading = true;
        showNotification('Iniciando sesión...', 'warning');

        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Verificar si el correo está verificado
        if (!user.emailVerified) {
            console.log('Email no verificado para usuario:', email);
            
            // Cerrar sesión inmediatamente
            await auth.signOut();
            
            showNotification('Debes verificar tu correo electrónico antes de iniciar sesión.', 'error');
            
            // Mostrar modal de verificación con opción de reenvío
            showEmailVerificationModal(email, true);
            return;
        }

        // SEGURIDAD: Actualizar estado de verificación en Firestore
        await db.collection('users').doc(user.uid).update({
            emailVerified: true,
            lastLoginAt: new Date().toISOString(),
            loginDevice: navigator.userAgent.substring(0, 100) // Registrar dispositivo para auditoría
        });

        showNotification('Sesión iniciada exitosamente. Sesión válida solo en este navegador.', 'success');
        window.location.href = '/';

    } catch (error) {
        console.error('Error en login:', error);
        let errorMessage = 'Error al iniciar sesión';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'Usuario no encontrado';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Contraseña incorrecta';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Email inválido';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Demasiados intentos. Intenta más tarde';
                break;
            default:
                errorMessage = error.message;
        }
        
        showNotification(errorMessage, 'error');
    } finally {
        isLoading = false;
    }
}

// ==================== FUNCIONES DE VERIFICACIÓN DE CORREO ====================

// Mostrar modal de verificación de correo
function showEmailVerificationModal(email, isLogin = false) {
    console.log('Mostrando modal de verificación para:', email);
    
    // Crear modal dinámicamente si no existe
    let modal = document.getElementById('emailVerificationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'emailVerificationModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>📧 Verificación de Correo</h2>
                    <button class="close-modal" onclick="closeModal('emailVerificationModal')">×</button>
                </div>
                
                <div class="modal-body">
                    <div class="verification-info">
                        <p><strong>¡Casi terminamos!</strong></p>
                        <p>Hemos enviado un correo de verificación a:</p>
                        <p class="email-display" id="verificationEmail">${email}</p>
                        
                        <div class="verification-steps">
                            <h4>Pasos a seguir:</h4>
                            <ol>
                                <li>Revisa tu bandeja de entrada</li>
                                <li>Busca el correo de Firebase Authentication</li>
                                <li>Haz clic en el enlace de verificación</li>
                                <li>Regresa aquí e intenta iniciar sesión</li>
                            </ol>
                        </div>
                        
                        <div class="verification-actions">
                            <button class="btn btn-secondary" onclick="resendVerificationEmail()">
                                📧 Reenviar Correo
                            </button>
                            <button class="btn btn-primary" onclick="checkEmailVerification()">
                                ✅ Ya Verifiqué mi Correo
                            </button>
                        </div>
                        
                        <div class="verification-note">
                            <p><small>💡 <strong>Nota:</strong> Si no encuentras el correo, revisa tu carpeta de spam o correo no deseado.</small></p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        // Actualizar email en modal existente
        const emailDisplay = modal.querySelector('#verificationEmail');
        if (emailDisplay) {
            emailDisplay.textContent = email;
        }
    }
    
    // Guardar email para funciones posteriores
    window.pendingVerificationEmail = email;
    window.isLoginAttempt = isLogin;
    
    showModal('emailVerificationModal');
}

// Reenviar correo de verificación
async function resendVerificationEmail() {
    try {
        const email = window.pendingVerificationEmail;
        if (!email) {
            showNotification('Error: No se encontró el email para reenvío', 'error');
            return;
        }
        
        showNotification('Reenviando correo de verificación...', 'warning');
        
        // Crear usuario temporal para reenviar verificación
        const tempUserCredential = await auth.signInWithEmailAndPassword(email, 'temp');
        await tempUserCredential.user.sendEmailVerification();
        await auth.signOut();
        
        showNotification('Correo de verificación reenviado exitosamente', 'success');
        
    } catch (error) {
        console.error('Error reenviando correo:', error);
        
        if (error.code === 'auth/wrong-password') {
            // Si no podemos hacer login temporal, mostrar instrucciones
            showNotification('Para reenviar el correo, intenta iniciar sesión nuevamente', 'warning');
        } else {
            showNotification('Error al reenviar correo de verificación', 'error');
        }
    }
}

// Verificar si el correo ya fue verificado
async function checkEmailVerification() {
    try {
        const email = window.pendingVerificationEmail;
        if (!email) {
            showNotification('Error: No se encontró el email para verificar', 'error');
            return;
        }
        
        showNotification('Verificando estado del correo...', 'warning');
        
        // Intentar hacer login temporal para verificar estado
        const tempUserCredential = await auth.signInWithEmailAndPassword(email, 'temp');
        
        // Recargar usuario para obtener estado actualizado
        await tempUserCredential.user.reload();
        
        if (tempUserCredential.user.emailVerified) {
            // Actualizar en Firestore
            await db.collection('users').doc(tempUserCredential.user.uid).update({
                emailVerified: true,
                verifiedAt: new Date().toISOString()
            });
            
            await auth.signOut();
            
            showNotification('¡Correo verificado exitosamente! Ya puedes iniciar sesión.', 'success');
            closeModal('emailVerificationModal');
            
            // Si era un intento de login, redirigir a login
            if (window.isLoginAttempt) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
            
        } else {
            await auth.signOut();
            showNotification('Tu correo aún no ha sido verificado. Por favor revisa tu bandeja de entrada.', 'warning');
        }
        
    } catch (error) {
        console.error('Error verificando correo:', error);
        
        if (error.code === 'auth/wrong-password') {
            showNotification('Para verificar, necesitas la contraseña correcta. Intenta iniciar sesión normalmente.', 'warning');
        } else {
            showNotification('Error al verificar el estado del correo', 'error');
        }
    }
}

// Función de logout
async function logout() {
    try {
        await auth.signOut();
        currentUser = null;
        cart = [];
        showNotification('Sesión cerrada', 'success');
        window.location.href = '/login';
    } catch (error) {
        console.error('Error en logout:', error);
        showNotification('Error al cerrar sesión', 'error');
    }
}

// Actualizar UI con datos del usuario
function updateUI() {
    console.log('updateUI llamada, currentUser:', currentUser);
    
    if (!currentUser) {
        console.log('No hay currentUser, saliendo de updateUI');
        return;
    }

    console.log('Actualizando UI para usuario:', currentUser.name);

    // Actualizar nombre de usuario
    const userNameElements = document.querySelectorAll('#userName, .user-name');
    console.log('Elementos de nombre encontrados:', userNameElements.length);
    userNameElements.forEach(element => {
        if (element) {
            element.textContent = currentUser.name;
            console.log('Nombre actualizado en elemento:', element);
        }
    });

    // Actualizar avatar
    const userAvatarElements = document.querySelectorAll('#userAvatar, .user-avatar');
    console.log('Elementos de avatar encontrados:', userAvatarElements.length);
    userAvatarElements.forEach(element => {
        if (element) {
            if (currentUser.photoURL) {
                element.style.backgroundImage = `url(${currentUser.photoURL})`;
                element.style.backgroundSize = 'contain'; // Mostrar imagen completa sin recortes
                element.style.backgroundRepeat = 'no-repeat';
                element.style.backgroundPosition = 'center';
                element.textContent = '';
            } else {
                element.textContent = currentUser.name.charAt(0).toUpperCase();
                element.style.backgroundImage = 'none';
                element.style.backgroundSize = '';
                element.style.backgroundRepeat = '';
                element.style.backgroundPosition = '';
            }
            console.log('Avatar actualizado en elemento:', element);
        }
    });

    // Mostrar/ocultar enlaces de admin
    const adminLinks = document.querySelectorAll('#adminLink, .admin-link');
    adminLinks.forEach(link => {
        if (link) {
            link.style.display = (currentUser.role === 'admin' || currentUser.role === 'employee') ? 'block' : 'none';
        }
    });

    // Mostrar dropdown de usuario y ocultar botón de login
    const userDropdown = document.getElementById('userDropdownBtn');
    const userSection = document.getElementById('userSection');
    const loginButton = document.getElementById('loginButton');
    
    if (userDropdown) {
        userDropdown.style.display = 'flex';
        console.log('Dropdown de usuario mostrado');
    } else {
        console.log('No se encontró userDropdownBtn');
    }
    
    // Mostrar el contenedor del usuario si existe
    if (userSection) {
        userSection.style.display = 'block';
        console.log('Sección de usuario mostrada');
    }
    
    if (loginButton) {
        loginButton.style.display = 'none';
        console.log('Botón de login ocultado');
    }

    // Configurar dropdown
    setupUserDropdown();
    
    console.log('updateUI completada');
}

// Configurar menú desplegable de usuario
function setupUserDropdown() {
    const dropdownBtn = document.getElementById('userDropdownBtn');
    const dropdownMenu = document.getElementById('userDropdownMenu');
    
    if (dropdownBtn && dropdownMenu) {
        // Remover listeners anteriores
        dropdownBtn.replaceWith(dropdownBtn.cloneNode(true));
        const newDropdownBtn = document.getElementById('userDropdownBtn');
        
        newDropdownBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
            newDropdownBtn.classList.toggle('active');
        });

        // Cerrar dropdown al hacer clic fuera
        document.addEventListener('click', function(e) {
            if (!newDropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('show');
                newDropdownBtn.classList.remove('active');
            }
        });
    }
}

// Actualizar UI para visitantes no autenticados
function updateUIForGuest() {
    console.log('Actualizando UI para visitante no autenticado');
    
    // Ocultar dropdown de usuario
    const userDropdown = document.getElementById('userDropdownBtn');
    const userSection = document.getElementById('userSection');
    
    if (userDropdown) {
        userDropdown.style.display = 'none';
    }
    
    // Ocultar el contenedor del usuario si existe
    if (userSection) {
        userSection.style.display = 'none';
        console.log('Sección de usuario ocultada');
    }
    
    // Crear o mostrar botón de "Iniciar sesión"
    let loginButton = document.getElementById('loginButton');
    if (!loginButton) {
        // Crear el botón si no existe
        loginButton = document.createElement('button');
        loginButton.id = 'loginButton';
        loginButton.className = 'btn';
        loginButton.textContent = 'Iniciar Sesión';
        loginButton.onclick = () => window.location.href = '/login';
        
        // Agregar el botón al contenedor de iconos de navegación
        const navIcons = document.querySelector('.nav-icons');
        if (navIcons) {
            navIcons.appendChild(loginButton);
        }
    } else {
        loginButton.style.display = 'block';
    }
    
    console.log('UI actualizada para visitante');
}

// ==================== FUNCIONES DEL CARRITO ====================

// Cargar carrito específico del usuario desde Firebase
async function loadUserCart() {
    if (!currentUser) {
        console.log('No hay usuario autenticado, carrito vacío');
        cart = [];
        updateCartUI();
        updateCartDisplay();
        return;
    }
    
    try {
        console.log('Cargando carrito para usuario:', currentUser.uid);
        const cartDoc = await db.collection('carts').doc(currentUser.uid).get();
        
        if (cartDoc.exists) {
            const cartData = cartDoc.data();
            cart = cartData.items || [];
            console.log('Carrito cargado desde Firebase:', cart.length, 'items');
        } else {
            cart = [];
            console.log('No existe carrito para este usuario, iniciando vacío');
        }
        
        updateCartUI();
        updateCartDisplay();
    } catch (error) {
        console.error('Error cargando carrito del usuario:', error);
        cart = [];
        updateCartUI();
        updateCartDisplay();
    }
}

// Guardar carrito específico del usuario en Firebase
async function saveUserCart() {
    if (!currentUser) {
        console.log('No hay usuario autenticado, no se puede guardar carrito');
        return;
    }
    
    try {
        await db.collection('carts').doc(currentUser.uid).set({
            items: cart,
            updatedAt: new Date().toISOString(),
            userId: currentUser.uid
        });
        console.log('Carrito guardado en Firebase para usuario:', currentUser.uid);
    } catch (error) {
        console.error('Error guardando carrito del usuario:', error);
    }
}

// Función para agregar productos al carrito
async function addToCart(productId) {
    // Verificar si el usuario está autenticado
    if (!currentUser) {
        showCartRestrictionAlert();
        return;
    }
    
    // Verificar si el correo del usuario está verificado
    if (!auth.currentUser || !auth.currentUser.emailVerified) {
        showEmailVerificationAlert();
        return;
    }
    
    // Buscar producto en la lista global de productos
    let product = null;
    if (typeof adminProducts !== 'undefined' && adminProducts.length > 0) {
        product = adminProducts.find(p => p.id === productId);
    }
    
    if (!product && typeof products !== 'undefined' && products.length > 0) {
        product = products.find(p => p.id === productId);
    }
    
    if (!product) {
        showNotification('Producto no encontrado', 'error');
        return;
    }
    
    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: productId,
            name: product.name,
            price: product.price,
            quantity: 1,
            imageUrl: product.imageUrl || product.image || '/static/img/placeholder.jpg',
            stock: product.stock
        });
    }
    
    // Guardar en Firebase
    await saveUserCart();
    
    // Actualizar UI
    updateCartUI();
    updateCartDisplay();
    showNotification(`${product.name} agregado al carrito`, 'success');
    
    // Abrir carrito automáticamente
    setTimeout(() => {
        openCart();
    }, 500);
}

// Mostrar alerta para usuarios no autenticados
function showCartRestrictionAlert() {
    const alertMessage = `
        <div style="text-align: center; padding: 1rem;">
            <h3 style="color: #8B4513; margin-bottom: 1rem;">🔒 Acceso Restringido</h3>
            <p style="margin-bottom: 1rem;">Para agregar productos al carrito y realizar compras, necesitas:</p>
            <ul style="text-align: left; margin: 1rem 0; padding-left: 1.5rem;">
                <li>✅ Iniciar sesión con tu cuenta</li>
                <li>✅ Verificar tu correo electrónico</li>
            </ul>
            <p style="margin-bottom: 1.5rem; color: #666;">¡Es rápido y fácil!</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button onclick="window.location.href='/login'" style="background: #8B4513; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">
                    Iniciar Sesión
                </button>
                <button onclick="window.location.href='/register'" style="background: #28a745; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">
                    Registrarse
                </button>
            </div>
        </div>
    `;
    
    showCustomAlert('Inicia sesión para continuar', alertMessage);
}

// Mostrar alerta para usuarios sin verificar correo
function showEmailVerificationAlert() {
    const alertMessage = `
        <div style="text-align: center; padding: 1rem;">
            <h3 style="color: #ffc107; margin-bottom: 1rem;">📧 Verificación Requerida</h3>
            <p style="margin-bottom: 1rem;">Tu cuenta está creada, pero necesitas verificar tu correo electrónico para poder agregar productos al carrito.</p>
            <p style="margin-bottom: 1.5rem; color: #666;">Revisa tu bandeja de entrada y haz clic en el enlace de verificación.</p>
            <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                <button onclick="resendVerificationEmail()" style="background: #ffc107; color: #333; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">
                    Reenviar Correo
                </button>
                <button onclick="checkEmailVerification()" style="background: #28a745; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">
                    Ya Verifiqué
                </button>
            </div>
        </div>
    `;
    
    showCustomAlert('Verifica tu correo electrónico', alertMessage);
}

// Función para mostrar alertas personalizadas
function showCustomAlert(title, content) {
    // Crear modal si no existe
    let alertModal = document.getElementById('customAlertModal');
    if (!alertModal) {
        alertModal = document.createElement('div');
        alertModal.id = 'customAlertModal';
        alertModal.className = 'modal';
        alertModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2 id="alertTitle">${title}</h2>
                    <button class="close-modal" onclick="closeCustomAlert()">×</button>
                </div>
                <div class="modal-body" id="alertContent">
                    ${content}
                </div>
            </div>
        `;
        document.body.appendChild(alertModal);
    } else {
        document.getElementById('alertTitle').textContent = title;
        document.getElementById('alertContent').innerHTML = content;
    }
    
    // Mostrar modal
    alertModal.style.display = 'flex';
}

// Función para cerrar alerta personalizada
function closeCustomAlert() {
    const alertModal = document.getElementById('customAlertModal');
    if (alertModal) {
        alertModal.style.display = 'none';
    }
}

// Función para abrir carrito
function openCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');
    
    if (cartSidebar && cartOverlay) {
        cartSidebar.classList.add('active');
        cartOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        updateCartDisplay();
        console.log('Carrito abierto');
    } else {
        console.error('No se encontraron elementos del carrito');
    }
}

// Función para cerrar carrito
function closeCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');
    
    if (cartSidebar && cartOverlay) {
        cartSidebar.classList.remove('active');
        cartOverlay.classList.remove('active');
        document.body.style.overflow = '';
        console.log('Carrito cerrado');
    }
}

// Función para alternar carrito
function toggleCart() {
    console.log('toggleCart llamada');
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');
    
    if (!cartSidebar || !cartOverlay) {
        console.error('Elementos del carrito no encontrados:', {
            cartSidebar: !!cartSidebar,
            cartOverlay: !!cartOverlay
        });
        return;
    }
    
    const isOpen = cartSidebar.classList.contains('active');
    console.log('Carrito está abierto:', isOpen);
    
    if (isOpen) {
        console.log('Cerrando carrito...');
        closeCart();
    } else {
        console.log('Abriendo carrito...');
        openCart();
    }
}

// Función global para abrir carrito manualmente
window.openCartManually = function() {
    console.log('Abriendo carrito manualmente...');
    openCart();
};

// Función global para toggle del carrito
window.toggleCart = toggleCart;

// Actualizar contador del carrito
function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    if (cartCount) {
        cartCount.textContent = totalItems;
        cartCount.style.display = totalItems > 0 ? 'flex' : 'none';
    }
}

// Actualizar display del carrito
function updateCartDisplay() {
    console.log('Actualizando display del carrito...');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (!cartItems || !cartTotal) {
        console.error('No se encontraron elementos del carrito para actualizar');
        return;
    }
    
    console.log('Carrito actual:', cart);
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart" style="text-align: center; padding: 2rem; color: #666;">
                <h4>Tu carrito está vacío</h4>
                <p>Agrega algunos productos para comenzar</p>
            </div>
        `;
        cartTotal.textContent = 'Q0.00';
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-image">
                <img src="${item.imageUrl || '/static/img/placeholder.jpg'}" 
                     alt="${item.name}" 
                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 0.5rem;">
            </div>
            <div class="cart-item-info">
                <h4 class="cart-item-name">${item.name}</h4>
                <p class="cart-item-price">Q${item.price.toFixed(2)} x ${item.quantity}</p>
                <div class="cart-item-controls" style="margin-top: 0.5rem;">
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="updateCartItemQuantity('${item.id}', ${item.quantity - 1})">-</button>
                        <span style="margin: 0 0.5rem; font-weight: bold;">${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateCartItemQuantity('${item.id}', ${item.quantity + 1})">+</button>
                        <button class="remove-btn" onclick="removeFromCart('${item.id}')" style="margin-left: 0.5rem;">🗑️</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    cartTotal.textContent = `Q${total.toFixed(2)}`;
    if (checkoutBtn) checkoutBtn.disabled = false;
    
    console.log(`Carrito actualizado: ${cart.length} items, total: Q${total.toFixed(2)}`);
}

// Actualizar cantidad de producto en carrito
async function updateCartItemQuantity(productId, newQuantity) {
    if (newQuantity <= 0) {
        await removeFromCart(productId);
        return;
    }
    
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity = newQuantity;
        await saveUserCart();
        updateCartUI();
        updateCartDisplay();
    }
}

// Remover producto del carrito
async function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    await saveUserCart();
    updateCartUI();
    updateCartDisplay();
    showNotification('Producto removido del carrito', 'success');
}

// Limpiar carrito
async function clearCart() {
    console.log('Limpiando carrito...');
    cart = [];
    
    // Guardar carrito vacío en Firebase si hay usuario autenticado
    if (currentUser) {
        try {
            await saveUserCart();
            console.log('Carrito vacío guardado en Firebase');
        } catch (error) {
            console.error('Error guardando carrito vacío:', error);
        }
    }
    
    updateCartUI();
    updateCartDisplay();
    showNotification('Carrito limpiado', 'success');
}

// Mostrar checkout
function showCheckout() {
    console.log('Mostrando checkout...');
    if (cart.length === 0) {
        showNotification('Tu carrito está vacío', 'warning');
        return;
    }
    
    // Actualizar el resumen del checkout
    const checkoutSummary = document.getElementById('checkoutSummary');
    if (checkoutSummary) {
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        checkoutSummary.innerHTML = `
            <h3>Resumen del Pedido</h3>
            <div class="checkout-items">
                ${cart.map(item => `
                    <div class="checkout-item">
                        <span>${item.name} x ${item.quantity}</span>
                        <span>Q${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="checkout-total" style="border-top: 1px solid #eee; padding-top: 1rem; margin-top: 1rem; font-weight: bold;">
                <span>Total: Q${total.toFixed(2)}</span>
            </div>
        `;
    }
    
    // Ocultar campo de email si el usuario está autenticado
    const emailGroup = document.getElementById('emailGroup');
    const customerEmailInput = document.getElementById('customer_email');
    
    if (currentUser && currentUser.email) {
        console.log('Usuario autenticado detectado, ocultando campo de email');
        if (emailGroup) {
            emailGroup.style.display = 'none';
        }
        if (customerEmailInput) {
            customerEmailInput.removeAttribute('required');
            customerEmailInput.value = currentUser.email; // Pre-llenar con email verificado
        }
    } else {
        console.log('Usuario no autenticado, mostrando campo de email');
        if (emailGroup) {
            emailGroup.style.display = 'block';
        }
        if (customerEmailInput) {
            customerEmailInput.setAttribute('required', 'required');
        }
    }
    
    showModal('checkoutModal');
    console.log('Modal de checkout mostrado');
}

// Variable global para prevenir duplicación de checkout
let checkoutInProgress = false;

// Manejar checkout
async function handleCheckout(event) {
    event.preventDefault();
    
    // Protección robusta contra ejecuciones múltiples
    if (checkoutInProgress || isLoading) {
        console.log('Checkout ya en proceso, ignorando ejecución duplicada...');
        return false;
    }
    
    if (!currentUser) {
        showNotification('Debes iniciar sesión para realizar un pedido', 'error');
        return false;
    }
    
    if (cart.length === 0) {
        showNotification('Tu carrito está vacío', 'warning');
        return false;
    }
    
    try {
        // Marcar checkout como en progreso INMEDIATAMENTE
        checkoutInProgress = true;
        isLoading = true;
        
        console.log('=== INICIANDO CHECKOUT ÚNICO ===');
        console.log('Timestamp:', new Date().toISOString());
        
        // Deshabilitar botón de submit para prevenir clics múltiples
        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Procesando...';
        }
        
        // Deshabilitar todo el formulario
        const formElements = event.target.querySelectorAll('input, button, select, textarea');
        formElements.forEach(element => {
            element.disabled = true;
        });
        
        showNotification('Procesando pedido...', 'warning');
        
        // Función de depuración adicional
        console.log('=== DEPURACIÓN DEL FORMULARIO ===');
        console.log('Formulario target:', event.target);
        
        // MÉTODO ALTERNATIVO: Captura directa de elementos DOM
        const nameElement = document.getElementById('customer_name');
        const emailElement = document.getElementById('customer_email');
        const phoneElement = document.getElementById('customer_phone');
        const addressElement = document.getElementById('customer_address');
        const notesElement = document.getElementById('customer_notes');
        
        console.log('Elementos encontrados:', {
            nameElement: !!nameElement,
            emailElement: !!emailElement,
            phoneElement: !!phoneElement,
            addressElement: !!addressElement,
            notesElement: !!notesElement
        });
        
        // Capturar valores directamente de los elementos DOM
        const customerName = nameElement ? nameElement.value.trim() : '';
        const customerEmail = emailElement ? emailElement.value.trim() : '';
        const customerPhone = phoneElement ? phoneElement.value.trim() : '';
        const customerAddress = addressElement ? addressElement.value.trim() : '';
        const customerNotes = notesElement ? notesElement.value.trim() : '';
        
        console.log('Valores directos de elementos DOM:', {
            customerName: `"${customerName}"`,
            customerEmail: `"${customerEmail}"`,
            customerPhone: `"${customerPhone}"`,
            customerAddress: `"${customerAddress}"`,
            customerNotes: `"${customerNotes}"`
        });
        
        // MÉTODO DE RESPALDO: FormData (para comparación)
        const formData = new FormData(event.target);
        console.log('Contenido de FormData (para comparación):');
        for (let [key, value] of formData.entries()) {
            console.log(`${key}: "${value}"`);
        }
        
        console.log('Longitudes de los campos:', {
            customerNameLength: customerName.length,
            customerEmailLength: customerEmail.length,
            customerPhoneLength: customerPhone.length,
            customerAddressLength: customerAddress.length
        });
        
        console.log('Datos capturados del formulario:', {
            customerName: `"${customerName}"`,
            customerEmail: `"${customerEmail}"`,
            customerPhone: `"${customerPhone}"`,
            customerAddress: `"${customerAddress}"`,
            customerNotes: `"${customerNotes}"`
        });
        
        console.log('Longitudes de los campos:', {
            customerNameLength: customerName.length,
            customerEmailLength: customerEmail.length,
            customerPhoneLength: customerPhone.length,
            customerAddressLength: customerAddress.length
        });
        
        // Validaciones adicionales con logs detallados
        if (!customerName || customerName.length === 0) {
            console.error('Validación fallida: Nombre completo vacío');
            showNotification('El nombre completo es requerido', 'error');
            return false;
        }
        
        if (!customerEmail || customerEmail.length === 0) {
            console.error('Validación fallida: Email vacío');
            showNotification('El correo electrónico es requerido', 'error');
            return false;
        }
        
        if (!customerPhone || customerPhone.length === 0) {
            console.error('Validación fallida: Teléfono vacío');
            showNotification('El teléfono es requerido', 'error');
            return false;
        }
        
        if (!customerAddress || customerAddress.length === 0) {
            console.error('Validación fallida: Dirección vacía');
            showNotification('La dirección de entrega es requerida', 'error');
            return false;
        }
        
        console.log('✅ Todas las validaciones pasaron correctamente');
        
        // Usar el email verificado del usuario autenticado si está disponible
        const verifiedEmail = currentUser && currentUser.email ? currentUser.email : customerEmail;
        console.log('Email a usar para el pedido:', {
            userEmail: currentUser?.email,
            formEmail: customerEmail,
            finalEmail: verifiedEmail
        });
        
        // Crear datos del pedido con información completa
        const orderData = {
            userId: currentUser.uid,
            customerName: customerName,
            customerEmail: verifiedEmail, // Usar email verificado del usuario
            customerPhone: customerPhone,
            customerAddress: customerAddress,
            customerNotes: customerNotes,
            items: cart.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                imageUrl: item.imageUrl,
                subtotal: item.price * item.quantity
            })),
            total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            status: 'pending',
            paymentStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        console.log('Datos completos del pedido a guardar:', orderData);
        
        // Guardar orden en Firestore
        const orderRef = await db.collection('orders').add(orderData);
        console.log('Pedido creado exitosamente con ID:', orderRef.id);
        
        showNotification('¡Pedido realizado exitosamente!', 'success');
        
        // Limpiar carrito
        await clearCart();
        closeModal('checkoutModal');
        
        // Resetear formulario
        event.target.reset();
        
        // Mostrar información del pedido
        setTimeout(() => {
            showNotification(`Pedido #${orderRef.id.substring(0, 8)} confirmado. Te contactaremos pronto.`, 'success');
        }, 2000);
        
    } catch (error) {
        console.error('Error procesando pedido:', error);
        showNotification('Error procesando pedido: ' + error.message, 'error');
    } finally {
        // Resetear variables de control SIEMPRE
        checkoutInProgress = false;
        isLoading = false;
        
        console.log('=== CHECKOUT FINALIZADO ===');
        console.log('checkoutInProgress resetado a:', checkoutInProgress);
        
        // Rehabilitar botón de submit
        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirmar Pedido';
        }
        
        // Rehabilitar todo el formulario
        const formElements = event.target.querySelectorAll('input, button, select, textarea');
        formElements.forEach(element => {
            element.disabled = false;
        });
        
        console.log('Proceso de checkout finalizado completamente');
    }
}

// ==================== FUNCIONES DE PRODUCTOS ====================

// Cargar datos iniciales
async function loadInitialData() {
    try {
        // Cargar productos destacados si estamos en la página de inicio
        if (window.location.pathname === '/' || window.location.pathname === '/index') {
            await loadFeaturedProducts();
        }
        
        // Cargar todos los productos si estamos en la página de productos
        if (window.location.pathname === '/productos') {
            await loadProducts();
        }
        
    } catch (error) {
        console.error('Error cargando datos iniciales:', error);
    }
}

// Cargar productos destacados para la página de inicio
async function loadFeaturedProducts() {
    console.log('Iniciando carga de productos destacados...');
    
    try {
        // Consulta simplificada para evitar problemas
        const productsSnapshot = await db.collection('products')
            .limit(10)
            .get();
        
        console.log('Productos obtenidos de Firebase:', productsSnapshot.size);
        
        const featuredProducts = [];
        productsSnapshot.forEach(doc => {
            const productData = doc.data();
            console.log('Producto encontrado:', productData.name, 'Stock:', productData.stock);
            
            // Filtrar productos con stock > 0 y limitar a 3 productos
            if (productData.stock > 0 && featuredProducts.length < 3) {
                featuredProducts.push({
                    id: doc.id,
                    ...productData
                });
            }
        });

        console.log('Productos destacados filtrados:', featuredProducts.length);

        const grid = document.getElementById('productsGrid');
        if (!grid) {
            console.error('No se encontró el elemento productsGrid');
            return;
        }

        if (featuredProducts.length === 0) {
            console.log('No hay productos con stock disponible');
            grid.innerHTML = '<p class="text-center">No hay productos destacados disponibles</p>';
            return;
        }

        grid.innerHTML = featuredProducts.map(product => `
            <div class="product-card">
                <img src="${product.imageUrl || '/static/img/placeholder.jpg'}" 
                     alt="${product.name}" class="product-image">
                <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-description">${product.description || 'Delicioso café guatemalteco'}</p>
                    <p class="product-price">Q${product.price.toFixed(2)}</p>
                </div>
            </div>
        `).join('');

        console.log(`Productos destacados cargados exitosamente: ${featuredProducts.length}`);
    } catch (error) {
        console.error('Error cargando productos destacados:', error);
        
        // Mostrar mensaje de error en la página
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.innerHTML = '<p class="text-center">Error cargando productos. Revisa la consola para más detalles.</p>';
        }
        
        if (typeof showNotification === 'function') {
            showNotification('Error cargando productos destacados', 'error');
        }
    }
}

// Cargar productos para la página de productos
async function loadProducts() {
    try {
        console.log('Cargando productos para página de productos...');
        
        // Consulta simplificada sin filtros complejos
        const productsSnapshot = await db.collection('products').get();
        products = [];
        
        productsSnapshot.forEach(doc => {
            const productData = doc.data();
            // Solo agregar productos con stock disponible
            if (productData.stock > 0) {
                products.push({
                    id: doc.id,
                    ...productData
                });
            }
        });
        
        console.log('Productos cargados:', products.length);
        displayProducts();
        
    } catch (error) {
        console.error('Error cargando productos:', error);
        showNotification('Error cargando productos', 'error');
    }
}

// Mostrar productos en la página de productos
function displayProducts() {
    const productsGrid = document.getElementById('allProductsGrid');
    if (!productsGrid) return;

    if (products.length === 0) {
        productsGrid.innerHTML = '<div class="no-products">No hay productos disponibles</div>';
        return;
    }

    productsGrid.innerHTML = products.map(product => `
        <div class="product-card">
            <img src="${product.imageUrl || product.image || '/static/img/default-product.jpg'}" 
                 alt="${product.name}" class="product-image">
            <div class="product-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description || ''}</p>
                <div class="product-details">
                    <span class="product-price">Q${product.price.toFixed(2)}</span>
                    <span class="product-category">${product.category || 'General'}</span>
                </div>
                <button onclick="addToCart('${product.id}')" class="btn btn-primary btn-full">
                    Agregar al Carrito
                </button>
            </div>
        </div>
    `).join('');
}

// ==================== FUNCIONES DE UTILIDAD ====================

// Mostrar notificaciones
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// Mostrar modal
function showModal(modalId) {
    console.log('Intentando mostrar modal:', modalId);
    
    // Crear modal dinámicamente si no existe
    let modal = document.getElementById(modalId);
    if (!modal) {
        console.log('Modal no encontrado, creando dinámicamente:', modalId);
        modal = createModalDynamically(modalId);
    }
    
    // Asegurar que los modales estén configurados
    if (modalId === 'changePasswordModal') {
        ensureModalsReady();
    }
    
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        console.log('Modal mostrado exitosamente:', modalId);
    } else {
        console.error('No se pudo crear o encontrar el modal:', modalId);
    }
}

// Crear modales dinámicamente
function createModalDynamically(modalId) {
    console.log('Creando modal dinámicamente:', modalId);
    
    if (modalId === 'profileModal') {
        return createProfileModal();
    } else if (modalId === 'changePasswordModal') {
        return createChangePasswordModal();
    }
    
    return null;
}

// Crear modal de perfil dinámicamente
function createProfileModal() {
    const modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Mi Perfil</h2>
                <button class="close-modal" onclick="closeModal('profileModal')">×</button>
            </div>
            
            <div class="modal-body">
                <div class="profile-section">
                    <div class="profile-photo-section">
                        <div class="current-photo" id="currentPhoto">
                            <div class="user-avatar large" id="profileAvatar"></div>
                        </div>
                        <div class="photo-upload">
                            <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                            <button class="btn btn-secondary" onclick="document.getElementById('photoUpload').click()">
                                📷 Cambiar Foto
                            </button>
                        </div>
                    </div>
                    
                    <div class="profile-info">
                        <div class="form-group">
                            <label>Nombre</label>
                            <input type="text" id="profileName" readonly>
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="profileEmail" readonly>
                        </div>
                        <div class="form-group">
                            <label>Rol</label>
                            <input type="text" id="profileRole" readonly>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    console.log('Modal de perfil creado dinámicamente');
    return modal;
}

// Crear modal de cambio de contraseña dinámicamente
function createChangePasswordModal() {
    const modal = document.createElement('div');
    modal.id = 'changePasswordModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Cambiar Contraseña</h2>
                <button class="close-modal" onclick="closeModal('changePasswordModal')">×</button>
            </div>
            
            <div class="modal-body">
                <form id="changePasswordForm">
                    <div class="form-group">
                        <label for="current_password">Contraseña Actual</label>
                        <input type="password" id="current_password" name="current_password" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="new_password">Nueva Contraseña</label>
                        <input type="password" id="new_password" name="new_password" required minlength="6">
                    </div>
                    
                    <div class="form-group">
                        <label for="confirm_password">Confirmar Nueva Contraseña</label>
                        <input type="password" id="confirm_password" name="confirm_password" required>
                    </div>
                    
                    <button type="submit" class="btn btn-primary btn-full">
                        Cambiar Contraseña
                    </button>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    console.log('Modal de cambio de contraseña creado dinámicamente');
    
    // Configurar el formulario inmediatamente
    setTimeout(() => {
        setupChangePasswordForm();
    }, 100);
    
    return modal;
}

// Cerrar modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// ==================== EVENT LISTENERS ====================

// Event listeners para formularios de auth
function setupAuthEventListeners() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            await loginUser(formData.get('email'), formData.get('password'));
        });
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const password = formData.get('password');
            const confirmPassword = formData.get('confirm_password');
            
            if (password !== confirmPassword) {
                showNotification('Las contraseñas no coinciden', 'error');
                return;
            }
            
            await registerUser(formData.get('email'), password, formData.get('name'));
        });
    }
}

// Configurar event listeners adicionales
function setupAdditionalEventListeners() {
    console.log('Configurando event listeners adicionales...');
    
    // Event listener para el carrito - método más directo
    const cartIcon = document.getElementById('cartIcon');
    if (cartIcon) {
        console.log('Event listener del carrito configurado');
    } else {
        console.error('No se encontró el elemento cartIcon');
    }
    
    // Event listener para cerrar carrito con overlay
    const cartOverlay = document.getElementById('cartOverlay');
    if (cartOverlay) {
        cartOverlay.onclick = function(e) {
            e.preventDefault();
            closeCart();
        };
        console.log('Event listener del overlay configurado');
    }
    
    // Event listener para checkout - MÉTODO MÁS ROBUSTO
    const checkoutForm = document.getElementById('checkoutForm');
    if (checkoutForm) {
        // Remover cualquier listener anterior
        checkoutForm.onsubmit = null;
        
        // Asignar nuevo listener con protección adicional
        checkoutForm.onsubmit = function(e) {
            console.log('=== SUBMIT DETECTADO ===');
            console.log('checkoutInProgress actual:', checkoutInProgress);
            
            // Protección adicional a nivel de evento
            if (checkoutInProgress) {
                console.log('Bloqueando submit duplicado');
                e.preventDefault();
                e.stopImmediatePropagation();
                return false;
            }
            
            return handleCheckout(e);
        };
        console.log('Event listener del checkout configurado (ÚNICO Y ROBUSTO)');
    }
    
    // Configurar dropdown del usuario si existe
    setupUserDropdown();
}

// ==================== INICIALIZACIÓN ====================

// Inicialización principal
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM cargado, iniciando aplicación...');
    const currentPath = window.location.pathname;
    
    if (currentPath === '/login' || currentPath === '/register') {
        setupAuthEventListeners();
    } else {
        // Configurar event listeners inmediatamente
        setupAdditionalEventListeners();
        
        // Inicializar Firebase
        initializeFirebase();
    }
    
    // Cargar carrito al inicio (después de un pequeño delay)
    setTimeout(() => {
        updateCartDisplay();
        // Reconfigurar event listeners después de la inicialización
        setupAdditionalEventListeners();
    }, 2000);
});



// ==================== FUNCIONES DEL MODAL DE PERFIL ====================

// Mostrar modal de perfil
// Mostrar modal de perfil
function showProfileModal() {
    console.log('Mostrando modal de perfil...');
    
    if (!currentUser) {
        showNotification('Debes iniciar sesión para ver tu perfil', 'error');
        return;
    }
    
    // Usar la función showModal mejorada que crea el modal si no existe
    showModal('profileModal');
    
    // Esperar un momento para que el modal se cree si es necesario
    setTimeout(() => {
        // Actualizar información del perfil
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const profileRole = document.getElementById('profileRole');
        const profileAvatar = document.getElementById('profileAvatar');
        
        if (profileName) {
            profileName.value = currentUser.name || 'Usuario';
            profileName.removeAttribute('readonly'); // Permitir edición
        }
        if (profileEmail) {
            profileEmail.value = currentUser.email || '';
            // Email no editable por seguridad
        }
        if (profileRole) {
            profileRole.value = currentUser.role || 'cliente';
        }
        
        // Configurar avatar
        if (profileAvatar) {
            if (currentUser.photoURL) {
                profileAvatar.style.backgroundImage = `url(${currentUser.photoURL})`;
                profileAvatar.style.backgroundSize = 'contain'; // Mostrar imagen completa sin recortes
                profileAvatar.style.backgroundRepeat = 'no-repeat';
                profileAvatar.style.backgroundPosition = 'center';
                profileAvatar.textContent = '';
                
                // Agregar funcionalidad de ampliación al hacer clic
                profileAvatar.style.cursor = 'pointer';
                profileAvatar.onclick = function() {
                    showEnlargedProfileImage(currentUser.photoURL);
                };
            } else {
                profileAvatar.style.backgroundImage = 'none';
                profileAvatar.style.cursor = 'default';
                profileAvatar.onclick = null;
                profileAvatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
            }
        }
        
        // Configurar upload de foto
        setupPhotoUpload();
        
        // Configurar botón de guardar cambios
        setupProfileSaveButton();
        
        console.log('Modal de perfil configurado exitosamente');
    }, 200);
}

// Función para mostrar la imagen de perfil ampliada
function showEnlargedProfileImage(imageUrl) {
    // Crear modal de imagen ampliada si no existe
    let enlargedModal = document.getElementById('enlargedImageModal');
    
    if (!enlargedModal) {
        enlargedModal = document.createElement('div');
        enlargedModal.id = 'enlargedImageModal';
        enlargedModal.className = 'modal';
        enlargedModal.style.zIndex = '10000'; // Asegurar que esté por encima de otros modales
        
        enlargedModal.innerHTML = `
            <div class="modal-content" style="max-width: 90%; max-height: 90%; padding: 20px; text-align: center;">
                <div class="modal-header">
                    <h3>Foto de Perfil</h3>
                    <button class="close-modal" onclick="closeModal('enlargedImageModal')" style="background: none; border: none; font-size: 24px; cursor: pointer; float: right;">×</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <img id="enlargedImage" src="" alt="Foto de perfil ampliada" style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                </div>
            </div>
        `;
        
        document.body.appendChild(enlargedModal);
        
        // Cerrar modal al hacer clic fuera de la imagen
        enlargedModal.addEventListener('click', function(e) {
            if (e.target === enlargedModal) {
                closeModal('enlargedImageModal');
            }
        });
    }
    
    // Actualizar imagen y mostrar modal
    const enlargedImage = document.getElementById('enlargedImage');
    if (enlargedImage) {
        enlargedImage.src = imageUrl;
    }
    
    enlargedModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevenir scroll del fondo
}

// Configurar botón de guardar cambios del perfil
function setupProfileSaveButton() {
    // Buscar o crear botón de guardar
    let saveButton = document.getElementById('saveProfileBtn');
    
    if (!saveButton) {
        // Crear botón si no existe
        const modalBody = document.querySelector('#profileModal .modal-body');
        if (modalBody) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'profile-actions';
            buttonContainer.style.marginTop = '2rem';
            buttonContainer.style.textAlign = 'center';
            
            saveButton = document.createElement('button');
            saveButton.id = 'saveProfileBtn';
            saveButton.className = 'btn btn-primary';
            saveButton.textContent = '💾 Guardar Cambios';
            saveButton.style.minWidth = '200px';
            
            buttonContainer.appendChild(saveButton);
            modalBody.appendChild(buttonContainer);
        }
    }
    
    if (saveButton) {
        // Remover event listeners anteriores
        saveButton.replaceWith(saveButton.cloneNode(true));
        saveButton = document.getElementById('saveProfileBtn');
        
        saveButton.onclick = async function() {
            await saveProfileChanges();
        };
    }
}

// Guardar cambios del perfil
async function saveProfileChanges() {
    try {
        if (!currentUser) {
            showNotification('Error: Usuario no autenticado', 'error');
            return;
        }
        
        const profileName = document.getElementById('profileName');
        const newName = profileName ? profileName.value.trim() : '';
        
        // Validaciones
        if (!newName || newName.length < 2) {
            showNotification('El nombre debe tener al menos 2 caracteres', 'error');
            return;
        }
        
        if (newName === currentUser.name) {
            showNotification('No hay cambios que guardar', 'warning');
            return;
        }
        
        showNotification('Guardando cambios...', 'warning');
        
        // Actualizar en Firebase Auth
        await auth.currentUser.updateProfile({
            displayName: newName
        });
        
        // Actualizar en Firestore
        await db.collection('users').doc(currentUser.uid).update({
            name: newName,
            updatedAt: new Date().toISOString()
        });
        
        // Actualizar currentUser local
        currentUser.name = newName;
        
        // Actualizar UI en toda la aplicación
        updateUI();
        
        // Actualizar avatar en el modal si no hay foto
        const profileAvatar = document.getElementById('profileAvatar');
        if (profileAvatar && !currentUser.photoURL) {
            profileAvatar.textContent = newName.charAt(0).toUpperCase();
        }
        
        showNotification('Perfil actualizado exitosamente', 'success');
        
    } catch (error) {
        console.error('Error guardando cambios del perfil:', error);
        showNotification('Error al guardar los cambios del perfil', 'error');
    }
}

// Configurar upload de foto de perfil
function setupPhotoUpload() {
    const photoUpload = document.getElementById('photoUpload');
    
    if (photoUpload) {
        photoUpload.onchange = async function(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            // Validar tipo de archivo
            if (!file.type.startsWith('image/')) {
                showNotification('Por favor selecciona una imagen válida', 'error');
                return;
            }
            
            // Validar tamaño (máximo 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showNotification('La imagen debe ser menor a 5MB', 'error');
                return;
            }
            
            try {
                showNotification('Subiendo foto de perfil...', 'warning');
                
                // Subir imagen a Firebase Storage
                const storageRef = storage.ref();
                const photoRef = storageRef.child(`profile-photos/${currentUser.uid}/${Date.now()}_${file.name}`);
                
                const uploadTask = await photoRef.put(file);
                const downloadURL = await uploadTask.ref.getDownloadURL();
                
                // Actualizar perfil del usuario en Firebase Auth
                await auth.currentUser.updateProfile({
                    photoURL: downloadURL
                });
                
                // Actualizar en Firestore
                await db.collection('users').doc(currentUser.uid).update({
                    photoURL: downloadURL,
                    updatedAt: new Date().toISOString()
                });
                
                // Actualizar currentUser local
                currentUser.photoURL = downloadURL;
                
                // Actualizar UI
                updateUI();
                
                // Actualizar avatar en el modal
                const profileAvatar = document.getElementById('profileAvatar');
                if (profileAvatar) {
                    profileAvatar.style.backgroundImage = `url(${downloadURL})`;
                    profileAvatar.style.backgroundSize = 'contain'; // Mostrar imagen completa sin recortes
                    profileAvatar.style.backgroundRepeat = 'no-repeat';
                    profileAvatar.style.backgroundPosition = 'center';
                    profileAvatar.textContent = '';
                    
                    // Agregar funcionalidad de ampliación al hacer clic
                    profileAvatar.style.cursor = 'pointer';
                    profileAvatar.onclick = function() {
                        showEnlargedProfileImage(downloadURL);
                    };
                }
                
                showNotification('Foto de perfil actualizada exitosamente', 'success');
                
            } catch (error) {
                console.error('Error subiendo foto de perfil:', error);
                showNotification('Error al subir la foto de perfil', 'error');
            }
        };
    }
}

// ==================== FUNCIONES DE CAMBIO DE CONTRASEÑA ====================

// Configurar formulario de cambio de contraseña
function setupChangePasswordForm() {
    const changePasswordForm = document.getElementById('changePasswordForm');
    
    if (changePasswordForm) {
        changePasswordForm.onsubmit = async function(event) {
            event.preventDefault();
            
            if (!currentUser) {
                showNotification('Debes iniciar sesión para cambiar tu contraseña', 'error');
                return;
            }
            
            const currentPassword = document.getElementById('current_password').value;
            const newPassword = document.getElementById('new_password').value;
            const confirmPassword = document.getElementById('confirm_password').value;
            
            // Validaciones
            if (!currentPassword || !newPassword || !confirmPassword) {
                showNotification('Todos los campos son requeridos', 'error');
                return;
            }
            
            if (newPassword.length < 6) {
                showNotification('La nueva contraseña debe tener al menos 6 caracteres', 'error');
                return;
            }
            
            if (newPassword !== confirmPassword) {
                showNotification('Las contraseñas no coinciden', 'error');
                return;
            }
            
            if (currentPassword === newPassword) {
                showNotification('La nueva contraseña debe ser diferente a la actual', 'error');
                return;
            }
            
            try {
                showNotification('Cambiando contraseña...', 'warning');
                
                // Reautenticar usuario con contraseña actual
                const credential = firebase.auth.EmailAuthProvider.credential(
                    currentUser.email,
                    currentPassword
                );
                
                await auth.currentUser.reauthenticateWithCredential(credential);
                
                // Cambiar contraseña
                await auth.currentUser.updatePassword(newPassword);
                
                // Actualizar timestamp en Firestore
                await db.collection('users').doc(currentUser.uid).update({
                    passwordUpdatedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                
                showNotification('Contraseña cambiada exitosamente', 'success');
                
                // Limpiar formulario
                changePasswordForm.reset();
                
                // Cerrar modal
                closeModal('changePasswordModal');
                
            } catch (error) {
                console.error('Error cambiando contraseña:', error);
                
                let errorMessage = 'Error al cambiar la contraseña';
                
                switch (error.code) {
                    case 'auth/wrong-password':
                        errorMessage = 'La contraseña actual es incorrecta';
                        break;
                    case 'auth/weak-password':
                        errorMessage = 'La nueva contraseña es muy débil';
                        break;
                    case 'auth/requires-recent-login':
                        errorMessage = 'Por seguridad, debes iniciar sesión nuevamente';
                        break;
                    default:
                        errorMessage = error.message;
                }
                
                showNotification(errorMessage, 'error');
            }
        };
    }
}

// ==================== INICIALIZACIÓN DE MODALES ====================

// Configurar event listeners para modales al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    // Configurar formulario de cambio de contraseña
    setTimeout(() => {
        setupChangePasswordForm();
        console.log('Formulario de cambio de contraseña configurado');
    }, 1000);
    
    // Reconfigurar después de que Firebase esté listo
    setTimeout(() => {
        setupChangePasswordForm();
        console.log('Formulario de cambio de contraseña reconfigurado');
    }, 3000);
});

// Función para configurar modales cuando se necesiten
function ensureModalsReady() {
    console.log('Asegurando que los modales estén listos...');
    
    // Verificar y crear modal de perfil si no existe
    if (!document.getElementById('profileModal')) {
        console.log('Creando modal de perfil...');
        createProfileModal();
    }
    
    // Verificar y crear modal de cambio de contraseña si no existe
    if (!document.getElementById('changePasswordModal')) {
        console.log('Creando modal de cambio de contraseña...');
        createChangePasswordModal();
    }
    
    // Configurar formularios
    setTimeout(() => {
        setupChangePasswordForm();
        console.log('Modales asegurados y configurados');
    }, 100);
}