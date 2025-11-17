// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://cotacoes-frete-aikc.onrender.com/api';

let cotacoes = [];
let isOnline = false;
let lastDataHash = '';
let sessionToken = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

console.log('🚀 Cotações de Frete iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ============================================
// NAVEGAÇÃO POR MESES
// ============================================
function updateMonthDisplay() {
    const display = document.getElementById('currentMonthDisplay');
    if (display) {
        display.textContent = `${meses[currentMonth]} ${currentYear}`;
    }
    filterCotacoes();
}

window.previousMonth = function() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    updateMonthDisplay();
};

window.nextMonth = function() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    updateMonthDisplay();
};

// ============================================
// MODAL DE CONFIRMAÇÃO PERSONALIZADO
// ============================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal" style="z-index: 10001;">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p style="margin: 1.5rem 0; color: var(--text-primary); font-size: 1rem; line-height: 1.6;">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'success'}" id="modalConfirmBtn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('confirmModal');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { 
                modal.remove(); 
                resolve(result); 
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));

        if (!document.querySelector('#modalAnimations')) {
            const style = document.createElement('style');
            style.id = 'modalAnimations';
            style.textContent = `@keyframes fadeOut { to { opacity: 0; } }`;
            document.head.appendChild(style);
        }
    });
}

// ============================================
// AUTENTICAÇÃO
// ============================================
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
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

