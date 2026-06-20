from flask import Blueprint, render_template, url_for, flash, redirect, request, jsonify
from app import db, bcrypt
from app.models import User, CarModel, SalesData, ChargingPile
from flask_login import login_user, current_user, logout_user, login_required
from sqlalchemy import func, or_
import random

bp = Blueprint('main', __name__)

@bp.route("/")
@login_required
def home():
    return render_template('index.html')

@bp.route("/login", methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.home'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and bcrypt.check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('main.home'))
        else:
            flash('登录失败，请检查用户名或密码', 'danger')
    return render_template('login.html')

@bp.route("/register", methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.home'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        user = User(username=username, password=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash('账号创建成功！请登录', 'success')
        return redirect(url_for('main.login'))
    return render_template('register.html')

@bp.route("/logout")
def logout():
    logout_user()
    return redirect(url_for('main.login'))

@bp.route("/admin/data")
@login_required
def admin_data():
    if current_user.role != 'admin':
        return redirect(url_for('main.home'))
    return render_template('admin_data.html')

# --- Helper for Chart Filtering ---
def apply_car_filters(query):
    brand = request.args.get('brand')
    category_list = request.args.getlist('category[]')
    price_min = request.args.get('price_min')
    price_max = request.args.get('price_max')
    range_min = request.args.get('range_min')

    if brand:
        query = query.filter(CarModel.brand == brand)
    if category_list:
        query = query.filter(CarModel.category.in_(category_list))
    if price_min:
        query = query.filter(CarModel.price >= float(price_min))
    if price_max:
        query = query.filter(CarModel.price <= float(price_max))
    if range_min:
        query = query.filter(CarModel.range_km >= int(range_min))
    return query

# --- Chart APIs ---

@bp.route("/api/chart/bar")
@login_required
def get_bar_data():
    query = CarModel.query
    query = apply_car_filters(query)
    
    sort_field = request.args.get('sort_field', 'model_name')
    sort_order = request.args.get('sort_order', 'asc')
    
    # Map sort fields to columns
    field_map = {
        'range': CarModel.range_km,
        'price': CarModel.price,
        'power': CarModel.power_consumption,
        'sales': func.sum(SalesData.quantity)
    }
    
    if sort_field == 'sales':
        # Join with SalesData for sales sorting
        query = db.session.query(CarModel, func.sum(SalesData.quantity).label('total_sales')).join(SalesData).group_by(CarModel.id)
        # Re-apply filters if we recreated the query
        brand = request.args.get('brand')
        category_list = request.args.getlist('category[]')
        price_min = request.args.get('price_min')
        price_max = request.args.get('price_max')
        range_min = request.args.get('range_min')
        if brand: query = query.filter(CarModel.brand == brand)
        if category_list: query = query.filter(CarModel.category.in_(category_list))
        if price_min: query = query.filter(CarModel.price >= float(price_min))
        if price_max: query = query.filter(CarModel.price <= float(price_max))
        if range_min: query = query.filter(CarModel.range_km >= int(range_min))

        if sort_order == 'desc':
            query = query.order_by(func.sum(SalesData.quantity).desc())
        else:
            query = query.order_by(func.sum(SalesData.quantity).asc())
        
        results = query.all()
        cars = [r[0] for r in results]
    else:
        col = field_map.get(sort_field, CarModel.model_name)
        if sort_order == 'desc':
            query = query.order_by(col.desc())
        else:
            query = query.order_by(col.asc())
        cars = query.all()
    
    return jsonify({
        'models': [c.model_name for c in cars],
        'range': [c.range_km for c in cars],
        'price': [c.price for c in cars],
        'power': [c.power_consumption for c in cars]
    })

@bp.route("/api/chart/line")
@login_required
def get_line_data():
    brand = request.args.get('brand')
    # If a brand is selected, show its trend vs total
    query = db.session.query(SalesData.period, func.sum(SalesData.quantity))
    if brand:
        query = query.join(CarModel).filter(CarModel.brand == brand)
    
    sales = query.group_by(SalesData.period).order_by(SalesData.period).all()
    
    # Also get market share logic if brand selected
    return jsonify({
        'periods': [s[0] for s in sales],
        'sales': [int(s[1]) for s in sales]
    })

@bp.route("/api/chart/pie")
@login_required
def get_pie_data():
    city = request.args.get('city', '北京')
    # Use 'like' to match both '北京' and '北京市'
    sales = db.session.query(
        CarModel.brand, func.sum(SalesData.quantity)
    ).join(SalesData).filter(SalesData.region.like(f"%{city}%")).group_by(CarModel.brand).all()
    
    return jsonify([{"name": s[0], "value": int(s[1])} for s in sales])

@bp.route("/api/chart/scatter")
@login_required
def get_scatter_data():
    query = CarModel.query
    query = apply_car_filters(query)
    cars = query.all()
    
    return jsonify({
        'price_range': [[c.price, c.range_km, c.model_name] for c in cars],
        'weight_power': [[c.weight_kg, c.power_consumption, c.model_name] for c in cars]
    })

@bp.route("/api/chart/map")
@login_required
def get_map_data():
    brand = request.args.get('brand')
    mode = request.args.get('mode', 'sales') # sales or density
    
    if mode == 'density':
        piles = ChargingPile.query.all()
        return jsonify({
            'data': [{"name": p.province, "value": p.density} for p in piles],
            'title': '各省份充电桩密度分布'
        })
    else:
        query = db.session.query(SalesData.region, func.sum(SalesData.quantity)).join(CarModel)
        
        # Apply filters to Sales Map
        brand = request.args.get('brand')
        category_list = request.args.getlist('category[]')
        price_min = request.args.get('price_min')
        price_max = request.args.get('price_max')
        range_min = request.args.get('range_min')
        
        if brand: query = query.filter(CarModel.brand == brand)
        if category_list: query = query.filter(CarModel.category.in_(category_list))
        if price_min: query = query.filter(CarModel.price >= float(price_min))
        if price_max: query = query.filter(CarModel.price <= float(price_max))
        if range_min: query = query.filter(CarModel.range_km >= int(range_min))
            
        sales = query.group_by(SalesData.region).all()
        
        # Keeping names as they are (e.g. "北京市") to match Alibaba GeoJSON exactly
        formatted_sales = []
        for s in sales:
            formatted_sales.append({"name": s[0], "value": int(s[1])})

        return jsonify({
            'data': formatted_sales,
            'title': f'{brand} 全国销量分布' if brand else '全国销售热力分布'
        })

# --- Admin CRUD APIs ---

@bp.route("/api/admin/cars", methods=['GET'])
@login_required
def get_all_cars():
    if current_user.role != 'admin': return jsonify([]), 403
    cars = CarModel.query.all()
    return jsonify([{
        'id': c.id, 'brand': c.brand, 'model_name': c.model_name,
        'price': c.price, 'range_km': c.range_km, 'power': c.power_consumption,
        'weight': c.weight_kg, 'category': c.category
    } for c in cars])

@bp.route("/api/admin/cars", methods=['POST'])
@login_required
def add_car():
    if current_user.role != 'admin': return jsonify({}), 403
    data = request.json
    car = CarModel(
        brand=data['brand'], model_name=data['model_name'],
        price=float(data['price']), range_km=int(data['range_km']),
        power_consumption=float(data['power']), weight_kg=int(data['weight']),
        category=data['category']
    )
    db.session.add(car)
    db.session.flush() # Get the ID before commit

    # Auto-generate some dummy sales for this car so it shows in charts
    regions = ['北京市', '上海市', '广东省', '浙江省']
    periods = ['2023 Q4', '2024 Q1']
    for r in regions:
        for p in periods:
            sale = SalesData(car_model_id=car.id, region=r, period=p, quantity=random.randint(500, 1500))
            db.session.add(sale)
            
    db.session.commit()
    return jsonify({'id': car.id})

@bp.route("/api/admin/cars/<int:id>", methods=['PUT', 'DELETE'])
@login_required
def update_delete_car(id):
    if current_user.role != 'admin': return jsonify({}), 403
    car = CarModel.query.get_or_404(id)
    if request.method == 'DELETE':
        # Also clean up sales data
        SalesData.query.filter_by(car_model_id=id).delete()
        db.session.delete(car)
        db.session.commit()
        return jsonify({'status': 'deleted'})
    
    data = request.json
    car.brand = data['brand']
    car.model_name = data['model_name']
    car.price = float(data['price'])
    car.range_km = int(data['range_km'])
    car.power_consumption = float(data['power'])
    car.weight_kg = int(data['weight'])
    car.category = data['category']
    db.session.commit()
    return jsonify({'status': 'updated'})

@bp.route("/admin/init_db")
@login_required
def init_db_data():
    if current_user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    
    db.session.query(SalesData).delete()
    db.session.query(CarModel).delete()
    db.session.query(ChargingPile).delete()
    
    models_data = [
        ('特斯拉', 'Model 3', 25.5, 600, 12.5, 1600, '纯电'),
        ('特斯拉', 'Model Y', 31.0, 545, 14.0, 1850, '纯电'),
        ('比亚迪', '汉EV', 22.0, 610, 13.2, 1750, '纯电'),
        ('比亚迪', '秦Plus Dm-i', 12.0, 120, 4.5, 1500, '混动'),
        ('蔚来', 'ET7', 45.0, 675, 15.5, 1950, '纯电'),
        ('蔚来', 'ES6', 38.0, 490, 17.0, 2100, '纯电'),
        ('小鹏', 'P7', 23.5, 586, 13.0, 1700, '纯电'),
        ('小鹏', 'G9', 30.0, 520, 16.0, 2200, '纯电')
    ]
    
    for m in models_data:
        car = CarModel(brand=m[0], model_name=m[1], price=m[2], range_km=m[3], power_consumption=m[4], weight_kg=m[5], category=m[6])
        db.session.add(car)
    db.session.commit()
    
    # Full list of 34 Chinese regions to avoid "NaN" on map
    provinces = [
        '北京市', '天津市', '河北省', '山西省', '内蒙古自治区', '辽宁省', '吉林省', '黑龙江省', 
        '上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '湖北省', 
        '湖南省', '广东省', '广西壮族自治区', '海南省', '重庆市', '四川省', '贵州省', 
        '云南省', '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区', 
        '新疆维吾尔自治区', '香港特别行政区', '澳门特别行政区', '台湾省'
    ]
    periods = ['2023 Q3', '2023 Q4', '2024 Q1']
    
    for car in CarModel.query.all():
        for p in provinces:
            for t in periods:
                s = SalesData(car_model_id=car.id, region=p, period=t, quantity=random.randint(100, 1000))
                db.session.add(s)
    
    # Populate Charging Pile Data
    for p in provinces:
        density = round(random.uniform(5.0, 50.0), 1)
        pile = ChargingPile(province=p, density=density)
        db.session.add(pile)
        
    db.session.commit()
    
    return jsonify({'status': '数据初始化成功'})

# --- User Management & Password Change ---

@bp.route("/api/admin/users", methods=['GET', 'POST'])
@login_required
def manage_users():
    if current_user.role != 'admin': return jsonify([]), 403
    if request.method == 'GET':
        users = User.query.all()
        return jsonify([{'id': u.id, 'username': u.username, 'role': u.role} for u in users])
    
    data = request.json
    hashed_pw = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    user = User(username=data['username'], password=hashed_pw, role=data.get('role', 'user'))
    db.session.add(user)
    db.session.commit()
    return jsonify({'status': 'created'})

@bp.route("/api/admin/users/<int:id>", methods=['PUT', 'DELETE'])
@login_required
def edit_user(id):
    if current_user.role != 'admin': return jsonify({}), 403
    user = User.query.get_or_404(id)
    if request.method == 'DELETE':
        if user.id == current_user.id: return jsonify({'error': '不能删除自己'}), 400
        db.session.delete(user)
        db.session.commit()
        return jsonify({'status': 'deleted'})
    
    data = request.json
    user.username = data['username']
    user.role = data['role']
    if data.get('password'):
        user.password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    db.session.commit()
    return jsonify({'status': 'updated'})

@bp.route("/change_password", methods=['GET', 'POST'])
@login_required
def change_password():
    if request.method == 'POST':
        old_pw = request.form.get('old_password')
        new_pw = request.form.get('new_password')
        if bcrypt.check_password_hash(current_user.password, old_pw):
            current_user.password = bcrypt.generate_password_hash(new_pw).decode('utf-8')
            db.session.commit()
            flash('密码修改成功！', 'success')
            return redirect(url_for('main.home'))
        else:
            flash('旧密码错误', 'danger')
    return render_template('change_password.html')

@bp.route("/admin/users")
@login_required
def admin_users():
    if current_user.role != 'admin':
        return redirect(url_for('main.home'))
    return render_template('admin_users.html')
