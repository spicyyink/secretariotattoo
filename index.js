require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// Servidor de Salud para Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// PERSISTENCIA DE DATOS
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {} };
const DATA_FILE = './database.json';
if (fs.existsSync(DATA_FILE)) { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
function guardar() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// --- ESCENA DE MINERÍA ---
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
    (ctx) => { return; }
);

// --- COMANDO START (REINICIO FORZADO) ---
bot.start(async (ctx) => {
    // 1. FORZAR SALIDA DE ESCENAS (Desbloqueo total)
    if (ctx.scene) {
        await ctx.scene.leave();
    }
    
    // 2. LIMPIAR SESIÓN (Opcional, pero asegura reinicio limpio)
    ctx.session = {};

    // 3. Lógica de referidos (Solo si es nuevo)
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id)) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
    }

    return irAlMenuPrincipal(ctx);
});

// --- LÓGICA DE BOTONES DE MINERÍA ---
bot.action('minar_punto', async (ctx) => {
    const userId = ctx.from.id;
    db.clics[userId] = (db.clics[userId] || 0) + 1;
    guardar();

    if (db.clics[userId] >= 1000) {
        await ctx.answerCbQuery('¡OBJETIVO LOGRADO! 🎉');
        await ctx.editMessageText(`🎉 **¡LOGRADO!**\n\nHas llegado a 1000 clics.\n🎁 Ganas un **MINI TATTOO de 15€**.\n\nCaptura esta pantalla.`);
        db.clics[userId] = 0;
        guardar();
        return;
    }

    try {
        await ctx.editMessageText(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${db.clics[userId]}/1000** clics.\n\n🎁 **PREMIO:** MINI TATTOO de 15€.\n\n¡Sigue dándole!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]
        ]));
    } catch (e) {}
    return ctx.answerCbQuery();
});

// ACCIÓN VOLVER (DESBLOQUEO)
bot.action('volver_menu', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.scene) await ctx.scene.leave();
    try { await ctx.deleteMessage(); } catch (e) {}
    return irAlMenuPrincipal(ctx);
});

// --- MENÚ PRINCIPAL ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️ (Sistema Reiniciado)', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],
            ['💡 Consultar Ideas', '👥 Mis Referidos'],
            ['🧼 Cuidados', '🎁 Sorteos']
        ]).resize());
}

// Configuración del Stage y Bot
const stage = new Scenes.Stage([mineScene]);
bot.use(session());
bot.use(stage.middleware());

bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.reply('Formulario listo. Pulsa de nuevo.'));

bot.launch().then(() => console.log('🚀 Bot listo con reinicio forzado por /start'));
