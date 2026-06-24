/**
 * Netlify Sales Dashboard - Core Logic Engine
 * Integrates Chart.js, HTML5 canvas sparklines, rotation controls, and dynamic renders.
 */

document.addEventListener("DOMContentLoaded", () => {


    // --- 1. State Management ---
    let currentScreen = 0; // 0: Weekly, 1: Overall, 2: Reps
    let isPaused = false;
    const rotationTime = 15000; // 15 seconds
    const tickMs = 100; // Update frequency
    let currentTime = 0;
    let timerInterval = null;
    let chartInstance = null;

    // --- 2. DOM Cache ---
    const screens = [
        document.getElementById("screenWeekly"),
        document.getElementById("screenReps"),
        document.getElementById("screenMTD"),
        document.getElementById("screenYTD"),
        document.getElementById("screenOverdue")
    ];
    const indicatorDots = document.querySelectorAll(".indicator-dot");
    const countdownBar = document.getElementById("countdownBar");
    const timerDot = document.getElementById("timerDot");
    const timerLabel = document.getElementById("timerLabel");
    
    // Action buttons
    const btnPlayPause = document.getElementById("btnPlayPause");
    const btnPrev = document.getElementById("btnPrev");
    const btnNext = document.getElementById("btnNext");
    const btnFullscreen = document.getElementById("btnFullscreen");
    const svgPlayPause = document.getElementById("svgPlayPause");
    
    // Rep grid screen
    const repsGridContainer = document.getElementById("repsGrid");
    
    // Static bottom metrics
    const totalSalesEl = document.getElementById("totalSales");
    const totalDead ProfitEl = document.getElementById("totalDead Profit");
    const totalCommissionEl = document.getElementById("totalCommission");
    const totalPipelineEl = document.getElementById("totalPipeline");
    const bottomProgressCircle = document.getElementById("bottomProgressCircle");
    const bottomProgressPct = document.getElementById("bottomProgressPct");
    const bottomProgressDetails = document.getElementById("bottomProgressDetails");

    // Dynamic Date Calculations for filters
    const today = new Date();
    const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    const todayY = today.getFullYear();
    const todayM = String(today.getMonth() + 1).padStart(2, '0');
    const todayD = String(today.getDate()).padStart(2, '0');
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    // Dynamic week dates configuration (Monday to Friday of the current week)
    const getCurrentWeekDays = () => {
        const day = today.getDay();
        const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today.getFullYear(), today.getMonth(), diffToMonday);
        
        const days = [];
        for (let i = 0; i < 5; i++) {
            const nextDay = new Date(monday);
            nextDay.setDate(monday.getDate() + i);
            const yyyy = nextDay.getFullYear();
            const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
            const dd = String(nextDay.getDate()).padStart(2, '0');
            days.push(`${yyyy}-${mm}-${dd}`);
        }
        return days;
    };
    const weekDays = getCurrentWeekDays();

    // --- 3. Format Helpers ---
    const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(val);
    };

    // --- 4. Render Layouts ---
    
    // Initialize the static bottom bar KPIs
    const initStaticKPIs = () => {
        const tw = dashboardData.teamWeekly;
        
        // Static bottom totals
        totalSalesEl.textContent = formatCurrency(tw.salesCurrent);
        totalDead ProfitEl.textContent = formatCurrency(tw.profitCurrent);
        totalCommissionEl.textContent = formatCurrency(tw.commissionCurrent);
        totalPipelineEl.textContent = formatCurrency(tw.pipelineValue);

        // Circular progress at bottom
        const quotaPct = Math.round((tw.salesCurrent / tw.salesTarget) * 100);
        bottomProgressPct.textContent = `${quotaPct}%`;
        bottomProgressDetails.textContent = `${formatCurrency(tw.salesCurrent)} / ${formatCurrency(tw.salesTarget)}`;
        
        // Circular stroke math (R = 20, Circ = 125.6)
        const offset = 125.6 - (quotaPct / 100) * 125.6;
        bottomProgressCircle.style.strokeDashoffset = Math.max(0, offset);
    };

    // Render Weekly Sales & Dead Profit Grid (tdsales style)
    const renderWeeklyGrid = () => {
        const tvBody = document.getElementById("tvBody");
        if (!tvBody) return;
        
        tvBody.innerHTML = "";
        
        // Update header dates to match spreadsheet
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        const headerIds = ['tvHMon', 'tvHTue', 'tvHWed', 'tvHThu', 'tvHFri'];
        weekDays.forEach((iso, idx) => {
            const el = document.getElementById(headerIds[idx]);
            if (el) {
                const parts = iso.split('-');
                const month = parseInt(parts[1], 10);
                const day = parseInt(parts[2], 10);
                el.textContent = `${dayNames[idx]} ${month}/${day}`;
            }
        });

        // Day totals accumulator
        const dayTotals = {
            sales: [0, 0, 0, 0, 0],
            profit: [0, 0, 0, 0, 0]
        };
        let overallSalesTotal = 0;
        let overallProfitTotal = 0;
        
        const sortedReps = [...dashboardData.salesReps].sort((a, b) => b.metrics.sales - a.metrics.sales);
        sortedReps.forEach(rep => {
            const salesDays = [0, 0, 0, 0, 0];
            const profitDays = [0, 0, 0, 0, 0];
            let repSalesTotal = 0;
            let repProfitTotal = 0;
            
            // Dynamic aggregation of transactions for current week (May 4 - May 8, 2026)
            dashboardData.recentDeals.forEach(deal => {
                if (deal.owner.toLowerCase().includes(rep.name.toLowerCase()) || 
                    rep.name.toLowerCase().includes(deal.owner.toLowerCase())) {
                    
                    const dayIdx = weekDays.indexOf(deal.date);
                    if (dayIdx >= 0) {
                        salesDays[dayIdx] += deal.amount;
                        profitDays[dayIdx] += deal.profit;
                    }
                }
            });
            
            repSalesTotal = salesDays.reduce((a, b) => a + b, 0);
            repProfitTotal = profitDays.reduce((a, b) => a + b, 0);
            
            for (let i = 0; i < 5; i++) {
                dayTotals.sales[i] += salesDays[i];
                dayTotals.profit[i] += profitDays[i];
            }
            overallSalesTotal += repSalesTotal;
            overallProfitTotal += repProfitTotal;
            
            const salesCells = salesDays.map(v => 
                v > 0 ? `<td class="day-has">${formatCurrency(v)}</td>` : `<td class="day-zero">—</td>`
            ).join('');
            
            const profitCells = profitDays.map(v => 
                v > 0 ? `<td class="day-has">${formatCurrency(v)}</td>` : `<td class="day-zero">—</td>`
            ).join('');
            
            tvBody.innerHTML += `
                <tr class="row-t">
                    <td rowspan="2" style="vertical-align:middle; font-size:0.95rem; font-weight:700; border-bottom:2px solid var(--glass-border)">${rep.name}</td>
                    <td style="font-size:0.72rem; color:var(--text-secondary); font-weight:700; border-bottom:1px solid var(--glass-border)">Sales</td>
                    ${salesCells}
                    <td class="wk-total" style="border-bottom:1px solid var(--glass-border)">${formatCurrency(repSalesTotal)}</td>
                </tr>
                <tr class="row-p">
                    <td style="font-size:0.72rem; color:var(--accent-teal); font-weight:700">Dead Profit</td>
                    ${profitCells}
                    <td class="wk-total" style="color:var(--accent-teal)">${formatCurrency(repProfitTotal)}</td>
                </tr>
            `;
        });
        
        // Render team totals at the bottom of the table
        const totSalesCells = dayTotals.sales.map(v => 
            v > 0 ? `<td>${formatCurrency(v)}</td>` : `<td class="day-zero">—</td>`
        ).join('');
        
        const totprofitCells = dayTotals.profit.map(v => 
            v > 0 ? `<td style="color: var(--accent-teal)">${formatCurrency(v)}</td>` : `<td class="day-zero">—</td>`
        ).join('');
        
        tvBody.innerHTML += `
            <tr class="totals-row">
                <td rowspan="2" style="vertical-align:middle; font-size:0.9rem; color:var(--primary)">TEAM TOTALS</td>
                <td style="font-size:0.72rem; color:var(--text-secondary); border-bottom:1px solid var(--glass-border)">Total Sales</td>
                ${totSalesCells}
                <td style="border-bottom:1px solid var(--glass-border)">${formatCurrency(overallSalesTotal)}</td>
            </tr>
            <tr class="totals-row" style="border-top:none">
                <td style="font-size:0.72rem; color:var(--accent-teal)">Total Dead Profit</td>
                ${totprofitCells}
                <td style="color:var(--accent-teal)">${formatCurrency(overallProfitTotal)}</td>
            </tr>
        `;
    };

    // Render Sales Rep Invoiced (MTD) Grid
    const renderMTDGrid = () => {
        const tvInvoicedBody = document.getElementById("tvInvoicedBody");
        if (!tvInvoicedBody) return;
        
        tvInvoicedBody.innerHTML = "";
        
        dashboardData.salesReps.forEach(rep => {
            let mtdSales = 0;
            let dealCount = 0;
            
            dashboardData.recentDeals.forEach(deal => {
                if (deal.owner.toLowerCase().includes(rep.name.toLowerCase()) || 
                    rep.name.toLowerCase().includes(deal.owner.toLowerCase())) {
                    
                    if (deal.date.startsWith(currentYearMonth)) {
                        mtdSales += deal.amount;
                        dealCount++;
                    }
                }
            });
            
            tvInvoicedBody.innerHTML += `
                <tr>
                    <td style="font-weight:700; color:var(--text-primary)">${rep.name}</td>
                    <td style="color:var(--primary); font-weight:800">${formatCurrency(mtdSales)}</td>
                    <td style="color:var(--text-secondary)">${dealCount} deals</td>
                </tr>
            `;
        });
    };

    // Render MTD Full Performance Screen
    const renderMTDFullScreen = () => {
        const body = document.getElementById("tvMTDFullBody");
        const label = document.getElementById("mtdScreenLabel");
        if (!body) return;

        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const now = new Date();
        if (label) label.textContent = `${months[now.getMonth()]} 1 – ${now.getDate()}, ${now.getFullYear()}`;

        body.innerHTML = "";
        let teamSales = 0, teamProfit = 0, teamComm = 0, teamDeals = 0;

        const rowsData = dashboardData.salesReps.map(rep => {
            let sales = 0, profit = 0, commission = 0, deals = 0;
            (dashboardData.allDeals || []).forEach(deal => {
                if (!deal.date.startsWith(currentYearMonth)) return;
                if (deal.owner.toLowerCase().includes(rep.name.toLowerCase()) ||
                    rep.name.toLowerCase().includes(deal.owner.toLowerCase())) {
                    sales += deal.amount;
                    profit += deal.profit;
                    commission += deal.commission;
                    deals++;
                }
            });
            teamSales += sales; teamProfit += profit; teamComm += commission; teamDeals += deals;
            return { name: rep.name, gradient: rep.avatarGradient, sales, profit, commission, deals };
        }).sort((a, b) => b.sales - a.sales);

        rowsData.forEach((r, idx) => {
            const avgDeal = r.deals > 0 ? r.sales / r.deals : 0;
            const profitPct = r.sales > 0 ? ((r.profit / r.sales) * 100).toFixed(1) : '0.0';
            const rankBadge = idx === 0 && r.sales > 0 ? ' 🥇' : '';
            body.innerHTML += `
                <tr>
                    <td style="font-weight:700; color:var(--text-primary)">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.gradient[0]};margin-right:8px;"></span>
                        ${r.name}${rankBadge}
                    </td>
                    <td style="color:var(--primary);font-weight:800">${formatCurrency(r.sales)}</td>
                    <td style="color:var(--accent-teal);font-weight:700">${formatCurrency(r.profit)}</td>
                    <td style="color:var(--accent-purple);font-weight:700">${formatCurrency(r.commission)}</td>
                    <td style="color:var(--text-secondary);font-weight:600">${r.deals}</td>
                    <td style="color:var(--text-secondary)">${avgDeal > 0 ? formatCurrency(avgDeal) : '—'}</td>
                    <td style="color:${parseFloat(profitPct) >= 15 ? 'var(--accent-teal)' : 'var(--accent-amber)'}">${profitPct}%</td>
                </tr>`;
        });

        // Team totals row
        const teamAvg = teamDeals > 0 ? teamSales / teamDeals : 0;
        const teamPct = teamSales > 0 ? ((teamProfit / teamSales) * 100).toFixed(1) : '0.0';
        body.innerHTML += `
            <tr class="totals-row">
                <td style="font-weight:800;color:var(--primary)">TEAM TOTAL</td>
                <td style="color:var(--primary);font-weight:800">${formatCurrency(teamSales)}</td>
                <td style="color:var(--accent-teal);font-weight:800">${formatCurrency(teamProfit)}</td>
                <td style="color:var(--accent-purple);font-weight:800">${formatCurrency(teamComm)}</td>
                <td style="font-weight:800">${teamDeals}</td>
                <td>${teamAvg > 0 ? formatCurrency(teamAvg) : '—'}</td>
                <td style="color:var(--accent-teal);font-weight:800">${teamPct}%</td>
            </tr>`;
    };

    // Render YTD Full Performance Screen
    const renderYTDScreen = () => {
        const body = document.getElementById("tvYTDFullBody");
        const label = document.getElementById("ytdScreenLabel");
        if (!body) return;

        const now = new Date();
        const currentYear = String(now.getFullYear());
        if (label) label.textContent = `Jan 1 – ${now.toLocaleDateString('en-US',{month:'short',day:'numeric'})}, ${currentYear}`;

        body.innerHTML = "";
        let teamSales = 0, teamProfit = 0, teamComm = 0, teamDeals = 0;

        const rowsData = dashboardData.salesReps.map(rep => {
            let sales = 0, profit = 0, commission = 0, deals = 0;
            (dashboardData.allDeals || []).forEach(deal => {
                if (!deal.date.startsWith(currentYear)) return;
                if (deal.owner.toLowerCase().includes(rep.name.toLowerCase()) ||
                    rep.name.toLowerCase().includes(deal.owner.toLowerCase())) {
                    sales += deal.amount;
                    profit += deal.profit;
                    commission += deal.commission;
                    deals++;
                }
            });
            teamSales += sales; teamProfit += profit; teamComm += commission; teamDeals += deals;
            return { name: rep.name, gradient: rep.avatarGradient, sales, profit, commission, deals };
        }).sort((a, b) => b.sales - a.sales);

        rowsData.forEach((r, idx) => {
            const avgDeal = r.deals > 0 ? r.sales / r.deals : 0;
            const profitPct = r.sales > 0 ? ((r.profit / r.sales) * 100).toFixed(1) : '0.0';
            const rankBadge = idx === 0 && r.sales > 0 ? ' 🥇' : '';
            body.innerHTML += `
                <tr>
                    <td style="font-weight:700; color:var(--text-primary)">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.gradient[0]};margin-right:8px;"></span>
                        ${r.name}${rankBadge}
                    </td>
                    <td style="color:var(--primary);font-weight:800">${formatCurrency(r.sales)}</td>
                    <td style="color:var(--accent-teal);font-weight:700">${formatCurrency(r.profit)}</td>
                    <td style="color:var(--accent-purple);font-weight:700">${formatCurrency(r.commission)}</td>
                    <td style="color:var(--text-secondary);font-weight:600">${r.deals}</td>
                    <td style="color:var(--text-secondary)">${avgDeal > 0 ? formatCurrency(avgDeal) : '—'}</td>
                    <td style="color:${parseFloat(profitPct) >= 15 ? 'var(--accent-teal)' : 'var(--accent-amber)'}">${profitPct}%</td>
                </tr>`;
        });

        const teamAvg = teamDeals > 0 ? teamSales / teamDeals : 0;
        const teamPct = teamSales > 0 ? ((teamProfit / teamSales) * 100).toFixed(1) : '0.0';
        body.innerHTML += `
            <tr class="totals-row">
                <td style="font-weight:800;color:var(--accent-amber)">TEAM TOTAL</td>
                <td style="color:var(--primary);font-weight:800">${formatCurrency(teamSales)}</td>
                <td style="color:var(--accent-teal);font-weight:800">${formatCurrency(teamProfit)}</td>
                <td style="color:var(--accent-purple);font-weight:800">${formatCurrency(teamComm)}</td>
                <td style="font-weight:800">${teamDeals}</td>
                <td>${teamAvg > 0 ? formatCurrency(teamAvg) : '—'}</td>
                <td style="color:var(--accent-teal);font-weight:800">${teamPct}%</td>
            </tr>`;
    };

    // Render Overdue Invoices (>30 Days) Grid Full Screen
    const renderOverdueGrid = () => {
        const tvOverdueBody = document.getElementById("tvOverdueBody");
        if (!tvOverdueBody) return;
        
        tvOverdueBody.innerHTML = "";
        
        // Collect all overdue deals
        const overdueDeals = dashboardData.recentDeals.filter(deal => deal.status === "Overdue");
        
        // Sort by oldest date
        overdueDeals.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (overdueDeals.length === 0) {
            tvOverdueBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No Overdue Invoices</td></tr>`;
            return;
        }

        const now = new Date();
        overdueDeals.forEach(deal => {
            const dealDate = new Date(deal.date);
            const diffTime = Math.abs(now - dealDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            tvOverdueBody.innerHTML += `
                <tr>
                    <td style="font-weight:700; color:var(--text-primary)">${deal.owner}</td>
                    <td style="color:var(--text-secondary)">${deal.name} <br><span style="font-size:0.7rem;color:var(--text-muted)">INV-${deal.invoice || 'N/A'}</span></td>
                    <td style="color:var(--accent-rose); font-weight:800">${formatCurrency(deal.amount)}</td>
                    <td style="color:var(--text-secondary)">${deal.date}</td>
                    <td style="color:var(--accent-rose); font-weight:700">${diffDays} Days</td>
                </tr>
            `;
        });
    };

    // Render Overdue Invoices Overall KPIs
    const renderOverdueKPIs = () => {
        const balanceEl = document.getElementById("overallOverdueBalance");
        const countEl = document.getElementById("overallOverdueCount");
        const oldestEl = document.getElementById("overallOldestInvoice");
        if (!balanceEl || !countEl || !oldestEl) return;

        let totalBalance = 0;
        let count = 0;
        let oldestDeal = null;

        dashboardData.recentDeals.forEach(deal => {
            if (deal.status === "Overdue") {
                totalBalance += deal.amount;
                count++;
                if (!oldestDeal || deal.date < oldestDeal.date) {
                    oldestDeal = deal;
                }
            }
        });

        balanceEl.textContent = formatCurrency(totalBalance);
        countEl.textContent = count === 1 ? "1 Invoice" : `${count} Invoices`;

        if (oldestDeal) {
            // Parse date (e.g. "2026-04-05")
            const parts = oldestDeal.date.split('-');
            const monthIdx = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthStr = months[monthIdx] || parts[1];
            
            // Format short name (e.g. "Ross Haisler" -> "Ross H.")
            const nameParts = oldestDeal.owner.split(" ");
            const shortName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[1][0]}.` : oldestDeal.owner;
            
            oldestEl.textContent = `${monthStr} ${day} (${shortName})`;
        } else {
            oldestEl.textContent = "—";
        }
    };

    // Render individual Rep Cards screen
    const renderRepGrid = () => {
        repsGridContainer.innerHTML = "";
        dashboardData.salesReps.forEach((rep) => {
            const card = document.createElement("div");
            card.className = "glass-card rep-card";
            card.style.borderTopColor = rep.avatarGradient[0];
            
            const hasVigWarning = rep.metrics.actualVig !== rep.metrics.expectedVig;
            const vigBadgeHTML = hasVigWarning 
                ? `<div class="vig-badge">
                     <span class="vig-label">VIG Rate (Mismatched)</span>
                     <span class="vig-status">ACTUAL: ${rep.metrics.actualVig.toFixed(1)}x (EXP: ${rep.metrics.expectedVig.toFixed(1)}x)</span>
                   </div>`
                : `<div class="vig-badge healthy">
                     <span class="vig-label">VIG Rate</span>
                     <span class="vig-status">ACTIVE: ${rep.metrics.actualVig.toFixed(1)}x</span>
                   </div>`;
            
            const initials = rep.name.split(" ").map(n => n[0]).join("");
            
            card.innerHTML = `
                <!-- Identity -->
                <div class="rep-profile">
                    <div class="rep-avatar" style="background: linear-gradient(135deg, ${rep.avatarGradient[0]}, ${rep.avatarGradient[1]})">
                        ${initials}
                    </div>
                    <div class="rep-identity">
                        <span class="rep-name">${rep.name}</span>
                        <span class="rep-role">${rep.role}</span>
                    </div>
                </div>

                <!-- Individual Quota Progression -->
                <div class="quota-container">
                    <div class="quota-header">
                        <span class="quota-label">Weekly Target Progress</span>
                        <span class="quota-percentage" style="color: ${rep.avatarGradient[0]}">${rep.metrics.quotaAttainment}%</span>
                    </div>
                    <div class="quota-bar-outer">
                        <div class="quota-bar-inner" style="width: ${Math.min(100, rep.metrics.quotaAttainment)}%; background: linear-gradient(90deg, ${rep.avatarGradient[0]}, ${rep.avatarGradient[1]})"></div>
                    </div>
                </div>

                <!-- KPIs grid -->
                <div class="rep-stats-grid">
                    <div class="rep-stat-box">
                        <div class="rep-stat-lbl">Sales</div>
                        <div class="rep-stat-val">${formatCurrency(rep.metrics.sales)}</div>
                    </div>
                    <div class="rep-stat-box">
                        <div class="rep-stat-lbl">Dead Profit</div>
                        <div class="rep-stat-val" style="color: var(--accent-teal)">${formatCurrency(rep.metrics.profit)}</div>
                    </div>
                    <div class="rep-stat-box">
                        <div class="rep-stat-lbl">Commission</div>
                        <div class="rep-stat-val" style="color: var(--accent-purple)">${formatCurrency(rep.metrics.commission)}</div>
                    </div>
                    <div class="rep-stat-box">
                        <div class="rep-stat-lbl">Deals Closed</div>
                        <div class="rep-stat-val">${rep.metrics.dealsClosed} Won</div>
                    </div>
                </div>

                <!-- VIG rate discrepancy alert -->
                ${vigBadgeHTML}

                <!-- Daily sparkline canvas -->
                <div class="quota-header" style="margin-top: 6px;">
                    <span class="quota-label">Daily Sales Trend</span>
                    <span class="quota-percentage" style="color: var(--text-muted); font-size: 0.72rem;">Conversion: ${rep.metrics.conversionRate}%</span>
                </div>
                <div class="sparkline-box">
                    <canvas id="sparkline_${rep.id}" width="340" height="40"></canvas>
                </div>
            `;
            
            repsGridContainer.appendChild(card);
            
            setTimeout(() => {
                drawSparkline(`sparkline_${rep.id}`, rep.trend, rep.avatarGradient);
            }, 100);
        });
    };

    // Helper to draw a glowing mini canvas sparkline
    const drawSparkline = (canvasId, dataPoints, colors) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const maxVal = Math.max(...dataPoints) * 1.1;
        const minVal = Math.min(...dataPoints) * 0.9;
        const range = maxVal - minVal || 1;
        
        const points = dataPoints.map((val, idx) => {
            const x = (idx / (dataPoints.length - 1)) * (width - 10) + 5;
            const y = height - ((val - minVal) / range) * (height - 12) - 6;
            return { x, y };
        });

        // 1. Draw area gradient underneath line
        ctx.beginPath();
        ctx.moveTo(points[0].x, height);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, height);
        ctx.closePath();
        
        const areaGrd = ctx.createLinearGradient(0, 0, 0, height);
        areaGrd.addColorStop(0, `${colors[0]}18`);
        areaGrd.addColorStop(1, 'transparent');
        ctx.fillStyle = areaGrd;
        ctx.fill();

        // 2. Draw line path
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for(let i = 1; i < points.length; i++) {
            const xc = (points[i-1].x + points[i].x) / 2;
            const yc = (points[i-1].y + points[i].y) / 2;
            ctx.quadraticCurveTo(points[i-1].x, points[i-1].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        
        ctx.strokeStyle = colors[0];
        ctx.lineWidth = 2.5;
        ctx.shadowColor = colors[0];
        ctx.shadowBlur = 8;
        ctx.stroke();
        
        ctx.shadowBlur = 0;

        // 3. Draw pulsating last point dot
        const lastP = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(lastP.x, lastP.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = colors[1];
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    // --- 6. Rotation Timing Engine ---
    const switchScreen = (index) => {
        if (index === currentScreen) return;
        
        screens[currentScreen].classList.remove("active");
        indicatorDots[currentScreen].classList.remove("active");
        
        currentScreen = index;
        screens[currentScreen].classList.add("active");
        indicatorDots[currentScreen].classList.add("active");
        
        currentTime = 0;
        countdownBar.style.width = "0%";
        
        if (currentScreen === 0) {
            renderWeeklyGrid();
        } else if (currentScreen === 1) {
            setTimeout(renderRepGrid, 100);
        } else if (currentScreen === 2) {
            renderMTDFullScreen();
        } else if (currentScreen === 3) {
            renderYTDScreen();
        } else if (currentScreen === 4) {
            renderOverdueGrid();
            renderOverdueKPIs();
        }
    };

    const nextScreen = () => {
        const nextIdx = (currentScreen + 1) % screens.length;
        switchScreen(nextIdx);
    };

    const prevScreen = () => {
        const prevIdx = (currentScreen - 1 + screens.length) % screens.length;
        switchScreen(prevIdx);
    };

    const startTimer = () => {
        if (timerInterval) clearInterval(timerInterval);
        
        timerInterval = setInterval(() => {
            if (!isPaused) {
                currentTime += tickMs;
                const progressPct = (currentTime / rotationTime) * 100;
                countdownBar.style.width = `${progressPct}%`;
                
                if (currentTime >= rotationTime) {
                    nextScreen();
                }
            }
        }, tickMs);
    };

    const togglePlayPause = () => {
        isPaused = !isPaused;
        
        if (isPaused) {
            timerDot.classList.add("paused");
            timerLabel.textContent = "ROTATION PAUSED";
            svgPlayPause.innerHTML = `
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            `;
        } else {
            timerDot.classList.remove("paused");
            timerLabel.textContent = "ROTATING IN 15S";
            svgPlayPause.innerHTML = `
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            `;
        }
    };

    // --- 7. Event Binding ---
    btnPlayPause.addEventListener("click", togglePlayPause);
    btnNext.addEventListener("click", () => {
        nextScreen();
        if (!isPaused) togglePlayPause();
    });
    btnPrev.addEventListener("click", () => {
        prevScreen();
        if (!isPaused) togglePlayPause();
    });

    indicatorDots.forEach(dot => {
        dot.addEventListener("click", (e) => {
            const targetScreenIdx = parseInt(e.target.getAttribute("data-screen"));
            switchScreen(targetScreenIdx);
            if (!isPaused) togglePlayPause();
        });
    });

    btnFullscreen.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) {
            btnFullscreen.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"></path>
                </svg>
            `;
        } else {
            btnFullscreen.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
            `;
        }
    });

    // --- 8. Live Zoho Books Integration & Aggregation ---
    async function loadLiveData() {
        try {
            const response = await fetch('/api/zoho-invoices');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data && Array.isArray(data.invoices)) {
                console.log("Successfully fetched live Zoho Books data. Aggregating...", data.invoices.length, "invoices");
                aggregateLiveData(data);
                return true;
            }
        } catch (err) {
            console.warn("Could not load live Zoho Books data. Falling back to local mock data.", err);
        }
        return false;
    }

    function aggregateLiveData(invoicesPayload) {
        const invoices = invoicesPayload.invoices || [];
        const reps = [
            {
                id: "rep_1",
                name: "Ross Haisler",
                role: "Enterprise Sales Director",
                expectedVig: 1.5,
                avatarGradient: ["#a855f7", "#6366f1"],
                status: "active",
                metrics: { sales: 0, profit: 0, commission: 0, dealsClosed: 0, quotaAttainment: 0, actualVig: 1.5, expectedVig: 1.5, conversionRate: 24.2 },
                trend: [0, 0, 0, 0, 0]
            },
            {
                id: "rep_2",
                name: "Richard Griffin",
                role: "Senior Account Executive",
                expectedVig: 1.5,
                avatarGradient: ["#ec4899", "#f43f5e"],
                status: "active",
                metrics: { sales: 0, profit: 0, commission: 0, dealsClosed: 0, quotaAttainment: 0, actualVig: 1.5, expectedVig: 1.5, conversionRate: 19.5 },
                trend: [0, 0, 0, 0, 0]
            },
            {
                id: "rep_3",
                name: "Ben Bequette",
                role: "Regional Sales Lead",
                expectedVig: 1.3,
                avatarGradient: ["#3b82f6", "#1d4ed8"],
                status: "active",
                metrics: { sales: 0, profit: 0, commission: 0, dealsClosed: 0, quotaAttainment: 0, actualVig: 1.3, expectedVig: 1.3, conversionRate: 18.2 },
                trend: [0, 0, 0, 0, 0]
            },
            {
                id: "rep_4",
                name: "Bobby Salyers",
                role: "Senior Sales Representative",
                expectedVig: 1.3,
                avatarGradient: ["#14b8a6", "#059669"],
                status: "active",
                metrics: { sales: 0, profit: 0, commission: 0, dealsClosed: 0, quotaAttainment: 0, actualVig: 1.3, expectedVig: 1.3, conversionRate: 16.8 },
                trend: [0, 0, 0, 0, 0]
            },
            {
                id: "rep_5",
                name: "Montgomery Morgan",
                role: "Key Account Manager",
                expectedVig: 1.3,
                avatarGradient: ["#f59e0b", "#d97706"],
                status: "active",
                metrics: { sales: 0, profit: 0, commission: 0, dealsClosed: 0, quotaAttainment: 0, actualVig: 1.3, expectedVig: 1.3, conversionRate: 14.5 },
                trend: [0, 0, 0, 0, 0]
            }
        ];

        const REP_WEEKLY_TARGETS = {
            "rep_1": 20000,
            "rep_2": 10000,
            "rep_3": 10000,
            "rep_4": 4000,
            "rep_5": 20000
        };

        const filteredInvoices = invoices.filter(inv => {
            const spName = (inv.salesperson_name || "").toUpperCase();
            return !(spName.includes("PAUL") && (spName.includes("GENCUSKI") || spName.includes("GENKUSKI")));
        });

        const recentDeals = [];
        const dailyChartData = {
            labels: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            sales: [0, 0, 0, 0, 0],
            profit: [0, 0, 0, 0, 0]
        };

        let teamWeeklySales = 0;
        let teamWeeklyDead Profit = 0;
        let teamWeeklyCommission = 0;
        let teamWeeklyDeals = 0;
        let teamWeeklyVigSum = 0;
        let teamWeeklyVigCount = 0;

        filteredInvoices.forEach(inv => {
            // Use salesorder_salesperson_name (originating SO rep) if available, otherwise fall back to invoice salesperson
            const creditSpName = (inv.salesorder_salesperson_name || inv.salesperson_name || "").toLowerCase();
            const rep = reps.find(r => r.name.toLowerCase().includes(creditSpName) || creditSpName.includes(r.name.toLowerCase()));
            
            // Use subtotal per user requirement
            const invAmount = Number(inv.sub_total !== undefined ? inv.sub_total : (inv.total || 0));
            const invProfit = Number(inv.cf_profit_unformatted || inv.custom_field_hash?.cf_profit_unformatted || 0);
            const invCommission = Number(inv.cf_commision_amount_unformatted || inv.custom_field_hash?.cf_commision_amount_unformatted || 0);
            const invVig = Number(inv.cf_salesperson_vig_unformatted || inv.custom_field_hash?.cf_salesperson_vig_unformatted || 1.3);

            const isOverdue = !inv.is_sales_order && (inv.status === "overdue" || (inv.due_date && inv.due_date < todayStr && inv.status !== "paid" && inv.status !== "draft"));
            const saleDate = inv.salesorder_date || inv.date;
            const dateIdx = weekDays.indexOf(saleDate);
            const inCurrentWeek = dateIdx >= 0;
            const inCurrentMonth = saleDate.startsWith(currentYearMonth);

            const dealObj = {
                id: inv.invoice_id,
                name: `${inv.customer_name} | ${inv.invoice_number}`,
                invoice: inv.invoice_number,
                owner: rep ? rep.name : (inv.salesorder_salesperson_name || inv.salesperson_name || "Unknown"),
                amount: invAmount,
                profit: invProfit,
                commission: invCommission,
                date: saleDate,
                status: isOverdue ? "Overdue" : (inv.is_sales_order ? `SO - ${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}` : (inv.status === "paid" ? "Paid" : (inv.status === "draft" ? "Draft" : "Approved"))),
                vigRate: `${invVig.toFixed(1)}x`
            };

            // Collect ALL deals (no date filter) for MTD/YTD screens
            const inAnyRelevantPeriod = inCurrentWeek || isOverdue || inCurrentMonth || saleDate.startsWith(String(new Date().getFullYear()));
            if (inAnyRelevantPeriod) {
                recentDeals.push(dealObj);
            }

            if (inCurrentWeek) {
                teamWeeklySales += invAmount;
                teamWeeklyDead Profit += invProfit;
                teamWeeklyCommission += invCommission;
                teamWeeklyDeals++;
                if (invVig > 0) {
                    teamWeeklyVigSum += invVig;
                    teamWeeklyVigCount++;
                }

                dailyChartData.sales[dateIdx] += invAmount;
                dailyChartData.profit[dateIdx] += invProfit;

                if (rep) {
                    rep.metrics.sales += invAmount;
                    rep.metrics.profit += invProfit;
                    rep.metrics.commission += invCommission;
                    rep.metrics.dealsClosed++;
                    rep.trend[dateIdx] += invAmount;
                    
                    if (!rep._vigSum) {
                        rep._vigSum = 0;
                        rep._vigCount = 0;
                    }
                    rep._vigSum += invVig;
                    rep._vigCount++;
                }
            }
        });

        reps.forEach(rep => {
            if (rep._vigCount > 0) {
                rep.metrics.actualVig = Number((rep._vigSum / rep._vigCount).toFixed(2));
            } else {
                rep.metrics.actualVig = rep.expectedVig;
            }
            delete rep._vigSum;
            delete rep._vigCount;

            const target = REP_WEEKLY_TARGETS[rep.id] || 10000;
            rep.metrics.quotaAttainment = Math.round((rep.metrics.sales / target) * 100);
        });

        const teamWeekly = {
            salesTarget: 40000,
            salesCurrent: Number(teamWeeklySales.toFixed(2)),
            profitTarget: 15000,
            profitCurrent: Number(teamWeeklyDead Profit.toFixed(2)),
            commissionTarget: 7500,
            commissionCurrent: Number(teamWeeklyCommission.toFixed(2)),
            dealsTarget: 15,
            dealsCurrent: teamWeeklyDeals,
            avgVigRate: teamWeeklyVigCount > 0 ? Number((teamWeeklyVigSum / teamWeeklyVigCount).toFixed(2)) : 1.3,
            pipelineValue: 75000
        };

        // Store all deals for MTD/YTD screens
        dashboardData.allDeals = invoicesPayload.allDeals || recentDeals;
        dashboardData.salesReps = reps;
        dashboardData.recentDeals = recentDeals;
        dashboardData.teamWeekly = teamWeekly;
        dashboardData.dailyChartData = dailyChartData;

        // --- Leadership Shift Check ---
        let mtdLeaders = [];
        let ytdLeaders = [];
        const currentYearStr = String(today.getFullYear());
        reps.forEach(rep => {
            let ytdSales = 0, mtdSales = 0;
            recentDeals.forEach(deal => {
                if (deal.owner.toLowerCase().includes(rep.name.toLowerCase()) || rep.name.toLowerCase().includes(deal.owner.toLowerCase())) {
                    if (deal.date.startsWith(currentYearStr)) ytdSales += deal.amount;
                    if (deal.date.startsWith(currentYearMonth)) mtdSales += deal.amount;
                }
            });
            mtdLeaders.push({ name: rep.name, sales: mtdSales });
            ytdLeaders.push({ name: rep.name, sales: ytdSales });
        });
        
        let weeklyLeaders = reps.map(r => ({ name: r.name, sales: r.metrics.sales }));
        checkLeadershipShifts(weeklyLeaders, mtdLeaders, ytdLeaders);
    }

    const checkLeadershipShifts = (weeklyLeaders, mtdLeaders, ytdLeaders) => {
        weeklyLeaders.sort((a,b) => b.sales - a.sales);
        mtdLeaders.sort((a,b) => b.sales - a.sales);
        ytdLeaders.sort((a,b) => b.sales - a.sales);

        const newWeeklyLeader = weeklyLeaders.length > 0 && weeklyLeaders[0].sales > 0 ? weeklyLeaders[0].name : null;
        const newMTDLeader = mtdLeaders.length > 0 && mtdLeaders[0].sales > 0 ? mtdLeaders[0].name : null;
        const newYTDLeader = ytdLeaders.length > 0 && ytdLeaders[0].sales > 0 ? ytdLeaders[0].name : null;

        const prevWeeklyLeader = localStorage.getItem('lastWeeklyLeader');
        const prevMTDLeader = localStorage.getItem('lastMTDLeader');
        const prevYTDLeader = localStorage.getItem('lastYTDLeader');

        if (prevWeeklyLeader && newWeeklyLeader && prevWeeklyLeader !== newWeeklyLeader) {
            fireCelebration("Weekly", newWeeklyLeader);
        } else if (prevMTDLeader && newMTDLeader && prevMTDLeader !== newMTDLeader) {
            fireCelebration("Month-To-Date", newMTDLeader);
        } else if (prevYTDLeader && newYTDLeader && prevYTDLeader !== newYTDLeader) {
            fireCelebration("Year-To-Date", newYTDLeader);
        }

        if (newWeeklyLeader) localStorage.setItem('lastWeeklyLeader', newWeeklyLeader);
        if (newMTDLeader) localStorage.setItem('lastMTDLeader', newMTDLeader);
        if (newYTDLeader) localStorage.setItem('lastYTDLeader', newYTDLeader);
    };

    const fireCelebration = (type, leaderName) => {
        const banner = document.getElementById('celebrationBanner');
        const text = document.getElementById('celebrationText');
        if (banner && text) {
            text.textContent = `New ${type} Leader: ${leaderName}!`;
            banner.classList.remove('hidden');
            if (typeof confetti === 'function') {
                const duration = 5 * 1000;
                const end = Date.now() + duration;
                (function frame() {
                    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#a855f7', '#14b8a6', '#f59e0b'] });
                    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#a855f7', '#14b8a6', '#f59e0b'] });
                    if (Date.now() < end) requestAnimationFrame(frame);
                }());
            }
            setTimeout(() => { banner.classList.add('hidden'); }, 6000);
        }
    };

    const applyMockFallback = () => {
        if (typeof dashboardData !== "undefined" && dashboardData) {
            if (Array.isArray(dashboardData.salesReps)) {
                dashboardData.salesReps = dashboardData.salesReps.filter(rep => {
                    const name = (rep.name || "").toUpperCase();
                    return !(name.includes("PAUL") && (name.includes("GENCUSKI") || name.includes("GENKUSKI")));
                });
            }
            
            const originalWeekDays = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];
            const todayRef = new Date();
            const dayRef = todayRef.getDay();
            const diffRef = todayRef.getDate() - dayRef + (dayRef === 0 ? -6 : 1);
            const mondayRef = new Date(todayRef.getFullYear(), todayRef.getMonth(), diffRef);
            const shiftWeekDays = [];
            for (let i = 0; i < 5; i++) {
                const nextDay = new Date(mondayRef);
                nextDay.setDate(mondayRef.getDate() + i);
                const yyyy = nextDay.getFullYear();
                const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
                const dd = String(nextDay.getDate()).padStart(2, '0');
                shiftWeekDays.push(`${yyyy}-${mm}-${dd}`);
            }

            if (Array.isArray(dashboardData.recentDeals)) {
                dashboardData.recentDeals = dashboardData.recentDeals.filter(deal => {
                    const owner = (deal.owner || "").toUpperCase();
                    return !(owner.includes("PAUL") && (owner.includes("GENCUSKI") || owner.includes("GENKUSKI")));
                });

                dashboardData.recentDeals.forEach(deal => {
                    const idx = originalWeekDays.indexOf(deal.date);
                    if (idx >= 0) {
                        deal.date = shiftWeekDays[idx];
                    }
                });
            }
        }
    };

    const initializeDashboard = async () => {
        const loadedLive = await loadLiveData();
        if (!loadedLive) {
            applyMockFallback();
        }
        initStaticKPIs();
        renderWeeklyGrid();
        renderMTDGrid();
        renderOverdueGrid();
        renderOverdueKPIs();
        renderRepGrid();
        renderMTDFullScreen();
        renderYTDScreen();
        startTimer();

        // Background polling every 10 minutes to auto-update the dashboard
        setInterval(async () => {
            const success = await loadLiveData();
            if (success) {
                console.log("Auto-refreshed live data in the background.");
                initStaticKPIs();
                renderWeeklyGrid();
                renderMTDGrid();
                renderOverdueGrid();
                renderOverdueKPIs();
                renderRepGrid();
                renderMTDFullScreen();
                renderYTDScreen();
            }
        }, 10 * 60 * 1000);
    };

    initializeDashboard();
});

