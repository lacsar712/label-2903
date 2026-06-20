// ECharts Dark Theme Configuration
const echartsTheme = {
    color: ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fbbf24', '#10b981'],
    textStyle: { color: '#94a3b8' }
};

let charts = {};
let currentSelection = {
    brand: '',
    city: '北京',
    drillDown: false // Clicked a brand in bar chart
};

function initCharts() {
    const ids = ['barChart', 'pieChart', 'lineChart', 'scatterChart', 'mapChart'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) charts[id] = echarts.init(el);
    });

    // Interaction Events
    if (charts.barChart) {
        charts.barChart.on('click', function (params) {
            if (params.componentType === 'series' && params.name) {
                const brands = ['特斯拉', '比亚迪', '蔚来', '小鹏'];
                if (brands.includes(params.name)) {
                    const brandSelect = document.getElementById('brandFilter');
                    brandSelect.value = params.name;
                    refreshCharts();
                } else {
                    openCarSidebar(params.name);
                }
            }
        });
    }

    if (charts.scatterChart) {
        charts.scatterChart.on('click', function (params) {
            if (params.data && params.data[2]) {
                openCarSidebar(params.data[2]);
            }
        });
    }

    if (charts.pieChart) {
        charts.pieChart.on('click', function (params) {
            document.getElementById('brandFilter').value = params.name;
            refreshCharts();
            showToast(`已筛选品牌: ${params.name}`, 'info');
        });
    }
}

function getFilterParams() {
    const brand = document.getElementById('brandFilter').value;
    const city = document.getElementById('cityFilter').value;
    const pMin = document.getElementById('priceMin').value;
    const pMax = document.getElementById('priceMax').value;
    const rMin = document.getElementById('rangeMin').value;

    const categories = Array.from(document.querySelectorAll('.cat-filter:checked')).map(cb => cb.value);

    const sortField = document.getElementById('sortField').value;
    const sortOrder = document.getElementById('sortOrder').value;

    let url = `?brand=${brand}&city=${city}&price_min=${pMin}&price_max=${pMax}&range_min=${rMin}&sort_field=${sortField}&sort_order=${sortOrder}`;
    categories.forEach(c => url += `&category[]=${c}`);
    return url;
}

async function loadBarChart() {
    const params = getFilterParams();
    const res = await fetch(`/api/chart/bar${params}`);
    const data = await res.json();

    const brand = document.getElementById('brandFilter').value;

    const tbody = document.getElementById('dashboardTableBody');
    if (tbody) {
        tbody.innerHTML = data.models.map((m, i) => `
            <tr>
                <td style="color: #fff; font-weight: 500;"><span class="model-link" data-model="${m}">${m}</span></td>
                <td>${data.range[i]} km</td>
                <td>${data.price[i]} 万</td>
                <td>${data.power[i]}</td>
            </tr>
        `).join('');
        tbody.querySelectorAll('.model-link').forEach(el => {
            el.onclick = () => openCarSidebar(el.dataset.model);
        });
    }

    charts.barChart.setOption({
        tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155', textStyle: { color: '#fff' } },
        legend: { data: ['续航 (km)', '价格 (万元)', '百公里电耗'], textStyle: { color: '#94a3b8' }, top: 'bottom' },
        xAxis: { type: 'category', data: data.models, axisLabel: { color: '#94a3b8', interval: 0, rotate: 30 } },
        yAxis: { splitLine: { lineStyle: { color: '#334155' } } },
        grid: { bottom: '20%' },
        series: [
            { name: '续航 (km)', type: 'bar', data: data.range, itemStyle: { borderRadius: [4, 4, 0, 0] } },
            { name: '价格 (万元)', type: 'bar', data: data.price, itemStyle: { borderRadius: [4, 4, 0, 0] } },
            { name: '百公里电耗', type: 'bar', data: data.power, itemStyle: { borderRadius: [4, 4, 0, 0] } }
        ]
    });
}

async function loadLineChart() {
    const brand = document.getElementById('brandFilter').value;
    const res = await fetch(`/api/chart/line?brand=${brand}`);
    const data = await res.json();

    charts.lineChart.setOption({
        title: { text: brand ? `${brand} 销量趋势` : '全行业销量趋势', textStyle: { color: '#94a3b8', fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: data.periods, boundaryGap: false },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#334155' } } },
        series: [{
            name: '销量',
            data: data.sales,
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { width: 4, color: '#38bdf8' },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(56, 189, 248, 0.4)' },
                    { offset: 1, color: 'rgba(56, 189, 248, 0)' }
                ])
            }
        }]
    }, true);
}

async function loadPieChart() {
    const city = document.getElementById('cityFilter').value;
    const res = await fetch(`/api/chart/pie?city=${city}`);
    const data = await res.json();

    charts.pieChart.setOption({
        title: { text: `${city} 品牌占比`, left: 'center', textStyle: { color: '#94a3b8', fontSize: 14 } },
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 10, borderColor: '#1e293b', borderWidth: 2 },
            label: { show: false },
            emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold', color: '#fff' } },
            data: data
        }]
    });
}