// ============================================
// CONEXÃO E STATUS
// ============================================
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/cotacoes`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ SERVIDOR ONLINE');
            await loadCotacoes();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
        if (statusText) {
            statusText.textContent = isOnline ? 'Online' : 'Offline';
        }
    }
}

// ============================================
// MAPEAMENTO DE COLUNAS - CORRIGIDO
// ============================================
function mapearCotacao(cotacao) {
    // CORREÇÃO: Normalizar responsável
    let responsavel = cotacao.responsavel || cotacao.RESPONSAVEL || '';
    if (responsavel.toLowerCase() === 'gustavo') responsavel = 'GUSTAVO';
    if (responsavel.toLowerCase() === 'isaque') responsavel = 'ISAQUE';

    return {
        id: cotacao.id,
        timestamp: cotacao.timestamp,
        responsavel: responsavel,
        documento: cotacao.documento || cotacao.DOCUMENTO || '',
        vendedor: cotacao.vendedor || cotacao.VENDEDOR || '',
        transportadora: cotacao.transportadora || cotacao.TRANSPORTADORA || '',
        destino: cotacao.destino || cotacao.DESTINO || '',
        numeroCotacao: cotacao.numeroCotacao || cotacao.NUMEROCOTACAO || '',
        valorFrete: cotacao.valorFrete || cotacao.VALORFRETE || cotacao.valor || cotacao.VALOR || 0,
        previsaoEntrega: cotacao.previsaoEntrega || cotacao.PREVISAOENTREGA || cotacao.previsao || cotacao.PREVISAO || '',
        canalComunicacao: cotacao.canalComunicacao || cotacao.CANALCOMUNICACAO || '',
        codigoColeta: cotacao.codigoColeta || cotacao.CODIGOCOLETA || '',
        responsavelTransportadora: cotacao.responsavelTransportadora || cotacao.RESPONSAVELTRANSPORTADORA || '',
        dataCotacao: cotacao.dataCotacao || cotacao.DATACOTACAO || cotacao.data || cotacao.DATA || '',
        observacoes: cotacao.observacoes || cotacao.OBSERVACOES || '',
        negocioFechado: cotacao.negocioFechado || cotacao.NEGOCIOFECHADO || cotacao.status === 'fechado' || cotacao.STATUS === 'FECHADO' || false
    };
}

// ============================================
// CARREGAMENTO DE DADOS
// ============================================
async function loadCotacoes() {
    if (!isOnline) return;

    try {
        const response = await fetch(`${API_URL}/cotacoes`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        cotacoes = data.map(mapearCotacao);
        
        const newHash = JSON.stringify(cotacoes.map(c => c.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            console.log(`${cotacoes.length} cotações carregadas`);
            updateAllFilters();
            filterCotacoes();
        }
    } catch (error) {
        console.error('Erro ao carregar:', error);
    }
}

function startPolling() {
    loadCotacoes();
    setInterval(() => {
        if (isOnline) loadCotacoes();
    }, 10000);
}

// ============================================
// TOGGLE NEGÓCIO FECHADO
// ============================================
window.toggleNegocioFechado = async function(id) {
    const idStr = String(id);
    const cotacao = cotacoes.find(c => String(c.id) === idStr);
    if (!cotacao) return;

    const novoStatus = !cotacao.negocioFechado;
    cotacao.negocioFechado = novoStatus;
    filterCotacoes();
    
    showMessage(`Negócio marcado como ${novoStatus ? 'aprovado' : 'reprovado'}!`, 'success');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/cotacoes/${idStr}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(cotacao),
                mode: 'cors'
            });

            if (!response.ok) throw new Error('Erro ao atualizar');

            const savedData = await response.json();
            const index = cotacoes.findIndex(c => String(c.id) === idStr);
            if (index !== -1) cotacoes[index] = mapearCotacao(savedData);
        } catch (error) {
            cotacao.negocioFechado = !novoStatus;
            filterCotacoes();
            showMessage('Erro ao atualizar status', 'error');
        }
    }
};

// ============================================
// FORMULÁRIO - CORRIGIDO
// ============================================
window.toggleForm = function() {
    showFormModal(null);
};

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    let cotacao = null;
    
    if (isEditing) {
        const idStr = String(editingId);
        cotacao = cotacoes.find(c => String(c.id) === idStr);
        
        if (!cotacao) {
            showMessage('Cotação não encontrada!', 'error');
            return;
        }
    }

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Cotação' : 'Nova Cotação'}</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchFormTab(0)">Geral</button>
                        <button class="tab-btn" onclick="switchFormTab(1)">Transportadora</button>
                        <button class="tab-btn" onclick="switchFormTab(2)">Detalhes</button>
                    </div>

                    <form id="cotacaoForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="responsavel">Responsável pela Cotação *</label>
                                    <select id="responsavel" required>
                                        <option value="">Selecione...</option>
                                        <option value="ROBERTO" ${cotacao?.responsavel === 'ROBERTO' ? 'selected' : ''}>ROBERTO</option>
                                        <option value="ISAQUE" ${cotacao?.responsavel === 'ISAQUE' ? 'selected' : ''}>ISAQUE</option>
                                        <option value="MIGUEL" ${cotacao?.responsavel === 'MIGUEL' ? 'selected' : ''}>MIGUEL</option>
                                        <option value="GUSTAVO" ${cotacao?.responsavel === 'GUSTAVO' ? 'selected' : ''}>GUSTAVO</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="documento">Documento *</label>
                                    <input type="text" id="documento" value="${cotacao?.documento || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="vendedor">Vendedor</label>
                                    <select id="vendedor">
                                        <option value="">Selecione...</option>
                                        <option value="ROBERTO" ${cotacao?.vendedor === 'ROBERTO' ? 'selected' : ''}>ROBERTO</option>
                                        <option value="ISAQUE" ${cotacao?.vendedor === 'ISAQUE' ? 'selected' : ''}>ISAQUE</option>
                                        <option value="MIGUEL" ${cotacao?.vendedor === 'MIGUEL' ? 'selected' : ''}>MIGUEL</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-transportadora">
                            <div class="form-grid">
                                <div class="form-group">
                                     <label for="transportadora">Transportadora</label>
                                    <select id="transportadora">
                                        <option value="">Selecione...</option>
                                        <option value="TNT MERCÚRIO" ${cotacao?.transportadora === 'TNT MERCÚRIO' ? 'selected' : ''}>TNT MERCÚRIO</option>
                                        <option value="JAMEF" ${cotacao?.transportadora === 'JAMEF' ? 'selected' : ''}>JAMEF</option>
                                        <option value="BRASPRESS" ${cotacao?.transportadora === 'BRASPRESS' ? 'selected' : ''}>BRASPRESS</option>
                                        <option value="GENEROSO" ${cotacao?.transportadora === 'GENEROSO' ? 'selected' : ''}>GENEROSO</option>
                                        <option value="CONTINENTAL" ${cotacao?.transportadora === 'CONTINENTAL' ? 'selected' : ''}>CONTINENTAL</option>
                                        <option value="JEOLOG" ${cotacao?.transportadora === 'JEOLOG' ? 'selected' : ''}>JEOLOG</option>
                                        <option value="TG TRANSPORTES" ${cotacao?.transportadora === 'TG TRANSPORTES' ? 'selected' : ''}>TG TRANSPORTES</option>
                                        <option value="CORREIOS" ${cotacao?.transportadora === 'CORREIOS' ? 'selected' : ''}>CORREIOS</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="destino">Cidade-UF *</label>
                                    <input type="text" id="destino" value="${cotacao?.destino || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="numeroCotacao">Número da Cotação</label>
                                    <input type="text" id="numeroCotacao" value="${cotacao?.numeroCotacao || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="valorFrete">Valor do Frete (R$) *</label>
                                    <input type="number" id="valorFrete" step="0.01" min="0" value="${cotacao?.valorFrete || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="previsaoEntrega">Previsão de Entrega</label>
                                    <input type="date" id="previsaoEntrega" value="${cotacao?.previsaoEntrega || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="canalComunicacao">Canal de Comunicação</label>
                                    <input type="text" id="canalComunicacao" value="${cotacao?.canalComunicacao || ''}" placeholder="Ex: WhatsApp, E-mail">
                                </div>
                                <div class="form-group">
                                    <label for="codigoColeta">Código de Coleta</label>
                                    <input type="text" id="codigoColeta" value="${cotacao?.codigoColeta || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="responsavelTransportadora">Responsável da Transportadora</label>
                                    <input type="text" id="responsavelTransportadora" value="${cotacao?.responsavelTransportadora || ''}">
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-detalhes">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="dataCotacao">Data da Cotação *</label>
                                    <input type="date" id="dataCotacao" value="${cotacao?.dataCotacao || new Date().toISOString().split('T')[0]}" required>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">Observações</label>
                                    <textarea id="observacoes" rows="4">${cotacao?.observacoes || ''}</textarea>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="submit" class="save">${isEditing ? 'Atualizar' : 'Salvar'}</button>
                            <button type="button" class="secondary" onclick="closeFormModal()">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const camposMaiusculas = ['documento', 'destino', 'numeroCotacao', 'canalComunicacao', 
                               'codigoColeta', 'responsavelTransportadora', 'observacoes'];

    camposMaiusculas.forEach(campoId => {
        const campo = document.getElementById(campoId);
        if (campo) {
            campo.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(start, start);
            });
        }
    });
    
    setTimeout(() => document.getElementById('responsavel')?.focus(), 100);
}

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================
// SISTEMA DE ABAS - CORRIGIDO
// ============================================
window.switchFormTab = function(index) {
    // Aguarda um pequeno delay para garantir que o DOM está pronto
    setTimeout(() => {
        const modal = document.getElementById('formModal');
        if (!modal) return;
        
        const tabButtons = modal.querySelectorAll('.tab-btn');
        const tabContents = modal.querySelectorAll('.tab-content');
        
        tabButtons.forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        tabContents.forEach((content, i) => {
            if (i === index) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }, 10);
};

// ============================================
// SUBMIT - CORRIGIDO
// ============================================
async function handleSubmit(event) {
    if (event) event.preventDefault();

    const formData = {
        responsavel: document.getElementById('responsavel').value.trim(),
        documento: document.getElementById('documento').value.trim(),
        vendedor: document.getElementById('vendedor').value.trim(),
        transportadora: document.getElementById('transportadora').value.trim(),
        destino: document.getElementById('destino').value.trim(),
        numeroCotacao: document.getElementById('numeroCotacao').value.trim(),
        valorFrete: parseFloat(document.getElementById('valorFrete').value),
        previsaoEntrega: document.getElementById('previsaoEntrega').value.trim(),
        canalComunicacao: document.getElementById('canalComunicacao').value.trim(),
        codigoColeta: document.getElementById('codigoColeta').value.trim(),
        responsavelTransportadora: document.getElementById('responsavelTransportadora').value.trim(),
        dataCotacao: document.getElementById('dataCotacao').value,
        observacoes: document.getElementById('observacoes').value.trim(),
        negocioFechado: false
    };

    const editId = document.getElementById('editId').value;

    if (editId) {
        const cotacaoExistente = cotacoes.find(c => String(c.id) === String(editId));
        if (cotacaoExistente) {
            formData.negocioFechado = cotacaoExistente.negocioFechado;
            formData.timestamp = cotacaoExistente.timestamp;
        }
    }

    if (!isOnline) {
        showMessage('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }

    try {
        const url = editId ? `${API_URL}/cotacoes/${editId}` : `${API_URL}/cotacoes`;
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Erro ao salvar');
        }

        const savedData = await response.json();
        const mappedData = mapearCotacao(savedData);

        if (editId) {
            const index = cotacoes.findIndex(c => String(c.id) === String(editId));
            if (index !== -1) cotacoes[index] = mappedData;
            showMessage('Cotação atualizada!', 'success');
        } else {
            cotacoes.push(mappedData);
            showMessage('Cotação criada!', 'success');
        }

        lastDataHash = JSON.stringify(cotacoes.map(c => c.id));
        updateAllFilters();
        filterCotacoes();
        closeFormModal();

    } catch (error) {
        console.error('Erro:', error);
        showMessage(`Erro: ${error.message}`, 'error');
        closeFormModal();
    }
}

// ============================================
// EDIÇÃO
// ============================================
window.editCotacao = function(id) {
    const idStr = String(id);
    const cotacao = cotacoes.find(c => String(c.id) === idStr);
    
    if (!cotacao) {
        showMessage('Cotação não encontrada!', 'error');
        return;
    }
    
    showFormModal(idStr);
};

// ============================================
// EXCLUSÃO
// ============================================
window.deleteCotacao = async function(id) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir esta cotação?',
        {
            title: 'Excluir Cotação',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

    if (!confirmed) return;

    const idStr = String(id);
    const deletedCotacao = cotacoes.find(c => String(c.id) === idStr);
    cotacoes = cotacoes.filter(c => String(c.id) !== idStr);
    updateAllFilters();
    filterCotacoes();
    showMessage('Cotação excluída!', 'success');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/cotacoes/${idStr}`, {
                method: 'DELETE',
                headers: {
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            if (!response.ok) throw new Error('Erro ao deletar');
        } catch (error) {
            if (deletedCotacao) {
                cotacoes.push(deletedCotacao);
                updateAllFilters();
                filterCotacoes();
                showMessage('Erro ao excluir', 'error');
            }
        }
    }
};

