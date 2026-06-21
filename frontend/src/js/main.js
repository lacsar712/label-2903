// ECharts Dark Theme Configuration
const echartsTheme = {
    color: ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fbbf24', '#10b981'],
    textStyle: { color: '#94a3b8' }
};

let charts = {};
let currentSelection = {
    brand: '',
    city: '北京',
    drillDown: false
};

let priceDistState = {
    customBins: null,
    selectedInterval: null,
    collapsed: false
};

function initCharts() {
    const ids = ['barChart', 'pieChart', 'lineChart', 'scatterChart', 'mapChart', 'priceDistChart'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) charts[id] = echarts.init(el);
    });

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

    if (charts.priceDistChart) {
        charts.priceDistChart.on('click', function (params) {
            if (params.componentType === 'series' && params.seriesName !== '上季度') {
                const interval = priceDistState.currentData && priceDistState.currentData.intervals
                    ? priceDistState.currentData.intervals[params.dataIndex] : null;
                if (interval) {
                    selectPriceRange(interval);
                }
            }
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
    loadPriceDistChart();
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
        window._filterDebounceTimer = null;
        const numInputs = ['priceMin', 'priceMax', 'rangeMin'];
        numInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = () => {
                clearTimeout(window._filterDebounceTimer);
                window._filterDebounceTimer = setTimeout(refreshCharts, 500);
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

function updateExportPanelInfo() {
    const brand = document.getElementById('brandFilter').value;
    const city = document.getElementById('cityFilter').value;
    const pMin = document.getElementById('priceMin').value;
    const pMax = document.getElementById('priceMax').value;
    const rMin = document.getElementById('rangeMin').value;
    const cats = Array.from(document.querySelectorAll('.cat-filter:checked')).map(cb => cb.value);

    const parts = [];
    if (brand) parts.push(`品牌: ${brand}`);
    if (city) parts.push(`城市: ${city}`);
    if (pMin || pMax) parts.push(`价格: ${pMin || '0'} - ${pMax || '∞'} 万`);
    if (rMin) parts.push(`续航 ≥ ${rMin} km`);
    if (cats.length < 2 && cats.length > 0) parts.push(`动力: ${cats.join('/')}`);

    const summaryEl = document.getElementById('exportFilterSummary');
    if (summaryEl) {
        if (parts.length > 0) {
            summaryEl.style.display = 'block';
            summaryEl.innerHTML = `<span class="summary-label">当前筛选：</span>${parts.join(' · ')}`;
        } else {
            summaryEl.style.display = 'none';
        }
    }

    const carsNote = document.getElementById('carsCityNote');
    const salesNote = document.getElementById('salesCityNote');
    if (carsNote) {
        carsNote.textContent = city ? `（仅含${city}有销量的车型）` : '';
    }
    if (salesNote) {
        salesNote.textContent = city ? `（仅含${city}区域销量）` : '';
    }
}

function toggleExportPanel() {
    const panel = document.getElementById('exportPanel');
    if (panel) {
        const willShow = !panel.classList.contains('show');
        if (willShow) {
            updateExportPanelInfo();
        }
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

function doExport(endpoint, params, label) {
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

function exportData(type) {
    if (window._filterDebounceTimer) {
        clearTimeout(window._filterDebounceTimer);
        window._filterDebounceTimer = null;
    }

    const params = getFilterParams();
    const endpoint = type === 'cars' ? '/api/export/cars' : '/api/export/sales';
    const label = type === 'cars' ? '车型档案' : '销量汇总';

    showToast(`正在同步看板数据并导出${label}...`, 'info');
    toggleExportPanel();

    const pending = [];
    if (typeof loadBarChart === 'function') pending.push(loadBarChart());
    if (typeof loadScatterChart === 'function') pending.push(loadScatterChart());
    if (typeof loadMapChart === 'function') pending.push(loadMapChart());
    if (typeof loadPriceDistChart === 'function') pending.push(loadPriceDistChart());

    if (pending.length > 0) {
        Promise.all(pending).finally(() => {
            doExport(endpoint, params, label);
        });
    } else {
        doExport(endpoint, params, label);
    }
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

/* ========== 价格带分布 Price Distribution ========== */

async function loadPriceDistChart() {
    if (!charts.priceDistChart) return;
    let params = getFilterParams();
    if (priceDistState.customBins && priceDistState.customBins.length > 0) {
        const binsStr = priceDistState.customBins.join(',');
        params += params.includes('?') ? '&' : '?';
        params += `bins=${encodeURIComponent(binsStr)}`;
    }
    try {
        const res = await fetch(`/api/chart/price_distribution${params}`);
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();
        priceDistState.currentData = data;
        priceDistState.currentBins = data.bins || [];
        renderPriceDistChart(data);
        updatePriceDistSummary(data.summary);
    } catch (e) {
        console.error('Load price distribution failed:', e);
    }
}

function renderPriceDistChart(data) {
    if (!charts.priceDistChart || !data.intervals) return;
    const intervals = data.intervals;
    const labels = intervals.map(i => i.label);
    const bevData = intervals.map(i => i.bev_count);
    const phevData = intervals.map(i => i.phev_count);
    const prevData = intervals.map(i => i.prev_count || 0);
    const totalData = intervals.map(i => i.total_count);
    const medianData = intervals.map((i, idx) => {
        if (i.median_price == null) return null;
        const barTotal = bevData[idx] + phevData[idx];
        return {
            value: i.median_price,
            xAxis: idx,
            yAxis: barTotal,
            _label: `${i.median_price}万`
        };
    }).filter(x => x != null);

    const tooltipStyle = {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(56, 189, 248, 0.3)',
        borderWidth: 1,
        textStyle: { color: '#e2e8f0', fontSize: 12, lineHeight: 18 }
    };

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            ...tooltipStyle,
            formatter: function (params) {
                if (!params || params.length === 0) return '';
                const dataIndex = params[0].dataIndex;
                const iv = intervals[dataIndex];
                if (!iv) return '';
                const total = iv.total_count;
                const bevCount = iv.bev_count;
                const phevCount = iv.phev_count;
                const bevPct = total > 0 ? ((bevCount / total) * 100).toFixed(1) : 0;
                const phevPct = total > 0 ? ((phevCount / total) * 100).toFixed(1) : 0;
                const avgRange = iv.avg_range ? `${Number(iv.avg_range).toFixed(0)} km` : '—';
                const avgPower = iv.avg_power ? `${Number(iv.avg_power).toFixed(1)} kWh/100km` : '—';
                const medianPrice = iv.median_price != null ? `${Number(iv.median_price).toFixed(1)} 万` : '—';
                const prevCount = iv.prev_count != null ? iv.prev_count : 0;
                const diffSign = total >= prevCount ? '▲' : '▼';
                const diffColor = total >= prevCount ? '#10b981' : '#f43f5e';
                let diffPct = prevCount > 0 ? (((total - prevCount) / prevCount) * 100) : 0;
                diffPct = Math.abs(diffPct).toFixed(1);

                let topBrandsHtml = '';
                if (iv.top_brands && iv.top_brands.length > 0) {
                    topBrandsHtml = `<div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(148,163,184,0.2);">
                        <div style="color:#94a3b8; font-size:11px; margin-bottom:6px; font-weight:600; letter-spacing:0.5px;">🏆 销量TOP3品牌</div>
                        ${iv.top_brands.map((b, i) => `
                            <div style="display:flex; justify-content:space-between; padding:3px 0; font-size:12px;">
                                <span style="color:#cbd5e1;">
                                    <span style="display:inline-block; width:16px; text-align:center; font-weight:700; color:${['#fbbf24','#94a3b8','#d97706'][i] || '#94a3b8'};">${i + 1}</span>
                                    ${b.brand}
                                </span>
                                <span style="color:#f472b6; font-weight:600;">${Number(b.sales).toLocaleString()} 台</span>
                            </div>
                        `).join('')}
                    </div>`;
                }

                return `
                    <div style="min-width:260px;">
                        <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid rgba(148,163,184,0.2);">
                            <span style="color:#818cf8;">💰</span> 价格区间：${iv.label} 万元
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 16px;">
                            <div style="color:#94a3b8; font-size:12px;">车型总数</div>
                            <div style="color:#fff; font-weight:700; text-align:right;">${total} 台 <span style="color:${diffColor}; font-size:11px; margin-left:4px;">${diffSign}${diffPct}%</span></div>
                            <div style="color:#94a3b8; font-size:12px;">纯电 <span style="color:#38bdf8;">●</span></div>
                            <div style="color:#38bdf8; font-weight:600; text-align:right;">${bevCount} 台 (${bevPct}%)</div>
                            <div style="color:#94a3b8; font-size:12px;">混动 <span style="color:#f472b6;">●</span></div>
                            <div style="color:#f472b6; font-weight:600; text-align:right;">${phevCount} 台 (${phevPct}%)</div>
                            <div style="color:#94a3b8; font-size:12px;">区间中位价</div>
                            <div style="color:#fbbf24; font-weight:700; text-align:right;">${medianPrice}</div>
                            <div style="color:#94a3b8; font-size:12px;">平均续航</div>
                            <div style="color:#10b981; font-weight:600; text-align:right;">${avgRange}</div>
                            <div style="color:#94a3b8; font-size:12px;">平均电耗</div>
                            <div style="color:#a78bfa; font-weight:600; text-align:right;">${avgPower}</div>
                        </div>
                        ${topBrandsHtml}
                    </div>
                `;
            }
        },
        legend: {
            data: ['纯电', '混动', '上季度'],
            textStyle: { color: '#94a3b8', fontSize: 12 },
            top: 0,
            right: 10,
            itemWidth: 14,
            itemHeight: 10,
            itemGap: 18
        },
        grid: {
            left: 50,
            right: 30,
            top: 50,
            bottom: 60,
            containLabel: false
        },
        xAxis: {
            type: 'category',
            data: labels,
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                interval: 0,
                rotate: 25,
                margin: 10
            },
            axisLine: { lineStyle: { color: '#475569' } },
            axisTick: { show: false },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            name: '车型数量',
            nameTextStyle: { color: '#64748b', fontSize: 11, padding: [0, 0, 10, -20] },
            axisLabel: { color: '#94a3b8', fontSize: 11 },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.08)', type: 'dashed' } },
            minInterval: 1
        },
        series: [
            {
                name: '纯电',
                type: 'bar',
                stack: 'total',
                barWidth: '42%',
                barGap: '-100%',
                z: 3,
                data: bevData,
                itemStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(56, 189, 248, 0.95)' },
                            { offset: 1, color: 'rgba(56, 189, 248, 0.55)' }
                        ]
                    },
                    borderRadius: [0, 0, 0, 0]
                },
                emphasis: {
                    focus: 'series',
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(125, 211, 252, 1)' },
                                { offset: 1, color: 'rgba(56, 189, 248, 0.75)' }
                            ]
                        },
                        shadowBlur: 12,
                        shadowColor: 'rgba(56, 189, 248, 0.5)'
                    }
                },
                markLine: {
                    silent: true,
                    symbol: 'none',
                    animation: false,
                    lineStyle: {
                        type: 'dashed',
                        width: 1.5
                    },
                    label: {
                        formatter: '{b}',
                        fontSize: 10,
                        color: '#fbbf24',
                        backgroundColor: 'rgba(15, 23, 42, 0.8)',
                        borderColor: 'rgba(251, 191, 36, 0.3)',
                        borderWidth: 1,
                        borderRadius: 4,
                        padding: [3, 6],
                        position: 'start',
                        distance: 2
                    },
                    data: intervals.map((iv, idx) => {
                        const barTotal = bevData[idx] + phevData[idx];
                        if (iv.median_price == null || barTotal === 0) return null;
                        return {
                            name: `中${iv.median_price}万`,
                            xAxis: idx,
                            yAxis: barTotal,
                            lineStyle: {
                                color: 'rgba(251, 191, 36, 0.6)',
                                type: 'dashed',
                                width: 1.5
                            }
                        };
                    }).filter(x => x != null)
                }
            },
            {
                name: '混动',
                type: 'bar',
                stack: 'total',
                barWidth: '42%',
                z: 3,
                data: phevData,
                itemStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(244, 114, 182, 0.95)' },
                            { offset: 1, color: 'rgba(244, 114, 182, 0.55)' }
                        ]
                    },
                    borderRadius: [4, 4, 0, 0]
                },
                emphasis: {
                    focus: 'series',
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(249, 168, 212, 1)' },
                                { offset: 1, color: 'rgba(244, 114, 182, 0.75)' }
                            ]
                        },
                        shadowBlur: 12,
                        shadowColor: 'rgba(244, 114, 182, 0.5)'
                    }
                }
            },
            {
                name: '上季度',
                type: 'bar',
                barWidth: '42%',
                barGap: '-100%',
                z: 1,
                data: prevData,
                itemStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(148, 163, 184, 0.18)' },
                            { offset: 1, color: 'rgba(148, 163, 184, 0.06)' }
                        ]
                    },
                    borderColor: 'rgba(148, 163, 184, 0.35)',
                    borderWidth: 1,
                    borderType: 'dashed',
                    borderRadius: [4, 4, 0, 0]
                },
                silent: true
            }
        ]
    };

    charts.priceDistChart.setOption(option, true);
}

