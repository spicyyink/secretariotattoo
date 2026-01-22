require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// Servidor de salud para Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está vivo ✅');
});
server.listen(process.env.PORT || 3000);

// Verificar variables críticas
if (!process.env.BOT_TOKEN || !process.env.MI_ID) {
    console.error("ERROR: Falta BOT_TOKEN o MI_ID en las variables de entorno.");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// Bases de datos temporales
const db_clics = new Map();
const db_referidos_count = new Map();
const db_tattoos_confirmados = new Map();
const quien_invito_a_quien = new Map();
const usuarios_registrados = new Set();

// --- ESCENA: MINERÍA (OPTIMIZADA SIN LAG) ---
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const userId = ctx.from.id;
        const clics = db_clics.get(userId) || 0;
        ctx.reply(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${clics}/1000** clics.\n\n🎁 **PREMIO:** MINI TATTOO de 15€.\n\nUsa los botones de abajo:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => { return; } 
);

// --- ESCENA: FORMULARIO (10 PREGUNTAS REALES) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => { ctx.reply('1️⃣ ¿Cómo te llamas?'); ctx.wizard.state.d = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.d.nombre = ctx.message.text; ctx.reply('2️⃣ ¿Qué edad tienes?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('Lo siento, no tatuamos a menores de 16.'); return ctx.scene.leave(); }
        ctx.wizard.state.d.edad = ctx.message.text;
        ctx.reply('3️⃣ ¿En qué zona del cuerpo quieres el tattoo?');
        return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.d.zona = ctx.message.text; ctx.reply('4️⃣ ¿Qué diseño tienes en mente? Cuéntame la idea.'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.d.idea = ctx.message.text; ctx.reply('5️⃣ ¿Qué estilo prefieres? (Fine line, Blackwork, Realismo...)'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.d.estilo = ctx.message.text; ctx.reply('6️⃣ ¿Tamaño aproximado en centímetros?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.d.tamano = ctx.message.text; ctx.reply('7️⃣ ¿Tienes alergias o tomas medicación?', Markup.keyboard([['No, todo bien'], ['Sí (especificar)']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.d.salud = ctx.message.text; ctx.reply('8️⃣ ¿Hay cicatrices o lunares en esa zona?', Markup.keyboard([['Piel limpia'], ['Sí, tengo']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.d.piel = ctx.message.text; ctx.reply('9️⃣ ¿Qué horario prefieres para la cita?', Markup.keyboard([['Mañanas', 'Tardes'], ['Cualquier horario']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.d.horario = ctx.message.text; ctx.reply('🔟 Por último, envíame una foto de referencia o de la zona:', Markup.keyboard([['❌ No tengo foto']]).oneTime().resize()); return ctx.wizard.next(); },
    async (ctx) => {
        const d = ctx.wizard.state.d;
        let photo = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('✅ ¡Ficha enviada! El tatuador la revisará pronto.', Markup.removeKeyboard());
        const ficha = `🖋️ NUEVA SOLICITUD\n\n👤 ${d.nombre} (${d.edad})\n📍 Zona: ${d.zona}\n💡 Idea: ${d.idea}\n🎨 Estilo: ${d.estilo}\n📏 Tam: ${d.tamano}\n🏥 Salud: ${d.salud}\n🩹 Piel: ${d.piel}\n🕒 Horario: ${d.horario}`;
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photo) await ctx.telegram.sendPhoto(MI_ID, photo);
        return irAlMenuPrincipal(ctx);
    }
);

// --- LÓGICA DE NAVEGACIÓN ---
function irAlMenuPrincipal(ctx) {
    if (ctx.scene) ctx.scene.leave();
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️\nSelecciona una opción:', 
        Markup.keyboard([['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],['💡 Consultar Ideas', '👥 Mis Referidos'],['🎨 Tipografías', '🧼 Cuidados']]).resize());
}

const stage = new Scenes.Stage([tattooScene, mineScene]);
bot.use(session());
bot.use(stage.middleware());

// --- ACCIONES DE BOTONES (SOLUCIÓN AL LAG) ---
bot.action('minar_punto', async (ctx) => {
    const userId = ctx.from.id;
    let clics = (db_clics.get(userId) || 0) + 1;
    db_clics.set(userId, clics);
    if (clics >= 1000) {
        await ctx.editMessageText(`🎉 **¡LOGRADO!**\n\nHas llegado a 1000 clics. Ganas un **MINI TATTOO de 15€**.\nCaptura esto y envíalo al tatuador.`);
        db_clics.set(userId, 0);
        return;
    }
    await ctx.editMessageText(`⛏️ **MODO MINERÍA**\nLlevas: **${clics}/1000** clics.\n🎁 PREMIO: Mini Tattoo 15€.\n¡Dale!`,
        Markup.inlineKeyboard([[Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],[Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]]));
    return ctx.answerCbQuery();
});

bot.action('volver_menu', async (ctx) => { await ctx.answerCbQuery(); await ctx.deleteMessage(); return irAlMenuPrincipal(ctx); });

// --- COMANDOS Y MENÚ ---
bot.start((ctx) => {
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id) && !usuarios_registrados.has(ctx.from.id)) {
        db_referidos_count.set(parseInt(payload), (db_referidos_count.get(parseInt(payload)) || 0) + 1);
        quien_invito_a_quien.set(ctx.from.id, parseInt(payload));
        usuarios_registrados.add(ctx.from.id);
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('👥 Mis Referidos', (ctx) => {
    const link = `https://t.me/SpicyInkBot?start=${ctx.from.id}`;
    ctx.reply(`👥 **MIS REFERIDOS**\n\nLink: ${link}\n\n🎁 ¡Si 3 amigos se tatúan, tienes un **50% de descuento**!`);
});

bot.launch().then(() => console.log('🚀 SpicyBot corregido y online'));
