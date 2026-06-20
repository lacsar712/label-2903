from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
import os

db = SQLAlchemy()
login_manager = LoginManager()
bcrypt = Bcrypt()

def create_app():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    docker_template = '/frontend/src/templates'
    docker_static = '/frontend/src'
    docker_db = 'sqlite:////database/nev_data.db'
    
    local_template = os.path.join(base_dir, 'frontend', 'src', 'templates')
    local_static = os.path.join(base_dir, 'frontend', 'src')
    local_db = f'sqlite:///{os.path.join(base_dir, "database", "nev_data.db")}'
    
    use_docker = os.path.exists(docker_template)
    
    template_folder = docker_template if use_docker else local_template
    static_folder = docker_static if use_docker else local_static
    db_uri = docker_db if use_docker else local_db
    
    app = Flask(__name__, 
                template_folder=template_folder,
                static_folder=static_folder)
    
    app.config['SECRET_KEY'] = 'nev_secret_key_2024'
    app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    
    login_manager.login_view = 'main.login'

    from app import routes
    app.register_blueprint(routes.bp)

    from app import models
    with app.app_context():
        # Ensure database directory exists
        if not os.path.exists('../database'):
            os.makedirs('../database')
        db.create_all()
        
        # Automatic Admin Creation
        admin = models.User.query.filter_by(username='admin').first()
        if not admin:
            hashed_password = bcrypt.generate_password_hash('admin123').decode('utf-8')
            admin = models.User(username='admin', password=hashed_password, role='admin')
            db.session.add(admin)
            db.session.commit()

    return app