async function loadScatterChart() {
    const params = getFilterParams();
    const res = await fetch(`/api/chart/scatter${params}`);
    const data = await res.json();

    charts.scatterChart.setOption({
        title: { text: '车身重量与电耗相关性', textStyle: { color: '#94a3b8', fontSize: 14 } },
        tooltip: {
            formatter: params => `${params.data[2]}<br/>重量: ${params.data[0]}kg<br/>电耗: ${params.data[1]}kWh/100km`
        },
        xAxis: { name: '重量 (kg)', splitLine: { lineStyle: { color: '#334155' } } },
        yAxis: { name: '电耗 (kWh)', splitLine: { lineStyle: { color: '#334155' } } },
        series: [{
            symbolSize: (data) => Math.sqrt(data[0]) / 2,
            data: data.weight_power,
            type: 'scatter',
            itemStyle: { color: '#f472b6', shadowBlur: 10, shadowColor: 'rgba(244, 114, 182, 0.5)' }
        }]
    });
}
let mapGeoCache = null;

async function loadMapChart() {
    const mapMode = document.getElementById('mapMode').value;
    const params = getFilterParams();
    const res = await fetch(`/api/chart/map${params}&mode=${mapMode}`);
    const data = await res.json();

    const mapUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';

    try {
        if (!mapGeoCache) {
            const mapRes = await fetch(mapUrl);
            mapGeoCache = await mapRes.json();
            echarts.registerMap('china', mapGeoCache);
        }

        const vals = data.data.map(d => d.value).filter(v => v > 0);
        const maxVal = vals.length > 0 ? Math.max(...vals) : (mapMode === 'density' ? 50 : 20000);

        charts.mapChart.setOption({
            title: { text: data.title + ' (可滚轮缩放)', textStyle: { color: '#94a3b8', fontSize: 14 } },
            visualMap: {
                min: 0, max: maxVal > 0 ? maxVal : 100, left: 'right', top: 'bottom', text: ['高', '低'],
                calculable: true, inRange: { color: ['#1e293b', '#38bdf8', '#818cf8'] },
                textStyle: { color: '#94a3b8' }
            },
            tooltip: {
                trigger: 'item',
                formatter: function (params) {
                    const val = params.value ? params.value : 0;
                    const unit = mapMode === 'density' ? '个/km²' : '辆';
                    return `${params.name}<br/>${mapMode === 'density' ? '密度' : '销量'}: ${val} ${unit}`;
                }
            },
            series: [{
                name: mapMode === 'density' ? '密度' : '销量', type: 'map', mapType: 'china', roam: true,
                emphasis: { label: { color: '#fff' }, itemStyle: { areaColor: '#a78bfa' } },
                data: data.data
            }]
        });
    } catch (e) {
        console.error('Map loading failed:', e);
        showToast('地图加载失败，请检查网络', 'danger');
    }
}

function refreshCharts() {
    loadBarChart();
    loadLineChart();
    loadPieChart();
    loadScatterChart();
    loadMapChart();
}

let _pendingPrefConfig = null;
let _urlHasParams = false;

function applyConfigToFilters(config) {
    if (!config) return;
    const brandEl = document.getElementById('brandFilter');
    const cityEl = document.getElementById('cityFilter');
    const priceMinEl = document.getElementById('priceMin');
    const priceMaxEl = document.getElementById('priceMax');
    const rangeMinEl = document.getElementById('rangeMin');
    const sortFieldEl = document.getElementById('sortField');
    const sortOrderEl = document.getElementById('sortOrder');
    const mapModeEl = document.getElementById('mapMode');

    if (brandEl && config.brand !== undefined) brandEl.value = config.brand;
    if (cityEl && config.city !== undefined) cityEl.value = config.city;
    if (priceMinEl && config.price_min !== undefined) priceMinEl.value = config.price_min;
    if (priceMaxEl && config.price_max !== undefined) priceMaxEl.value = config.price_max;
    if (rangeMinEl && config.range_min !== undefined) rangeMinEl.value = config.range_min;
    if (sortFieldEl && config.sort_field !== undefined) sortFieldEl.value = config.sort_field;
    if (sortOrderEl && config.sort_order !== undefined) sortOrderEl.value = config.sort_order;
    if (mapModeEl && config.map_mode !== undefined) mapModeEl.value = config.map_mode;

    if (config.categories) {
        document.querySelectorAll('.cat-filter').forEach(cb => {
            cb.checked = config.categories.includes(cb.value);
        });
    }

    if (config.expanded_charts) {
        document.querySelectorAll('.chart-card').forEach(card => {
            const chartBox = card.querySelector('[id$="Chart"]');
            if (chartBox) {
                card.style.display = config.expanded_charts.includes(chartBox.id) ? '' : 'none';
            }
        });
    }
}

function getUrlFilterParams() {
    const params = new URLSearchParams(window.location.search);
    return params.has('brand') || params.has('city') || params.has('price_min') ||
           params.has('price_max') || params.has('range_min') || params.has('sort_field') ||
           params.has('sort_order') || params.has('map_mode') || params.has('category[]');
}

