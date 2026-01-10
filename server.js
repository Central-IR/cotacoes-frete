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
// ======== CORS - CONFIGURAÇÃO ÚNICA =======
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'Accept'],
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requisições
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';
console.log('🔐 Portal URL configurado:', PORTAL_URL);

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health', '/app'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    if (!sessionToken) {
        console.log('❌ Token não encontrado');
        return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de sessão não encontrado',
            redirectToLogin: true
        });
    }

    try {
        // TIMEOUT de 5 segundos para verificação do portal
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!verifyResponse.ok) {
            console.log('❌ Resposta não OK do portal:', verifyResponse.status);
            return res.status(401).json({
                error: 'Sessão inválida',
                message: 'Sua sessão expirou ou foi invalidada',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();

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
        console.log('✅ Autenticação OK:', sessionData.session?.username);
        next();

    } catch (error) {
        console.error('⚠️ Erro ao verificar autenticação:', error.message);
        
        // Se for timeout ou erro de rede, permitir acesso temporário
        if (error.name === 'AbortError' || error.code === 'ENOTFOUND') {
            console.log('⚠️ Portal indisponível - permitindo acesso temporário');
            req.user = { username: 'temp' };
            req.sessionToken = sessionToken;
            return next();
        }

        return res.status(500).json({
            error: 'Erro interno',
            message: 'Erro ao verificar autenticação'
        });
    }
}

// ==========================================
// ======== SERVIR ARQUIVOS ESTÁTICOS =======
// ==========================================
const publicPath = path.join(__dirname, 'public');
console.log('📂 Pasta public:', publicPath);

app.use(express.static(publicPath, {
    index: 'index.html',
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

// ==========================================
// ======== HEALTH CHECK (PÚBLICO) ==========
// ==========================================
app.get('/health', async (req, res) => {
    console.log('💚 Health check requisitado');
    try {
        const { error, count } = await supabase
            .from('cotacoes')
            .select('*', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            supabase_url: supabaseUrl,
            portal_url: PORTAL_URL,
            timestamp: new Date().toISOString(),
            authentication: 'enabled',
            cors: 'enabled',
            recordCount: count || 0
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==========================================
// ======== ROTAS DA API ====================
// ==========================================

app.use('/api', verificarAutenticacao);

// Listar todas as cotações
app.get('/api/cotacoes', async (req, res) => {
    try {
        console.log('📋 Buscando cotações...');
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
// ======== ROTA PRINCIPAL (PÚBLICO) ========
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ==========================================
// ======== ROTA 404 ========================
// ==========================================
app.use((req, res) => {
    console.log('❌ Rota não encontrada:', req.path);
    res.status(404).json({
        error: '404 - Rota não encontrada',
        path: req.path
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
    console.log(`🔐 Autenticação: Ativa ✅`);
    console.log(`🌐 Portal URL: ${PORTAL_URL}`);
    console.log(`🌐 CORS: Liberado`);
    console.log('🚀 ================================\n');
});

// Verificar pasta public
const fs = require('fs');
if (!fs.existsSync(publicPath)) {
    console.error('⚠️ AVISO: Pasta public/ não encontrada!');
}
