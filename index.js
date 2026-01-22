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
// 2. BASE DE DATOS LOCAL
// ==========================================
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {} };
const DATA_FILE = './database.json';

if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch (e) {}
}

function guardar() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function irAlMenuPrincipal(ctx) {
    return ctx.reply('🔥 **MENÚ PRINCIPAL** 🔥\nElige una opción:',
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '💉 Minar Tinta'],
            ['💡 Consultar Ideas', '👥 Mis Referidos'],
            ['🧼 Cuidados', '🎁 Sorteos']
        ]).resize()
    );
}

// ==========================================
// 3. DEFINICIÓN DE ESCENAS
// ==========================================

// --- ESCENA MINERÍA ---
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    const clics = db.clics[uid] || 0;
    ctx.reply(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${clics}/1000** ml de tinta.\n\n👇 ¡DALE CAÑA! 👇`,
        Markup.inlineKeyboard([
            [Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')],
            [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]
        ])
    );
});

mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.answerCbQuery('🏆 ¡GANASTE!');
        await ctx.editMessageText('🎉 **¡TANQUE LLENO (1000)!**\nHaz captura y envíamela.');
        db.clics[uid] = 0; guardar(); return;
    }
    try {
        await ctx.editMessageText(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${db.clics[uid]}/1000** ml de tinta.`,
            Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]]));
    } catch (e) {}
    return ctx.answerCbQuery();
});

mineScene.action('volver_menu', async (ctx) => {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await ctx.scene.leave();
    return irAlMenuPrincipal(ctx);
});

mineScene.on('message', (ctx) => ctx.reply('⚠️ Pulsa "⬅️ SALIR AL MENÚ" para usar otras opciones.'));

// --- ESCENA IDEAS ---
const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        ctx.reply('💡 **CONSULTOR DE IDEAS**\n¿Dónde te quieres tatuar?',
            Markup.keyboard([['Brazo', 'Pierna'], ['Costillas', 'Espalda'], ['⬅️ Cancelar']]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (msg && msg.includes('Cancelar')) { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        let consejo = "✨ Para esa zona recomiendo diseños fluidos.";
        if (msg === 'Costillas') consejo = "🔥 Zona dolorosa pero sexy.";
        ctx.reply(consejo);
        ctx.scene.leave();
        return irAlMenuPrincipal(ctx);
    }
);

// --- ESCENA TATTOO ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('📝 1️⃣ ¿Cómo te llamas?'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('2️⃣ ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('3️⃣ ¿Zona del cuerpo?', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('4️⃣ Describe tu idea:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.idea = ctx.message.text; ctx.reply('5️⃣ ¿Estilo?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('6️⃣ Tamaño cm:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('7️⃣ ¿Alergias?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('8️⃣ ¿Cicatrices?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.horario = ctx.message.text; ctx.reply('9️⃣ ¿Horario?'); return ctx.wizard.next(); },
    (ctx) => { ctx.reply('🔟 Envía FOTO o escribe "No tengo":'); return ctx.wizard.next(); },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        let photo = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('✅ Recibido.');
        const ficha = `🖋️ SOLICITUD\n👤 ${d.nombre}\n📍 Zona: ${d.zona}\n💡 Idea: ${d.idea}\n📏 Tam: ${d.tamano}`;
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photo) await ctx.telegram.sendPhoto(MI_ID, photo);
        ctx.scene.leave(); return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// 4. LÓGICA DE REINICIO (/START) - ¡ORDEN CRÍTICO!
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene]);
bot.use(session());

// ESTO DEBE IR ANTES DEL MIDDLEWARE DE ESCENAS PARA PODER "ROBAR" EL CONTROL
bot.start(async (ctx) => {
    if (ctx.scene) {
        try { await ctx.scene.leave(); } catch(e) {}
    }
    ctx.session = {}; 
    
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id) && !db.invitados[ctx.from.id]) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
    }
    return irAlMenuPrincipal(ctx);
});

bot.use(stage.middleware());

// ==========================================
// 5. LISTENERS GLOBALES
// ==========================================
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const total = db.referidos[uid] || 0;
    ctx.reply(`👥 ZONA SOCIOS\n🔗 Link: https://t.me/SpicyInkBot?start=${uid}\n📊 Clics: ${total}\n🎁 Premio: 50% DTO al llegar a 3.`);
});

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('🧴 CUIDADOS:\n1. Jabón neutro.\n2. Bepanthol.\n3. Sin sol.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🎟️ SORTEO ACTIVO en Instagram: @SpicyInkk');
});

bot.launch().then(() => console.log('🚀 SpicyBot Blindado'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