function parseUrlParamsToConfig() {
    const params = new URLSearchParams(window.location.search);
    const config = {};
    if (params.get('brand')) config.brand = params.get('brand');
    if (params.get('city')) config.city = params.get('city');
    if (params.get('price_min')) config.price_min = params.get('price_min');
    if (params.get('price_max')) config.price_max = params.get('price_max');
    if (params.get('range_min')) config.range_min = params.get('range_min');
    if (params.get('sort_field')) config.sort_field = params.get('sort_field');
    if (params.get('sort_order')) config.sort_order = params.get('sort_order');
    if (params.get('map_mode')) config.map_mode = params.get('map_mode');
    const cats = params.getAll('category[]');
    if (cats.length > 0) config.categories = cats;
    return config;
}

window.applyUrlParams = function() {
    const config = parseUrlParamsToConfig();
    applyConfigToFilters(config);
    refreshCharts();
    dismissConflictBanner();
    showToast('已应用地址栏参数', 'info');
};

window.applyLocalPref = function() {
    if (_pendingPrefConfig) {
        applyConfigToFilters(_pendingPrefConfig);
        refreshCharts();
    }
    dismissConflictBanner();
    showToast('已应用本地偏好方案', 'success');
};

window.dismissConflictBanner = function() {
    const banner = document.getElementById('prefConflictBanner');
    if (banner) banner.style.display = 'none';
};

async function loadAndApplyPreference() {
    _urlHasParams = getUrlFilterParams();

    try {
        const res = await fetch('/api/preferences/active');
        const data = await res.json();

        if (!data.active) {
            if (_urlHasParams) {
                const config = parseUrlParamsToConfig();
                applyConfigToFilters(config);
            }
            return;
        }

        _pendingPrefConfig = data.active.config;

        if (_urlHasParams) {
            const banner = document.getElementById('prefConflictBanner');
            const msgEl = document.getElementById('prefConflictMsg');
            if (banner && msgEl) {
                msgEl.textContent = `检测到地址栏参数与本地方案「${data.active.scheme_name}」不一致，请选择优先采用哪一种配置：`;
                banner.style.display = 'block';
            }
            const config = parseUrlParamsToConfig();
            applyConfigToFilters(config);
        } else {
            applyConfigToFilters(data.active.config);
        }
    } catch (e) {
        console.error('Failed to load preference:', e);
        if (_urlHasParams) {
            const config = parseUrlParamsToConfig();
            applyConfigToFilters(config);
        }
    }
}

// Add event listeners for automatic refreshing
window.addEventListener('load', () => {
    initCharts();
    if (charts.barChart) {
        loadAndApplyPreference().then(() => {
            refreshCharts();
        });

        // Auto-refresh when dropdowns change
        const autoFilters = ['brandFilter', 'cityFilter', 'sortField', 'sortOrder', 'mapMode'];
        autoFilters.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onchange = refreshCharts;
        });

        // Auto-refresh for checkboxes
        document.querySelectorAll('.cat-filter').forEach(cb => {
            cb.onchange = refreshCharts;
        });

        // Debounced refresh for number inputs
        let debounceTimer;
        const numInputs = ['priceMin', 'priceMax', 'rangeMin'];
        numInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(refreshCharts, 500);
            };
        });
    }
});

