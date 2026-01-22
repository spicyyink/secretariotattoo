require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// ==========================================
// 1. SERVIDOR (Mantiene a Render despierto)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// ==========================================
// 2. BASE DE DATOS (No se borra nunca)
// ==========================================
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {} };
const DATA_FILE = './database.json';

// Carga segura de datos
if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch (e) {}
}

function guardar() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ==========================================
// 3. ESCENA: MINERÍA (ARREGLADA)
// ==========================================
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const uid = ctx.from.id;
        const clics = db.clics[uid] || 0;
        
        ctx.reply(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${clics}/1000** ml de tinta.\nObjetivo: Mini Tattoo Gratis.\n\n👇 ¡DALE CAÑA! 👇`,
            Markup.inlineKeyboard([
                [Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], // TEXTO CAMBIADO
                [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]
            ])
        );
        return ctx.wizard.next();
    },
    (ctx) => { 
        // Si el usuario escribe texto en vez de tocar botones, le avisamos
        // pero NO bloqueamos el bot.
        return ctx.reply('Usa los botones para inyectar tinta o salir.'); 
    }
);

// LÓGICA DEL BOTÓN INYECTAR (Sin Lag)
bot.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();

    // Si gana
    if (db.clics[uid] >= 1000) {
        await ctx.answerCbQuery('🏆 ¡GANASTE!');
        await ctx.editMessageText('🎉 **¡TANQUE LLENO (1000)!** 🎉\n\nHas ganado un MINI TATTOO.\nHaz captura y envíamela.');
        db.clics[uid] = 0;
        guardar();
        return;
    }

    // Actualizar mensaje (try/catch evita errores si pulsas muy rápido)
    try {
        await ctx.editMessageText(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${db.clics[uid]}/1000** ml de tinta.\nObjetivo: Mini Tattoo Gratis.\n\n👇 ¡DALE CAÑA! 👇`,
            Markup.inlineKeyboard([
                [Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')],
                [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]
            ])
        );
    } catch (e) {
        // Ignoramos el error "message is not modified" típico de hacer click muy rápido
    }
    
    return ctx.answerCbQuery(); // Quita el reloj de arena
});

// LÓGICA DEL BOTÓN SALIR (SOLUCIÓN AL BLOQUEO)
bot.action('volver_menu', async (ctx) => {
    await ctx.answerCbQuery(); // 1. Quitar reloj de arena
    
    // 2. Intentar borrar el mensaje de minería para limpiar chat
    try { await ctx.deleteMessage(); } catch (e) {} 
    
    // 3. OBLIGATORIO: Matar la escena para desbloquear el menú principal
    if (ctx.scene) { await ctx.scene.leave(); }
    
    // 4. Enviar menú principal
    return irAlMenuPrincipal(ctx);
});

// ==========================================
// 4. OTRAS ESCENAS (Ideas y Tattoo)
// ==========================================

// Escena Ideas
const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply('💡 **CONSULTOR DE IDEAS**\n\n¿Dónde te quieres tatuar? Elige:',
            Markup.keyboard([['Brazo', 'Pierna'], ['Costillas', 'Espalda'], ['⬅️ Cancelar']]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (msg.includes('Cancelar')) return irAlMenuPrincipal(ctx);
        
        let consejo = "✨ Para esa zona recomiendo diseños fluidos.";
        if (msg === 'Costillas') consejo = "🔥 Zona dolorosa pero sexy. Mejor algo vertical y fino.";
        if (msg === 'Espalda') consejo = "🖼️ El mejor lienzo. Ideal para piezas grandes o realismo.";
        
        ctx.reply(consejo);
        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

// Escena Formulario (Tattoo)
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => { ctx.reply('📝 **FICHA DE TATTOO**\n\n1️⃣ ¿Cómo te llamas?'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('2️⃣ ¿Qué edad tienes?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Lo siento, no tatúo a menores de 16.'); return ctx.scene.leave(); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('3️⃣ ¿Zona del cuerpo?', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('4️⃣ Describe tu idea:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.idea = ctx.message.text; ctx.reply('5️⃣ ¿Estilo? (Realismo, Linea fina...)'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('6️⃣ Tamaño en cm (aprox):'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('7️⃣ ¿Alergias o medicación?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('8️⃣ ¿Tienes cicatrices/lunares ahí?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.horario = ctx.message.text; ctx.reply('9️⃣ ¿Preferencia horaria?'); return ctx.wizard.next(); },
    (ctx) => { ctx.reply('🔟 Envía FOTO de referencia (o escribe "No tengo"):'); return ctx.wizard.next(); },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        let photo = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('✅ ¡Ficha recibida! Te contestaré pronto.');
        const ficha = `🖋️ **NUEVA SOLICITUD**\n\n👤 ${d.nombre} (${d.edad})\n📍 Zona: ${d.zona}\n💡 Idea: ${d.idea}\n🎨 Estilo: ${d.estilo}\n📏 Tam: ${d.tamano}\n🏥 Salud: ${d.salud}\n🕒 Horario: ${d.horario}`;
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photo) await ctx.telegram.sendPhoto(MI_ID, photo);
        return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// 5. CONFIGURACIÓN GLOBAL
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());

// MENÚ PRINCIPAL
function irAlMenuPrincipal(ctx) {
    if (ctx.scene) ctx.scene.leave(); 
    return ctx.reply('🔥 **MENÚ PRINCIPAL** 🔥\nElige una opción:',
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],
            ['💡 Consultar Ideas', '👥 Mis Referidos'],
            ['🧼 Cuidados', '🎁 Sorteos']
        ]).resize()
    );
}

// START (RESET TOTAL)
bot.start(async (ctx) => {
    if (ctx.scene) await ctx.scene.leave();
    ctx.session = {}; // Limpieza
    
    // Referidos
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id) && !db.invitados[ctx.from.id]) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
    }
    return irAlMenuPrincipal(ctx);
});

// LISTENERS DEL MENÚ
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const total = db.referidos[uid] || 0;
    const confirmados = db.confirmados[uid] || 0;
    ctx.reply(`👥 **ZONA DE SOCIOS**\n\n🔗 Link: https://t.me/SpicyInkBot?start=${uid}\n📊 Clics: ${total}\n💉 Tattoos hechos: ${confirmados}/3\n🎁 Premio: 50% DTO al llegar a 3.`);
});

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('🧴 **CUIDADOS**\n1. Lavar con agua tibia y jabón neutro.\n2. Secar a toques con papel.\n3. Crema fina (Bepanthol).\n4. 🚫 NO sol, NO piscina.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🎟️ **SORTEO ACTIVO**\nEstamos sorteando una sesión.\n👉 Participa en Instagram: @SpicyInkk');
});

// LANZAMIENTO
bot.launch().then(() => console.log('🚀 SpicyBot ACTIVO y BLINDADO'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
