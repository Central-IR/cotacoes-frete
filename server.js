require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// ======== CONFIGURAÇÃO DO SUPABASE ========
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

// ==========================================
// ======== MIDDLEWARES GLOBAIS =============
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'Accept'],
    credentials: false
}));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token, Accept');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requisições
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==========================================
// ======== CONFIGURAÇÃO DE ARQUIVOS ========
// ==========================================
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';
console.log('🔐 Portal URL configurado:', PORTAL_URL);

// Determinar o caminho correto para os arquivos públicos
const publicPath = path.join(__dirname, 'public');
console.log('📁 Pasta public:', publicPath);

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
async function verificarAutenticacao(req, res, next) {
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    console.log('🔑 Token recebido:', sessionToken ? `${sessionToken.substring(0, 20)}...` : 'NENHUM');

    if (!sessionToken) {
        console.log('❌ Token não encontrado');
        return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de sessão não encontrado',
            redirectToLogin: true
        });
    }

    try {
        console.log('🔍 Verificando sessão no portal:', PORTAL_URL);
        
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        console.log('📊 Resposta do portal:', verifyResponse.status);

        if (!verifyResponse.ok) {
            console.log('❌ Resposta não OK do portal');
            return res.status(401).json({
                error: 'Sessão inválida',
                message: 'Sua sessão expirou ou foi invalidada',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();
        console.log('📋 Dados da sessão:', sessionData.valid ? 'VÁLIDA' : 'INVÁLIDA');

        if (!sessionData.valid) {
            console.log('❌ Sessão marcada como inválida pelo portal');
            return res.status(401).json({
                error: 'Sessão inválida',
                message: sessionData.message || 'Sua sessão expirou',
                redirectToLogin: true
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;

        console.log('✅ Autenticação bem-sucedida para:', sessionData.session?.username);
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return res.status(500).json({
            error: 'Erro interno',
            message: 'Erro ao verificar autenticação'
        });
    }
}

// ==========================================
// ======== HEALTH CHECK (PÚBLICO) ==========
// ==========================================
app.get('/health', async (req, res) => {
    console.log('💚 Health check requisitado');
    try {
        const { error } = await supabase
            .from('cotacoes')
            .select('count', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            supabase_url: supabaseUrl,
            portal_url: PORTAL_URL,
            timestamp: new Date().toISOString(),
            publicPath: publicPath,
            authentication: 'enabled',
            cors: 'enabled - all origins'
        });
    } catch (error) {
        res.json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==========================================
// ======== ROTAS DA API ====================
// ==========================================

// Aplicar autenticação em todas as rotas da API
app.use('/api', verificarAutenticacao);

// Listar todas as cotações
app.get('/api/cotacoes', async (req, res) => {
    try {
        console.log('🔍 Buscando cotações...');
        const { data, error } = await supabase
            .from('cotacoes')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar:', error);
            throw error;
        }
        
        console.log(`✅ ${data.length} cotações encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar cotações', 
            details: error.message 
        });
    }
});

// Buscar cotação específica
app.get('/api/cotacoes/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cotacoes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Cotação não encontrada' });
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao buscar cotação', 
            details: error.message 
        });
    }
});

// Criar nova cotação
app.post('/api/cotacoes', async (req, res) => {
    try {
        console.log('📝 Criando cotação:', req.body);
        
        const novaCotacao = {
            ...req.body,
            id: Date.now().toString(),
            timestamp: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('cotacoes')
            .insert([novaCotacao])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar:', error);
            throw error;
        }
        
        console.log('✅ Cotação criada:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao criar cotação', 
            details: error.message 
        });
    }
});

// Atualizar cotação
app.put('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log('✏️ Atualizando cotação:', req.params.id);
        
        const { data, error } = await supabase
            .from('cotacoes')
            .update({
                ...req.body,
                updatedAt: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Cotação não encontrada' });
        }
        
        console.log('✅ Cotação atualizada');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar cotação', 
            details: error.message 
        });
    }
});

// Atualizar status da cotação (PATCH)
app.patch('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log('🔄 Atualizando status da cotação:', req.params.id);
        
        const { data, error } = await supabase
            .from('cotacoes')
            .update({
                ...req.body,
                updatedAt: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Cotação não encontrada' });
        }
        
        console.log('✅ Status atualizado');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar status', 
            details: error.message 
        });
    }
});

// Deletar cotação
app.delete('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log('🗑️ Deletando cotação:', req.params.id);
        
        const { error } = await supabase
            .from('cotacoes')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        
        console.log('✅ Cotação deletada');
        res.status(204).end();
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir cotação', 
            details: error.message 
        });
    }
});

// ==========================================
// ======== SERVIR ARQUIVOS ESTÁTICOS =======
// ==========================================

// Middleware para servir arquivos estáticos
app.use(express.static(publicPath, {
    index: false, // Não servir automaticamente index.html
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
    }
}));

// Rotas para servir o index.html
app.get(['/', '/app'], (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    console.log('📄 Servindo index.html de:', indexPath);
    
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('❌ Erro ao servir index.html:', err);
            res.status(500).json({
                error: 'Erro ao carregar aplicação',
                message: 'Não foi possível carregar o arquivo index.html',
                details: err.message
            });
        }
    });
});

// ==========================================
// ======== ROTA 404 ========================
// ==========================================
app.use((req, res) => {
    console.log('❌ Rota não encontrada:', req.path);
    res.status(404).json({
        error: '404 - Rota não encontrada',
        path: req.path,
        availableRoutes: {
            interface: 'GET /',
            health: 'GET /health',
            api: 'GET /api/cotacoes'
        }
    });
});

// ==========================================
// ======== TRATAMENTO DE ERROS =============
// ==========================================
app.use((error, req, res, next) => {
    console.error('💥 Erro no servidor:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
    });
});

// ==========================================
// ======== INICIAR SERVIDOR ================
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ================================');
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Database: Supabase`);
    console.log(`🔗 Supabase URL: ${supabaseUrl}`);
    console.log(`📁 Public folder: ${publicPath}`);
    console.log(`🔐 Autenticação: Ativa ✅`);
    console.log(`🌐 Portal URL: ${PORTAL_URL}`);
    console.log(`🌍 CORS: Liberado para todos`);
    console.log(`🔓 Rotas públicas: /, /health, /app`);
    console.log('🚀 ================================\n');
    
    // Verificar se pasta public existe
    const fs = require('fs');
    if (!fs.existsSync(publicPath)) {
        console.error('⚠️ AVISO: Pasta public/ não encontrada!');
        console.error('📁 Crie a pasta e adicione os arquivos:');
        console.error('   - public/index.html');
        console.error('   - public/styles.css');
        console.error('   - public/script.js');
    } else {
        console.log('✅ Pasta public/ encontrada');
        
        // Listar arquivos na pasta public
        const files = fs.readdirSync(publicPath);
        console.log('📄 Arquivos na pasta public:');
        files.forEach(file => console.log(`   - ${file}`));
    }
});
