const DEVELOPMENT_MODE = false;
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://cotacoes-frete-aikc.onrender.com/api';

let cotacoes = [];
let currentMonth = new Date();
let editingId = null;
let currentTab = 0;
let currentInfoTab = 0;
let isOnline = false;
let sessionToken = null;
let lastDataHash = '';
let currentFetchController = null;
let currentUserName = null;
const KNOWN_RESPONSAVEIS = ['ROBERTO', 'ISAQUE', 'MIGUEL', 'GUSTAVO', 'LUIZ'];
let transportadorasCache = []; // nomes carregados da app Transportadoras

const tabs = ['tab-geral', 'tab-transportadora', 'tab-detalhes'];

function detectResponsavelFromUser(name) {
    if (!name) return null;
    const upper = name.trim().toUpperCase();
    for (const r of KNOWN_RESPONSAVEIS) {
        if (upper === r || upper.startsWith(r + ' ') || upper.startsWith(r + '.')) return r;
    }
    return null;
}

console.log('🚀 Cotações de Frete iniciada');
console.log('📍 API URL:', API_URL);
console.log('🔧 Modo desenvolvimento:', DEVELOPMENT_MODE);

function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
}

function setupUpperCaseInputs() {
    const textInputs = document.querySelectorAll('input[type="text"]:not([readonly]), textarea');
    textInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = toUpperCase(this.value);
            this.setSelectionRange(start, end);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (DEVELOPMENT_MODE) {
        console.log('⚠️ MODO DESENVOLVIMENTO ATIVADO');
        sessionToken = 'dev-mode';
        inicializarApp();
    } else {
        verificarAutenticacao();
    }
});

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('cotacoesFreteSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('cotacoesFreteSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
    fetchSessionUser();
}

async function fetchSessionUser() {
    if (!sessionToken) return;
    try {
        const r = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.valid && d.session && d.session.name) currentUserName = d.session.name;
    } catch (e) { /* silencioso */ }
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    updateMonthDisplay();
    loadCotacoesDirectly();
    loadTransportadorasCache();
    setInterval(() => { if (isOnline) loadCotacoesDirectly(); }, 30000);
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}


async function loadCotacoesDirectly() {
    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();
    const signal = currentFetchController.signal;
    const mesFetch = currentMonth.getMonth();
    const anoFetch = currentMonth.getFullYear();
    try {
        const headers = { 'Accept': 'application/json' };
        if (!DEVELOPMENT_MODE && sessionToken) headers['X-Session-Token'] = sessionToken;
        const response = await fetch(
            `${API_URL}/cotacoes?mes=${mesFetch}&ano=${anoFetch}`,
            { method: 'GET', headers, mode: 'cors', cache: 'no-cache', signal }
        );
        if (!DEVELOPMENT_MODE && response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        if (!response.ok) {
            isOnline = false;
            updateConnectionStatus();
            setTimeout(() => loadCotacoesDirectly(), 5000);
            return;
        }
        const data = await response.json();
        if (mesFetch !== currentMonth.getMonth() || anoFetch !== currentMonth.getFullYear()) return;
        cotacoes = data.map(c => ({ ...c, negocioFechado: c.negocioFechado || c.status === 'fechado' || false }));
        isOnline = true;
        updateConnectionStatus();
        lastDataHash = JSON.stringify(cotacoes.map(c => c.id));
        currentFetchController = null;
        updateDisplay();
    } catch (error) {
        if (error.name === 'AbortError') return;
        isOnline = false;
        updateConnectionStatus();
        setTimeout(() => loadCotacoesDirectly(), 5000);
    }
}

// Busca nomes das transportadoras cadastradas na app Transportadoras
async function loadTransportadorasCache() {
    try {
        const TRANSP_API = 'https://transportadoras.onrender.com/api';
        const headers = { 'Accept': 'application/json' };
        if (!DEVELOPMENT_MODE && sessionToken) headers['X-Session-Token'] = sessionToken;
        const response = await fetch(`${TRANSP_API}/transportadoras?page=1&limit=200`, { headers, mode: 'cors' });
        if (!response.ok) return;
        const result = await response.json();
        const lista = Array.isArray(result) ? result : (result.data || []);
        transportadorasCache = lista.map(t => t.nome.trim().toUpperCase()).filter(Boolean).sort();
        console.log(`Transportadoras carregadas: ${transportadorasCache.length}`);
    } catch (e) {
        console.error('Erro ao carregar transportadoras:', e);
    }
}

function buildTransportadoraOptions(selectedValue = '') {
    if (!transportadorasCache.length) return '<option value="">Carregando...</option>';
    return '<option value="">Selecione...</option>' +
        transportadorasCache.map(nome =>
            `<option value="${nome}" ${nome === selectedValue ? 'selected' : ''}>${nome}</option>`
        ).join('');
}

function changeMonth(direction) {
    currentMonth.setMonth(currentMonth.getMonth() + direction);
    cotacoes = [];
    lastDataHash = '';
    updateMonthDisplay();
    const container = document.getElementById('cotacoesContainer');
    if (container) container.innerHTML = '';
    loadCotacoesDirectly();
}

function updateMonthDisplay() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthName = months[currentMonth.getMonth()];
    const year = currentMonth.getFullYear();
    document.getElementById('currentMonth').textContent = `${monthName} ${year}`;
}

