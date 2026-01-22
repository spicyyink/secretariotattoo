require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// ==========================================
// 1. SERVIDOR (Para que Render no se apague)
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

if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch (e) {}
}

function guardar() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ==========================================
// 3. ESCENA 1: FORMULARIO TATTOO (10 Preguntas)
// ==========================================
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
// 4. ESCENA 2: MINERÍA (Juego)
// ==========================================
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const uid = ctx.from.id;
        const clics = db.clics[uid] || 0;
        ctx.reply(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${clics}/1000**.\nObjetivo: Mini Tattoo Gratis.\n\n👇 ¡DALE CAÑA! 👇`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🔨 PICAR PIEDRA', 'minar')],
                [Markup.button.callback('⬅️ SALIR AL MENÚ', 'salir_mineria')]
            ])
        );
        return ctx.wizard.next();
    },
    (ctx) => { return; } // No hace nada si escriben texto
);

// ==========================================
// 5. ESCENA 3: CONSULTOR DE IDEAS
// ==========================================
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

        let consejo = "✨ Para esa zona recomiendo diseños fluidos que sigan el músculo.";
        if (msg === 'Costillas') consejo = "🔥 Zona dolorosa pero sexy. Mejor algo vertical y fino.";
        if (msg === 'Espalda') consejo = "🖼️ El mejor lienzo. Ideal para piezas grandes o realismo.";

        ctx.reply(consejo);
        setTimeout(() => irAlMenuPrincipal(ctx), 2000); // Vuelve al menú solo a los 2s
        return ctx.scene.leave();
    }
);

// ==========================================
// 6. GESTIÓN DE ESCENAS Y MIDDLEWARE
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());

// --- FUNCIÓN CENTRAL: MENÚ ---
function irAlMenuPrincipal(ctx) {
    if (ctx.scene) ctx.scene.leave(); // Asegura salir de cualquier lado
    return ctx.reply('🔥 **MENÚ PRINCIPAL** 🔥\nElige una opción:',
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],
            ['💡 Consultar Ideas', '👥 Mis Referidos'],
            ['🧼 Cuidados', '🎁 Sorteos']
        ]).resize()
    );
}

// ==========================================
// 7. COMANDO START (REINICIO TOTAL FORCE)
// ==========================================
bot.start(async (ctx) => {
    // 1. Matar cualquier escena activa
    if (ctx.scene) await ctx.scene.leave();
    
    // 2. Limpiar sesión
    ctx.session = {};

    // 3. Gestionar Referidos (si es nuevo)
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id) && !db.invitados[ctx.from.id]) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
        ctx.reply('👋 ¡Vienes invitado por un amigo!');
    }

    return irAlMenuPrincipal(ctx);
});

// ==========================================
// 8. ACCIONES DE BOTONES (Lógica)
// ==========================================

// A. MINERÍA
bot.action('minar', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();

    if (db.clics[uid] >= 1000) {
        await ctx.answerCbQuery('🏆 ¡GANASTE!');
        await ctx.editMessageText('🎉 **¡1000 PUNTOS!** 🎉\n\nHas ganado un MINI TATTOO.\nHaz captura y envíamela.');
        db.clics[uid] = 0;
        guardar();
        return;
    }

    try {
        await ctx.editMessageText(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${db.clics[uid]}/1000**.\nObjetivo: Mini Tattoo Gratis.\n\n👇 ¡DALE CAÑA! 👇`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🔨 PICAR PIEDRA', 'minar')],
                [Markup.button.callback('⬅️ SALIR AL MENÚ', 'salir_mineria')]
            ])
        );
    } catch (e) {} // Evita error si pulsas muy rápido
    return ctx.answerCbQuery();
});

bot.action('salir_mineria', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage(); // Borra el juego
    if (ctx.scene) await ctx.scene.leave(); // IMPORTANTE: Mata la escena
    return irAlMenuPrincipal(ctx);
});

// B. LISTENERS GLOBALES (Funcionan desde el menú)
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const total = db.referidos[uid] || 0;
    const confirmados = db.confirmados[uid] || 0;
    
    ctx.reply(`👥 **ZONA DE SOCIOS**\n\n🔗 Tu Link:\nhttps://t.me/SpicyInkBot?start=${uid}\n\n📊 Estadísticas:\n- Clics en tu link: ${total}\n- Tattoos hechos: ${confirmados}/3\n\n🎁 **Premio al llegar a 3:** 50% DTO.`);
});

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('🧴 **CUIDADOS DEL TATTOO**\n\n1. Lavar con agua tibia y jabón neutro.\n2. Secar a toques con papel.\n3. Crema fina (Bepanthol/Aquaphor).\n4. 🚫 NO sol, NO piscina, NO rascar.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🎟️ **SORTEO ACTIVO**\n\nEstamos sorteando una sesión de día completo.\n👉 Participa en Instagram: @SpicyInkk');
});

// Lanzamiento Seguro
bot.launch().then(() => console.log('🤖 SpicyBot: LISTO Y BLINDADO'));

// Cierre elegante
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