function updatePriceDistSummary(summary) {
    if (!summary) return;
    const card = document.getElementById('priceDistCard');
    if (!card) return;

    const sampleCount = summary.sample_count || 0;
    const priceMin = summary.price_min != null ? Number(summary.price_min).toFixed(0) : '—';
    const priceMax = summary.price_max != null ? Number(summary.price_max).toFixed(0) : '—';
    const mostInterval = summary.most_interval || '—';
    const mostCount = summary.most_count || 0;

    const html = `
        <div class="pd-summary-item">
            <span class="pd-summary-label">📊 样本</span>
            <span class="pd-summary-value">${sampleCount} 款</span>
        </div>
        <span class="pd-summary-divider">|</span>
        <div class="pd-summary-item">
            <span class="pd-summary-label">💰 跨度</span>
            <span class="pd-summary-value">${priceMin} ~ ${priceMax} 万</span>
        </div>
        <span class="pd-summary-divider">|</span>
        <div class="pd-summary-item">
            <span class="pd-summary-label">🎯 集中区</span>
            <span class="pd-summary-value pd-highlight">${mostInterval}</span>
            <span style="color:var(--text-secondary);font-size:11px;">(${mostCount}款)</span>
        </div>
    `;
    const el = card.querySelector('.price-dist-summary');
    if (el) el.innerHTML = html;
}