function switchTab(tabId) {
    const tabIndex = tabs.indexOf(tabId);
    if (tabIndex !== -1) {
        currentTab = tabIndex;
        showTab(currentTab);
        updateNavigationButtons();
    }
}

function showTab(index) {
    const tabButtons = document.querySelectorAll('#formModal .tab-btn');
    const tabContents = document.querySelectorAll('#formModal .tab-content');
    
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    if (tabButtons[index]) tabButtons[index].classList.add('active');
    if (tabContents[index]) tabContents[index].classList.add('active');
}

function updateNavigationButtons() {
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');
    
    if (!btnPrevious || !btnNext || !btnSave) return;
    
    if (currentTab > 0) {
        btnPrevious.style.display = 'inline-flex';
    } else {
        btnPrevious.style.display = 'none';
    }
    
    if (currentTab < tabs.length - 1) {
        btnNext.style.display = 'inline-flex';
        btnSave.style.display = 'none';
    } else {
        btnNext.style.display = 'none';
        btnSave.style.display = 'inline-flex';
    }
}

function nextTab() {
    if (currentTab < tabs.length - 1) {
        currentTab++;
        showTab(currentTab);
        updateNavigationButtons();
    }
}

function previousTab() {
    if (currentTab > 0) {
        currentTab--;
        showTab(currentTab);
        updateNavigationButtons();
    }
}

function switchInfoTab(tabId) {
    const infoTabs = ['info-tab-geral', 'info-tab-transportadora', 'info-tab-detalhes'];
    const currentIndex = infoTabs.indexOf(tabId);
    
    if (currentIndex !== -1) {
        currentInfoTab = currentIndex;
    }
    
    document.querySelectorAll('#infoModal .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('#infoModal .tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const clickedBtn = event?.target?.closest('.tab-btn');
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    } else {
        document.querySelectorAll('#infoModal .tab-btn')[currentIndex]?.classList.add('active');
    }
    document.getElementById(tabId).classList.add('active');
    
    updateInfoNavigationButtons();
}

function updateInfoNavigationButtons() {
    const btnInfoPrevious = document.getElementById('btnInfoPrevious');
    const btnInfoNext = document.getElementById('btnInfoNext');
    const btnInfoClose = document.getElementById('btnInfoClose');
    
    if (!btnInfoPrevious || !btnInfoNext || !btnInfoClose) return;
    
    const totalTabs = 3;
    
    if (currentInfoTab > 0) {
        btnInfoPrevious.style.display = 'inline-flex';
    } else {
        btnInfoPrevious.style.display = 'none';
    }
    
    if (currentInfoTab < totalTabs - 1) {
        btnInfoNext.style.display = 'inline-flex';
    } else {
        btnInfoNext.style.display = 'none';
    }
    
    btnInfoClose.style.display = 'inline-flex';
}

function nextInfoTab() {
    const infoTabs = ['info-tab-geral', 'info-tab-transportadora', 'info-tab-detalhes'];
    if (currentInfoTab < infoTabs.length - 1) {
        currentInfoTab++;
        switchInfoTab(infoTabs[currentInfoTab]);
    }
}

