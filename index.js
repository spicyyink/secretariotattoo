require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// ==========================================
// SERVIDOR DE SALUD (Render)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Online ✅');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// ==========================================
// PERSISTENCIA DE DATOS
// ==========================================
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {} };
const DATA_FILE = './database.json';

if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function guardar() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ==========================================
// ESCENA: MINERÍA (CORREGIDA)
// ==========================================
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const userId = ctx.from.id;
        const clics = db.clics[userId] || 0;
        ctx.reply(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${clics}/1000** clics.\n\n🎁 **PREMIO:** MINI TATTOO de 15€.\n\n¡Dale al botón para sumar!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => { return; } // Ignora texto, solo botones
);

// Lógica de botones de minería (FUERA de la escena para evitar bloqueos)
bot.action('minar_punto', async (ctx) => {
    const userId = ctx.from.id;
    db.clics[userId] = (db.clics[userId] || 0) + 1;
    guardar();

    if (db.clics[userId] >= 1000) {
        await ctx.answerCbQuery('¡OBJETIVO LOGRADO! 🎉');
        await ctx.editMessageText(`🎉 **¡ENHORABUENA!**\n\nHas llegado a los 1000 clics.\n🎁 Has ganado un **MINI TATTOO de 15€**.\n\n📸 Captura esta pantalla para canjearlo.`);
        db.clics[userId] = 0;
        guardar();
        return;
    }

    try {
        await ctx.editMessageText(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${db.clics[userId]}/1000** clics.\n\n🎁 **PREMIO:** MINI TATTOO de 15€.\n\n¡No te detengas!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]
        ]));
    } catch (e) {}
    return ctx.answerCbQuery();
});

// ACCIÓN PARA VOLVER AL MENÚ (ARREGLA EL BLOQUEO)
bot.action('volver_menu', async (ctx) => {
    await ctx.answerCbQuery(); // Quita el "cargando"
    if (ctx.scene) await ctx.scene.leave(); // Cierra la escena de minería
    try { await ctx.deleteMessage(); } catch (e) {} // Borra el mensaje de minería
    return irAlMenuPrincipal(ctx);
});

// ==========================================
// ESCENA: TATTOO (10 PREGUNTAS)
// ==========================================
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => { ctx.reply('1️⃣ ¿Cómo te llamas?'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('2️⃣ ¿Qué edad tienes?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('Lo siento, mínimo 16 años.'); return ctx.scene.leave(); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('3️⃣ ¿En qué zona del cuerpo quieres el tattoo?');
        return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('4️⃣ ¿Qué diseño tienes en mente?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.idea = ctx.message.text; ctx.reply('5️⃣ ¿Qué estilo prefieres? (Fine line, Blackwork...)'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('6️⃣ ¿Tamaño aproximado en cm?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('7️⃣ ¿Alergias o medicación?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('8️⃣ ¿Cicatrices o lunares en la zona?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.horario = ctx.message.text; ctx.reply('9️⃣ ¿Horario preferido?'); return ctx.wizard.next(); },
    (ctx) => { ctx.reply('🔟 Envía una foto de referencia:'); return ctx.wizard.next(); },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        let photo = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('✅ Ficha enviada. Contactaremos contigo.', Markup.removeKeyboard());
        const ficha = `🖋️ NUEVA SOLICITUD\n👤 ${d.nombre} (${d.edad})\n📍 Zona: ${d.zona}\n💡 Idea: ${d.idea}\n📏 Tam: ${d.tamano}`;
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photo) await ctx.telegram.sendPhoto(MI_ID, photo);
        return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// LÓGICA GENERAL
// ==========================================
function irAlMenuPrincipal(ctx) {
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],
            ['💡 Consultar Ideas', '👥 Mis Referidos'],
            ['🧼 Cuidados', '🎁 Sorteos']
        ]).resize());
}

const stage = new Scenes.Stage([tattooScene, mineScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id)) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const n = db.confirmados[uid] || 0;
    ctx.reply(`👥 **REFERIDOS**\n\nTattoos confirmados de amigos: **${n}/3**\n\n🎁 **Premio:** 50% Dto.\n\nTu link: https://t.me/SpicyInkBot?start=${uid}`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Ya me he tatuado', 'validar_tattoo')]]));
});

bot.action('validar_tattoo', (ctx) => {
    const inviterId = db.invitados[ctx.from.id];
    if (!inviterId) return ctx.reply('No vienes de parte de nadie.');
    bot.telegram.sendMessage(MI_ID, `❓ ¿Confirmas tattoo de @${ctx.from.username}?`, 
    Markup.inlineKeyboard([[Markup.button.callback('SÍ', `conf_${ctx.from.id}_${inviterId}`)]]));
    ctx.reply('Solicitud enviada.');
});

bot.action(/conf_(.+)_(.+)/, (ctx) => {
    const invId = ctx.match[2];
    db.confirmados[invId] = (db.confirmados[invId] || 0) + 1;
    guardar();
    ctx.editMessageText('✅ Confirmado.');
    bot.telegram.sendMessage(invId, `🔥 ¡Un amigo se tatuó! Llevas ${db.confirmados[invId]}/3.`);
});

// Lanzamiento seguro
bot.launch().then(() => console.log('Bot Online con Minería Persistente'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
