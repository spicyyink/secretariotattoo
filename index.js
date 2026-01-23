require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. SERVIDOR HTTP (Indispensable para Render)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Spicy Inkk Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// ==========================================
// 2. BASE DE DATOS LOCAL
// ==========================================
let db = { clics: {}, fichas: {} };
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
// 3. UTILIDADES
// ==========================================
function traducirTerminos(texto) {
    if (!texto) return "";
    const diccionario = {
        'blanco y negro': 'black and gray', 'color': 'full color',
        'antebrazo': 'forearm', 'bíceps': 'biceps', 'hombro': 'shoulder',
        'costillas': 'ribs', 'esternón': 'sternum', 'espalda': 'back',
        'muslo': 'thigh', 'gemelo': 'calf', 'tobillo': 'ankle',
        'mano': 'hand', 'cuello': 'neck', 'muñeca': 'wrist',
        'realismo': 'photorealistic', 'fine line': 'ultra fine line',
        'blackwork': 'heavy blackwork', 'lettering': 'custom calligraphy'
    };
    let traducido = texto.toLowerCase();
    for (const [es, en] of Object.entries(diccionario)) {
        traducido = traducido.replace(new RegExp(es, 'g'), en);
    }
    return traducido;
}

// Función actualizada para coincidir con el formato de la imagen
function calcularPresupuesto(tamanoStr) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    if (cms <= 5) return "30€ (Tarifa Mini)";
    if (cms <= 10) return "65€ - 85€ (Mediano)";
    if (cms <= 15) return "120€ - 200€ (Maxi)";
    return "A valorar por el tatuador";
}

function irAlMenuPrincipal(ctx) {
    return ctx.reply('✨ S P I C Y  I N K ✨\n━━━━━━━━━━━━━━━━━━━━\nSelecciona una opción:',
        Markup.keyboard([
            ['🔥 Hablar con el Tatuador', '💉 Minar Tinta'],
            ['💡 Consultar Ideas', '🤖 IA: ¿Qué me tatuo?'],
            ['🧼 Cuidados', '🎁 Sorteos']
        ]).resize()
    );
}

// ==========================================
// 4. ESCENA IA (10 PASOS)
// ==========================================
const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => { ctx.wizard.state.ai = {}; ctx.reply('🤖 **DISEÑADOR IA (1/10)**\n¿Cuál es el elemento principal?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.elemento = ctx.message.text; ctx.reply('(2/10) ¿Qué postura o acción tiene?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.fondo = ctx.message.text; ctx.reply('(3/10) ¿Qué hay al fondo?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.luz = ctx.message.text; ctx.reply('(4/10) ¿Cómo es la iluminación?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.detalle = ctx.message.text; ctx.reply('(5/10) ¿Nivel de detalle?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.color = ctx.message.text; ctx.reply('(6/10) ¿Color o B/N?', Markup.keyboard([['Blanco y Negro', 'Color']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.extra = ctx.message.text; ctx.reply('(7/10) ¿Objetos secundarios?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.lineas = ctx.message.text; ctx.reply('(8/10) ¿Tipo de trazo?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.forma = ctx.message.text; ctx.reply('(9/10) ¿Composición?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.moo = ctx.message.text; ctx.reply('(10/10) ¿Atmósfera o Mood?'); return ctx.wizard.next(); },
    async (ctx) => {
        const ai = ctx.wizard.state.ai;
        const prompt = `Professional tattoo flash design of ${ai.elemento}. Style: Realistic. 8k white background.`;
        const copyUrl = `https://t.me/share/url?url=${encodeURIComponent(prompt)}`;
        await ctx.reply(`🧠 **DISEÑO IA**\n<code>${prompt}</code>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.url('📋 COPIAR', copyUrl)], [Markup.button.callback('🔄 Otra idea', 'nueva_ia')]])
        });
        return ctx.scene.leave();
    }
);

// ==========================================
// 5. ESCENA DE CITA (MODIFICADA PARA LA IMAGEN)
// ==========================================
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('👤 Escribe tu Nombre:'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 ¿Edad?', Markup.keyboard([['+18 años', '+16 años']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.edad = ctx.message.text; ctx.reply('📍 Zona (Ej: Hombro, Antebrazo...):', Markup.removeKeyboard()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('📏 Tamaño aproximado (cm):'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('🎨 Estilo:', Markup.inlineKeyboard([[Markup.button.callback('Realismo', 'estilo_Realismo'), Markup.button.callback('Fine Line', 'estilo_FineLine')]])); return ctx.wizard.next(); },
    (ctx) => { 
        if (!ctx.callbackQuery) return ctx.reply('Usa los botones.');
        ctx.wizard.state.f.estilo = ctx.callbackQuery.data.split('_')[1];
        ctx.answerCbQuery();
        ctx.reply('🏥 ¿Alergias o problemas de salud? (Si no tienes, pon "No")');
        return ctx.wizard.next(); 
    },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('📲 WhatsApp (ej: 34600...):'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.telefono = ctx.message.text.replace(/\s+/g, ''); ctx.reply('🖼️ Envía una foto de referencia:'); return ctx.wizard.next(); },
    async (ctx) => {
        if (!ctx.message.photo) return ctx.reply('Por favor, envía una imagen.');
        const d = ctx.wizard.state.f;
        d.foto = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const precio = calcularPresupuesto(d.tamano);

        // FORMATO DE LA SOLICITUD SEGÚN LA IMAGEN
        const fichaVisible = 
            `🔔 **NUEVA SOLICITUD**\n` +
            `\n` +
            `👤 **Nombre:** ${d.nombre}\n` +
            `🔞 **Edad:** ${d.edad}\n` +
            `📍 **Zona:** ${d.zona}\n` +
            `📏 **Tamaño:** ${d.tamano}\n` +
            `🎨 **Estilo:** ${d.estilo}\n` +
            `🏥 **Salud:** ${d.salud}\n` +
            `📞 **WhatsApp:** +${d.telefono}\n` +
            `\n` +
            `💰 **Estimado base: ${precio}**`;

        // Enviar al administrador
        await ctx.telegram.sendPhoto(MI_ID, d.foto, {
            caption: fichaVisible,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.url('📲 Hablar por WhatsApp', `https://wa.me/${d.telefono}`)]])
        });

        db.fichas[ctx.from.id] = d;
        guardar();
        await ctx.reply('✅ Solicitud enviada correctamente.');
        return ctx.scene.leave();
    }
);

// ==========================================
// 6. LANZAMIENTO Y MOTOR
// ==========================================
const mineScene = new Scenes.BaseScene('mine-scene'); // (Omitida lógica interna por brevedad, igual a la anterior)

const stage = new Scenes.Stage([tattooScene, mineScene, iaScene]);
bot.use(session());
bot.use(stage.middleware());

bot.use(async (ctx, next) => {
    if (ctx.message && ctx.message.text === '/start') {
        try { await ctx.scene.leave(); } catch (e) {}
        return irAlMenuPrincipal(ctx);
    }
    return next();
});

bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => ctx.scene.enter('ia-wizard'));
bot.launch();

process.on('unhandledRejection', (r) => console.log('Unhandled:', r));
process.on('uncaughtException', (e) => console.log('Exception:', e));
