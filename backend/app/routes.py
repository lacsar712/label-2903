from flask import Blueprint, render_template, url_for, flash, redirect, request, jsonify, make_response
from app import db, bcrypt
from app.models import User, CarModel, SalesData, ChargingPile, AuditLog, Announcement, AnnouncementRead, UserPreference
from flask_login import login_user, current_user, logout_user, login_required
from sqlalchemy import func, or_
import random
import pandas as pd
import json as json_module
from io import BytesIO
from datetime import datetime, timedelta

bp = Blueprint('main', __name__)

def log_audit(action, target):
    try:
        ip = request.remote_addr
        user_id = current_user.id if current_user.is_authenticated else None
        username = current_user.username if current_user.is_authenticated else 'anonymous'
        log = AuditLog(
            user_id=user_id,
            username=username,
            action=action,
            target=target,
            ip_address=ip
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        print(f"Audit log error: {e}")
        db.session.rollback()

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
            log_audit('用户登录', f'用户 {username} 登录系统')
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
    if current_user.is_authenticated:
        log_audit('用户登出', f'用户 {current_user.username} 登出系统')
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
    log_audit('新增车型', f'新增车型: {car.brand} {car.model_name} (ID: {car.id})')
    return jsonify({'id': car.id})

@bp.route("/api/admin/cars/<int:id>", methods=['PUT', 'DELETE'])
@login_required
def update_delete_car(id):
    if current_user.role != 'admin': return jsonify({}), 403
    car = CarModel.query.get_or_404(id)
    if request.method == 'DELETE':
        # Also clean up sales data
        car_name = f'{car.brand} {car.model_name}'
        SalesData.query.filter_by(car_model_id=id).delete()
        db.session.delete(car)
        db.session.commit()
        log_audit('删除车型', f'删除车型: {car_name} (ID: {id})')
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
    log_audit('更新车型', f'更新车型: {car.brand} {car.model_name} (ID: {id})')
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
    log_audit('新增用户', f'新增用户: {user.username} (角色: {user.role}, ID: {user.id})')
    return jsonify({'status': 'created'})

@bp.route("/api/admin/users/<int:id>", methods=['PUT', 'DELETE'])
@login_required
def edit_user(id):
    if current_user.role != 'admin': return jsonify({}), 403
    user = User.query.get_or_404(id)
    if request.method == 'DELETE':
        if user.id == current_user.id: return jsonify({'error': '不能删除自己'}), 400
        username = user.username
        db.session.delete(user)
        db.session.commit()
        log_audit('删除用户', f'删除用户: {username} (ID: {id})')
        return jsonify({'status': 'deleted'})
    
    data = request.json
    user.username = data['username']
    user.role = data['role']
    if data.get('password'):
        user.password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        log_msg = f'更新用户信息及密码: {user.username} (角色: {user.role}, ID: {id})'
    else:
        log_msg = f'更新用户信息: {user.username} (角色: {user.role}, ID: {id})'
    db.session.commit()
    log_audit('更新用户', log_msg)
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
            log_audit('修改密码', f'用户 {current_user.username} 修改了登录密码')
            flash('密码修改成功！', 'success')
            return redirect(url_for('main.home'))
        else:
            flash('旧密码错误', 'danger')
    return render_template('change_password.html')

@bp.route("/compare")
@login_required
def compare():
    return render_template('compare.html')

@bp.route("/api/compare/search")
@login_required
def compare_search():
    q = request.args.get('q', '')
    query = CarModel.query
    if q:
        query = query.filter(or_(
            CarModel.model_name.contains(q),
            CarModel.brand.contains(q)
        ))
    cars = query.order_by(CarModel.brand, CarModel.model_name).all()
    return jsonify([{
        'id': c.id, 'brand': c.brand, 'model_name': c.model_name,
        'price': c.price, 'range_km': c.range_km,
        'power': c.power_consumption, 'weight': c.weight_kg,
        'category': c.category
    } for c in cars])

@bp.route("/api/compare/data")
@login_required
def compare_data():
    ids = request.args.get('ids', '')
    if not ids:
        return jsonify({'cars': [], 'radar': {}})
    id_list = [int(x) for x in ids.split(',') if x.strip().isdigit()]
    cars = CarModel.query.filter(CarModel.id.in_(id_list)).all()
    car_map = {c.id: c for c in cars}
    ordered = [car_map[i] for i in id_list if i in car_map]

    all_cars = CarModel.query.all()
    if not all_cars:
        return jsonify({'cars': [], 'radar': {}})

    prices = [c.price for c in all_cars]
    ranges = [c.range_km for c in all_cars]
    powers = [c.power_consumption for c in all_cars]
    weights = [c.weight_kg for c in all_cars]

    all_sales = db.session.query(
        SalesData.car_model_id, func.sum(SalesData.quantity).label('total')
    ).group_by(SalesData.car_model_id).all()
    sales_map = {s[0]: int(s[1]) for s in all_sales}
    sales_vals = list(sales_map.values()) if sales_map else [0]

    def norm(val, mn, mx, invert=False):
        if mx == mn:
            return 50
        score = (val - mn) / (mx - mn) * 100
        return round(100 - score, 1) if invert else round(score, 1)

    price_mn, price_mx = min(prices), max(prices)
    range_mn, range_mx = min(ranges), max(ranges)
    power_mn, power_mx = min(powers), max(powers)
    weight_mn, weight_mx = min(weights), max(weights)
    sales_mn, sales_mx = min(sales_vals), max(sales_vals)

    result_cars = []
    for c in ordered:
        total_sales = sales_map.get(c.id, 0)
        result_cars.append({
            'id': c.id, 'brand': c.brand, 'model_name': c.model_name,
            'price': c.price, 'range_km': c.range_km,
            'power_consumption': c.power_consumption, 'weight_kg': c.weight_kg,
            'category': c.category, 'total_sales': total_sales,
            'norm_price': norm(c.price, price_mn, price_mx, invert=True),
            'norm_range': norm(c.range_km, range_mn, range_mx),
            'norm_power': norm(c.power_consumption, power_mn, power_mx, invert=True),
            'norm_weight': norm(c.weight_kg, weight_mn, weight_mx, invert=True),
            'norm_sales': norm(total_sales, sales_mn, sales_mx)
        })

    return jsonify({'cars': result_cars, 'radar': {
        'indicators': [
            {'name': '价格优势', 'max': 100},
            {'name': '续航能力', 'max': 100},
            {'name': '电耗表现', 'max': 100},
            {'name': '轻量化', 'max': 100},
            {'name': '销量表现', 'max': 100}
        ]
    }})

@bp.route("/admin/users")
@login_required
def admin_users():
    if current_user.role != 'admin':
        return redirect(url_for('main.home'))
    return render_template('admin_users.html')

def _export_excel(df, filename_prefix):
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='数据')
    output.seek(0)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'{filename_prefix}_{timestamp}.xlsx'
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    response.headers["Content-type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return response

@bp.route("/api/export/cars")
@login_required
def export_cars():
    query = CarModel.query
    query = apply_car_filters(query)
    
    sort_field = request.args.get('sort_field', 'model_name')
    sort_order = request.args.get('sort_order', 'asc')
    
    field_map = {
        'model_name': CarModel.model_name,
        'range': CarModel.range_km,
        'price': CarModel.price,
        'power': CarModel.power_consumption,
    }
    
    if sort_field == 'sales':
        query = db.session.query(
            CarModel.id, CarModel.brand, CarModel.model_name,
            CarModel.category, CarModel.price, CarModel.range_km,
            CarModel.power_consumption, CarModel.weight_kg,
            func.sum(SalesData.quantity).label('total_sales')
        ).join(SalesData).group_by(CarModel.id)
        query = apply_car_filters(query)
        if sort_order == 'desc':
            query = query.order_by(func.sum(SalesData.quantity).desc())
        else:
            query = query.order_by(func.sum(SalesData.quantity).asc())
    else:
        col = field_map.get(sort_field, CarModel.model_name)
        if sort_order == 'desc':
            query = query.order_by(col.desc())
        else:
            query = query.order_by(col.asc())
    
    cars = query.all()
    
    if sort_field == 'sales':
        data = [{
            '品牌': c.brand,
            '车型': c.model_name,
            '动力类型': c.category,
            '价格(万元)': c.price,
            '续航(km)': c.range_km,
            '百公里电耗(kWh)': c.power_consumption,
            '车重(kg)': c.weight_kg,
            '总销量(辆)': c.total_sales if c.total_sales else 0
        } for c in cars]
    else:
        data = [{
            '品牌': c.brand,
            '车型': c.model_name,
            '动力类型': c.category,
            '价格(万元)': c.price,
            '续航(km)': c.range_km,
            '百公里电耗(kWh)': c.power_consumption,
            '车重(kg)': c.weight_kg
        } for c in cars]
    
    df = pd.DataFrame(data)
    return _export_excel(df, '车型档案')

@bp.route("/api/export/sales")
@login_required
def export_sales():
    query = db.session.query(
        CarModel.brand, CarModel.model_name, CarModel.category,
        CarModel.price, SalesData.region, SalesData.period,
        SalesData.quantity
    ).select_from(SalesData).join(CarModel)
    
    brand = request.args.get('brand')
    city = request.args.get('city')
    category_list = request.args.getlist('category[]')
    price_min = request.args.get('price_min')
    price_max = request.args.get('price_max')
    range_min = request.args.get('range_min')
    
    if brand:
        query = query.filter(CarModel.brand == brand)
    if city:
        query = query.filter(SalesData.region.like(f"%{city}%"))
    if category_list:
        query = query.filter(CarModel.category.in_(category_list))
    if price_min:
        query = query.filter(CarModel.price >= float(price_min))
    if price_max:
        query = query.filter(CarModel.price <= float(price_max))
    if range_min:
        query = query.filter(CarModel.range_km >= int(range_min))
    
    sales = query.order_by(CarModel.brand, CarModel.model_name, SalesData.period, SalesData.region).all()
    
    data = [{
        '品牌': s.brand,
        '车型': s.model_name,
        '动力类型': s.category,
        '价格(万元)': s.price,
        '区域': s.region,
        '周期': s.period,
        '销量(辆)': s.quantity
    } for s in sales]
    
    df = pd.DataFrame(data)
    return _export_excel(df, '销量汇总')

# --- Audit Log ---

@bp.route("/admin/audit")
@login_required
def admin_audit():
    if current_user.role != 'admin':
        return redirect(url_for('main.home'))
    return render_template('admin_audit.html')

@bp.route("/api/admin/audit/stats")
@login_required
def audit_stats():
    if current_user.role != 'admin':
        return jsonify({}), 403
    
    today_start = datetime.utcnow().date()
    today_start_dt = datetime.combine(today_start, datetime.min.time())
    
    today_count = AuditLog.query.filter(AuditLog.created_at >= today_start_dt).count()
    
    week_ago = datetime.utcnow() - timedelta(days=7)
    active_admins = db.session.query(func.count(func.distinct(AuditLog.user_id))).filter(
        AuditLog.created_at >= week_ago,
        AuditLog.user_id.isnot(None)
    ).scalar()
    
    return jsonify({
        'today_count': today_count,
        'active_admins_7d': active_admins or 0
    })

@bp.route("/api/admin/audit")
@login_required
def audit_logs():
    if current_user.role != 'admin':
        return jsonify([]), 403
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    username = request.args.get('username', '')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    action = request.args.get('action', '')
    
    query = AuditLog.query
    
    if username:
        query = query.filter(AuditLog.username.contains(username))
    
    if action:
        query = query.filter(AuditLog.action == action)
    
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(AuditLog.created_at >= start_dt)
        except ValueError:
            pass
    
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            end_dt = end_dt + timedelta(days=1)
            query = query.filter(AuditLog.created_at < end_dt)
        except ValueError:
            pass
    
    query = query.order_by(AuditLog.created_at.desc())
    
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    logs = [{
        'id': log.id,
        'username': log.username,
        'action': log.action,
        'target': log.target,
        'ip_address': log.ip_address,
        'created_at': log.created_at.strftime('%Y-%m-%d %H:%M:%S')
    } for log in pagination.items]
    
    return jsonify({
        'logs': logs,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': pagination.page,
        'per_page': per_page
    })

# --- Announcement Management ---

@bp.route("/admin/announcements")
@login_required
def admin_announcements():
    if current_user.role != 'admin':
        return redirect(url_for('main.home'))
    return render_template('admin_announcements.html')

def _parse_datetime(dt_str):
    if not dt_str:
        return None
    try:
        return datetime.strptime(dt_str, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        try:
            return datetime.strptime(dt_str, '%Y-%m-%dT%H:%M')
        except ValueError:
            try:
                return datetime.strptime(dt_str, '%Y-%m-%d')
            except ValueError:
                return None

@bp.route("/api/admin/announcements", methods=['GET'])
@login_required
def get_announcements_admin():
    if current_user.role != 'admin':
        return jsonify([]), 403
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    status = request.args.get('status', '')
    category = request.args.get('category', '')
    keyword = request.args.get('keyword', '')
    
    query = Announcement.query
    
    if status:
        query = query.filter(Announcement.status == status)
    if category:
        query = query.filter(Announcement.category == category)
    if keyword:
        query = query.filter(or_(
            Announcement.title.contains(keyword),
            Announcement.content.contains(keyword)
        ))
    
    query = query.order_by(
        Announcement.is_pinned.desc(),
        Announcement.pin_priority.desc(),
        Announcement.created_at.desc()
    )
    
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    announcements = []
    for a in pagination.items:
        read_count = AnnouncementRead.query.filter_by(announcement_id=a.id).count()
        total_users = User.query.count()
        announcements.append({
            'id': a.id,
            'title': a.title,
            'category': a.category,
            'status': a.status,
            'audience': a.audience,
            'is_pinned': a.is_pinned,
            'pin_priority': a.pin_priority,
            'require_confirmation': a.require_confirmation,
            'effective_at': a.effective_at.strftime('%Y-%m-%d %H:%M:%S') if a.effective_at else '',
            'expire_at': a.expire_at.strftime('%Y-%m-%d %H:%M:%S') if a.expire_at else '',
            'created_by': a.created_by_name,
            'created_at': a.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'read_count': read_count,
            'unread_count': total_users - read_count if a.audience == 'all' else (User.query.filter_by(role='admin').count() - read_count)
        })
    
    return jsonify({
        'announcements': announcements,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': pagination.page,
        'per_page': per_page
    })

@bp.route("/api/admin/announcements/<int:id>", methods=['GET'])
@login_required
def get_announcement_detail_admin(id):
    if current_user.role != 'admin':
        return jsonify({}), 403
    
    a = Announcement.query.get_or_404(id)
    return jsonify({
        'id': a.id,
        'title': a.title,
        'content': a.content,
        'category': a.category,
        'status': a.status,
        'audience': a.audience,
        'is_pinned': a.is_pinned,
        'pin_priority': a.pin_priority,
        'require_confirmation': a.require_confirmation,
        'effective_at': a.effective_at.strftime('%Y-%m-%d %H:%M') if a.effective_at else '',
        'expire_at': a.expire_at.strftime('%Y-%m-%d %H:%M') if a.expire_at else '',
        'created_by': a.created_by_name,
        'created_at': a.created_at.strftime('%Y-%m-%d %H:%M:%S')
    })

@bp.route("/api/admin/announcements", methods=['POST'])
@login_required
def create_announcement():
    if current_user.role != 'admin':
        return jsonify({}), 403
    
    data = request.json
    announcement = Announcement(
        title=data['title'],
        content=data.get('content', ''),
        category=data.get('category', '系统维护'),
        status=data.get('status', 'draft'),
        audience=data.get('audience', 'all'),
        is_pinned=data.get('is_pinned', False),
        pin_priority=data.get('pin_priority', 0),
        require_confirmation=data.get('require_confirmation', False),
        effective_at=_parse_datetime(data.get('effective_at', '')),
        expire_at=_parse_datetime(data.get('expire_at', '')),
        created_by=current_user.id,
        created_by_name=current_user.username
    )
    
    db.session.add(announcement)
    db.session.commit()
    
    log_audit('创建公告', f'创建公告: {announcement.title} (ID: {announcement.id})')
    return jsonify({'id': announcement.id, 'status': 'created'})

@bp.route("/api/admin/announcements/<int:id>", methods=['PUT'])
@login_required
def update_announcement(id):
    if current_user.role != 'admin':
        return jsonify({}), 403
    
    a = Announcement.query.get_or_404(id)
    data = request.json
    
    a.title = data.get('title', a.title)
    a.content = data.get('content', a.content)
    a.category = data.get('category', a.category)
    a.status = data.get('status', a.status)
    a.audience = data.get('audience', a.audience)
    a.is_pinned = data.get('is_pinned', a.is_pinned)
    a.pin_priority = data.get('pin_priority', a.pin_priority)
    a.require_confirmation = data.get('require_confirmation', a.require_confirmation)
    
    if 'effective_at' in data:
        a.effective_at = _parse_datetime(data['effective_at'])
    if 'expire_at' in data:
        a.expire_at = _parse_datetime(data['expire_at'])
    
    db.session.commit()
    
    log_audit('更新公告', f'更新公告: {a.title} (ID: {id})')
    return jsonify({'status': 'updated'})

@bp.route("/api/admin/announcements/<int:id>", methods=['DELETE'])
@login_required
def delete_announcement(id):
    if current_user.role != 'admin':
        return jsonify({}), 403
    
    a = Announcement.query.get_or_404(id)
    title = a.title
    db.session.delete(a)
    db.session.commit()
    
    log_audit('删除公告', f'删除公告: {title} (ID: {id})')
    return jsonify({'status': 'deleted'})

@bp.route("/api/admin/announcements/batch", methods=['POST'])
@login_required
def batch_announcements():
    if current_user.role != 'admin':
        return jsonify({}), 403
    
    data = request.json
    ids = data.get('ids', [])
    action = data.get('action', '')
    
    if not ids or not action:
        return jsonify({'error': '参数错误'}), 400
    
    announcements = Announcement.query.filter(Announcement.id.in_(ids)).all()
    
    if action == 'publish':
        for a in announcements:
            a.status = 'published'
        log_audit('批量发布公告', f'批量发布 {len(announcements)} 条公告')
    elif action == 'offline':
        for a in announcements:
            a.status = 'offline'
        log_audit('批量下线公告', f'批量下线 {len(announcements)} 条公告')
    elif action == 'delete':
        for a in announcements:
            db.session.delete(a)
        log_audit('批量删除公告', f'批量删除 {len(announcements)} 条公告')
    else:
        return jsonify({'error': '不支持的操作'}), 400
    
    db.session.commit()
    return jsonify({'status': 'success', 'count': len(announcements)})

@bp.route("/api/admin/announcements/stats", methods=['GET'])
@login_required
def announcement_stats_admin():
    if current_user.role != 'admin':
        return jsonify({}), 403
    
    draft_count = Announcement.query.filter_by(status='draft').count()
    published_count = Announcement.query.filter_by(status='published').count()
    offline_count = Announcement.query.filter_by(status='offline').count()
    
    return jsonify({
        'draft_count': draft_count,
        'published_count': published_count,
        'offline_count': offline_count
    })

# --- User-side Announcements ---

@bp.route("/announcements")
@login_required
def announcements_history():
    return render_template('announcements.html')

def _get_effective_announcements_query():
    now = datetime.utcnow()
    query = Announcement.query.filter(
        Announcement.status == 'published',
        or_(Announcement.effective_at.is_(None), Announcement.effective_at <= now),
        or_(Announcement.expire_at.is_(None), Announcement.expire_at >= now)
    )
    
    if current_user.role != 'admin':
        query = query.filter(Announcement.audience == 'all')
    
    return query

@bp.route("/api/announcements/active", methods=['GET'])
@login_required
def get_active_announcements():
    query = _get_effective_announcements_query()
    announcements = query.order_by(
        Announcement.is_pinned.desc(),
        Announcement.pin_priority.desc(),
        Announcement.created_at.desc()
    ).all()
    
    read_ids = [r.announcement_id for r in AnnouncementRead.query.filter_by(user_id=current_user.id).all()]
    
    result = []
    for a in announcements:
        result.append({
            'id': a.id,
            'title': a.title,
            'content': a.content,
            'category': a.category,
            'is_pinned': a.is_pinned,
            'pin_priority': a.pin_priority,
            'require_confirmation': a.require_confirmation,
            'created_by': a.created_by_name,
            'created_at': a.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'is_read': a.id in read_ids
        })
    
    return jsonify({'announcements': result})

@bp.route("/api/announcements/<int:id>/read", methods=['POST'])
@login_required
def mark_announcement_read(id):
    a = Announcement.query.get_or_404(id)
    
    if a.audience != 'all' and current_user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    
    existing = AnnouncementRead.query.filter_by(
        announcement_id=id,
        user_id=current_user.id
    ).first()
    
    if not existing:
        read_record = AnnouncementRead(
            announcement_id=id,
            user_id=current_user.id,
            username=current_user.username
        )
        db.session.add(read_record)
        db.session.commit()
    
    return jsonify({'status': 'marked'})

@bp.route("/api/announcements", methods=['GET'])
@login_required
def get_announcements_history():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    category = request.args.get('category', '')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    
    query = Announcement.query.filter(Announcement.status == 'published')
    
    if current_user.role != 'admin':
        query = query.filter(Announcement.audience == 'all')
    
    if category:
        query = query.filter(Announcement.category == category)
    
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(Announcement.created_at >= start_dt)
        except ValueError:
            pass
    
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            end_dt = end_dt + timedelta(days=1)
            query = query.filter(Announcement.created_at < end_dt)
        except ValueError:
            pass
    
    read_ids = [r.announcement_id for r in AnnouncementRead.query.filter_by(user_id=current_user.id).all()]
    
    query = query.order_by(
        Announcement.is_pinned.desc(),
        Announcement.pin_priority.desc(),
        Announcement.created_at.desc()
    )
    
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    result = []
    for a in pagination.items:
        result.append({
            'id': a.id,
            'title': a.title,
            'category': a.category,
            'is_pinned': a.is_pinned,
            'require_confirmation': a.require_confirmation,
            'created_by': a.created_by_name,
            'created_at': a.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'effective_at': a.effective_at.strftime('%Y-%m-%d %H:%M:%S') if a.effective_at else '',
            'expire_at': a.expire_at.strftime('%Y-%m-%d %H:%M:%S') if a.expire_at else '',
            'is_read': a.id in read_ids
        })
    
    return jsonify({
        'announcements': result,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': pagination.page,
        'per_page': per_page
    })

@bp.route("/api/announcements/<int:id>", methods=['GET'])
@login_required
def get_announcement_detail(id):
    a = Announcement.query.get_or_404(id)
    
    if a.audience != 'all' and current_user.role != 'admin':
        return jsonify({'error': '无权限'}), 403
    
    is_read = AnnouncementRead.query.filter_by(
        announcement_id=id,
        user_id=current_user.id
    ).first() is not None
    
    return jsonify({
        'id': a.id,
        'title': a.title,
        'content': a.content,
        'category': a.category,
        'is_pinned': a.is_pinned,
        'require_confirmation': a.require_confirmation,
        'created_by': a.created_by_name,
        'created_at': a.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        'effective_at': a.effective_at.strftime('%Y-%m-%d %H:%M:%S') if a.effective_at else '',
        'expire_at': a.expire_at.strftime('%Y-%m-%d %H:%M:%S') if a.expire_at else '',
        'is_read': is_read
    })

# --- Car Detail Sidebar APIs ---

def _get_car_by_name(model_name):
    return CarModel.query.filter_by(model_name=model_name).first()

@bp.route("/api/car/detail/<path:model_name>")
@login_required
def car_detail(model_name):
    car = _get_car_by_name(model_name)
    if not car:
        return jsonify({'error': '车型不存在'}), 404

    all_cars = CarModel.query.all()
    brand_cars = [c for c in all_cars if c.brand == car.brand]

    price_min, price_max = car.price - 2, car.price + 2
    price_segment_cars = [c for c in all_cars if price_min <= c.price <= price_max]

    def calc_percentile(lst, val, lower_better=False):
        total = len(lst)
        if total <= 1:
            return 50
        if lower_better:
            better = sum(1 for v in lst if v < val)
        else:
            better = sum(1 for v in lst if v > val)
        equal = sum(1 for v in lst if v == val)
        return round((better + equal * 0.5) / total * 100, 1)

    return jsonify({
        'id': car.id,
        'brand': car.brand,
        'model_name': car.model_name,
        'category': car.category,
        'price': car.price,
        'range_km': car.range_km,
        'power_consumption': car.power_consumption,
        'weight_kg': car.weight_kg,
        'ranks': {
            'brand_total': len(brand_cars),
            'rank_in_brand_price': sorted(brand_cars, key=lambda c: c.price).index(car) + 1,
            'rank_in_brand_range': sorted(brand_cars, key=lambda c: c.range_km, reverse=True).index(car) + 1,
            'rank_in_brand_power': sorted(brand_cars, key=lambda c: c.power_consumption).index(car) + 1,
            'segment_total': len(price_segment_cars),
            'rank_in_segment_price': sorted(price_segment_cars, key=lambda c: c.price).index(car) + 1 if price_segment_cars else 0,
            'rank_in_segment_range': sorted(price_segment_cars, key=lambda c: c.range_km, reverse=True).index(car) + 1 if price_segment_cars else 0,
            'rank_in_segment_power': sorted(price_segment_cars, key=lambda c: c.power_consumption).index(car) + 1 if price_segment_cars else 0,
            'pct_brand_price': calc_percentile([c.price for c in brand_cars], car.price, lower_better=True),
            'pct_brand_range': calc_percentile([c.range_km for c in brand_cars], car.range_km),
            'pct_brand_power': calc_percentile([c.power_consumption for c in brand_cars], car.power_consumption, lower_better=True),
            'pct_segment_price': calc_percentile([c.price for c in price_segment_cars], car.price, lower_better=True),
            'pct_segment_range': calc_percentile([c.range_km for c in price_segment_cars], car.range_km),
            'pct_segment_power': calc_percentile([c.power_consumption for c in price_segment_cars], car.power_consumption, lower_better=True)
        }
    })

@bp.route("/api/car/region_sales/<path:model_name>")
@login_required
def car_region_sales(model_name):
    car = _get_car_by_name(model_name)
    if not car:
        return jsonify({'error': '车型不存在'}), 404

    sales = db.session.query(
        SalesData.region, func.sum(SalesData.quantity)
    ).filter_by(car_model_id=car.id).group_by(SalesData.region).all()

    total = sum(int(s[1]) for s in sales)

    return jsonify({
        'total': total,
        'regions': [{'name': s[0], 'value': int(s[1])} for s in sales]
    })

@bp.route("/api/car/quarterly/<path:model_name>")
@login_required
def car_quarterly(model_name):
    car = _get_car_by_name(model_name)
    if not car:
        return jsonify({'error': '车型不存在'}), 404

    sales = db.session.query(
        SalesData.period, func.sum(SalesData.quantity)
    ).filter_by(car_model_id=car.id).group_by(SalesData.period).order_by(SalesData.period).all()

    periods = [s[0] for s in sales]
    quantities = [int(s[1]) for s in sales]

    changes = []
    for i in range(len(quantities)):
        if i == 0:
            changes.append(None)
        else:
            prev = quantities[i - 1]
            cur = quantities[i]
            if prev > 0:
                pct = round((cur - prev) / prev * 100, 1)
                changes.append({
                    'pct': pct,
                    'up': pct >= 0
                })
            else:
                changes.append(None)

    return jsonify({
        'periods': periods,
        'quantities': quantities,
        'changes': changes
    })

@bp.route("/api/car/compare_avg/<path:model_name>")
@login_required
def car_compare_avg(model_name):
    car = _get_car_by_name(model_name)
    if not car:
        return jsonify({'error': '车型不存在'}), 404

    same_cat_cars = [c for c in CarModel.query.all() if c.category == car.category]

    def avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else 0

    avg_price = avg([c.price for c in same_cat_cars])
    avg_range = avg([c.range_km for c in same_cat_cars])
    avg_power = avg([c.power_consumption for c in same_cat_cars])
    avg_weight = avg([c.weight_kg for c in same_cat_cars])

    dims = [
        {'name': '价格', 'unit': '万元', 'car': car.price, 'avg': avg_price, 'lower_better': True},
        {'name': '续航', 'unit': 'km', 'car': car.range_km, 'avg': avg_range, 'lower_better': False},
        {'name': '电耗', 'unit': 'kWh/100km', 'car': car.power_consumption, 'avg': avg_power, 'lower_better': True},
        {'name': '车重', 'unit': 'kg', 'car': car.weight_kg, 'avg': avg_weight, 'lower_better': True}
    ]

    result = []
    for d in dims:
        diff = round(d['car'] - d['avg'], 1)
        better = (diff < 0) if d['lower_better'] else (diff > 0)
        if d['avg'] > 0:
            if d['lower_better']:
                pct = round((d['avg'] - d['car']) / d['avg'] * 100, 1)
            else:
                pct = round((d['car'] - d['avg']) / d['avg'] * 100, 1)
        else:
            pct = 0
        result.append({
            'name': d['name'],
            'unit': d['unit'],
            'car': d['car'],
            'avg': d['avg'],
            'diff': diff,
            'pct': pct,
            'better': better
        })

    return jsonify({
        'category': car.category,
        'total_in_category': len(same_cat_cars),
        'dims': result
    })

@bp.route("/api/car/similar/<path:model_name>")
@login_required
def car_similar(model_name):
    car = _get_car_by_name(model_name)
    if not car:
        return jsonify({'error': '车型不存在'}), 404

    all_cars = CarModel.query.filter(CarModel.id != car.id).all()

    def similarity_score(c):
        price_diff = abs(c.price - car.price) * 2
        range_diff = abs(c.range_km - car.range_km) / 100
        power_diff = abs(c.power_consumption - car.power_consumption) * 5
        cat_bonus = 0 if c.category == car.category else 50
        return price_diff + range_diff + power_diff + cat_bonus

    similar = sorted(all_cars, key=similarity_score)[:3]

    return jsonify([{
        'id': c.id,
        'brand': c.brand,
        'model_name': c.model_name,
        'price': c.price,
        'range_km': c.range_km,
        'power_consumption': c.power_consumption,
        'category': c.category
    } for c in similar])

# ========== 充电焦虑指数模块 ==========

@bp.route("/anxiety")
@login_required
def anxiety_index():
    return render_template('anxiety_index.html')

def _get_available_periods():
    periods = db.session.query(SalesData.period).distinct().order_by(SalesData.period).all()
    return [p[0] for p in periods]

def _calc_region_sales(period, categories_filter):
    query = db.session.query(
        SalesData.region,
        CarModel.category,
        func.sum(SalesData.quantity).label('qty')
    ).join(CarModel).filter(SalesData.period == period)
    if categories_filter:
        query = query.filter(CarModel.category.in_(categories_filter))
    rows = query.group_by(SalesData.region, CarModel.category).all()

    region_totals = {}
    region_bev = {}
    for region, cat, qty in rows:
        region_totals[region] = region_totals.get(region, 0) + (qty or 0)
        if cat == '纯电':
            region_bev[region] = region_bev.get(region, 0) + (qty or 0)

    result = {}
    for region, total in region_totals.items():
        bev = region_bev.get(region, 0)
        bev_ratio = bev / total if total > 0 else 0
        result[region] = {
            'total_sales': int(total),
            'bev_sales': int(bev),
            'bev_ratio': round(bev_ratio * 100, 2)
        }
    return result

def _calc_anxiety_index(bev_ratio, density, formula='default'):
    if density <= 0:
        return None
    if formula == 'weighted':
        return round((pow(bev_ratio, 1.5) / pow(density, 0.5)), 4)
    elif formula == 'conservative':
        return round((pow(bev_ratio, 0.5) / pow(density, 1.5)), 4)
    else:
        return round((bev_ratio / density), 4)

def _get_province_suggestion(province_name, index, ratio, density):
    short = province_name.replace('市', '').replace('省', '').replace('壮族自治区', '').replace('回族自治区', '').replace('维吾尔自治区', '').replace('自治区', '').replace('特别行政区', '')
    if index >= 8:
        level = '🔴 极度压力'
        if ratio > 60 and density < 15:
            advice = f'{short}纯电渗透率已达{ratio}%但充电桩供给严重不足，建议优先在高速服务区和核心商圈批量建设超充站。'
        else:
            advice = f'{short}补能体系面临严峻考验，建议立即制定充电桩3年专项规划，并引入民间资本参与建设。'
    elif index >= 5:
        level = '🟠 较高压力'
        if ratio > density * 2:
            advice = f'{short}纯电销量增长快于补能设施建设，建议重点加密城区公共充电网络。'
        else:
            advice = f'{short}补能压力逐步显现，建议在居住区配套建设慢充桩缓解夜间需求。'
    elif index >= 2.5:
        level = '🟡 中等压力'
        advice = f'{short}目前补能供需相对平衡，建议关注重点区域规划预留充电设施用地。'
    else:
        level = '🟢 低压力'
        if density > 35:
            advice = f'{short}充电桩覆盖率较高，建议探索V2G双向充放电等创新运营模式。'
        else:
            advice = f'{short}补能压力较小，可适度超前布局充电设施以支撑未来新能源汽车增长。'
    return level, advice

@bp.route("/api/anxiety/index")
@login_required
def anxiety_index_api():
    formula = request.args.get('formula', 'default')
    period = request.args.get('period', '')
    compare_period = request.args.get('compare_period', '')
    bev_only = request.args.get('bev_only', '0') == '1'
    exclude_phev = request.args.get('exclude_phev', '0') == '1'

    periods = _get_available_periods()
    if not periods:
        return jsonify({'error': '暂无销量数据', 'periods': [], 'provinces': [], 'summary': {}, 'high_list': [], 'low_list': []})

    if not period:
        period = periods[-1]
    if not compare_period and len(periods) >= 2:
        if period in periods:
            idx = periods.index(period)
            compare_period = periods[idx - 1] if idx > 0 else ''

    categories = ['纯电'] if (bev_only or exclude_phev) else ['纯电', '混动']

    current_sales = _calc_region_sales(period, categories)

    piles = ChargingPile.query.all()
    pile_map = {p.province: p.density for p in piles}

    compare_sales = _calc_region_sales(compare_period, categories) if compare_period else {}

    provinces_data = []
    all_regions = set(list(current_sales.keys()) + list(pile_map.keys()))

    for region in all_regions:
        sales_info = current_sales.get(region, {'total_sales': 0, 'bev_sales': 0, 'bev_ratio': 0})
        density = pile_map.get(region, 0)
        index_val = _calc_anxiety_index(sales_info['bev_ratio'], density, formula)

        compare_info = compare_sales.get(region, {'bev_ratio': 0})
        prev_index = _calc_anxiety_index(compare_info['bev_ratio'], pile_map.get(region, 0), formula)

        ring_change = None
        if prev_index is not None and index_val is not None and prev_index > 0:
            pct = round((index_val - prev_index) / prev_index * 100, 1)
            ring_change = {'pct': pct, 'up': pct >= 0}

        level, advice = _get_province_suggestion(region, index_val or 0, sales_info['bev_ratio'], density)

        provinces_data.append({
            'name': region,
            'total_sales': sales_info['total_sales'],
            'bev_sales': sales_info['bev_sales'],
            'bev_ratio': sales_info['bev_ratio'],
            'density': density,
            'index': index_val if index_val is not None else 0,
            'prev_index': prev_index if prev_index is not None else 0,
            'ring_change': ring_change,
            'level': level,
            'advice': advice
        })

    valid_provinces = [p for p in provinces_data if p['index'] > 0]
    valid_provinces.sort(key=lambda x: x['index'], reverse=True)
    for i, p in enumerate(valid_provinces):
        p['rank'] = i + 1

    rank_map = {p['name']: p['rank'] for p in valid_provinces}
    for p in provinces_data:
        p['rank'] = rank_map.get(p['name'], None)

    index_values = [p['index'] for p in valid_provinces]
    mean_val = round(sum(index_values) / len(index_values), 4) if index_values else 0
    sorted_vals = sorted(index_values)
    n = len(sorted_vals)
    median_val = round(sorted_vals[n // 2], 4) if n % 2 == 1 else round((sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2, 4) if n > 0 else 0

    top10 = valid_provinces[:10]
    bottom10 = valid_provinces[-10:][::-1]

    formula_info = {
        'default': {'name': '默认公式', 'desc': '焦虑指数 = 纯电占比 / 桩密度'},
        'weighted': {'name': '加权公式', 'desc': '焦虑指数 = 纯电占比^1.5 / 桩密度^0.5（销量权重更高）'},
        'conservative': {'name': '保守公式', 'desc': '焦虑指数 = 纯电占比^0.5 / 桩密度^1.5（密度权重更高）'}
    }

    return jsonify({
        'periods': periods,
        'current_period': period,
        'compare_period': compare_period,
        'formula': formula,
        'formula_info': formula_info.get(formula, formula_info['default']),
        'map_data': [{'name': p['name'], 'value': p['index']} for p in provinces_data if p['index'] > 0],
        'provinces': provinces_data,
        'top10': top10,
        'summary': {
            'mean': mean_val,
            'median': median_val,
            'count': len(valid_provinces),
            'max': max(index_values) if index_values else 0,
            'min': min(index_values) if index_values else 0
        },
        'high_list': valid_provinces[:15],
        'low_list': valid_provinces[-15:][::-1]
    })

# ========== User Preference Schemes ==========

@bp.route("/preferences")
@login_required
def preferences_page():
    return render_template('preferences.html')

@bp.route("/api/preferences", methods=['GET'])
@login_required
def get_preferences():
    prefs = UserPreference.query.filter_by(user_id=current_user.id).order_by(UserPreference.created_at).all()
    result = []
    for p in prefs:
        result.append({
            'id': p.id,
            'scheme_name': p.scheme_name,
            'config': p.get_config(),
            'is_active': p.is_active,
            'use_count': p.use_count,
            'last_used_at': p.last_used_at.strftime('%Y-%m-%d %H:%M:%S') if p.last_used_at else '',
            'created_at': p.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'updated_at': p.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        })
    return jsonify({'schemes': result})

@bp.route("/api/preferences", methods=['POST'])
@login_required
def create_preference():
    data = request.json
    name = data.get('scheme_name', '').strip()
    if not name:
        return jsonify({'error': '方案名称不能为空'}), 400

    existing = UserPreference.query.filter_by(user_id=current_user.id, scheme_name=name).first()
    if existing:
        return jsonify({'error': '已存在同名方案'}), 409

    if data.get('is_active'):
        UserPreference.query.filter_by(user_id=current_user.id, is_active=True).update({'is_active': False})

    pref = UserPreference(
        user_id=current_user.id,
        scheme_name=name,
        is_active=data.get('is_active', False)
    )
    pref.set_config(data.get('config', UserPreference.default_config()))
    db.session.add(pref)
    db.session.commit()
    log_audit('创建偏好方案', f'创建偏好方案: {name} (ID: {pref.id})')
    return jsonify({'id': pref.id, 'status': 'created'})

@bp.route("/api/preferences/<int:id>", methods=['GET'])
@login_required
def get_preference(id):
    pref = UserPreference.query.get_or_404(id)
    if pref.user_id != current_user.id:
        return jsonify({'error': '无权限'}), 403
    return jsonify({
        'id': pref.id,
        'scheme_name': pref.scheme_name,
        'config': pref.get_config(),
        'is_active': pref.is_active,
        'use_count': pref.use_count,
        'last_used_at': pref.last_used_at.strftime('%Y-%m-%d %H:%M:%S') if pref.last_used_at else '',
        'created_at': pref.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        'updated_at': pref.updated_at.strftime('%Y-%m-%d %H:%M:%S')
    })

@bp.route("/api/preferences/<int:id>", methods=['PUT'])
@login_required
def update_preference(id):
    pref = UserPreference.query.get_or_404(id)
    if pref.user_id != current_user.id:
        return jsonify({'error': '无权限'}), 403

    data = request.json

    if 'scheme_name' in data:
        new_name = data['scheme_name'].strip()
        if not new_name:
            return jsonify({'error': '方案名称不能为空'}), 400
        dup = UserPreference.query.filter_by(user_id=current_user.id, scheme_name=new_name).first()
        if dup and dup.id != id:
            return jsonify({'error': '已存在同名方案'}), 409
        pref.scheme_name = new_name

    if 'config' in data:
        pref.set_config(data['config'])

    if data.get('is_active'):
        UserPreference.query.filter_by(user_id=current_user.id, is_active=True).update({'is_active': False})
        pref.is_active = True
    elif 'is_active' in data:
        pref.is_active = False

    db.session.commit()
    log_audit('更新偏好方案', f'更新偏好方案: {pref.scheme_name} (ID: {id})')
    return jsonify({'status': 'updated'})

@bp.route("/api/preferences/<int:id>", methods=['DELETE'])
@login_required
def delete_preference(id):
    pref = UserPreference.query.get_or_404(id)
    if pref.user_id != current_user.id:
        return jsonify({'error': '无权限'}), 403
    name = pref.scheme_name
    was_active = pref.is_active
    db.session.delete(pref)
    if was_active:
        first = UserPreference.query.filter_by(user_id=current_user.id).order_by(UserPreference.created_at).first()
        if first:
            first.is_active = True
    db.session.commit()
    log_audit('删除偏好方案', f'删除偏好方案: {name} (ID: {id})')
    return jsonify({'status': 'deleted'})

@bp.route("/api/preferences/<int:id>/activate", methods=['POST'])
@login_required
def activate_preference(id):
    pref = UserPreference.query.get_or_404(id)
    if pref.user_id != current_user.id:
        return jsonify({'error': '无权限'}), 403

    UserPreference.query.filter_by(user_id=current_user.id, is_active=True).update({'is_active': False})
    pref.is_active = True
    pref.use_count = (pref.use_count or 0) + 1
    pref.last_used_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'activated', 'config': pref.get_config()})

@bp.route("/api/preferences/<int:id>/copy", methods=['POST'])
@login_required
def copy_preference(id):
    pref = UserPreference.query.get_or_404(id)
    if pref.user_id != current_user.id:
        return jsonify({'error': '无权限'}), 403

    data = request.json or {}
    new_name = data.get('scheme_name', f'{pref.scheme_name} (副本)')
    dup = UserPreference.query.filter_by(user_id=current_user.id, scheme_name=new_name).first()
    if dup:
        return jsonify({'error': '已存在同名方案'}), 409

    new_pref = UserPreference(
        user_id=current_user.id,
        scheme_name=new_name,
        is_active=False
    )
    new_pref.set_config(pref.get_config())
    db.session.add(new_pref)
    db.session.commit()
    log_audit('复制偏好方案', f'复制偏好方案: {pref.scheme_name} -> {new_name}')
    return jsonify({'id': new_pref.id, 'status': 'created'})

@bp.route("/api/preferences/active", methods=['GET'])
@login_required
def get_active_preference():
    pref = UserPreference.query.filter_by(user_id=current_user.id, is_active=True).first()
    if not pref:
        return jsonify({'active': None})
    pref.use_count = (pref.use_count or 0) + 1
    pref.last_used_at = datetime.utcnow()
    db.session.commit()
    return jsonify({
        'active': {
            'id': pref.id,
            'scheme_name': pref.scheme_name,
            'config': pref.get_config()
        }
    })

@bp.route("/api/preferences/export", methods=['GET'])
@login_required
def export_preferences():
    prefs = UserPreference.query.filter_by(user_id=current_user.id).all()
    export_data = []
    for p in prefs:
        export_data.append({
            'scheme_name': p.scheme_name,
            'config': p.get_config(),
            'is_active': p.is_active
        })
    output = BytesIO()
    output.write(json_module.dumps(export_data, ensure_ascii=False, indent=2).encode('utf-8'))
    output.seek(0)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename=preferences_{timestamp}.json"
    response.headers["Content-type"] = "application/json"
    return response

@bp.route("/api/preferences/import", methods=['POST'])
@login_required
def import_preferences():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': '请选择文件'}), 400

    try:
        content = file.read().decode('utf-8')
        import_data = json_module.loads(content)
    except (json_module.JSONDecodeError, UnicodeDecodeError):
        return jsonify({'error': '文件格式错误，请上传有效的JSON文件'}), 400

    if not isinstance(import_data, list):
        return jsonify({'error': '文件格式错误，数据应为数组'}), 400

    conflicts = []
    for item in import_data:
        name = item.get('scheme_name', '').strip()
        if not name:
            continue
        existing = UserPreference.query.filter_by(user_id=current_user.id, scheme_name=name).first()
        if existing:
            conflicts.append({'name': name, 'existing_id': existing.id, 'import_config': item.get('config', {})})

    if conflicts:
        return jsonify({'conflicts': conflicts, 'need_resolution': True})

    for item in import_data:
        name = item.get('scheme_name', '').strip()
        if not name:
            continue
        pref = UserPreference(
            user_id=current_user.id,
            scheme_name=name,
            is_active=item.get('is_active', False)
        )
        pref.set_config(item.get('config', UserPreference.default_config()))
        db.session.add(pref)

    db.session.commit()
    log_audit('导入偏好方案', f'导入 {len(import_data)} 套偏好方案')
    return jsonify({'status': 'imported', 'count': len(import_data)})

@bp.route("/api/preferences/import_resolve", methods=['POST'])
@login_required
def import_preferences_resolve():
    data = request.json
    items = data.get('items', [])
    resolutions = data.get('resolutions', {})

    count = 0
    for item in items:
        name = item.get('scheme_name', '').strip()
        if not name:
            continue
        resolution = resolutions.get(name, 'skip')
        config = item.get('config', UserPreference.default_config())

        if resolution == 'overwrite':
            existing = UserPreference.query.filter_by(user_id=current_user.id, scheme_name=name).first()
            if existing:
                existing.set_config(config)
                count += 1
                continue

        if resolution == 'merge':
            existing = UserPreference.query.filter_by(user_id=current_user.id, scheme_name=name).first()
            if existing:
                merged = existing.get_config()
                merged.update(config)
                existing.set_config(merged)
                count += 1
                continue

        if resolution == 'rename':
            base = name
            i = 1
            new_name = f'{base} (导入)'
            while UserPreference.query.filter_by(user_id=current_user.id, scheme_name=new_name).first():
                i += 1
                new_name = f'{base} (导入{i})'
            pref = UserPreference(user_id=current_user.id, scheme_name=new_name, is_active=False)
            pref.set_config(config)
            db.session.add(pref)
            count += 1
            continue

        if resolution == 'skip':
            continue

    db.session.commit()
    log_audit('导入偏好方案(含冲突处理)', f'处理 {count} 套偏好方案')
    return jsonify({'status': 'resolved', 'count': count})

@bp.route("/api/preferences/reset", methods=['POST'])
@login_required
def reset_preferences():
    UserPreference.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    log_audit('重置偏好方案', f'用户 {current_user.username} 清空全部偏好方案')
    return jsonify({'status': 'reset'})

@bp.route("/api/preferences/default_config", methods=['GET'])
@login_required
def get_default_config():
    return jsonify({'config': UserPreference.default_config()})

@bp.route("/api/admin/preferences/stats", methods=['GET'])
@login_required
def admin_preference_stats():
    if current_user.role != 'admin':
        return jsonify({}), 403

    total_schemes = UserPreference.query.count()
    total_users_with_prefs = db.session.query(func.count(func.distinct(UserPreference.user_id))).scalar()
    active_schemes = UserPreference.query.filter_by(is_active=True).count()

    top_schemes = db.session.query(
        UserPreference.scheme_name,
        UserPreference.use_count,
        User.username
    ).join(User).order_by(UserPreference.use_count.desc()).limit(20).all()

    recent_used = db.session.query(
        UserPreference.scheme_name,
        UserPreference.last_used_at,
        User.username
    ).join(User).filter(UserPreference.last_used_at.isnot(None)).order_by(UserPreference.last_used_at.desc()).limit(20).all()

    return jsonify({
        'total_schemes': total_schemes,
        'total_users_with_prefs': total_users_with_prefs or 0,
        'active_schemes': active_schemes,
        'top_schemes': [{'scheme_name': s[0], 'use_count': s[1], 'username': s[2]} for s in top_schemes],
        'recent_used': [{'scheme_name': s[0], 'last_used_at': s[1].strftime('%Y-%m-%d %H:%M:%S') if s[1] else '', 'username': s[2]} for s in recent_used]
    })
