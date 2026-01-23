require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR (Keep-Alive para Render)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Tatuador Online ✅');
});
// Render usa la variable de entorno PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor HTTP activo en puerto ${PORT}`);
});

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
// 3. UTILIDADES
// ==========================================
function traducirTerminos(texto) {
    if (!texto) return "";
    const diccionario = {
        'blanco y negro': 'black and gray',
        'color': 'full color',
        'antebrazo': 'forearm',
        'bíceps': 'biceps',
        'hombro': 'shoulder',
        'costillas': 'ribs',
        'esternón': 'sternum',
        'espalda': 'back',
        'muslo': 'thigh',
        'gemelo': 'calf',
        'tobillo': 'ankle',
        'mano': 'hand',
        'cuello': 'neck',
        'muñeca': 'wrist',
        'realismo': 'photorealistic',
        'fine line': 'ultra fine line',
        'blackwork': 'heavy blackwork',
        'lettering': 'custom calligraphy'
    };
    let traducido = texto.toLowerCase();
    for (const [es, en] of Object.entries(diccionario)) {
        traducido = traducido.replace(new RegExp(es, 'g'), en);
    }
    return traducido;
}

function calcularPresupuesto(tamanoStr, zona, estilo, tieneFoto) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    const zonaLow = zona.toLowerCase();
    const estiloLow = (estilo || "").toLowerCase();
    let estimado = "";

    if (cms <= 5) estimado = "30€ (Tarifa Mini)";
    else if (cms <= 10) estimado = "65€ - 85€ (Mediano)";
    else if (cms <= 14) estimado = "90€ - 110€ (Grande)";
    else if (cms <= 20) estimado = "120€ - 200€ (Maxi)";
    else return "A valorar por el tatuador (Pieza XL / Sesión)";

    let pluses = [];
    if (estiloLow.includes("realismo")) pluses.push("Complejidad de Estilo (Realismo)");
    else if (estiloLow.includes("lettering")) pluses.push("Detalle de Caligrafía (Lettering)");

    const zonasCriticas = ['costillas', 'cuello', 'mano', 'rodilla', 'esternon', 'cara', 'pies', 'columna', 'codo', 'tobillo', 'axila'];
    if (zonasCriticas.some(z => zonaLow.includes(z))) pluses.push("Dificultad de Zona Anatómica");

    if (tieneFoto) pluses.push("Carga de detalle analizada en referencia 🖼️");
    else pluses.push("Sin referencia visual (Sujeto a cambios)");

    let base = `Estimado base: ${estimado}`;
    if (pluses.length > 0) base += `\n⚠️ FACTORES DE AJUSTE:\n└ ${pluses.join("\n└ ")}`;
    base += `\n\n📢 **AVISO:** Presupuesto automático orientativo. El tatuador dará el precio final.`;
    return base;
}