// ============================================
// VISUALIZAÇÃO
// ============================================
window.viewCotacao = function(id) {
    const idStr = String(id);
    const cotacao = cotacoes.find(c => String(c.id) === idStr);
    
    if (!cotacao) {
        showMessage('Cotação não encontrada!', 'error');
        return;
    }

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Cotação</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab(0)">Geral</button>
                        <button class="tab-btn" onclick="switchViewTab(1)">Transportadora</button>
                        <button class="tab-btn" onclick="switchViewTab(2)">Detalhes</button>
                    </div>

                    <div class="tab-content active" id="view-tab-geral">
                        <div class="info-section">
                            <h4>Informações Gerais</h4>
                            <p><strong>Responsável:</strong> ${cotacao.responsavel}</p>
                            <p><strong>Documento:</strong> ${cotacao.documento}</p>
                            ${cotacao.vendedor ? `<p><strong>Vendedor:</strong> ${cotacao.vendedor}</p>` : ''}
                            <p><strong>Status:</strong> <span class="badge ${cotacao.negocioFechado ? 'fechada' : 'aberta'}">${cotacao.negocioFechado ? 'APROVADA' : 'REPROVADA'}</span></p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-transportadora">
                        <div class="info-section">
                            <h4>Dados da Transportadora</h4>
                            <p><strong>Transportadora:</strong> ${cotacao.transportadora}</p>
                            <p><strong>Destino:</strong> ${cotacao.destino}</p>
                            ${cotacao.numeroCotacao ? `<p><strong>Número da Cotação:</strong> ${cotacao.numeroCotacao}</p>` : ''}
                            <p><strong>Valor do Frete:</strong> R$ ${parseFloat(cotacao.valorFrete).toFixed(2)}</p>
                            ${cotacao.previsaoEntrega ? `<p><strong>Previsão de Entrega:</strong> ${formatDateDDMMYYYY(cotacao.previsaoEntrega)}</p>` : ''}
                            ${cotacao.canalComunicacao ? `<p><strong>Canal de Comunicação:</strong> ${cotacao.canalComunicacao}</p>` : ''}
                            ${cotacao.codigoColeta ? `<p><strong>Código de Coleta:</strong> ${cotacao.codigoColeta}</p>` : ''}
                            ${cotacao.responsavelTransportadora ? `<p><strong>Responsável:</strong> ${cotacao.responsavelTransportadora}</p>` : ''}
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-detalhes">
                        <div class="info-section">
                            <h4>Detalhes Adicionais</h4>
                            <p><strong>Data da Cotação:</strong> ${formatDate(cotacao.dataCotacao)}</p>
                            ${cotacao.observacoes ? `<p><strong>Observações:</strong> ${cotacao.observacoes}</p>` : ''}
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="secondary" onclick="closeViewModal()">Fechar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

window.switchViewTab = function(index) {
    setTimeout(() => {
        const modal = document.getElementById('viewModal');
        if (!modal) return;
        
        const tabButtons = modal.querySelectorAll('.tab-btn');
        const tabContents = modal.querySelectorAll('.tab-content');
        
        tabButtons.forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        tabContents.forEach((content, i) => {
            if (i === index) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }, 10);
};

// ============================================
// FILTROS - ATUALIZAÇÃO DINÂMICA
// ============================================
function updateAllFilters() {
    updateTransportadorasFilter();
    updateResponsaveisFilter();
}

function updateTransportadorasFilter() {
    const transportadoras = new Set();
    cotacoes.forEach(c => {
        if (c.transportadora?.trim()) {
            transportadoras.add(c.transportadora.trim());
        }
    });

    const select = document.getElementById('filterTransportadora');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todas</option>';
        Array.from(transportadoras).sort().forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

function updateResponsaveisFilter() {
    const responsaveis = new Set();
    cotacoes.forEach(c => {
        if (c.responsavel?.trim()) {
            responsaveis.add(c.responsavel.trim());
        }
    });

    const select = document.getElementById('filterResponsavel');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos</option>';
        Array.from(responsaveis).sort().forEach(r => {
            const option = document.createElement('option');
            option.value = r;
            option.textContent = r;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

// ============================================
// FILTROS E RENDERIZAÇÃO
// ============================================
function filterCotacoes() {
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const filterTransportadora = document.getElementById('filterTransportadora')?.value || '';
    const filterResponsavel = document.getElementById('filterResponsavel')?.value || '';
    const filterStatus = document.getElementById('filterStatus')?.value || '';
    
    let filtered = [...cotacoes];

    filtered = filtered.filter(c => {
        const data = new Date(c.dataCotacao + 'T00:00:00');
        return data.getMonth() === currentMonth && data.getFullYear() === currentYear;
    });

    if (filterTransportadora) {
        filtered = filtered.filter(c => c.transportadora === filterTransportadora);
    }

    if (filterResponsavel) {
        filtered = filtered.filter(c => c.responsavel === filterResponsavel);
    }

    if (filterStatus) {
        filtered = filtered.filter(c => {
            if (filterStatus === 'aberto') return !c.negocioFechado;
            if (filterStatus === 'fechado') return c.negocioFechado;
            return true;
        });
    }

    if (searchTerm) {
        filtered = filtered.filter(c => 
            c.transportadora?.toLowerCase().includes(searchTerm) ||
            c.destino?.toLowerCase().includes(searchTerm) ||
            c.documento?.toLowerCase().includes(searchTerm) ||
            c.numeroCotacao?.toLowerCase().includes(searchTerm) ||
            c.responsavel?.toLowerCase().includes(searchTerm)
        );
    }

    filtered.sort((a, b) => new Date(b.dataCotacao) - new Date(a.dataCotacao));
    renderCotacoes(filtered);
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderCotacoes(cotacoesToRender) {
    const container = document.getElementById('cotacoesContainer');
    
    if (!container) return;
    
    if (!cotacoesToRender || cotacoesToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma cotação encontrada para este período</div>';
        return;
    }

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th style="text-align: center; width: 60px;"> </th>
                        <th>Data</th>
                        <th>Transportadora</th>
                        <th>Destino</th>
                        <th>Documento</th>
                        <th>Valor</th>
                        <th>Previsão</th>
                        <th>Status</th>
                        <th style="text-align: center; min-width: 260px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${cotacoesToRender.map(c => `
                        <tr class="${c.negocioFechado ? 'fechada' : ''}">
                            <td style="text-align: center;">
                                <button class="check-btn ${c.negocioFechado ? 'checked' : ''}" 
                                        onclick="toggleNegocioFechado('${c.id}')" 
                                        title="${c.negocioFechado ? 'Marcar como reprovada' : 'Marcar como aprovada'}">
                                        ✓
                                </button>
                            </td>
                            <td>${formatDate(c.dataCotacao)}</td>
                            <td><strong>${c.transportadora}</strong></td>
                            <td>${c.destino}</td>
                            <td>${c.documento || 'N/A'}</td>
                            <td><strong>R$ ${parseFloat(c.valorFrete).toFixed(2)}</strong></td>
                            <td>${formatDateDDMMYYYY(c.previsaoEntrega)}</td>
                            <td>
                                <span class="badge ${c.negocioFechado ? 'fechada' : 'aberta'}">
                                    ${c.negocioFechado ? 'APROVADA' : 'REPROVADA'}
                                </span>
                            </td>
                            <td class="actions-cell" style="text-align: center;">
                                <button onclick="viewCotacao('${c.id}')" class="action-btn view">Ver</button>
                                <button onclick="editCotacao('${c.id}')" class="action-btn edit">Editar</button>
                                <button onclick="deleteCotacao('${c.id}')" class="action-btn delete">Excluir</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
}

// ============================================
// UTILIDADES
// ============================================
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function formatDateDDMMYYYY(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function showMessage(message, type) {
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
