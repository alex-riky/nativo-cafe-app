from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_cors import CORS
import json
import uuid
from datetime import datetime
import os

app = Flask(__name__)
app.secret_key = 'nativo-cafe-secret-key-2024'
CORS(app)

# Rutas principales
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/register')
def register():
    return render_template('register.html')

@app.route('/productos')
def productos():
    return render_template('productos.html')

@app.route('/sobre-nosotros')
def sobre_nosotros():
    return render_template('sobre-nosotros.html')

@app.route('/equipo')
def equipo():
    return render_template('equipo.html')

@app.route('/menu')
def menu():
    return render_template('menu.html')

@app.route('/ubicacion')
def ubicacion():
    return render_template('ubicacion.html')

@app.route('/admin')
def admin():
    return render_template('admin.html')

# API endpoints para compatibilidad (Firebase maneja la autenticación)
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    # Firebase maneja la autenticación, este endpoint es para compatibilidad
    return jsonify({'success': True, 'message': 'Login manejado por Firebase'})

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    # Firebase maneja el registro, este endpoint es para compatibilidad
    return jsonify({'success': True, 'message': 'Registro manejado por Firebase'})

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    # Firebase maneja el logout, este endpoint es para compatibilidad
    return jsonify({'success': True, 'message': 'Logout manejado por Firebase'})

# Endpoints para productos (simulación, en producción usar Firestore)
@app.route('/api/products', methods=['GET'])
def get_products():
    # Los productos se manejan desde Firestore en el frontend
    return jsonify({'success': True, 'products': []})

@app.route('/api/products', methods=['POST'])
def add_product():
    # Los productos se agregan a Firestore desde el frontend
    return jsonify({'success': True, 'message': 'Producto agregado a Firestore'})

@app.route('/api/products/<product_id>', methods=['DELETE'])
def delete_product(product_id):
    # Los productos se eliminan de Firestore desde el frontend
    return jsonify({'success': True, 'message': 'Producto eliminado de Firestore'})

# Endpoints para carrito
@app.route('/api/cart', methods=['GET'])
def get_cart():
    # El carrito se maneja en localStorage y Firestore
    return jsonify({'success': True, 'cart': []})

@app.route('/api/cart/add', methods=['POST'])
def add_to_cart():
    # El carrito se maneja en localStorage y Firestore
    return jsonify({'success': True, 'message': 'Producto agregado al carrito'})

# Endpoints para órdenes
@app.route('/api/orders', methods=['POST'])
def create_order():
    try:
        data = request.get_json()
        # En producción, guardar en Firestore
        order = {
            'id': str(uuid.uuid4()),
            'customer_name': data.get('customer_name'),
            'customer_email': data.get('customer_email'),
            'customer_phone': data.get('customer_phone'),
            'customer_address': data.get('customer_address'),
            'items': data.get('items', []),
            'total': data.get('total', 0),
            'status': 'pending',
            'created_at': datetime.now().isoformat()
        }
        
        return jsonify({
            'success': True,
            'order_id': order['id'],
            'message': 'Pedido creado exitosamente'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# Endpoint para subir imágenes (simulación)
@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    # En producción, subir a Firebase Storage
    return jsonify({
        'success': True,
        'image_url': 'https://via.placeholder.com/300x200',
        'message': 'Imagen subida a Firebase Storage'
    })

if __name__ == '__main__':
 port = int(os.environ.get('PORT', 5006))
 app.run(debug=False, host="0.0.0.0", port=port)