// Custom UI Components
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderLeftColor = type === 'success' ? '#10b981' : (type === 'danger' ? '#f43f5e' : '#38bdf8');
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function showModal(title, msg, onConfirm) {
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMsg').innerText = msg;
    overlay.style.display = 'flex';

    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    const close = () => overlay.style.display = 'none';

    confirmBtn.onclick = () => { onConfirm(); close(); };
    cancelBtn.onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

function initDB() {
    showModal('重置数据库', '确定要删除现有记录并初始化模拟数据吗？', () => {
        fetch('/admin/init_db')
            .then(r => r.json())
            .then(d => {
                showToast(d.status, 'success');
                refreshCharts();
            })
            .catch(() => showToast('初始化失败', 'danger'));
    });
}

window.addEventListener('load', () => {
    initCharts();
    if (charts.barChart) refreshCharts();
});

window.addEventListener('resize', () => {
    Object.values(charts).forEach(c => c.resize());
});

function toggleExportPanel() {
    const panel = document.getElementById('exportPanel');
    if (panel) {
        panel.classList.toggle('show');
    }
}

document.addEventListener('click', function(e) {
    const exportWrapper = document.querySelector('.export-wrapper');
    const exportPanel = document.getElementById('exportPanel');
    if (exportWrapper && exportPanel && !exportWrapper.contains(e.target)) {
        exportPanel.classList.remove('show');
    }
});

function exportData(type) {
    const params = getFilterParams();
    const endpoint = type === 'cars' ? '/api/export/cars' : '/api/export/sales';
    const label = type === 'cars' ? '车型档案' : '销量汇总';

    showToast(`正在导出${label}，请稍候...`, 'info');
    toggleExportPanel();

    fetch(endpoint + params)
        .then(response => {
            if (!response.ok) {
                throw new Error('导出失败');
            }
            const disposition = response.headers.get('Content-Disposition');
            let filename = `${label}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            if (disposition) {
                const matches = disposition.match(/filename="?([^"]+)"?/);
                if (matches && matches[1]) {
                    filename = matches[1];
                }
            }
            return response.blob().then(blob => ({ blob, filename }));
        })
        .then(({ blob, filename }) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showToast(`${label}导出成功！`, 'success');
        })
        .catch(err => {
            console.error('Export error:', err);
            showToast(`${label}导出失败，请重试`, 'danger');
        });
}

let activeAnnouncements = [];
let currentBannerIndex = 0;
let bannerAutoTimer = null;
let currentPanelId = null;
let bannerDismissedIds = new Set();

const categoryColors = {
    '系统维护': '#f59e0b',
    '数据更新': '#38bdf8',
    '功能上线': '#10b981'
};

async function loadActiveAnnouncements() {
    try {
        const res = await fetch('/api/announcements/active');
        const data = await res.json();
        activeAnnouncements = data.announcements || [];
        renderBanner();
    } catch (e) {
        console.error('Failed to load announcements:', e);
    }
}

function renderBanner() {
    const banner = document.getElementById('announcementBanner');
    const track = document.getElementById('announcementTrack');
    const counter = document.getElementById('bannerCounter');

    if (!banner || !track) return;

    const visibleAnnouncements = activeAnnouncements.filter(a => !bannerDismissedIds.has(a.id) || a.is_pinned);

    if (visibleAnnouncements.length === 0) {
        banner.style.display = 'none';
        stopBannerAutoPlay();
        return;
    }

    banner.style.display = 'block';

    const catColor = categoryColors[visibleAnnouncements[currentBannerIndex]?.category] || '#94a3b8';
    const a = visibleAnnouncements[currentBannerIndex];

    track.innerHTML = `
        <div class="banner-item" style="opacity: 1;" onclick="openAnnouncementPanel(${a.id})">
            ${a.is_pinned ? '<span class="banner-item-pin">📌</span>' : ''}
            <span class="banner-item-category" style="background: ${catColor}30; color: ${catColor};">${a.category}</span>
            <span class="banner-item-title">${a.title}</span>
            ${a.require_confirmation ? '<span class="badge-confirm">需确认</span>' : ''}
            ${!a.is_read ? '<span class="badge-unread">新</span>' : ''}
        </div>
    `;

    counter.textContent = `${currentBannerIndex + 1} / ${visibleAnnouncements.length}`;

    if (visibleAnnouncements.length > 1) {
        startBannerAutoPlay();
    } else {
        stopBannerAutoPlay();
    }
}

function startBannerAutoPlay() {
    stopBannerAutoPlay();
    bannerAutoTimer = setInterval(() => {
        nextAnnouncement();
    }, 5000);
}

function stopBannerAutoPlay() {
    if (bannerAutoTimer) {
        clearInterval(bannerAutoTimer);
        bannerAutoTimer = null;
    }
}

function nextAnnouncement() {
    const visible = activeAnnouncements.filter(a => !bannerDismissedIds.has(a.id) || a.is_pinned);
    if (visible.length <= 1) return;
    currentBannerIndex = (currentBannerIndex + 1) % visible.length;
    renderBanner();
}

function prevAnnouncement() {
    const visible = activeAnnouncements.filter(a => !bannerDismissedIds.has(a.id) || a.is_pinned);
    if (visible.length <= 1) return;
    currentBannerIndex = (currentBannerIndex - 1 + visible.length) % visible.length;
    renderBanner();
}

function closeBanner() {
    const visible = activeAnnouncements.filter(a => !bannerDismissedIds.has(a.id) || a.is_pinned);
    const current = visible[currentBannerIndex];
    if (!current) return;

    if (current.is_pinned) {
        showToast('置顶公告无法关闭', 'info');
        return;
    }

    bannerDismissedIds.add(current.id);
    
    const newVisible = activeAnnouncements.filter(a => !bannerDismissedIds.has(a.id) || a.is_pinned);
    if (currentBannerIndex >= newVisible.length) {
        currentBannerIndex = Math.max(0, newVisible.length - 1);
    }
    
    renderBanner();
    showToast('公告已关闭，本次浏览不再显示', 'info');
}

function openAnnouncementPanel(id) {
    currentPanelId = id;
    const panel = document.getElementById('announcementPanel');
    if (!panel) return;

    fetch(`/api/announcements/${id}`)
        .then(r => r.json())
        .then(data => {
            document.getElementById('panelTitle').textContent = data.title;
            document.getElementById('panelContent').innerHTML = data.content;
            document.getElementById('panelDate').textContent = `发布时间: ${data.created_at}`;
            document.getElementById('panelAuthor').textContent = `发布人: ${data.created_by}`;
            
            const catEl = document.getElementById('panelCategory');
            const catColor = categoryColors[data.category] || '#94a3b8';
            catEl.textContent = data.category;
            catEl.style.background = `${catColor}20`;
            catEl.style.color = catColor;

            const pinnedEl = document.getElementById('panelPinned');
            pinnedEl.style.display = data.is_pinned ? 'inline-block' : 'none';

            const confirmBtn = document.getElementById('panelConfirmBtn');
            if (data.require_confirmation && !data.is_read) {
                confirmBtn.style.display = 'block';
            } else {
                confirmBtn.style.display = 'none';
            }

            panel.style.display = 'flex';
            
            if (!data.is_read) {
                markAsRead(id);
            }
        })
        .catch(e => {
            console.error('Failed to load announcement:', e);
            showToast('加载公告详情失败', 'danger');
        });
}

function closeAnnouncementPanel() {
    const panel = document.getElementById('announcementPanel');
    if (panel) {
        panel.style.display = 'none';
    }
    currentPanelId = null;
}

function confirmRead() {
    if (!currentPanelId) return;
    
    fetch(`/api/announcements/${currentPanelId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(r => r.json())
    .then(d => {
        showToast('已确认阅读', 'success');
        document.getElementById('panelConfirmBtn').style.display = 'none';
        
        const idx = activeAnnouncements.findIndex(a => a.id === currentPanelId);
        if (idx !== -1) {
            activeAnnouncements[idx].is_read = true;
        }
        
        renderBanner();
    })
    .catch(() => showToast('操作失败', 'danger'));
}

function markAsRead(id) {
    fetch(`/api/announcements/${id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).catch(e => console.error('Mark read error:', e));
    
    const idx = activeAnnouncements.findIndex(a => a.id === id);
    if (idx !== -1) {
        activeAnnouncements[idx].is_read = true;
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeAnnouncementPanel();
    }
});

document.addEventListener('click', function(e) {
    const panelOverlay = document.getElementById('announcementPanel');
    if (panelOverlay && panelOverlay.style.display === 'flex' && e.target === panelOverlay) {
        const panel = panelOverlay.querySelector('.announcement-panel');
        if (panel && !panel.contains(e.target)) {
            const confirmBtn = document.getElementById('panelConfirmBtn');
            if (confirmBtn && confirmBtn.style.display !== 'none') {
                showToast('请先确认已读此公告', 'warning');
                return;
            }
            closeAnnouncementPanel();
        }
    }
});

window.addEventListener('load', () => {
    const bannerEl = document.getElementById('announcementBanner');
    if (bannerEl) {
        loadActiveAnnouncements();
    }
});

// ========== Car Detail Sidebar ==========
let sidebarState = {
    currentModel: null,
    pinned: false,
    charts: {},
    activeTab: 'overview',
    currentCarId: null,
    currentModelName: null
};

function openCarSidebar(modelName) {
    sidebarState.currentModel = modelName;
    const overlay = document.getElementById('carSidebarOverlay');
    if (!overlay) return;

    if (sidebarState.pinned) {
        overlay.classList.remove('pinned');
        sidebarState.pinned = false;
        updatePinButton();
    }
    overlay.style.display = 'flex';
    document.getElementById('sidebarInvisible').style.display = 'none';

    loadCarDetail(modelName);
    loadCarRegionSales(modelName);
    loadCarQuarterly(modelName);
    loadCarCompareAvg(modelName);
    loadSimilarCars(modelName);

    switchSidebarTab('overview');
}

function closeCarSidebar() {
    if (sidebarState.pinned) return;
    const overlay = document.getElementById('carSidebarOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        Object.values(sidebarState.charts).forEach(c => {
            if (c && c.dispose) c.dispose();
        });
        sidebarState.charts = {};
    }
}

function updatePinButton() {
    const btn = document.getElementById('btnPinSidebar');
    if (!btn) return;
    if (sidebarState.pinned) {
        btn.classList.add('active');
        btn.querySelector('.action-text').textContent = '已固定';
    } else {
        btn.classList.remove('active');
        btn.querySelector('.action-text').textContent = '固定';
    }
}

function switchSidebarTab(tabName) {
    sidebarState.activeTab = tabName;
    document.querySelectorAll('.car-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.car-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabName}`);
    });
    setTimeout(() => {
        Object.values(sidebarState.charts).forEach(c => {
            if (c && c.resize) c.resize();
        });
    }, 50);
}

async function loadCarDetail(modelName) {
    try {
        const res = await fetch(`/api/car/detail/${encodeURIComponent(modelName)}`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        sidebarState.currentCarId = data.id;
        sidebarState.currentModelName = data.model_name;

        document.getElementById('sidebarCarName').textContent = data.model_name;
        document.getElementById('sidebarCarSub').textContent = `${data.brand} · ${data.category}`;
        const badge = document.getElementById('sidebarBrandBadge');
        badge.textContent = data.brand.charAt(0);

        document.getElementById('ovBrand').textContent = data.brand;
        document.getElementById('ovCategory').textContent = data.category;
        document.getElementById('ovPrice').textContent = data.price;
        document.getElementById('ovRange').textContent = data.range_km;
        document.getElementById('ovPower').textContent = data.power_consumption;
        document.getElementById('ovWeight').textContent = data.weight_kg;

        renderRankList('rankBrand', [
            { label: '价格排名', rank: data.ranks.rank_in_brand_price, total: data.ranks.brand_total, pct: data.ranks.pct_brand_price, lowerBetter: true },
            { label: '续航排名', rank: data.ranks.rank_in_brand_range, total: data.ranks.brand_total, pct: data.ranks.pct_brand_range, lowerBetter: false },
            { label: '电耗排名', rank: data.ranks.rank_in_brand_power, total: data.ranks.brand_total, pct: data.ranks.pct_brand_power, lowerBetter: true }
        ]);

        renderRankList('rankSegment', [
            { label: '价格排名', rank: data.ranks.rank_in_segment_price, total: data.ranks.segment_total, pct: data.ranks.pct_segment_price, lowerBetter: true },
            { label: '续航排名', rank: data.ranks.rank_in_segment_range, total: data.ranks.segment_total, pct: data.ranks.pct_segment_range, lowerBetter: false },
            { label: '电耗排名', rank: data.ranks.rank_in_segment_power, total: data.ranks.segment_total, pct: data.ranks.pct_segment_power, lowerBetter: true }
        ]);
    } catch (e) {
        console.error('Load detail error:', e);
        showToast('加载车型详情失败', 'danger');
    }
}

function getPctClass(pct) {
    if (pct >= 60) return 'good';
    if (pct >= 35) return 'mid';
    return 'bad';
}

function getPctBarClass(pct) {
    if (pct >= 60) return 'high';
    if (pct >= 35) return '';
    return 'low';
}

function renderRankList(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = items.map(item => {
        const pctClass = getPctClass(item.pct);
        const barClass = getPctBarClass(item.pct);
        return `
            <div class="rank-item">
                <div class="rank-item-left">
                    <span class="rank-label">${item.label}</span>
                </div>
                <div class="rank-item-right">
                    <span class="rank-position">第${item.rank}</span>
                    <span class="rank-total">/ ${item.total}</span>
                    <div class="rank-progress">
                        <div class="rank-progress-fill ${barClass}" style="width: ${Math.max(5, item.pct)}%"></div>
                    </div>
                    <span class="rank-percentile ${pctClass}">${item.pct}%</span>
                </div>
            </div>
        `;
    }).join('');
}

let sidebarMapGeoCache = null;

async function loadCarRegionSales(modelName) {
    try {
        const res = await fetch(`/api/car/region_sales/${encodeURIComponent(modelName)}`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        renderRegionMap(data.regions);
        renderRegionBars(data.regions);
    } catch (e) {
        console.error('Load region sales error:', e);
    }
}

async function renderRegionMap(regions) {
    const chartEl = document.getElementById('regionMapChart');
    if (!chartEl) return;
    if (sidebarState.charts.regionMap) {
        sidebarState.charts.regionMap.dispose();
    }
    const chart = echarts.init(chartEl);
    sidebarState.charts.regionMap = chart;

    try {
        const mapUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';
        if (!sidebarMapGeoCache) {
            const mapRes = await fetch(mapUrl);
            sidebarMapGeoCache = await mapRes.json();
            echarts.registerMap('china_mini', sidebarMapGeoCache);
        }
    } catch (e) {
        console.error('Map loading failed:', e);
    }

    const vals = regions.map(r => r.value).filter(v => v > 0);
    const maxVal = vals.length > 0 ? Math.max(...vals) : 100;

    chart.setOption({
        tooltip: {
            trigger: 'item',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#fff', fontSize: 12 },
            formatter: p => `${p.name}<br/>销量: ${p.value || 0} 辆`
        },
        visualMap: {
            min: 0, max: maxVal > 0 ? maxVal : 100,
            show: false,
            inRange: { color: ['#1e293b', '#38bdf8', '#a78bfa'] }
        },
        series: [{
            type: 'map',
            mapType: 'china_mini',
            roam: false,
            zoom: 1.2,
            label: { show: false },
            emphasis: {
                label: { show: true, color: '#fff', fontSize: 10 },
                itemStyle: { areaColor: '#a78bfa' }
            },
            itemStyle: {
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 0.5
            },
            data: regions
        }]
    });
}

function renderRegionBars(regions) {
    const container = document.getElementById('regionBarChart');
    if (!container) return;
    const sorted = [...regions].sort((a, b) => b.value - a.value).slice(0, 15);
    const maxVal = sorted.length > 0 ? sorted[0].value : 1;

    container.innerHTML = sorted.map(r => {
        const width = maxVal > 0 ? Math.max(2, (r.value / maxVal) * 100) : 2;
        return `
            <div class="region-bar-item" data-region="${r.name}">
                <div class="region-bar-name">${r.name.replace(/市$|省$|壮族自治区$|回族自治区$|维吾尔自治区$|自治区$|特别行政区$/, '')}</div>
                <div class="region-bar-track">
                    <div class="region-bar-fill" style="width: ${width}%"></div>
                </div>
                <div class="region-bar-value">${r.value.toLocaleString()} 辆</div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.region-bar-item').forEach(item => {
        item.onmouseenter = () => {
            highlightRegionOnMap(item.dataset.region, true);
            container.querySelectorAll('.region-bar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        };
        item.onmouseleave = () => {
            highlightRegionOnMap(item.dataset.region, false);
            item.classList.remove('active');
        };
    });
}

function highlightRegionOnMap(regionName, highlight) {
    if (!sidebarState.charts.regionMap) return;
    sidebarState.charts.regionMap.dispatchAction({
        type: highlight ? 'highlight' : 'downplay',
        name: regionName
    });
}

async function loadCarQuarterly(modelName) {
    try {
        const res = await fetch(`/api/car/quarterly/${encodeURIComponent(modelName)}`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        renderQuarterlyChart(data);
    } catch (e) {
        console.error('Load quarterly error:', e);
    }
}

function renderQuarterlyChart(data) {
    const chartEl = document.getElementById('trendLineChart');
    if (!chartEl) return;
    if (sidebarState.charts.trend) {
        sidebarState.charts.trend.dispose();
    }
    const chart = echarts.init(chartEl);
    sidebarState.charts.trend = chart;

    const markPoints = [];
    data.changes.forEach((c, i) => {
        if (c && i > 0) {
            markPoints.push({
                name: data.periods[i],
                coord: [i, data.quantities[i]],
                value: `${c.up ? '↑' : '↓'}${Math.abs(c.pct)}%`,
                symbolSize: 0,
                label: {
                    show: true,
                    position: c.up ? 'top' : 'bottom',
                    color: c.up ? '#10b981' : '#f43f5e',
                    fontSize: 11,
                    fontWeight: 700,
                    formatter: `${c.up ? '+' : ''}${c.pct}%`
                }
            });
        }
    });

    chart.setOption({
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#fff', fontSize: 12 },
            formatter: params => {
                const idx = params[0].dataIndex;
                const change = data.changes[idx];
                let html = `<div style="font-weight:600;margin-bottom:4px;">${data.periods[idx]}</div>`;
                html += `<div>销量: <b>${data.quantities[idx].toLocaleString()}</b> 辆</div>`;
                if (change) {
                    const color = change.up ? '#10b981' : '#f43f5e';
                    const arrow = change.up ? '↑' : '↓';
                    html += `<div style="color:${color};margin-top:4px;">环比 ${arrow} ${Math.abs(change.pct)}%</div>`;
                } else if (idx === 0) {
                    html += `<div style="color:#94a3b8;margin-top:4px;">基期</div>`;
                }
                return html;
            }
        },
        grid: { left: 50, right: 40, top: 50, bottom: 40 },
        xAxis: {
            type: 'category',
            data: data.periods,
            axisLabel: { color: '#94a3b8', fontSize: 11 },
            axisLine: { lineStyle: { color: '#334155' } }
        },
        yAxis: {
            type: 'value',
            axisLabel: { color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: '#334155' } }
        },
        series: [{
            name: '销量',
            type: 'line',
            data: data.quantities,
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { width: 3, color: '#38bdf8' },
            itemStyle: { color: '#38bdf8', borderColor: '#fff', borderWidth: 2 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(56, 189, 248, 0.35)' },
                    { offset: 1, color: 'rgba(56, 189, 248, 0.02)' }
                ])
            },
            markPoint: {
                data: markPoints,
                symbol: 'none'
            }
        }]
    });
}

async function loadCarCompareAvg(modelName) {
    try {
        const res = await fetch(`/api/car/compare_avg/${encodeURIComponent(modelName)}`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        document.getElementById('compareAvgTitle').textContent = `${data.category}车型均值对比`;
        document.getElementById('compareAvgCount').textContent = `样本: ${data.total_in_category} 款`;
        renderCompareBars(data.dims);
    } catch (e) {
        console.error('Load compare error:', e);
    }
}

function renderCompareBars(dims) {
    const container = document.getElementById('compareBarsContainer');
    if (!container) return;

    container.innerHTML = dims.map(dim => {
        const maxVal = Math.max(dim.car, dim.avg) * 1.1;
        const carWidth = maxVal > 0 ? (dim.car / maxVal * 100) : 0;
        const avgWidth = maxVal > 0 ? (dim.avg / maxVal * 100) : 0;
        const diffSign = dim.diff > 0 ? '+' : '';
        const pctSign = dim.pct > 0 ? '+' : '';
        let badgeClass = 'equal';
        let badgeText = '持平';
        if (dim.better) {
            badgeClass = 'better';
            badgeText = `优于均值 ${pctSign}${dim.pct}%`;
        } else if (dim.diff !== 0) {
            badgeClass = 'worse';
            badgeText = `落后均值 ${Math.abs(dim.pct)}%`;
        }

        return `
            <div class="compare-bar-group">
                <div class="compare-bar-group-header">
                    <div class="compare-bar-name">${dim.name} <span style="color:#94a3b8;font-weight:400;">(${dim.unit})</span></div>
                    <div class="compare-bar-badge ${badgeClass}">${badgeText}</div>
                </div>
                <div class="compare-bars-dual">
                    <div class="compare-bar-row car-row">
                        <div class="compare-bar-label">当前</div>
                        <div class="compare-bar-track">
                            <div class="compare-bar-fill car" style="width: ${Math.max(2, carWidth)}%"></div>
                        </div>
                        <div class="compare-bar-value" style="color: var(--accent-color);">${dim.car}</div>
                    </div>
                    <div class="compare-bar-row">
                        <div class="compare-bar-label">均值</div>
                        <div class="compare-bar-track">
                            <div class="compare-bar-fill avg" style="width: ${Math.max(2, avgWidth)}%"></div>
                        </div>
                        <div class="compare-bar-value">${dim.avg}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function loadSimilarCars(modelName) {
    try {
        const res = await fetch(`/api/car/similar/${encodeURIComponent(modelName)}`);
        if (!res.ok) throw new Error('Failed');
        const cars = await res.json();
        renderSimilarCars(cars);
    } catch (e) {
        console.error('Load similar cars error:', e);
    }
}

function renderSimilarCars(cars) {
    const container = document.getElementById('similarCars');
    if (!container) return;
    if (cars.length === 0) {
        container.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 16px; color: var(--text-secondary); font-size: 12px;">暂无相近替代车型</div>';
        return;
    }
    container.innerHTML = cars.map(c => `
        <div class="similar-card" data-model="${c.model_name}">
            <div class="similar-brand">${c.brand}</div>
            <div class="similar-name">${c.model_name}</div>
            <div class="similar-meta">
                <span class="price">${c.price} 万</span>
                <span>${c.range_km} km · ${c.category}</span>
            </div>
        </div>
    `).join('');
    container.querySelectorAll('.similar-card').forEach(card => {
        card.onclick = () => {
            openCarSidebar(card.dataset.model);
        };
    });
}

function checkSidebarVisibilityInFilters() {
    if (!sidebarState.pinned || !sidebarState.currentModelName) return;
    const params = getFilterParams();
    fetch(`/api/chart/bar${params}`)
        .then(r => r.json())
        .then(data => {
            const visible = data.models.includes(sidebarState.currentModelName);
            const tip = document.getElementById('sidebarInvisible');
            if (!visible) {
                tip.style.display = 'flex';
            } else {
                tip.style.display = 'none';
            }
        })
        .catch(() => {});
}

// ========== Sidebar Event Bindings ==========
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.car-tab').forEach(btn => {
        btn.onclick = () => switchSidebarTab(btn.dataset.tab);
    });

    const closeBtn = document.getElementById('btnCloseSidebar');
    if (closeBtn) closeBtn.onclick = closeCarSidebar;

    const overlay = document.getElementById('carSidebarOverlay');
    if (overlay) {
        overlay.onclick = e => {
            if (e.target === overlay && !sidebarState.pinned) {
                closeCarSidebar();
            }
        };
    }

    const addCompareBtn = document.getElementById('btnAddCompare');
    if (addCompareBtn) {
        addCompareBtn.onclick = () => {
            if (!sidebarState.currentCarId) {
                showToast('请先选择车型', 'warning');
                return;
            }
            sessionStorage.setItem('preselectCompareCar', sidebarState.currentCarId.toString());
            window.location.href = '/compare';
        };
    }

    const shareBtn = document.getElementById('btnShareLink');
    if (shareBtn) {
        shareBtn.onclick = () => {
            if (!sidebarState.currentModelName) return;
            const url = `${window.location.origin}${window.location.pathname}?car=${encodeURIComponent(sidebarState.currentModelName)}`;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(() => {
                    showToast('分享链接已复制到剪贴板', 'success');
                }).catch(() => fallbackCopy(url));
            } else {
                fallbackCopy(url);
            }
        };
    }

    const pinBtn = document.getElementById('btnPinSidebar');
    if (pinBtn) {
        pinBtn.onclick = () => {
            sidebarState.pinned = !sidebarState.pinned;
            const overlay = document.getElementById('carSidebarOverlay');
            if (sidebarState.pinned) {
                overlay.classList.add('pinned');
                showToast('侧栏已固定，可继续操作左侧看板', 'info');
            } else {
                overlay.classList.remove('pinned');
            }
            updatePinButton();
        };
    }

    const urlParams = new URLSearchParams(window.location.search);
    const carFromUrl = urlParams.get('car');
    if (carFromUrl) {
        window.addEventListener('load', () => {
            setTimeout(() => openCarSidebar(decodeURIComponent(carFromUrl)), 500);
        });
    }
});

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('分享链接已复制到剪贴板', 'success');
    } catch (e) {
        showToast(`复制失败，请手动复制: ${text}`, 'warning');
    }
    document.body.removeChild(ta);
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('carSidebarOverlay');
        if (overlay && overlay.style.display === 'flex' && !sidebarState.pinned) {
            closeCarSidebar();
        }
    }
});

window.addEventListener('load', () => {
    const originalRefresh = window.refreshCharts;
    window.refreshCharts = function () {
        if (originalRefresh) originalRefresh.apply(this, arguments);
        setTimeout(checkSidebarVisibilityInFilters, 300);
    };
});