function irAlMenuPrincipal(ctx) {
    return ctx.reply('✨ S P I C Y  I N K ✨\n━━━━━━━━━━━━━━━━━━━━\nGestión de citas y diseños IA.\n\nSelecciona una opción:',
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

// MINA
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    ctx.reply(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid] || 0} / 1000 ml`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]]));
});
mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.editMessageText('🎉 TATUAJE POR 20€ GANADO 🎉');
        db.clics[uid] = 0; guardar(); return;
    }
    try { await ctx.editMessageText(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid]} / 1000 ml`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]])); } catch (e) {}
    return ctx.answerCbQuery();
});
mineScene.action('volver_menu', async (ctx) => { await ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

// CITA
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('⚠️ Nombre Completo:'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); return ctx.scene.leave(); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('📍 Zona:', Markup.keyboard([['Antebrazo', 'Bíceps'], ['Costillas', 'Espalda'], ['Mano', 'Cuello'], ['Otro']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('📏 Tamaño (cm):', Markup.removeKeyboard()); return ctx.wizard.next(); },
    (ctx) => { 
        ctx.wizard.state.f.tamano = ctx.message.text; 
        ctx.reply('🎨 Estilo:', Markup.inlineKeyboard([[Markup.button.callback('Fine Line', 'estilo_Fine Line'), Markup.button.callback('Realismo', 'estilo_Realismo')], [Markup.button.callback('Blackwork', 'estilo_Blackwork')]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return ctx.reply('Usa los botones.');
        ctx.wizard.state.f.estilo = ctx.callbackQuery.data.replace('estilo_', '');
        ctx.answerCbQuery();
        ctx.reply('🏥 Alergias/Salud:');
        return ctx.wizard.next();
    },
    (ctx) => { 
        ctx.wizard.state.f.salud = ctx.message.text; 
        ctx.reply('🖼️ Envía Foto o pulsa:', Markup.inlineKeyboard([[Markup.button.callback('❌ No tengo', 'no_foto')]]));
        return ctx.wizard.next(); 
    },
    async (ctx) => {
        if (ctx.message && ctx.message.photo) {
            ctx.wizard.state.f.foto = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            ctx.wizard.state.f.tieneFoto = true;
        } else if (ctx.callbackQuery && ctx.callbackQuery.data === 'no_foto') {
            ctx.wizard.state.f.tieneFoto = false;
            ctx.answerCbQuery();
        } else return ctx.reply('Envía una foto o usa el botón.');
        ctx.reply('📲 WhatsApp (ej: 34600...):'); return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.telefono = ctx.message.text.replace(/\s+/g, '').replace('+', '');
        db.fichas[ctx.from.id] = d;
        guardar();
        const estimacion = calcularPresupuesto(d.tamano, d.zona, d.estilo, d.tieneFoto);
        
        await ctx.telegram.sendMessage(MI_ID, `🔔 CITA: ${d.nombre}\n📞 +${d.telefono}\n🎨 ${d.estilo}\n📍 ${d.zona}\n💰 ${estimacion.split('\n')[0]}`, 
            Markup.inlineKeyboard([[Markup.button.url('📲 Hablar', `https://wa.me/${d.telefono}`)]]));
        
        if (d.foto) await ctx.telegram.sendPhoto(MI_ID, d.foto);
        await ctx.reply(`✅ RECIBIDO\n${estimacion}`);
        return ctx.scene.leave();
    }
);

// IA
const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => { ctx.wizard.state.ai = {}; ctx.reply('🤖 (1/10) ¿Qué quieres tatuarte?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.el = ctx.message.text; ctx.reply('(2/10) Acción/Postura:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.fo = ctx.message.text; ctx.reply('(3/10) Fondo:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.lu = ctx.message.text; ctx.reply('(4/10) Iluminación:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.de = ctx.message.text; ctx.reply('(5/10) Detalle:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.co = ctx.message.text; ctx.reply('(6/10) Color:', Markup.keyboard([['B/N', 'Color']]).resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.ex = ctx.message.text; ctx.reply('(7/10) Extras:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.li = ctx.message.text; ctx.reply('(8/10) Línea:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.cm = ctx.message.text; ctx.reply('(9/10) Composición:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.mo = ctx.message.text; ctx.reply('(10/10) Mood:'); return ctx.wizard.next(); },
    async (ctx) => {
        const ai = ctx.wizard.state.ai;
        const f = db.fichas[ctx.from.id] || { zona: "body", estilo: "tattoo" };
        const prompt = `Professional tattoo design of ${ai.el}, ${ctx.message.text}. Style: ${traducirTerminos(f.estilo)}. Line: ${ai.li}. 8k, white background.`;
        const copyUrl = `https://t.me/share/url?url=${encodeURIComponent(prompt)}&text=Prompt:`;
        
        await ctx.reply(`🧠 **DISEÑO NANO-BANANA IA**\n\n<code>${prompt}</code>\n\nGratis hasta 50 fotos/día.`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.url('📋 COPIAR', copyUrl)], [Markup.button.callback('🔄 REPETIR', 'nueva_ia')]])
        });
        return ctx.scene.leave();
    }
);

const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => { ctx.reply('💡 ¿Zona?', Markup.keyboard([['Brazo', 'Pierna'], ['Espalda', 'Pecho'], ['⬅️ Volver']]).resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
);

// ==========================================
// 7. MOTOR DEL BOT
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene, iaScene]);
bot.use(session());
bot.use(stage.middleware());

// MIDDLEWARE DE PROTECCIÓN: Si el usuario pulsa /start, se limpia su estado
bot.use(async (ctx, next) => {
    if (ctx.message && ctx.message.text === '/start') {
        try { await ctx.scene.leave(); } catch(e) {}
        return irAlMenuPrincipal(ctx);
    }
    return next();
});

bot.start((ctx) => irAlMenuPrincipal(ctx));

bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => {
    if (!db.fichas[ctx.from.id]) return ctx.reply('Rellena la ficha en "Hablar con el Tatuador" primero.');
    return ctx.scene.enter('ia-wizard');
});

bot.action('nueva_ia', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('ia-wizard'); });
bot.action('ir_a_formulario', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('tattoo-wizard'); });
bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('Jabón neutro y crema 3 veces al día.'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('Sorteo activo en el canal oficial.'));

// Lanzamiento con manejo de errores para Render
bot.launch()
    .then(() => console.log('Bot funcionando correctamente'))
    .catch(err => console.error('Error al iniciar el bot:', err));

process.on('unhandledRejection', (e) => console.log('Unhandled Rejection:', e));
process.on('uncaughtException', (e) => console.log('Uncaught Exception:', e));
