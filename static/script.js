document.addEventListener("DOMContentLoaded", () => {
    // ---- Navigation Logic ----
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.page-section');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const titles = {
        'dashboard': { title: "Security Dashboard", sub: "Checking your money moves" },
        'history': { title: "Past Activities", sub: "See what happened before" },
        'analytics': { title: "Safety Numbers", sub: "See how we protect you" },
        'settings': { title: "System Settings", sub: "Adjust your experience" },
        'support': { title: "Get Help", sub: "Talk to our team" },
        'admin': { title: "Staff Area", sub: "Check moves that look weird" }
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // set active
            const target = item.getAttribute('data-target');
            const targetSection = document.getElementById(target);
            
            if (targetSection) {
                navItems.forEach(nav => nav.classList.remove('active'));
                sections.forEach(sec => sec.classList.remove('active'));
                
                item.classList.add('active');
                targetSection.classList.add('active');

                // update header
                pageTitle.textContent = titles[target].title;
                pageSubtitle.textContent = titles[target].sub;

                // Optional lazy loads
                if (target === 'history') fetchHistory();
                if (target === 'admin') fetchAdminData();
            }
        });
    });

    // ---- Theme Toggle ----
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            document.documentElement.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
        });
    }

    // ---- Admin Portal Logic ----
    const adminTable = document.getElementById('admin-table-body');
    const adminLogTable = document.getElementById('admin-log-body');
    const refreshBtn = document.getElementById('refresh-admin');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchAdminData);
    }

    async function fetchAdminData() {
        try {
            const [reviewsRes, logsRes] = await Promise.all([
                fetch('/api/admin/reviews'),
                fetch('/api/admin/logs')
            ]);
            const reviews = await reviewsRes.json();
            const logs = await logsRes.json();
            
            renderAdminQueue(reviews);
            renderAdminLogs(logs);
            
            document.getElementById('stat-pending').textContent = reviews.length;
            document.getElementById('stat-decisions').textContent = logs.length;
        } catch (err) {
            console.error("Admin API failed", err);
        }
    }

    function renderAdminQueue(reviews) {
        if (!adminTable) return;
        if (reviews.length === 0) {
            adminTable.innerHTML = `<tr><td colspan="5" class="text-center py-4">No pending reviews found.</td></tr>`;
            return;
        }

        adminTable.innerHTML = '';
        reviews.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.id}</strong></td>
                <td>
                    <div class="review-details">
                        <span>$${item.amount} via ${item.channel} (${item.type})</span>
                        <span class="review-meta">Age: ${item.age} | Time: ${item.duration}s | Tries: ${item.login_attempts}</span>
                    </div>
                </td>
                <td>
                    <div class="badge badge-warning">${item.risk_score}% Risk</div>
                </td>
                <td><span class="text-muted">${item.timestamp}</span></td>
                <td>
                    <button class="btn-outline btn-small btn-success" onclick="processAdminAction('${item.id}', 'Approve')">Approve</button>
                    <button class="btn-outline btn-small btn-danger" onclick="processAdminAction('${item.id}', 'Block')">Block</button>
                    <button class="btn-outline btn-small btn-warning" onclick="processAdminAction('${item.id}', 'Investigate')">Review</button>
                </td>
            `;
            adminTable.appendChild(tr);
        });
    }

    function renderAdminLogs(logs) {
        if (!adminLogTable) return;
        if (logs.length === 0) {
            adminLogTable.innerHTML = `<tr><td colspan="4" class="text-center py-4">No actions logged yet.</td></tr>`;
            return;
        }

        adminLogTable.innerHTML = '';
        logs.forEach(log => {
            const tr = document.createElement('tr');
            const badgeClass = log.status === 'Approve' ? 'badge-success' : (log.status === 'Block' ? 'badge-danger' : 'badge-warning');
            const statusText = log.status === 'Approve' ? 'Approved' : (log.status === 'Block' ? 'Blocked' : 'Reviewed');
            tr.innerHTML = `
                <td><strong>${log.id}</strong></td>
                <td>Action: <strong>${log.status}</strong></td>
                <td><span class="badge ${badgeClass}">${statusText}</span></td>
                <td class="text-muted">${log.processed_at}</td>
            `;
            adminLogTable.appendChild(tr);
        });
    }

    window.processAdminAction = async (id, action) => {
        try {
            const res = await fetch('/api/admin/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action })
            });
            const data = await res.json();
            if (data.status === 'success') {
                fetchAdminData();
            } else {
                alert(data.message);
            }
        } catch (err) {
            console.error("Action failed", err);
        }
    };

    // ---- Prediction Form Handling ----
    const form = document.getElementById('predict-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Checking now...';

            const payload = {
                TransactionAmount: document.getElementById('TransactionAmount').value,
                AccountBalance: document.getElementById('AccountBalance').value,
                CustomerAge: document.getElementById('CustomerAge').value,
                TransactionDuration: document.getElementById('TransactionDuration').value,
                LoginAttempts: document.getElementById('LoginAttempts').value,
                Channel: document.getElementById('Channel').value,
                TransactionType: document.getElementById('TransactionType').value
            };

            try {
                const response = await fetch('/predict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                displayResult(result);
            } catch (err) {
                console.error(err);
                alert("Prediction API failed");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Check for Problems';
            }
        });
    }

    function displayResult(result) {
        document.getElementById('initial-state').classList.remove('active');
        document.getElementById('result-state').classList.add('active');

        const badge = document.getElementById('status-badge');
        const title = document.getElementById('result-title');
        const progressFill = document.getElementById('progress-fill');
        const desc = document.getElementById('result-description');

        badge.className = 'status-badge';
        progressFill.className = 'progress-fill';

        if (result.prediction === 'Suspicious') {
            badge.classList.add('suspicious');
            badge.textContent = 'High Risk';
            title.textContent = 'Something looks weird';
            title.style.color = 'var(--danger)';
            progressFill.classList.add('suspicious');
            desc.textContent = 'This move is very different from your usual activity.';
        } else {
            badge.classList.add('normal');
            badge.textContent = 'Safe';
            title.textContent = 'Looks Good';
            title.style.color = 'var(--text-main)';
            progressFill.classList.add('normal');
            desc.textContent = 'Everything looks normal.';
        }
        const score = (typeof result.risk_score === 'number') ? result.risk_score : 10;
        document.getElementById('score-value').textContent = score + "% Risk";
        
        progressFill.style.width = '0%';
        setTimeout(() => { progressFill.style.width = score + '%'; }, 50);
    }

    // ---- Fetch Analytics on Load ----
    fetch('/api/stats').then(res => res.json()).then(data => {
        document.getElementById('stat-total').textContent = data.total_transactions;
        document.getElementById('stat-fraud').textContent = data.fraud_prevented;
        document.getElementById('stat-acc').textContent = data.accuracy;
    });

    // ---- Render Chart JS ----
    const barCtx = document.getElementById('barChart');
    const doughCtx = document.getElementById('doughnutChart');
    
    if (barCtx) {
        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Money Move Volume',
                    data: [1200, 1900, 3000, 5000, 2000, 3000, 4000],
                    backgroundColor: 'rgba(211, 47, 47, 0.7)',
                    borderRadius: 5
                }]
            },
            options: { responsive: true, backgroundColor: 'transparent' }
        });
    }

    if (doughCtx) {
        new Chart(doughCtx, {
            type: 'doughnut',
            data: {
                labels: ['Real', 'Fake'],
                datasets: [{
                    data: [23750, 842],
                    backgroundColor: ['rgba(34, 197, 94, 0.8)', 'rgba(239, 68, 68, 0.8)'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, cutout: '70%'}
        });
    }

    // ---- Fetch History Function ----
    function fetchHistory() {
        const tbody = document.getElementById('history-table-body');
        if (tbody.children.length > 0) return; // already fetched

        fetch('/api/history').then(res => res.json()).then(data => {
            data.forEach(txn => {
                const tr = document.createElement('tr');
                const badgeClass = txn.status === 'Secure' ? 'text-success' : 'text-danger';
                tr.innerHTML = `
                    <td><strong>${txn.id}</strong></td>
                    <td>$${txn.amount}</td>
                    <td>${txn.type}</td>
                    <td class="text-muted">${txn.time}</td>
                    <td class="${badgeClass} font-weight-bold">${txn.status}</td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    // ---- Tracking Search Logic ----
    const trackBtn = document.getElementById('btn-track');
    const trackInput = document.getElementById('track-id');
    const trackResultBox = document.getElementById('track-result-box');
    const trackEmptyState = document.getElementById('track-empty');

    if (trackBtn && trackInput) {
        trackBtn.addEventListener('click', async () => {
            const id = trackInput.value.trim();
            if (!id) return alert("Please enter a Transaction or Account ID");

            trackBtn.disabled = true;
            trackBtn.textContent = 'Searching...';

            try {
                const res = await fetch(`/api/track/${id}`);
                const result = await res.json();

                if (result.status === 'success') {
                    const data = result.data;
                    document.getElementById('res-balance').textContent = `$${(data.balance || 0).toLocaleString()}`;
                    document.getElementById('res-amount').textContent = `$${(data.amount || 0).toLocaleString()}`;
                    
                    const statusEl = document.getElementById('res-status');
                    statusEl.textContent = data.status;
                    statusEl.style.background = data.status === 'Secure' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                    statusEl.style.color = data.status === 'Secure' ? 'var(--success)' : 'var(--danger)';
                    
                    document.getElementById('res-time').textContent = data.time || 'N/A';

                    trackResultBox.style.display = 'block';
                    trackEmptyState.style.display = 'none';
                } else {
                    alert(result.message);
                    trackResultBox.style.display = 'none';
                    trackEmptyState.style.display = 'block';
                }
            } catch (err) {
                console.error("Tracking failed", err);
                alert("Tracking system offline. Please try again later.");
            } finally {
                trackBtn.disabled = false;
                trackBtn.textContent = 'Track Now';
            }
        });
    }

    // ---- Logout Feedback Modal Logic ----
    const logoutLinks = document.querySelectorAll('.logout-link');
    const logoutModal = document.getElementById('logout-modal');
    const stars = document.querySelectorAll('.star');
    const ratingText = document.getElementById('rating-text');
    const btnSubmitLogout = document.getElementById('btn-submit-logout');
    const btnSkipLogout = document.getElementById('btn-skip-logout');

    let selectedRating = 0;

    const ratingLabels = {
        1: "Poor 😞",
        2: "Fair 😐",
        3: "Good 🙂",
        4: "Very Good 😊",
        5: "Excellent! 🤩"
    };

    if (logoutLinks.length > 0 && logoutModal) {
        logoutLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                sessionStorage.setItem('pendingLogoutUrl', link.href);
                logoutModal.style.display = 'flex';
            });
        });

        stars.forEach(star => {
            star.addEventListener('click', () => {
                selectedRating = parseInt(star.getAttribute('data-value'));
                updateStars(selectedRating);
                ratingText.textContent = ratingLabels[selectedRating];
                btnSubmitLogout.disabled = false;
            });
            star.addEventListener('mouseover', () => {
                const hoverValue = parseInt(star.getAttribute('data-value'));
                updateStars(hoverValue);
            });

            star.addEventListener('mouseout', () => {
                updateStars(selectedRating);
            });
        });

        function updateStars(value) {
            stars.forEach(s => {
                const sValue = parseInt(s.getAttribute('data-value'));
                s.classList.toggle('active', sValue <= value);
            });
        }

        btnSubmitLogout.addEventListener('click', () => {
            const logoutUrl = sessionStorage.getItem('pendingLogoutUrl') || '/logout';
            window.location.href = logoutUrl;
        });

        btnSkipLogout.addEventListener('click', () => {
            const logoutUrl = sessionStorage.getItem('pendingLogoutUrl') || '/logout';
            window.location.href = logoutUrl;
        });
    }
});