function selectPriceRange(interval) {
    if (!interval) return;
    const pMinEl = document.getElementById('priceMin');
    const pMaxEl = document.getElementById('priceMax');
    if (!pMinEl || !pMaxEl) return;
    pMinEl.value = interval.low;
    pMaxEl.value = interval.high;

    priceDistState.selectedInterval = { ...interval, _ts: Date.now() };
    renderQuickTags();
    refreshCharts();
    showToast(`已锁定价格带：${interval.label} 万元`, 'info');
}

function clearPriceRangeFilter() {
    const pMinEl = document.getElementById('priceMin');
    const pMaxEl = document.getElementById('priceMax');
    if (pMinEl) pMinEl.value = '';
    if (pMaxEl) pMaxEl.value = '';
    priceDistState.selectedInterval = null;
    renderQuickTags();
    refreshCharts();
}

function removeQuickTag() {
    clearPriceRangeFilter();
}

function renderQuickTags() {
    const container = document.getElementById('pdQuickTags');
    if (!container) return;
    if (!priceDistState.selectedInterval) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    const iv = priceDistState.selectedInterval;
    container.innerHTML = `
        <span class="pd-quick-label">🎯 已锁定：</span>
        <div class="pd-quick-tags-list">
            <span class="pd-quick-tag" title="点击重新应用此价格带">
                💰 ${iv.label} 万
                <span class="pd-quick-tag-close" id="pdTagClose" title="清除价格筛选">✕</span>
            </span>
        </div>
        <button class="pd-clear-tags" id="pdClearTagsBtn">重置</button>
    `;
    const tagEl = container.querySelector('.pd-quick-tag');
    if (tagEl) tagEl.onclick = (e) => {
        if (e.target.classList.contains('pd-quick-tag-close')) return;
        selectPriceRange(iv);
    };
    const closeBtn = document.getElementById('pdTagClose');
    if (closeBtn) closeBtn.onclick = (e) => {
        e.stopPropagation();
        removeQuickTag();
    };
    const clearBtn = document.getElementById('pdClearTagsBtn');
    if (clearBtn) clearBtn.onclick = clearPriceRangeFilter;
}

