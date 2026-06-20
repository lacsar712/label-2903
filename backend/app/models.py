from app import db, login_manager
from flask_login import UserMixin
from datetime import datetime
import json

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(10), nullable=False, default='user')

class CarModel(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(50), nullable=False)
    model_name = db.Column(db.String(50), nullable=False)
    price = db.Column(db.Float, nullable=False)
    range_km = db.Column(db.Integer, nullable=False)
    power_consumption = db.Column(db.Float, nullable=False)
    weight_kg = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(20), nullable=False) # 纯电 / 混动

class SalesData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    car_model_id = db.Column(db.Integer, db.ForeignKey('car_model.id'), nullable=False)
    region = db.Column(db.String(50), nullable=False)
    period = db.Column(db.String(20), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    car_model = db.relationship('CarModel', backref=db.backref('sales', lazy=True))

class ChargingPile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    province = db.Column(db.String(50), nullable=False)
    density = db.Column(db.Float, nullable=False)

class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    username = db.Column(db.String(20), nullable=False)
    action = db.Column(db.String(50), nullable=False)
    target = db.Column(db.String(200), nullable=False)
    ip_address = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('audit_logs', lazy=True))

class Announcement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(20), nullable=False, default='系统维护')
    status = db.Column(db.String(20), nullable=False, default='draft')
    audience = db.Column(db.String(20), nullable=False, default='all')
    is_pinned = db.Column(db.Boolean, nullable=False, default=False)
    pin_priority = db.Column(db.Integer, nullable=False, default=0)
    require_confirmation = db.Column(db.Boolean, nullable=False, default=False)
    effective_at = db.Column(db.DateTime, nullable=True)
    expire_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_by_name = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = db.relationship('User', backref=db.backref('announcements', lazy=True))
    reads = db.relationship('AnnouncementRead', backref='announcement', lazy=True, cascade='all, delete-orphan')

class UserPreference(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    scheme_name = db.Column(db.String(100), nullable=False)
    config_json = db.Column(db.Text, nullable=False, default='{}')
    is_active = db.Column(db.Boolean, nullable=False, default=False)
    use_count = db.Column(db.Integer, nullable=False, default=0)
    last_used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('preferences', lazy=True, cascade='all, delete-orphan'))

    def get_config(self):
        try:
            return json.loads(self.config_json)
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_config(self, config_dict):
        self.config_json = json.dumps(config_dict, ensure_ascii=False)

    @staticmethod
    def default_config():
        return {
            'brand': '',
            'city': '北京',
            'categories': ['纯电', '混动'],
            'price_min': '',
            'price_max': '',
            'range_min': '',
            'sort_field': 'model_name',
            'sort_order': 'asc',
            'map_mode': 'sales',
            'expanded_charts': ['barChart', 'pieChart', 'lineChart', 'mapChart', 'scatterChart']
        }

class AnnouncementRead(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    announcement_id = db.Column(db.Integer, db.ForeignKey('announcement.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    username = db.Column(db.String(20), nullable=False)
    read_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('announcement_reads', lazy=True))


class CompareReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    report_name = db.Column(db.String(200), nullable=False)
    city_a = db.Column(db.String(50), nullable=False)
    city_b = db.Column(db.String(50), nullable=False)
    city_ref = db.Column(db.String(50), nullable=True)
    period = db.Column(db.String(20), nullable=True)
    dimension = db.Column(db.String(20), nullable=False, default='sales')
    snapshot_json = db.Column(db.Text, nullable=False, default='{}')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('compare_reports', lazy=True, cascade='all, delete-orphan'))

    def get_snapshot(self):
        try:
            return json.loads(self.snapshot_json)
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_snapshot(self, snapshot_dict):
        self.snapshot_json = json.dumps(snapshot_dict, ensure_ascii=False)


class CompareShareLink(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False)
    report_id = db.Column(db.Integer, db.ForeignKey('compare_report.id'), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    expire_at = db.Column(db.DateTime, nullable=False)
    view_count = db.Column(db.Integer, nullable=False, default=0)

    report = db.relationship('CompareReport', backref=db.backref('share_links', lazy=True, cascade='all, delete-orphan'))
    creator = db.relationship('User', backref=db.backref('created_share_links', lazy=True))

    def is_expired(self):
        return datetime.utcnow() > self.expire_at


class BrandHealthScore(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(50), nullable=False)
    period = db.Column(db.String(20), nullable=False)
    sales_momentum = db.Column(db.Float, nullable=False, default=0)
    avg_range = db.Column(db.Float, nullable=False, default=0)
    price_competitiveness = db.Column(db.Float, nullable=False, default=0)
    product_richness = db.Column(db.Float, nullable=False, default=0)
    region_penetration = db.Column(db.Float, nullable=False, default=0)
    charging_compatibility = db.Column(db.Float, nullable=False, default=0)
    total_score = db.Column(db.Float, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class BrandTracking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    brand = db.Column(db.String(50), nullable=False)
    alert_threshold = db.Column(db.Float, nullable=False, default=5.0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('brand_trackings', lazy=True, cascade='all, delete-orphan'))


class BrandWeightConfig(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    sales_momentum = db.Column(db.Float, nullable=False, default=20)
    avg_range = db.Column(db.Float, nullable=False, default=15)
    price_competitiveness = db.Column(db.Float, nullable=False, default=20)
    product_richness = db.Column(db.Float, nullable=False, default=15)
    region_penetration = db.Column(db.Float, nullable=False, default=15)
    charging_compatibility = db.Column(db.Float, nullable=False, default=15)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('brand_weight_config', uselist=False, lazy=True, cascade='all, delete-orphan'))
