require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Tatuador Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// ==========================================
// 2. BASE DE DATOS LOCAL
// ==========================================
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {}, fichas: {} };
const DATA_FILE = path.join('/tmp', 'database.json');

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        if (!db.fichas) db.fichas = {};
    } catch (e) { console.log("Error al cargar DB"); }
}

function guardar() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.log("Error al guardar"); }
}

// ==========================================
// 3. UTILIDADES DE TRADUCCIÓN
// ==========================================
function traducirTerminos(texto) {
    if (!texto) return "";
    const diccionario = {
        'blanco y negro': 'black and gray',
        'color': 'full color',
        'realismo': 'photorealistic',
        'antebrazo': 'forearm',
        'bíceps': 'biceps',
        'hombro': 'shoulder',
        'costillas': 'ribs',
        'espalda': 'back',
        'lobo': 'wolf',
        'león': 'lion',
        'calavera': 'skull',
        'hiperrealista': 'hyper-realistic masterpiece, 8k',
        'minimalista': 'clean minimalist'
    };

    let traducido = texto.toLowerCase().trim();
    for (const [es, en] of Object.entries(diccionario)) {
        const regex = new RegExp(`\\b${es}\\b`, 'g');
        traducido = traducido.replace(regex, en);
    }
    return traducido;
}

// ==========================================
// 4. LÓGICA DE PRESUPUESTO
// ==========================================
function calcularPresupuesto(tamanoStr, zona, estilo, tieneFoto) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    let estimado = cms <= 5 ? "30€" : cms <= 10 ? "65€-85€" : "A valorar";
    return `Estimado base: ${estimado}\n\n📢 Aviso: Precio orientativo.`;
}

// ==========================================
// 5. MENÚ PRINCIPAL
// ==========================================
function irAlMenuPrincipal(ctx) {
    return ctx.reply('✨ S P I C Y  I N K ✨\nSelecciona una opción:',
        Markup.keyboard([
            ['🔥 Hablar con el Tatuador', '💉 Minar Tinta'],
            ['💡 Consultar Ideas', '🤖 IA: ¿Qué me tatuo?'],
            ['👥 Mis Referidos', '🧼 Cuidados'],
            ['🎁 Sorteos']
        ]).resize()
    );
}

// ==========================================
// 6. ESCENAS
// ==========================================

const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => ctx.reply('💉 M I N E R Í A', Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR', 'minar_punto')]])));
mineScene.action('minar_punto', (ctx) => { ctx.answerCbQuery(); return ctx.reply('Punto minado'); });

const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('Nombre:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.nombre = ctx.message.text; ctx.reply('Edad:'); return ctx.wizard.next(); },
    async (ctx) => { ctx.reply('Recibido'); return ctx.scene.leave(); }
);

const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => { ctx.wizard.state.ai = {}; ctx.reply('Elemento principal:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.elemento = ctx.message.text; ctx.reply('Postura/Acción:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.accion = ctx.message.text; ctx.reply('Fondo:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.fondo = ctx.message.text; ctx.reply('Iluminación:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.luz = ctx.message.text; ctx.reply('Detalle:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.detalle = ctx.message.text; ctx.reply('Color:', Markup.keyboard([['Blanco y Negro', 'Color']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.color = ctx.message.text; ctx.reply('Extras:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.extra = ctx.message.text; ctx.reply('Línea:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.lineas = ctx.message.text; ctx.reply('Composición:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.forma = ctx.message.text; ctx.reply('Sensación:'); return ctx.wizard.next(); },
    async (ctx) => {
        const ai = ctx.wizard.state.ai;
        ai.sentimiento = ctx.message.text;
        const f = db.fichas[ctx.from.id] || { zona: "body", estilo: "artistic" };

        const prompt = `Professional tattoo flash design of ${traducirTerminos(ai.elemento)}, ${traducirTerminos(ai.accion)}. Background: ${traducirTerminos(ai.fondo)}. Lighting: ${traducirTerminos(ai.luz)}. Detail: ${traducirTerminos(ai.detalle)}. Palette: ${traducirTerminos(ai.color)}. Elements: ${traducirTerminos(ai.extra)}. Linework: ${traducirTerminos(ai.lineas)}. Composition: ${traducirTerminos(ai.forma)}. Mood: ${traducirTerminos(ai.sentimiento)}. Optimized for ${traducirTerminos(f.zona)} in ${traducirTerminos(f.estilo)} style. 8k, high contrast.`;
        
        const encodedPrompt = encodeURIComponent(`Genera una imagen de tatuaje con este prompt en inglés: ${prompt}`);
        const geminiUrl = `https://gemini.google.com/app?q=${encodedPrompt}`;

        // Aquí la etiqueta <code> solo envuelve el prompt
        await ctx.reply(`🧠 **PROMPT PROFESIONAL GENERADO**\n━━━━━━━━━━━━━━━━━━━━\n<code>${prompt}</code>\n━━━━━━━━━━━━━━━━━━━━\n\n👆 **Toca el texto gris de arriba para copiarlo.**\n\n💬 Copia y pega el comando anterior dentro de este enlace, que es la IA que usa el tatuador por el procesamiento **NanoBananaIA**. También puedes usar otra de tu gusto.`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🎨 GENERAR EN GOOGLE GEMINI', geminiUrl)],
                [Markup.button.callback('📋 ¿CÓMO COPIAR?', 'ayuda_copiar')],
                [Markup.button.callback('🔄 Otra idea', 'nueva_ia')]
            ])
        });
        return ctx.scene.leave();
    }
);

// ==========================================
// 7. REGISTRO Y ACCIONES
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, iaScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => ctx.scene.enter('ia-wizard'));
bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));

bot.action('nueva_ia', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('ia-wizard'); });

// Listener para el botón de ayuda de copiado
bot.action('ayuda_copiar', (ctx) => {
    return ctx.answerCbQuery('¡Es fácil! Solo mantén presionado o toca el bloque de texto gris y se copiará solo el prompt al portapapeles. 📋', { show_alert: true });
});

bot.launch().then(() => console.log('🚀 Bot Funcionando'));