function previousInfoTab() {
    const infoTabs = ['info-tab-geral', 'info-tab-transportadora', 'info-tab-detalhes'];
    if (currentInfoTab > 0) {
        currentInfoTab--;
        switchInfoTab(infoTabs[currentInfoTab]);
    }
}

function openFormModal() {
    editingId = null;
    currentTab = 0;
    
    const today = new Date().toISOString().split('T')[0];
    
    const modalHTML = `
        <div class="modal-overlay" id="formModal" style="display: flex;">
            <div class="modal-content" style="max-width: 1200px;">
                <div class="modal-header">
                    <h3 class="modal-title">Nova Cotação de Frete</h3>
                    <button class="close-modal" onclick="closeFormModal(true)">✕</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchTab('tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchTab('tab-transportadora')">Transportadora</button>
                        <button class="tab-btn" onclick="switchTab('tab-detalhes')">Detalhes</button>
                    </div>

                    <form id="cotacaoForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="">
                        
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="responsavel">Responsável pela Cotação</label>
                                    <input type="text" id="responsavel" value="${detectResponsavelFromUser(currentUserName) || ''}" readonly style="background:var(--input-bg);cursor:default;" tabindex="-1">
                                </div>
                                <div class="form-group">
                                    <label for="documento">Documento *</label>
                                    <input type="text" id="documento" required>
                                </div>
                                <div class="form-group">
                                    <label for="vendedor">Vendedor</label>
                                    <select id="vendedor">
                                        <option value="">Selecione...</option>
                                        <option value="ROBERTO">ROBERTO</option>
                                        <option value="ISAQUE">ISAQUE</option>
                                        <option value="MIGUEL">MIGUEL</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-transportadora">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="transportadora">Transportadora</label>
                                    <select id="transportadora">${buildTransportadoraOptions()}</select>
                                </div>
                                <div class="form-group">
                                    <label for="destino">Cidade-UF *</label>
                                    <input type="text" id="destino" required>
                                </div>
                                <div class="form-group">
                                    <label for="numeroCotacao">Número da Cotação</label>
                                    <input type="text" id="numeroCotacao">
                                </div>
                                <div class="form-group">
                                    <label for="valorFrete">Valor do Frete (R$) *</label>
                                    <input type="number" id="valorFrete" step="0.01" min="0" required>
                                </div>
                                <div class="form-group">
                                    <label for="previsaoEntrega">Previsão de Entrega</label>
                                    <input type="date" id="previsaoEntrega">
                                </div>
                                <div class="form-group">
                                    <label for="canalComunicacao">Canal de Comunicação</label>
                                    <input type="text" id="canalComunicacao" placeholder="Ex: WhatsApp, E-mail">
                                </div>
                                <div class="form-group">
                                    <label for="codigoColeta">Código de Coleta</label>
                                    <input type="text" id="codigoColeta">
                                </div>
                                <div class="form-group">
                                    <label for="responsavelTransportadora">Responsável da Transportadora</label>
                                    <input type="text" id="responsavelTransportadora">
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-detalhes">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="dataCotacao">Data da Cotação *</label>
                                    <input type="date" id="dataCotacao" value="${today}" required>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">Observações</label>
                                    <textarea id="observacoes" rows="4"></textarea>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" id="btnPrevious" onclick="previousTab()" class="secondary" style="display: none;">Anterior</button>
                            <button type="button" id="btnNext" onclick="nextTab()" class="secondary">Próximo</button>
                            <button type="submit" id="btnSave" class="save" style="display: none;">Salvar Cotação</button>
                            <button type="button" onclick="closeFormModal(true)" class="cancel-close">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    setTimeout(() => {
        setupUpperCaseInputs();
        updateNavigationButtons();
        document.getElementById('responsavel')?.focus();
    }, 100);
}

function closeFormModal(showCancelMessage = false) {
    const modal = document.getElementById('formModal');
    if (modal) {
        const editId = document.getElementById('editId')?.value;
        const isEditing = editId && editId !== '';
        
        if (showCancelMessage) {
            showToast(isEditing ? 'Atualização cancelada' : 'Registro cancelado', 'error');
        }
        
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// Continuação do script.js

async function handleSubmit(event) {
    event.preventDefault();
    
    const formData = {
        responsavel: document.getElementById('responsavel').value,
        documento: toUpperCase(document.getElementById('documento').value),
        vendedor: document.getElementById('vendedor').value,
        transportadora: document.getElementById('transportadora').value,
        destino: toUpperCase(document.getElementById('destino').value),
        numeroCotacao: toUpperCase(document.getElementById('numeroCotacao').value),
        valorFrete: parseFloat(document.getElementById('valorFrete').value) || 0,
        previsaoEntrega: document.getElementById('previsaoEntrega').value,
        canalComunicacao: toUpperCase(document.getElementById('canalComunicacao').value),
        codigoColeta: toUpperCase(document.getElementById('codigoColeta').value),
        responsavelTransportadora: toUpperCase(document.getElementById('responsavelTransportadora').value),
        dataCotacao: document.getElementById('dataCotacao').value,
        observacoes: toUpperCase(document.getElementById('observacoes').value),
        negocioFechado: false
    };
    
    if (!isOnline && !DEVELOPMENT_MODE) {
        showToast('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }

    try {
        const url = editingId ? `${API_URL}/cotacoes/${editingId}` : `${API_URL}/cotacoes`;
        const method = editingId ? 'PUT' : 'POST';

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (!DEVELOPMENT_MODE && sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const response = await fetch(url, {
            method,
            headers: headers,
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        if (!DEVELOPMENT_MODE && response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            let errorMessage = 'Erro ao salvar';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const savedData = await response.json();

        if (editingId) {
            const index = cotacoes.findIndex(c => String(c.id) === String(editingId));
            if (index !== -1) cotacoes[index] = savedData;
            showToast('Cotação atualizada com sucesso!', 'success');
        } else {
            cotacoes.push(savedData);
            showToast('Cotação criada com sucesso!', 'success');
        }

        lastDataHash = JSON.stringify(cotacoes.map(c => c.id));
        updateDisplay();
        closeFormModal();
    } catch (error) {
        console.error('Erro completo:', error);
        showToast(`Erro: ${error.message}`, 'error');
    }
}

async function editCotacao(id) {
    const cotacao = cotacoes.find(c => String(c.id) === String(id));
    if (!cotacao) {
        showToast('Cotação não encontrada!', 'error');
        return;
    }
    
    editingId = id;
    currentTab = 0;
    
    const modalHTML = `
        <div class="modal-overlay" id="formModal" style="display: flex;">
            <div class="modal-content" style="max-width: 1200px;">
                <div class="modal-header">
                    <h3 class="modal-title">Editar - ${cotacao.transportadora || "Cotação de Frete"}</h3>
                    <button class="close-modal" onclick="closeFormModal(true)">✕</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchTab('tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchTab('tab-transportadora')">Transportadora</button>
                        <button class="tab-btn" onclick="switchTab('tab-detalhes')">Detalhes</button>
                    </div>

                    <form id="cotacaoForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${cotacao.id}">
                        
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="responsavel">Responsável pela Cotação</label>
                                    <input type="text" id="responsavel" value="${toUpperCase(cotacao.responsavel || '')}" readonly style="background:var(--input-bg);cursor:default;" tabindex="-1">
                                </div>
                                <div class="form-group">
                                    <label for="documento">Documento *</label>
                                    <input type="text" id="documento" value="${toUpperCase(cotacao.documento || '')}" required>
                                </div>
                                <div class="form-group">
                                    <label for="vendedor">Vendedor</label>
                                    <select id="vendedor">
                                        <option value="">Selecione...</option>
                                        <option value="ROBERTO" ${cotacao.vendedor === 'ROBERTO' ? 'selected' : ''}>ROBERTO</option>
                                        <option value="ISAQUE" ${cotacao.vendedor === 'ISAQUE' ? 'selected' : ''}>ISAQUE</option>
                                        <option value="MIGUEL" ${cotacao.vendedor === 'MIGUEL' ? 'selected' : ''}>MIGUEL</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-transportadora">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="transportadora">Transportadora</label>
                                    <select id="transportadora">${buildTransportadoraOptions(cotacao.transportadora || '')}</select>
                                </div>
                                <div class="form-group">
                                    <label for="destino">Cidade-UF *</label>
                                    <input type="text" id="destino" value="${toUpperCase(cotacao.destino || '')}" required>
                                </div>
                                <div class="form-group">
                                    <label for="numeroCotacao">Número da Cotação</label>
                                    <input type="text" id="numeroCotacao" value="${toUpperCase(cotacao.numeroCotacao || '')}">
                                </div>
                                <div class="form-group">
                                    <label for="valorFrete">Valor do Frete (R$) *</label>
                                    <input type="number" id="valorFrete" step="0.01" min="0" value="${cotacao.valorFrete || 0}" required>
                                </div>
                                <div class="form-group">
                                    <label for="previsaoEntrega">Previsão de Entrega</label>
                                    <input type="date" id="previsaoEntrega" value="${cotacao.previsaoEntrega || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="canalComunicacao">Canal de Comunicação</label>
                                    <input type="text" id="canalComunicacao" value="${toUpperCase(cotacao.canalComunicacao || '')}" placeholder="Ex: WhatsApp, E-mail">
                                </div>
                                <div class="form-group">
                                    <label for="codigoColeta">Código de Coleta</label>
                                    <input type="text" id="codigoColeta" value="${toUpperCase(cotacao.codigoColeta || '')}">
                                </div>
                                <div class="form-group">
                                    <label for="responsavelTransportadora">Responsável da Transportadora</label>
                                    <input type="text" id="responsavelTransportadora" value="${toUpperCase(cotacao.responsavelTransportadora || '')}">
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-detalhes">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="dataCotacao">Data da Cotação *</label>
                                    <input type="date" id="dataCotacao" value="${cotacao.dataCotacao || ''}" required>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">Observações</label>
                                    <textarea id="observacoes" rows="4">${toUpperCase(cotacao.observacoes || '')}</textarea>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" id="btnPrevious" onclick="previousTab()" class="secondary" style="display: none;">Anterior</button>
                            <button type="button" id="btnNext" onclick="nextTab()" class="secondary">Próximo</button>
                            <button type="submit" id="btnSave" class="save" style="display: none;">Atualizar Cotação</button>
                            <button type="button" onclick="closeFormModal(true)" class="cancel-close">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    setTimeout(() => {
        setupUpperCaseInputs();
        updateNavigationButtons();
    }, 100);
}

async function deleteCotacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta cotação?')) return;

    if (!isOnline && !DEVELOPMENT_MODE) {
        showToast('Sistema offline. Não foi possível excluir.', 'error');
        return;
    }

    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (!DEVELOPMENT_MODE && sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const response = await fetch(`${API_URL}/cotacoes/${id}`, {
            method: 'DELETE',
            headers: headers,
            mode: 'cors'
        });

        if (!DEVELOPMENT_MODE && response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao deletar');

        cotacoes = cotacoes.filter(c => String(c.id) !== String(id));
        lastDataHash = JSON.stringify(cotacoes.map(c => c.id));
        updateDisplay();
        showToast('Cotação excluída com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao deletar:', error);
        showToast('Erro ao excluir cotação', 'error');
    }
}

async function toggleStatus(id) {
    const cotacao = cotacoes.find(c => String(c.id) === String(id));
    if (!cotacao) return;

    const novoStatus = !cotacao.negocioFechado;
    const old = { negocioFechado: cotacao.negocioFechado };
    cotacao.negocioFechado = novoStatus;
    updateDisplay();
    
    if (novoStatus) {
        showToast('Cotação marcada como aprovada!', 'success');
    } else {
        showToast('Cotação marcada como reprovada!', 'error');
    }

    if (isOnline || DEVELOPMENT_MODE) {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            
            if (!DEVELOPMENT_MODE && sessionToken) {
                headers['X-Session-Token'] = sessionToken;
            }

            const response = await fetch(`${API_URL}/cotacoes/${id}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({ negocioFechado: novoStatus }),
                mode: 'cors'
            });

            if (!DEVELOPMENT_MODE && response.status === 401) {
                sessionStorage.removeItem('cotacoesFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (!response.ok) throw new Error('Erro ao atualizar');

            const data = await response.json();
            const index = cotacoes.findIndex(c => String(c.id) === String(id));
            if (index !== -1) cotacoes[index] = data;
        } catch (error) {
            cotacao.negocioFechado = old.negocioFechado;
            updateDisplay();
            showToast('Erro ao atualizar status', 'error');
        }
    }
}

function viewCotacao(id) {
    const cotacao = cotacoes.find(c => String(c.id) === String(id));
    if (!cotacao) return;
    
    currentInfoTab = 0;
    
    document.getElementById('modalDocumento').textContent = toUpperCase(cotacao.transportadora || cotacao.documento || 'S/N');
    
    document.getElementById('info-tab-geral').innerHTML = `
        <div class="info-section">
            <h4>Informações Gerais</h4>
            <p><strong>Responsável:</strong> ${cotacao.responsavel}</p>
            <p><strong>Documento:</strong> ${toUpperCase(cotacao.documento || '')}</p>
            ${cotacao.vendedor ? `<p><strong>Vendedor:</strong> ${cotacao.vendedor}</p>` : ''}
            <p><strong>Status:</strong> <span class="badge ${cotacao.negocioFechado ? 'aprovada' : 'reprovada'}">${cotacao.negocioFechado ? 'APROVADA' : 'REPROVADA'}</span></p>
        </div>
    `;
    
    document.getElementById('info-tab-transportadora').innerHTML = `
        <div class="info-section">
            <h4>Dados da Transportadora</h4>
            <p><strong>Transportadora:</strong> ${cotacao.transportadora}</p>
            <p><strong>Destino:</strong> ${toUpperCase(cotacao.destino || '')}</p>
            ${cotacao.numeroCotacao ? `<p><strong>Número da Cotação:</strong> ${toUpperCase(cotacao.numeroCotacao)}</p>` : ''}
            <p><strong>Valor do Frete:</strong> R$ ${parseFloat(cotacao.valorFrete || 0).toFixed(2)}</p>
            ${cotacao.previsaoEntrega ? `<p><strong>Previsão de Entrega:</strong> ${formatDate(cotacao.previsaoEntrega)}</p>` : ''}
            ${cotacao.canalComunicacao ? `<p><strong>Canal de Comunicação:</strong> ${toUpperCase(cotacao.canalComunicacao)}</p>` : ''}
            ${cotacao.codigoColeta ? `<p><strong>Código de Coleta:</strong> ${toUpperCase(cotacao.codigoColeta)}</p>` : ''}
            ${cotacao.responsavelTransportadora ? `<p><strong>Responsável:</strong> ${toUpperCase(cotacao.responsavelTransportadora)}</p>` : ''}
        </div>
    `;
    
    document.getElementById('info-tab-detalhes').innerHTML = `
        <div class="info-section">
            <h4>Detalhes Adicionais</h4>
            <p><strong>Data da Cotação:</strong> ${formatDate(cotacao.dataCotacao)}</p>
            ${cotacao.observacoes ? `<p><strong>Observações:</strong> ${toUpperCase(cotacao.observacoes)}</p>` : ''}
        </div>
    `;
    
    document.querySelectorAll('#infoModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#infoModal .tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('#infoModal .tab-btn')[0].classList.add('active');
    document.getElementById('info-tab-geral').classList.add('active');
    
    document.getElementById('infoModal').classList.add('show');
    
    setTimeout(() => {
        updateInfoNavigationButtons();
    }, 100);
}

function closeInfoModal() {
    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function filterCotacoes() {
    updateTable();
}

function updateDisplay() {
    updateMonthDisplay();
    updateDashboard();
    updateTable();
    updateFilters();
}

function updateDashboard() {
    const monthCotacoes = getCotacoesForCurrentMonth();
    const totalAprovadas = monthCotacoes.filter(c => c.negocioFechado).length;
    const totalReprovadas = monthCotacoes.filter(c => !c.negocioFechado).length;
    
    document.getElementById('totalCotacoes').textContent = monthCotacoes.length;
    document.getElementById('totalAprovadas').textContent = totalAprovadas;
    document.getElementById('totalReprovadas').textContent = totalReprovadas;
}

function updateTable() {
    const container = document.getElementById('cotacoesContainer');
    let filteredCotacoes = getCotacoesForCurrentMonth();
    
    const search = document.getElementById('search').value.toLowerCase();
    const filterTransportadora = document.getElementById('filterTransportadora').value;
    const filterResponsavel = document.getElementById('filterResponsavel').value;
    const filterStatus = document.getElementById('filterStatus').value;
    
    if (search) {
        filteredCotacoes = filteredCotacoes.filter(c => 
            (c.documento || '').toLowerCase().includes(search) ||
            (c.transportadora || '').toLowerCase().includes(search) ||
            (c.destino || '').toLowerCase().includes(search) ||
            (c.responsavel || '').toLowerCase().includes(search)
        );
    }
    
    if (filterTransportadora) {
        filteredCotacoes = filteredCotacoes.filter(c => c.transportadora === filterTransportadora);
    }
    
    if (filterResponsavel) {
        filteredCotacoes = filteredCotacoes.filter(c => c.responsavel === filterResponsavel);
    }
    
    if (filterStatus) {
        if (filterStatus === 'reprovada') {
            filteredCotacoes = filteredCotacoes.filter(c => !c.negocioFechado);
        } else if (filterStatus === 'aprovada') {
            filteredCotacoes = filteredCotacoes.filter(c => c.negocioFechado);
        }
    }
    
    if (filteredCotacoes.length === 0) {
        if (currentFetchController) return; // aguarda resposta — não mostrar vazio ainda
        container.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:2rem;">Nenhum registro encontrado</td></tr>`;
        return;
    }
    
    filteredCotacoes.sort((a, b) => new Date(b.dataCotacao) - new Date(a.dataCotacao));
    
    container.innerHTML = filteredCotacoes.map(cotacao => `
        <tr class="${cotacao.negocioFechado ? 'row-aprovada' : ''}">
            <td style="text-align: center; padding: 8px;">
                <div class="checkbox-wrapper">
                    <input 
                        type="checkbox" 
                        id="check-${cotacao.id}"
                        ${cotacao.negocioFechado ? 'checked' : ''}
                        onchange="toggleStatus('${cotacao.id}')"
                        class="styled-checkbox"
                    >
                    <label for="check-${cotacao.id}" class="checkbox-label-styled"></label>
                </div>
            </td>
            <td style="white-space: nowrap;">${formatDate(cotacao.dataCotacao)}</td>
            <td><strong>${cotacao.transportadora}</strong></td>
            <td>${toUpperCase(cotacao.destino || '')}</td>
            <td>${toUpperCase(cotacao.documento || 'N/A')}</td>
            <td><strong>R$ ${parseFloat(cotacao.valorFrete || 0).toFixed(2)}</strong></td>
            <td>${formatDate(cotacao.previsaoEntrega)}</td>
            <td>
                <span class="badge ${cotacao.negocioFechado ? 'aprovada' : 'reprovada'}">${cotacao.negocioFechado ? 'APROVADA' : 'REPROVADA'}</span>
            </td>
            <td class="actions-cell">
                <div class="actions">
                    <button onclick="viewCotacao('${cotacao.id}')" class="action-btn view" title="Ver detalhes">Ver</button>
                    <button onclick="editCotacao('${cotacao.id}')" class="action-btn edit" title="Editar">Editar</button>
                    <button onclick="deleteCotacao('${cotacao.id}')" class="action-btn delete" title="Excluir">Excluir</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateFilters() {
    // Transportadoras: sempre do cache da app Transportadoras
    const selectTransportadora = document.getElementById('filterTransportadora');
    if (selectTransportadora) {
        const currentValue = selectTransportadora.value;
        selectTransportadora.innerHTML = '<option value="">Transportadora</option>';
        transportadorasCache.forEach(nome => {
            const option = document.createElement('option');
            option.value = nome;
            option.textContent = nome;
            selectTransportadora.appendChild(option);
        });
        if (transportadorasCache.includes(currentValue)) selectTransportadora.value = currentValue;
    }

    // Responsáveis: dos registros do mês
    const responsaveis = new Set();
    cotacoes.forEach(c => { if (c.responsavel?.trim()) responsaveis.add(c.responsavel.trim()); });
    const selectResponsavel = document.getElementById('filterResponsavel');
    if (selectResponsavel) {
        const currentValue = selectResponsavel.value;
        selectResponsavel.innerHTML = '<option value="">Responsável</option>';
        Array.from(responsaveis).sort().forEach(r => {
            const option = document.createElement('option');
            option.value = r;
            option.textContent = r;
            selectResponsavel.appendChild(option);
        });
        selectResponsavel.value = currentValue;
    }
}

function getCotacoesForCurrentMonth() {
    // Os dados em `cotacoes` já foram buscados filtrados pelo mês/ano no servidor
    return cotacoes;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function formatCurrency(value) {
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

function showToast(message, type = 'success') {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}