function togglePriceDistCard() {
    const card = document.getElementById('priceDistCard');
    if (!card) return;
    priceDistState.collapsed = !priceDistState.collapsed;
    card.classList.toggle('collapsed', priceDistState.collapsed);
    const icon = document.getElementById('pdToggleIcon');
    if (icon) icon.innerHTML = priceDistState.collapsed ? '&#9658;' : '&#9660;';
    if (!priceDistState.collapsed && charts.priceDistChart) {
        setTimeout(() => charts.priceDistChart.resize(), 320);
    }
}

function openBinEditor() {
    const bins = priceDistState.currentBins || [0, 15, 25, 35, 50, 80, 120, 200];
    const modal = document.getElementById('binEditorModal');
    const input = document.getElementById('binEditorInput');
    if (!modal || !input) return;
    input.value = bins.join(', ');
    renderBinEditorPreview();
    modal.style.display = 'flex';

    input.oninput = renderBinEditorPreview;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') applyCustomBins();
        if (e.key === 'Escape') closeBinEditor();
    };
}

function closeBinEditor() {
    const modal = document.getElementById('binEditorModal');
    if (modal) modal.style.display = 'none';
}

function renderBinEditorPreview() {
    const input = document.getElementById('binEditorInput');
    const preview = document.getElementById('binEditorPreview');
    const hint = document.getElementById('binEditorHint');
    if (!input || !preview || !hint) return;

    const raw = input.value.trim();
    if (!raw) {
        preview.innerHTML = '';
        hint.textContent = '';
        return;
    }

    const parts = raw.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    const nums = [];
    for (const p of parts) {
        const n = Number(p);
        if (isNaN(n) || n < 0) {
            hint.textContent = `⚠️ 输入非法："${p}" 不是有效正数`;
            preview.innerHTML = '';
            return;
        }
        nums.push(n);
    }

    if (nums.length < 2) {
        hint.textContent = `⚠️ 至少需要2个边界值，当前只有 ${nums.length} 个`;
        preview.innerHTML = '';
        return;
    }

    const sorted = [...nums].sort((a, b) => a - b);
    const dup = sorted.filter((v, i) => i > 0 && v === sorted[i - 1]);
    if (dup.length > 0) {
        hint.textContent = `⚠️ 存在重复边界值：${dup.join(', ')}`;
        preview.innerHTML = '';
        return;
    }

    if (!raw.split(/[,，\s]+/).every(s => s.trim() === '' || !isNaN(Number(s.trim())))) {
        // Already checked above
    }

    hint.textContent = '';
    let html = '';
    for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const aStr = a === Math.floor(a) ? a : a.toFixed(1);
        const bStr = b === Math.floor(b) ? b : b.toFixed(1);
        html += `<span class="bin-preview-seg">${aStr} ~ ${bStr} 万</span>`;
    }
    preview.innerHTML = html;
}

