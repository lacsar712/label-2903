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
            // Drill down: If brand filter is empty, and user clicks a model, 
            // maybe we extract the brand or just set the brand filter to that specific brand.
            // Simplified: Filter everything by this brand
            const brandSelect = document.getElementById('brandFilter');
            // Check if name is a brand or a specific model. 
            // In our current API, labels are model names. We might need brand info.
            // For this version: just toast and filter by brand if it matches known brands.
            const brands = ['特斯拉', '比亚迪', '蔚来', '小鹏'];
            if (brands.includes(params.name)) {
                brandSelect.value = params.name;
                refreshCharts();
            } else {
                // It's a model name. We can find the brand? 
                // Let's assume user wants to filter by this specific selection.
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
                <td style="color: #fff; font-weight: 500;">${m}</td>
                <td>${data.range[i]} km</td>
                <td>${data.price[i]} 万</td>
                <td>${data.power[i]}</td>
            </tr>
        `).join('');
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

// Add event listeners for automatic refreshing
window.addEventListener('load', () => {
    initCharts();
    if (charts.barChart) {
        refreshCharts();

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