function applyCustomBins() {
    const input = document.getElementById('binEditorInput');
    if (!input) return;
    const parts = input.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    const nums = parts.map(Number);
    if (nums.some(isNaN)) {
        showToast('请输入有效数字', 'warning');
        return;
    }
    if (nums.length < 2) {
        showToast('至少需要2个边界值', 'warning');
        return;
    }
    const sorted = [...nums].sort((a, b) => a - b);
    const dup = sorted.filter((v, i) => i > 0 && v === sorted[i - 1]);
    if (dup.length > 0) {
        showToast('存在重复边界值，请修正', 'warning');
        return;
    }
    priceDistState.customBins = sorted;
    closeBinEditor();
    loadPriceDistChart();
    showToast(`已应用 ${sorted.length - 1} 个价格区间`, 'success');
}

function resetPriceBins() {
    priceDistState.customBins = null;
    loadPriceDistChart();
    showToast('已恢复系统推荐分段', 'info');
}

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('pdToggleBtn');
    if (toggleBtn) toggleBtn.onclick = togglePriceDistCard;

    const editBtn = document.getElementById('pdEditBinBtn');
    if (editBtn) editBtn.onclick = openBinEditor;

    const resetBtn = document.getElementById('pdResetBinBtn');
    if (resetBtn) resetBtn.onclick = resetPriceBins;

    const binEditorClose = document.getElementById('binEditorClose');
    if (binEditorClose) binEditorClose.onclick = closeBinEditor;

    const binEditorCancel = document.getElementById('binEditorCancel');
    if (binEditorCancel) binEditorCancel.onclick = closeBinEditor;

    const binEditorApply = document.getElementById('binEditorApply');
    if (binEditorApply) binEditorApply.onclick = applyCustomBins;

    const binModal = document.getElementById('binEditorModal');
    if (binModal) {
        binModal.addEventListener('click', (e) => {
            if (e.target === binModal) closeBinEditor();
        });
    }

    renderQuickTags();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const binModal = document.getElementById('binEditorModal');
        if (binModal && binModal.style.display === 'flex') closeBinEditor();
    }
});
